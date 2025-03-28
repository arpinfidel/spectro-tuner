import { 
    findInterpolatedPeak, 
    findInterpolatedPeakQuinn,
    trackFrequencyChangesKalman 
} from './parabolic_interpolation.js';
import { findInterpolatedPeakQuinnComplex, findInterpolatedPeakJacobsen } from './enhanced_interpolation.js';
import { 
    gaussianWindow, 
    hanningWindow, 
    blackmanHarrisWindow, 
    hammingWindow,
    flatTopWindow,
    applyWindow,
} from './window_functions.js';
import Queue from 'yocto-queue';
import webfft from 'webfft';

// Constants for audio processing
const ACTUAL_FFT_SIZE = 1 << 6;
const PADDING_FACTOR = 1 << 6;
const FFT_SIZE = ACTUAL_FFT_SIZE * PADDING_FACTOR;
const HISTORY_SCALE = 1;
const updateIntervalMs = 1000/300;
const visualizeIntervalMs = 1000/60;
const calculateHistorySize = width => Math.round(width / HISTORY_SCALE);
// Initialize all window functions
const windows = {
    'hanning': hanningWindow(FFT_SIZE),
    'gaussian': gaussianWindow(FFT_SIZE),
    'blackman-harris': blackmanHarrisWindow(FFT_SIZE),
    'hamming': hammingWindow(FFT_SIZE),
    'flat-top': flatTopWindow(FFT_SIZE)
};
let currentWindow = 'hanning';

// Default configuration for analysis
let interpolationMethod = "parabolic"; // Changed from useParabolicInterpolation boolean to a string
let useSpectralWhitening = false;
let useHarmonicFiltering = false;
let useKalmanFilters = false;

// Threshold values for pitch detection
let th_1 = 0.0001; // Minimum magnitude threshold
let th_2 = 0.001; // Peak detection threshold
let th_3 = 0.001; // Magnitude filtering threshold
let defaultMaxMagnitude = 0.0005; // Default maximum magnitude

// Initialize WebFFT
const fft = new webfft(FFT_SIZE);
fft.profile(); // Profile to find fastest implementation

// Prevent screen from sleeping
async function preventScreenSleep() {
    try {
        await navigator.wakeLock.request("screen");
        // console.log("Wake lock acquired.");
    } catch (error) {
        // console.log(`Warning: did not acquire wake lock: ${error.name}, ${error.message}`);
    }
}

// Detect browser type and return appropriate gain value
function detectBrowser() {
    const userAgent = navigator.userAgent;
    return userAgent.includes("Chrome") ? 1 :
           userAgent.includes("Firefox") ? 3 :
           userAgent.includes("Safari") ? 4 :
           userAgent.includes("Edge") ? 3 : 1;
}

function getOctave(frequency) {
    const C0 = 16.3515978313;
    const octave = Math.floor(Math.log2(frequency / C0));
    return octave;
}

// Convert to interleaved complex format
function prepareComplexArray(realSamples) {
    const complexArray = new Float32Array(FFT_SIZE * 2); // 2x size for interleaved
    for (let i = 0; i < FFT_SIZE; i++) {
        complexArray[i*2] = realSamples[i]; // Real part
        complexArray[i*2 + 1] = 0;         // Imaginary part (0 for real signals)
    }
    for (let i = FFT_SIZE; i < FFT_SIZE * 2; i++) {
        complexArray[i*2] = 0; // Real part
        complexArray[i*2 + 1] = 0;         // Imaginary part (0 for real signals)
    }
    return complexArray;
}

// Pitch detection using FFT spectrum
async function detectPitch(spectrum, sampleRate) {
    // Convert interleaved complex FFT output to magnitudes
    const frequencyBinCount = FFT_SIZE / 2;
    let magnitudes = new Float32Array(frequencyBinCount);
    for (let i = 0; i < frequencyBinCount; i++) {
        const real = spectrum[i*2];
        const imag = spectrum[i*2 + 1];
        magnitudes[i] = Math.sqrt(real*real + imag*imag);
    }

    // Apply spectral whitening if enabled
    if (useSpectralWhitening) {
        magnitudes = applySpectralWhitening(magnitudes);
    }

    let maxMagnitude = Math.max(...magnitudes);
    // console.log("maxMagnitude", maxMagnitude)
    if (maxMagnitude < th_1) {
        return [[], []];
    }

    // Find peaks in the frequency domain
    let rawfreqs = [];
    let freqs = [];
    
    for (let i = 1; i < frequencyBinCount; i++) {
        const frequency = i * sampleRate / FFT_SIZE;
        rawfreqs.push({
            frequency: frequency,
            magnitude: magnitudes[i]
        });
    }
    
    if (interpolationMethod === "none") {
        freqs = JSON.parse(JSON.stringify(rawfreqs));
    } else {
        const findPeaks = (start, end, conditionFn, peakFn) => {
            for (let i = start; i < end; i++) {
                if (!conditionFn(i) || magnitudes[i] < th_2) {
                    continue;
                }
                let peak = peakFn(i)
                
                if (peak.frequency < 20
                    || peak.frequency > 22000
                    || isNaN(peak.frequency)
                    || isNaN(peak.magnitude)
                ) {
                    continue;
                }
                freqs.push(peak);
            }
        };

        switch (interpolationMethod) {
            case "parabolic":
                findPeaks(2, frequencyBinCount - 2,
                    i =>
                        magnitudes[i] > magnitudes[i-1]
                        && magnitudes[i] > magnitudes[i+1],
                    i => findInterpolatedPeak(magnitudes, i, sampleRate, FFT_SIZE),
                );
                break;
            case "quinn":
                findPeaks(3, frequencyBinCount - 2,
                    i =>
                        magnitudes[i] > magnitudes[i-1]
                        && magnitudes[i] > magnitudes[i+1]
                        && magnitudes[i] > magnitudes[i-2]
                        && magnitudes[i] > magnitudes[i+2],
                    i => findInterpolatedPeakQuinn(magnitudes, i, sampleRate, FFT_SIZE),
                );
                break;
            case "quinn-complex":
                findPeaks(3, frequencyBinCount - 2,
                    i =>
                        magnitudes[i] > magnitudes[i-1]
                        && magnitudes[i] > magnitudes[i+1]
                        && magnitudes[i] > magnitudes[i-2]
                        && magnitudes[i] > magnitudes[i+2],
                    i => findInterpolatedPeakQuinnComplex(spectrum, i, sampleRate, FFT_SIZE),
                );
                break;
            case "jacobsen":
                findPeaks(3, frequencyBinCount - 2,
                    i =>
                        magnitudes[i] > magnitudes[i-1]
                        && magnitudes[i] > magnitudes[i+1]
                        && magnitudes[i] > magnitudes[i-2]
                        && magnitudes[i] > magnitudes[i+2],
                    i => findInterpolatedPeakJacobsen(spectrum, i, sampleRate, FFT_SIZE),
                );
                break;
        }
    }
    
    if (freqs.length == 0) {
        return [rawfreqs, freqs];
    }
    
    freqs.sort((a, b) => b.magnitude - a.magnitude);
    freqs = freqs.slice(0, 100);

    if (useHarmonicFiltering) {
        freqs = filterHarmonics(freqs);
    }
    // console.log("freqs1", JSON.parse(JSON.stringify(freqs)))
    
    // remove subharmonics
    // freqs = freqs.filter(f => !isSubharmonic(f.frequency, freqs.map(f => f.frequency)));
    // console.log("freqs2", freqs)

    // maxMagnitude = Math.max(...freqs.map(f => f.magnitude));
    // console.log("maxMagnitude", maxMagnitude)
    const max2Magnitude = Math.max(defaultMaxMagnitude, freqs.length > 1 ? freqs[1].magnitude : 1);
    freqs = freqs.map(f => {
        f.magnitude = Math.min(1, f.magnitude / max2Magnitude);
        return f;
    })
    // console.log("freqs2", JSON.parse(JSON.stringify(freqs)))
    freqs = freqs.map(f => {
        f.magnitude = f.magnitude ** 2;
        return f;
    });
    // console.log("freqs3", JSON.parse(JSON.stringify(freqs)))
    freqs = freqs.filter(f => f.frequency >= 30 && f.magnitude >= th_3)

    // const minMagnitude = Math.min(...freqs.map(f => f.magnitude));
    // if (minMagnitude < 1) {
    //     freqs = freqs.map(f => {
    //         f.magnitude = (f.magnitude - minMagnitude) / (1 - minMagnitude);
    //         // f.magnitude = f.magnitude * 0.8 + 0.2;
    //         return f;
    //     })
    // }
    
    freqs = freqs.filter(f => !isNaN(f.frequency) && !isNaN(f.magnitude));
    freqs.sort((a, b) => b.magnitude - a.magnitude);
    freqs = freqs.slice(0, 30);
    
    return [rawfreqs, freqs];
}

// Create state manager for pitch tracking
const createPitchTracker = (historySize, sampleRate) => {
    const state = {
        fHistory: [],
        currentOctave: 1,
        currentFs: [],
        currentRawFs: [],
    };
    let kalmanFilters = {};

    async function detectPitchAndOctave(signal) {
        const complexSignal = prepareComplexArray(signal);
        const spectrum = fft.fft(complexSignal);        
        const [rawfreqs, frequencies] = await detectPitch(spectrum, sampleRate, 0.07);
        
        if (frequencies.length == 0) {
            return [state.currentOctave, [], []];
        }
        
        // TODO: do for each note
        let octave = getOctave(frequencies[0].frequency);
        
        return [octave, rawfreqs, frequencies];
    }

    async function updateState(signal) {
        const [octave, rawfreqs, frequencies] = await detectPitchAndOctave(signal);
        if (state.fHistory.length >= historySize) {
            state.fHistory.shift();
        }
        if (frequencies.length > 0) {
            if (useKalmanFilters) {
                // Apply Kalman filtering to frequencies
                const { peaks, kalmanFilters: updatedFilters } = trackFrequencyChangesKalman(
                    frequencies,
                    state.currentFs,
                    40,
                    kalmanFilters
                );
                
                kalmanFilters = updatedFilters;
                frequencies = peaks;
            }
            state.fHistory.push(frequencies);
            state.currentFs = frequencies;
            state.currentRawFs = rawfreqs;
            
            state.currentOctave = Math.round(octave) || state.currentOctave;
        } else {
            state.fHistory.push(null);
            state.currentFs = null;
        }
    }

    return {
        state,
        updateState
    };
};

// Set up canvas with proper dimensions and transfer to worker if supported
function setupCanvas(canvasId) {
    const mainCanvas = document.getElementById(canvasId);
    const bgCanvas = document.getElementById(`${canvasId}Background`);
    
    if (!mainCanvas || !bgCanvas) {
        console.error('Canvas elements not found');
        return null;
    }
    
    mainCanvas.style.width = "100%";
    mainCanvas.style.height = "100%";
    mainCanvas.width = mainCanvas.offsetWidth;
    mainCanvas.height = mainCanvas.offsetHeight;
    bgCanvas.style.width = "100%";
    bgCanvas.style.height = "100%";
    bgCanvas.width = bgCanvas.offsetWidth;
    bgCanvas.height = bgCanvas.offsetHeight;
    
    // Check if OffscreenCanvas is supported for main canvas
    if ('transferControlToOffscreen' in mainCanvas) {
        // Create a worker for rendering
        const worker = new Worker(new URL('./visualizer.worker.js', import.meta.url), { type: 'module' });
        
        // Transfer canvases to the worker
        const mainOffscreen = mainCanvas.transferControlToOffscreen();
        const bgOffscreen = bgCanvas.transferControlToOffscreen();
        
        const historySize = calculateHistorySize(mainCanvas.width);
        
        worker.postMessage({
            type: 'init',
            mainCanvas: mainOffscreen,
            bgCanvas: bgOffscreen,
            historySize: historySize,
            isFFTDetail: canvasId === 'fftDetailCanvas'
        }, [mainOffscreen, bgOffscreen]);
        
        // Handle window resize
        window.addEventListener('resize', () => {
            const width = mainCanvas.offsetWidth;
            const height = mainCanvas.offsetHeight;
            const historySize = calculateHistorySize(width);
            
            // Resize canvas
            mainCanvas.width = width;
            mainCanvas.height = height;
            
            worker.postMessage({
                type: 'resize',
                width: width,
                height: height,
                historySize: historySize
            });
        });
        
        return {
            canvas: mainCanvas,
            worker,
            isOffscreen: true
        };
    } else {
        // Fallback to regular canvas if OffscreenCanvas is not supported
        const ctx = mainCanvas.getContext("2d");
        ctx.font = "20px Signika";
        
        return {
            canvas: mainCanvas,
            ctx,
            isOffscreen: false
        };
    }
}

// Draw visualization components - handles both OffscreenCanvas and regular canvas
function renderVisualization(canvasInfo, historySize, state) {
    // Send state to worker for rendering
    canvasInfo.worker.postMessage({
        type: 'render',
        data: {
            state: state
        }
    });
    state.fHistory = [];
}

// Initialize audio analyzer
async function initializeAudioAnalyzer() {
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
    
    gainNode.gain.value = detectBrowser();
    // console.log(analyzer, gainNode.gain.value);
    
    source.connect(gainNode).connect(analyzer);
    
    return {
        analyser: analyzer,
        sampleRate: audioContext.sampleRate,
    };
}

function getAudioData(analyzer) {
    const timeData = new Float32Array(FFT_SIZE);
    analyzer.getFloatTimeDomainData(timeData);

    // Apply selected window function
    const windowedData = applyWindow(timeData, windows[currentWindow]);

    // Zero-pad the data
    const paddedData = new Float32Array(FFT_SIZE * PADDING_FACTOR);
    paddedData.set(windowedData, 0); // Copy windowed data to the beginning
    for (let i = FFT_SIZE; i < FFT_SIZE * 2; i++) {
        paddedData[i] = 0; // Fill the rest with zeros
    }

    return paddedData;
}

// Apply spectral whitening to magnitudes
function applySpectralWhitening(magnitudes) {
    // Calculate mean magnitude
    const mean = magnitudes.reduce((sum, val) => sum + val, 0) / magnitudes.length;
    
    // Whitening factor to prevent division by zero
    const epsilon = 1e-10;
    
    // Apply whitening
    for (let i = 0; i < magnitudes.length; i++) {
        magnitudes[i] = magnitudes[i] / (mean + epsilon);
    }
    return magnitudes;
}

function filterHarmonics(frequencies, tolerance = 0.05) {
    if (frequencies.length === 0) return [];
    
    // Sort by magnitude
    frequencies.sort((a, b) => b.magnitude - a.magnitude);
    
    // Consider the first three strongest peaks as potential fundamentals
    const potentialFundamentals = frequencies.slice(0, 3).map(peak => peak.frequency);
    
    // Filter out frequencies that are likely harmonics
    return frequencies.map(peak => {
        for (const potentialFundamental of potentialFundamentals) {
            for (let harmonic = 2; harmonic <= 10; harmonic++) {
                const harmonicFreq = potentialFundamental * harmonic;
                const relativeError = Math.abs(peak.frequency - harmonicFreq) / harmonicFreq;
                
                if (relativeError < tolerance) {
                    peak.magnitude *= 0.7; // This is likely a harmonic
                }
            }
        }
        return peak;
    });
}


// Initialize spectrum analyzer
async function initializeSpectrumAnalyzer() {
    try {
        // Initialize audio
        const {analyser, sampleRate} = await initializeAudioAnalyzer();
        await preventScreenSleep();
        
        // Set up main spectrum canvas with OffscreenCanvas if supported
        const spectrumCanvasInfo = setupCanvas("spectrumCanvas");
        if (!spectrumCanvasInfo) {
            throw new Error('Failed to initialize spectrum canvas');
        }

        // Set up FFT detail canvas
        const fftDetailCanvasInfo = setupCanvas("fftDetailCanvas");
        if (!fftDetailCanvasInfo) {
            throw new Error('Failed to initialize FFT detail canvas');
        }
        
        // Hide mic button, show record button and set up recording
        document.getElementById("enable-mic-button").style.display = "none";
        
        // Show interpolation toggle
        const interpolationToggle = document.getElementById("interpolation-toggle");
        interpolationToggle.classList.remove("hidden");
        interpolationToggle.style.display = "flex";
        
        // Add event listener for interpolation dropdown
        document.getElementById("interpolation-select").addEventListener("change", function(e) {
            interpolationMethod = e.target.value;
        });
        
        document.getElementById("spectral-whitening").addEventListener("change", function(e) {
            useSpectralWhitening = e.target.checked;
        });
        document.getElementById("harmonic-filtering").addEventListener("change", function(e) {
            useHarmonicFiltering = e.target.checked;
        });
        // Window function dropdown
        const windowSelect = document.getElementById("window-select");
        windowSelect.addEventListener("change", function(e) {
            currentWindow = e.target.value;
        });
        
        // Add FFT details toggle
        let showFFTDetails = true;
        const fftDetailsToggle = document.getElementById("fft-details-toggle");
        const fftDetailsContainer = document.querySelector("#fftDetailCanvas").parentElement;
        
        const toggleFFTDetails = () => {
            showFFTDetails = !showFFTDetails;
            fftDetailsContainer.style.display = showFFTDetails ? "block" : "none";
            fftDetailsToggle.textContent = showFFTDetails ? "Hide FFT Details" : "Show FFT Details";
        }

        fftDetailsToggle.addEventListener("click", toggleFFTDetails);
        toggleFFTDetails(); // immediately hide. can't default to hidden in html because can't resize canvas after transfer

        // Add event listeners for threshold sliders
        const th1Slider = document.getElementById("th-1-slider");
        const th2Slider = document.getElementById("th-2-slider");
        const th3Slider = document.getElementById("th-3-slider");
        const maxMagnitudeSlider = document.getElementById("max-magnitude-slider");
        
        // Set initial values from JavaScript variables
        th1Slider.value = th_1;
        document.getElementById("th-1-value").textContent = th_1.toFixed(4);
        
        th2Slider.value = th_2;
        document.getElementById("th-2-value").textContent = th_2.toFixed(4);
        
        th3Slider.value = th_3;
        document.getElementById("th-3-value").textContent = th_3.toFixed(4);
        
        maxMagnitudeSlider.value = defaultMaxMagnitude;
        document.getElementById("max-magnitude-value").textContent = defaultMaxMagnitude.toFixed(4);
        
        // Add event listeners for slider changes
        th1Slider.addEventListener("input", function(e) {
            th_1 = parseFloat(e.target.value);
            document.getElementById("th-1-value").textContent = th_1.toFixed(4);
        });
        
        th2Slider.addEventListener("input", function(e) {
            th_2 = parseFloat(e.target.value);
            document.getElementById("th-2-value").textContent = th_2.toFixed(4);
        });
        
        th3Slider.addEventListener("input", function(e) {
            th_3 = parseFloat(e.target.value);
            document.getElementById("th-3-value").textContent = th_3.toFixed(4);
        });
        
        maxMagnitudeSlider.addEventListener("input", function(e) {
            defaultMaxMagnitude = parseFloat(e.target.value);
            document.getElementById("max-magnitude-value").textContent = defaultMaxMagnitude.toFixed(4);
        });
        
        // setupRecording(canvas, audioStream);
        
        // Initialize pitch tracker
        const historySize = calculateHistorySize(spectrumCanvasInfo.canvas.width);
        const pitchTracker = createPitchTracker(historySize, sampleRate);
        
        let lastWarn = 0;
        let fftCounter = document.getElementById("fft-counter");
        let avgDuration = 0;
        const weight = 0.1; // Weight for moving average
        let updateCounter = async function() {
            const updatesPerSecond = 1000 / avgDuration;
            fftCounter.textContent = `update/s: ${updatesPerSecond.toFixed(1)} (avg: ${avgDuration.toFixed(1)}ms)`;
            setTimeout(updateCounter, 1000);
        };
        updateCounter();
        
        const tunerDisplay = document.getElementById("tunerDisplay");
        const tunerDisplayText = document.getElementById("tunerDisplayText");
        let updateTuner = async function() {
            updateTunerDisplay(tunerDisplay, tunerDisplayText, pitchTracker.state);
            setTimeout(updateTuner, 100);
        };
        updateTuner();

        let update = async function() {
            const startTime = performance.now();
            const signal = getAudioData(analyser);
            await pitchTracker.updateState(signal);
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            // Calculate weighted moving average
            avgDuration = (1 - weight) * avgDuration + weight * duration;
            
            if (duration > updateIntervalMs * 1.5) {
                const now = performance.now();
                if (now - lastWarn > 2000) {
                    lastWarn = now;
                    console.warn('Pitch tracking is taking longer than expected:', duration, 'ms');
                }
            }
            setTimeout(update, updateIntervalMs);
        };
        update();

        const visualize = async function() {
            const startTime = performance.now();
            // Render visualizations through their respective workers
            renderVisualization(spectrumCanvasInfo, historySize, pitchTracker.state);
            if (showFFTDetails) {
                fftDetailCanvasInfo.worker.postMessage({
                    type: 'render', 
                    data: {
                        state: pitchTracker.state,
                        isFFTDetail: true
                    }
                });
            }
            const endTime = performance.now();
            const duration = endTime - startTime;

            if (duration > visualizeIntervalMs) {
                console.warn('Visualization is taking longer than expected:', duration, 'ms');
            }
            setTimeout(visualize, visualizeIntervalMs);
        };
        visualize();
    } catch (error) {
        localStorage.setItem("micPermission", "no");
        const micButton = document.getElementById("enable-mic-button");
        micButton.innerText = "Microphone access denied. Try again";
        micButton.style.backgroundColor = "#ff4444";
        console.error(`you got an error: ${error}`);
    }
}
function frequencyToNote(frequency) {
    const A4 = 440;  // Reference frequency for A4
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    // Calculate the number of semitones from A4
    const semitonesFromA4 = Math.round(12 * Math.log(frequency / A4) / Math.log(2));
    
    // Calculate the frequency for the closest semitone
    const closestFrequency = A4 * Math.pow(2, semitonesFromA4 / 12);
    
    // Determine the note name and octave
    const noteIndex = (semitonesFromA4 + 9 + 12*100) % 12;  // 9 because A4 is the 9th note in the scale (0-indexed)
    const octave = Math.floor((semitonesFromA4 + 9) / 12) + 4; // A4 is the 4th octave
    
    // Calculate the cents deviation
    const centsDeviation = 1200 * Math.log(frequency / closestFrequency) / Math.log(2);

    return {
        note: noteNames[noteIndex],
        octave: octave,
        cents: centsDeviation
    };
}


let tunerFreq = 0;
const tunerFreqWeight = 0.1;
// Update tuner display with current note and cents
function updateTunerDisplay(tunerDisplay, tunerDisplayText, state) {
    const centsThreshold = 5;

    let freqs = state.currentFs;
    if (freqs && freqs.length > 0) {
        freqs = freqs.sort((a, b) => b.magnitude - a.magnitude);
    }

    let style, noteName;
    let invalid = false;
    let freq;
    if (!freqs
        || freqs.length === 0
        || freqs[0].frequency === 0
        // larger than 1.5x the median
        // already sorted by magnitued
        || freqs[0].magnitude < 2*freqs[Math.floor(freqs.length / 2)].magnitude
    ) {
        invalid = true;
        freq = 0;
    } else {
        freq = freqs[0].frequency;
    }

    tunerFreq = tunerFreqWeight * tunerFreq + (1 - tunerFreqWeight) * freq;
    let {note, octave, cents} = frequencyToNote(tunerFreq);
    
    if (!octave || octave < 0) {
        invalid = true;
    }
    // console.log(octave, tunerFreq, cents);

    if (invalid) {
        style = `--value: 50; --content: '-'; --primary: #777777; --secondary: #555555`
        noteName = "-";
    } else {
        style = `--value: ${50+cents}; --content: '${Math.round(cents, 1)}'; --primary: ${Math.abs(cents) > centsThreshold ? '#ff4444' : '#44ff44'}; --secondary: #555555`
        noteName = `${note} ${octave}`;
    }

    tunerDisplay.style = style;
    tunerDisplayText.innerText = noteName;
}

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await navigator.mediaDevices.getUserMedia({ audio: true });
        localStorage.setItem("micPermission", "yes");
        
        initializeSpectrumAnalyzer();
        // Hide enable mic buttons since permission was granted
        const enableMicButton = document.getElementById("enable-mic-button");
        if (enableMicButton) {
            enableMicButton.style.display = "none";
        }
        const enableTunerMicButton = document.getElementById("enable-tuner-mic-button");
        if (enableTunerMicButton) {
            enableTunerMicButton.style.display = "none";
        }
    } catch (error) {
        localStorage.setItem("micPermission", "no");
        const enableTunerMicButton = document.getElementById("enable-tuner-mic-button");
        if (enableTunerMicButton) {
            enableTunerMicButton.innerText = "Microphone access denied. Click to try again";
            enableTunerMicButton.style.backgroundColor = "#ff4444";
        }
        console.error(`you got an error: ${error}`);
    }
});
