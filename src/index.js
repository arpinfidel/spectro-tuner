// Check for debug parameter in URL and dynamically import eruda if needed
if (new URLSearchParams(window.location.search).get('debug') === 'true') {
    import('eruda').then(eruda => eruda.default.init());
}

import { Tuner } from './tuner.js';
import { PitchTracker } from './pitch_tracker.js'
import { Renderer } from './renderer.js'

// Constants for audio processing
const ACTUAL_FFT_SIZE = 1 << 6;
const PADDING_FACTOR = 1 << 6;
const FFT_SIZE = ACTUAL_FFT_SIZE * PADDING_FACTOR;
const HISTORY_SIZE = 300;
const UPDATE_PER_S = 300;
const RENDER_PER_S = 60;

let appState = {
    isTabVisible: true,
    isWindowFocused: true,
    isActive: () => appState.isTabVisible && appState.isWindowFocused,
    
    updateIntervalMs: 1000/UPDATE_PER_S,
    renderIntervalMs: 1000/RENDER_PER_S,
    
    interpolationMethod: "parabolic",
    currentWindow: 'hanning',
    useSpectralWhitening: false,
    useHarmonicFiltering: false,
    useKalmanFilters: false,
    
    showFFTDetails: true,

    // Threshold values for pitch detection
    th_1: 0.0001, // Minimum magnitude threshold
    th_2: 0.001, // Peak detection threshold
    th_3: 0.001, // Magnitude filtering threshold
    defaultMaxMagnitude: 0.0005, // Default maximum magnitude
    fftFrameSmoothingFactor: 0.6, // Smoothing factor for weighted averaging 0.6*newMagnitude + 0.4*previousMagnitude
    fftTrackSmoothingFactor: 0.1,
};

async function preventScreenSleep() {
    try {
        await navigator.wakeLock.request("screen");
        console.log("Wake lock acquired.");
    } catch (error) {
        console.log(`Warning: did not acquire wake lock: ${error.name}, ${error.message}`);
    }
}

// Detect browser type and return appropriate gain value
function calculateGainValue() {
    const userAgent = navigator.userAgent;
    return userAgent.includes("Chrome") ? 1 :
           userAgent.includes("Firefox") ? 3 :
           userAgent.includes("Safari") ? 4 :
           userAgent.includes("Edge") ? 3 : 1;
}

// Initialize audio analyzer
async function initializeAudioAnalyzer(gainValue) {
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
            autoGainControl: false,
            echoCancellation: false,
            noiseSuppression: false,
            latency: 0
        }
    });
    
    localStorage.setItem("micPermission", "yes");
    
    const audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    const analyzer = audioContext.createAnalyser();
    const gainNode = audioContext.createGain();
    
    gainNode.gain.value = gainValue;
    source.connect(gainNode).connect(analyzer);
    
    return {
        audioContext,
        source,
        analyzer,
        gainNode,
        sampleRate: audioContext.sampleRate,
    };
}

function setupDOM() {
    // Add event listener for interpolation dropdown
    const interpolationSelect = document.getElementById("interpolation-select")
    interpolationSelect.addEventListener("change", function (e) {
        appState.interpolationMethod = e.target.value
    })
    interpolationSelect.value = appState.interpolationMethod

    const spectralWhitening = document.getElementById("spectral-whitening")
    spectralWhitening.addEventListener("change", function (e) {
        appState.useSpectralWhitening = e.target.checked
    })
    spectralWhitening.checked = appState.useSpectralWhitening

    const harmonicFiltering = document.getElementById("harmonic-filtering")
    harmonicFiltering.addEventListener("change", function (e) {
        appState.useHarmonicFiltering = e.target.checked
    })
    harmonicFiltering.checked = appState.useHarmonicFiltering

    const windowSelect = document.getElementById("window-select")
    windowSelect.addEventListener("change", function (e) {
        appState.currentWindow = e.target.value
    })
    windowSelect.value = appState.currentWindow

    const fftDetailsToggle = document.getElementById("fft-details-toggle")
    const fftDetailsContainer = document.querySelector("#fftDetailCanvas").parentElement
    const toggleFFTDetails = () => {
        appState.showFFTDetails = !appState.showFFTDetails
        fftDetailsContainer.style.display = appState.showFFTDetails ? "block" : "none"
        fftDetailsToggle.textContent = appState.showFFTDetails ? "Hide FFT Details" : "Show FFT Details"
    }
    fftDetailsToggle.addEventListener("click", toggleFFTDetails)
    setTimeout(toggleFFTDetails, 100) // immediately hide. can't default to hidden in html because can't resize canvas after transfertoggleFFTDetails() // immediately hide. can't default to hidden in html because can't resize canvas after transfer

    // Add event listeners for threshold sliders
    const th1Slider = document.getElementById("th-1-slider")
    th1Slider.value = appState.th_1
    document.getElementById("th-1-value").textContent = appState.th_1.toFixed(4)
    th1Slider.addEventListener("input", function (e) {
        appState.th_1 = parseFloat(e.target.value)
        document.getElementById("th-1-value").textContent = appState.th_1.toFixed(4)
    })

    const th2Slider = document.getElementById("th-2-slider")
    th2Slider.value = appState.th_2
    document.getElementById("th-2-value").textContent = appState.th_2.toFixed(4)
    th2Slider.addEventListener("input", function (e) {
        appState.th_2 = parseFloat(e.target.value)
        document.getElementById("th-2-value").textContent = appState.th_2.toFixed(4)
    })

    const th3Slider = document.getElementById("th-3-slider")
    th3Slider.value = appState.th_3
    document.getElementById("th-3-value").textContent = appState.th_3.toFixed(4)
    th3Slider.addEventListener("input", function (e) {
        appState.th_3 = parseFloat(e.target.value)
        document.getElementById("th-3-value").textContent = appState.th_3.toFixed(4)
    })

    const maxMagnitudeSlider = document.getElementById("max-magnitude-slider")
    maxMagnitudeSlider.value = appState.defaultMaxMagnitude
    document.getElementById("max-magnitude-value").textContent = appState.defaultMaxMagnitude.toFixed(4)
    maxMagnitudeSlider.addEventListener("input", function (e) {
        appState.defaultMaxMagnitude = parseFloat(e.target.value)
        document.getElementById("max-magnitude-value").textContent = appState.defaultMaxMagnitude.toFixed(4)
    })

    const fftFrameSmoothingSlider = document.getElementById("fft-frame-smoothing-slider")
    fftFrameSmoothingSlider.value = appState.fftFrameSmoothingFactor
    document.getElementById("fft-frame-smoothing-value").textContent = appState.fftFrameSmoothingFactor.toFixed(2)
    fftFrameSmoothingSlider.addEventListener("input", function (e) {
        appState.fftFrameSmoothingFactor = parseFloat(e.target.value)
        document.getElementById("fft-frame-smoothing-value").textContent = appState.fftFrameSmoothingFactor.toFixed(2)
    })

    const fftTrackSmoothingSlider = document.getElementById("fft-track-smoothing-slider")
    fftTrackSmoothingSlider.value = appState.fftTrackSmoothingFactor
    document.getElementById("fft-track-smoothing-value").textContent = appState.fftTrackSmoothingFactor.toFixed(2)
    fftTrackSmoothingSlider.addEventListener("input", function (e) {
        appState.fftTrackSmoothingFactor = parseFloat(e.target.value)
        document.getElementById("fft-track-smoothing-value").textContent = appState.fftTrackSmoothingFactor.toFixed(2)
    })

    const spectrumCanvas = document.getElementById("spectrumCanvas");
    const spectrumCanvasBg = document.getElementById(`spectrumCanvasBackground`);
    const fftCanvas = document.getElementById("fftDetailCanvas");
    const fftCanvasBg = document.getElementById(`fftDetailCanvasBackground`);
    
    return { spectrumCanvas, spectrumCanvasBg, fftCanvas, fftCanvasBg }
}

async function startLoops(pitchTracker, tuner, renderer) {
    pitchTracker.loop();
    tuner.loop();
    renderer.loop();
}


function setupActivityMonitoring(audioContext, source, gainNode, analyzer) {
    // Page Visibility API
    document.addEventListener('visibilitychange', () => {
        appState.isTabVisible = document.visibilityState === 'visible';
        handleActivityChange(audioContext, source, gainNode, analyzer);
    });

    // Window Focus
    window.addEventListener('focus', () => {
        appState.isWindowFocused = true;
        handleActivityChange(audioContext, source, gainNode, analyzer);
    });

    window.addEventListener('blur', () => {
        appState.isWindowFocused = false; 
        handleActivityChange(audioContext, source, gainNode, analyzer);
    });
}

function handleActivityChange(audioContext, source, gainNode, analyzer) {
    const statusElement = document.getElementById('activity-status');
    if (statusElement) {
        statusElement.textContent = appState.isActive() ? 'Active' : 'Inactive';
        statusElement.style.color = appState.isActive() ? '#44ff44' : '#ff4444';
    }

    if (!appState.isActive()) {
        console.log('App inactive - pausing processing');
        if (audioContext) audioContext.suspend();
    } else {
        console.log('App active - resuming processing');
        if (audioContext) audioContext.resume();
        source.connect(gainNode).connect(analyzer);
    }
}

async function main() {
    const {audioContext, source, analyzer, gainNode, sampleRate} = await initializeAudioAnalyzer(calculateGainValue());
    setupActivityMonitoring(audioContext, source, gainNode, analyzer);
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        await preventScreenSleep();
        
        const { spectrumCanvas, spectrumCanvasBg, fftCanvas, fftCanvasBg } = setupDOM()
        const pitchTracker = new PitchTracker(appState, {
            updateCounter: document.getElementById("update-counter"),
        }, {
            analyzer,
        }, {
            fftSize: FFT_SIZE,
            paddingFactor: PADDING_FACTOR,
            sampleRate,
            historySize: HISTORY_SIZE
        });

        const tuner = new Tuner(appState, {
            display: document.getElementById("tunerDisplay"), 
            displayText: document.getElementById("tunerDisplayText"),
        }, pitchTracker);
        

        const renderer = new Renderer(appState, {
            spectrumCanvas,
            spectrumCanvasBg,
            fftCanvas,
            fftCanvasBg
        }, {
            pitchTracker
        });

        await startLoops(pitchTracker, tuner, renderer);
    } catch (error) {
        console.error(`you got an error: ${error}`);
    }
}
// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    main();
});
