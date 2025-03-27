import { findInterpolatedPeak } from './parabolic_interpolation.js';
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
const FFT_SIZE = 4096*16;
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
let useParabolicInterpolation = true;
let usePeakInterpolation = true;
let usePhaseVocoder = true;
let useSpectralWhitening = false;
let useHarmonicFiltering = false;
let useLogScaling = true;
let useEnhancedPeakDetection = true;

// Threshold values for pitch detection
let th_1 = 0.0001; // Minimum magnitude threshold
let th_2 = 0.0001; // Peak detection threshold
let th_3 = 0.1; // Magnitude filtering threshold
let defaultMaxMagnitude = 0.0005; // Default maximum magnitude
let phaseStabilityThreshold = 0.1; // Phase vocoder stability threshold (lower is more strict)

// Initialize WebFFT
const fft = new webfft(FFT_SIZE);
fft.profile(); // Profile to find fastest implementation

// Prevent screen from sleeping
async function preventScreenSleep() {
    try {
        await navigator.wakeLock.request("screen");
        console.log("Wake lock acquired.");
    } catch (error) {
        console.log(`Warning: did not acquire wake lock: ${error.name}, ${error.message}`);
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

    // Apply log scaling if enabled (transforms peaks to be more parabolic)
    if (useLogScaling) {
        const epsilon = 1e-10;
        for (let i = 0; i < magnitudes.length; i++) {
            magnitudes[i] = Math.log(magnitudes[i] + epsilon);
        }
    }

    // Apply spectral whitening if enabled
    if (useSpectralWhitening) {
        magnitudes = applySpectralWhitening(magnitudes);
    }

    let maxMagnitude = Math.max(...magnitudes);
    if (maxMagnitude < th_1) {
        return [];
    }

    // Find peaks in the frequency domain
    let freqs = [];
    if (useParabolicInterpolation) {
        const findPeaks = (start, end, conditionFn) => {
            for (let i = start; i < end; i++) {
                if (!conditionFn(i) || magnitudes[i] < th_2) {
                    continue;
                }
                const peak = findInterpolatedPeak(magnitudes, i, sampleRate, FFT_SIZE);
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

        if (usePeakInterpolation) {
            findPeaks(2, frequencyBinCount - 2,
                i => {
                    const isLocalMax = magnitudes[i] > magnitudes[i-1] 
                                    && magnitudes[i] > magnitudes[i+1];
                    
                    if (!useEnhancedPeakDetection) {
                        return isLocalMax;
                    }
                    
                    // Enhanced peak detection checks wider neighborhood
                    const isProminent = magnitudes[i] > 1.2 * Math.max(
                        magnitudes[i-2], 
                        magnitudes[i+2]
                    );
                    
                    return isLocalMax && isProminent;
                }
            );
        } else {
            findPeaks(1, frequencyBinCount, () => true);
        }
    } else {
        for (let i = 1; i < frequencyBinCount; i++) {
            const frequency = i * sampleRate / FFT_SIZE;
            freqs.push({
                frequency: frequency,
                magnitude: magnitudes[i]
            });
        }
    }
    if (freqs.length == 0) {
        return freqs;
    }
    
    freqs.sort((a, b) => b.magnitude - a.magnitude);
    freqs = freqs.slice(0, 100);

    if (useHarmonicFiltering) {
        freqs = filterHarmonics(freqs);
    }
    
    const max2Magnitude = Math.max(defaultMaxMagnitude, freqs.length > 1 ? freqs[1].magnitude : 1);
    freqs = freqs.map(f => {
        f.magnitude = Math.min(1, f.magnitude / max2Magnitude);
        return f;
    })
    
    freqs = freqs.map(f => {
        f.magnitude = f.magnitude ** 2;
        return f;
    });
    
    freqs = freqs.filter(f => f.magnitude >= th_3)
    freqs = freqs.filter(f => !isNaN(f.frequency) && !isNaN(f.magnitude));
    freqs.sort((a, b) => b.magnitude - a.magnitude);
    freqs = freqs.slice(0, 30);
    
    return freqs;
}

// Track phase between frames
let lastPhases = null;
const PHASE_HISTORY = 5; // Number of frames to track phase consistency

// Create state manager for pitch tracking
const createPitchTracker = (historySize, sampleRate) => {
    const state = {
        fHistory: [],
        phaseHistory: [],
        currentOctave: 1,
        currentFs: [],
        phaseStability: []
    };

    function getOctave(frequency) {
        const C0 = 16.3515978313;
        return Math.floor(Math.log2(frequency / C0));
    }

    async function detectPitchAndOctave(signal, spectrum) {
        // Phase analysis
        const currentPhases = new Float32Array(FFT_SIZE/2);
        for (let i = 0; i < FFT_SIZE/2; i++) {
            currentPhases[i] = Math.atan2(spectrum[i*2 + 1], spectrum[i*2]);
        }

        // Calculate phase stability
        const phaseStability = new Float32Array(FFT_SIZE/2).fill(1);
        if (lastPhases && usePhaseVocoder) {
            for (let i = 0; i < FFT_SIZE/2; i++) {
                const phaseDiff = currentPhases[i] - lastPhases[i];
                // Calculate expected phase change for this bin's frequency
                const binFrequency = i * sampleRate / FFT_SIZE;
                const expectedPhase = 2 * Math.PI * binFrequency * (updateIntervalMs/1000);
                
                // Calculate raw phase difference
                let rawDiff = phaseDiff - expectedPhase;
                
                // Normalize to [-π, π] range with proper wrapping
                rawDiff = ((rawDiff + Math.PI) % (2*Math.PI));
                if (rawDiff < 0) rawDiff += 2*Math.PI; // Handle negative modulo
                const normalizedDiff = rawDiff - Math.PI;
                
                // Calculate bounded phase error [0,1]
                const phaseError = Math.min(1, Math.abs(normalizedDiff) / Math.PI);
                
                // Calculate stability [0,1] using squared error
                phaseStability[i] = 1 - (phaseError * phaseError);
            }
        }
        lastPhases = currentPhases;

        let frequencies = await detectPitch(spectrum, sampleRate, 0.07);
        if (usePhaseVocoder && frequencies.length > 0) {
            frequencies = frequencies.map(freq => {
                const bin = Math.round(freq.frequency * FFT_SIZE / sampleRate);
                if (bin >= 0 && bin < phaseStability.length) {
                    console.log(phaseStability[bin], phaseStabilityThreshold);
                    if (phaseStability[bin] >= phaseStabilityThreshold) {
                        return freq;
                    // } else if (phaseStability[bin] < phaseStabilityThreshold * 0.8) {
                    } else {
                        const instability = (phaseStabilityThreshold - phaseStability[bin]) / phaseStabilityThreshold;
                        // freq.magnitude *= (1 - (instability*0.5));
                        freq.magnitude *= phaseStability[bin];
                    }
                }
                return freq;
            });
        }
        
        if (frequencies.length == 0) {
            return [state.currentOctave, []];
        }
        
        let octave = getOctave(frequencies[0].frequency);
        return [octave, frequencies];
    }

    async function updateState(signal) {
        const complexSignal = prepareComplexArray(signal);
        const spectrum = fft.fft(complexSignal);
        const [octave, frequencies] = await detectPitchAndOctave(signal, spectrum);
        
        if (state.fHistory.length >= historySize) {
            state.fHistory.shift();
        }
        if (frequencies.length > 0) {
            state.fHistory.push(frequencies);
            state.currentFs = frequencies;
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
        
        // Transfer both canvases to the worker
        const mainOffscreen = mainCanvas.transferControlToOffscreen();
        const bgOffscreen = bgCanvas.transferControlToOffscreen();
        const historySize = calculateHistorySize(mainCanvas.width);
        
        worker.postMessage({
            type: 'init',
            mainCanvas: mainOffscreen,
            bgCanvas: bgOffscreen,
            historySize: historySize
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
    console.log(analyzer, gainNode.gain.value);
    
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
    return applyWindow(timeData, windows[currentWindow]);
    
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


// Convert to interleaved complex format
function prepareComplexArray(realSamples) {
    const complexArray = new Float32Array(FFT_SIZE * 2); // 2x size for interleaved
    for (let i = 0; i < FFT_SIZE; i++) {
        complexArray[i*2] = realSamples[i]; // Real part
        complexArray[i*2 + 1] = 0;         // Imaginary part (0 for real signals)
    }
    return complexArray;
}

// Initialize spectrum analyzer
async function initializeSpectrumAnalyzer() {
    try {
        // Initialize audio
        const {analyser, sampleRate} = await initializeAudioAnalyzer();
        await preventScreenSleep();
        
        // Set up canvas with OffscreenCanvas if supported
        const canvasInfo = setupCanvas("spectrumCanvas");
        if (!canvasInfo) {
            throw new Error('Failed to initialize canvas');
        }
        
        // Hide mic button, show record button and set up recording
        document.getElementById("enable-mic-button").style.display = "none";
        
        // Show interpolation toggle
        const interpolationToggle = document.getElementById("interpolation-toggle");
        interpolationToggle.classList.remove("hidden");
        interpolationToggle.style.display = "flex";
        
        // Add event listeners for processing toggles
        document.getElementById("enable-interpolation").addEventListener("change", function(e) {
            useParabolicInterpolation = e.target.checked;
        });
        document.getElementById("peak-interpolation").addEventListener("change", function(e) {
            usePeakInterpolation = e.target.checked;
        });
        document.getElementById("spectral-whitening").addEventListener("change", function(e) {
            useSpectralWhitening = e.target.checked;
        });
        document.getElementById("harmonic-filtering").addEventListener("change", function(e) {
            useHarmonicFiltering = e.target.checked;
        });
        document.getElementById("phase-vocoder").addEventListener("change", function(e) {
            usePhaseVocoder = e.target.checked;
        });
        document.getElementById("log-scaling").addEventListener("change", function(e) {
            useLogScaling = e.target.checked;
        });
        document.getElementById("enhanced-peaks").addEventListener("change", function(e) {
            useEnhancedPeakDetection = e.target.checked;
        });
        // Window function dropdown
        const windowSelect = document.getElementById("window-select");
        windowSelect.addEventListener("change", function(e) {
            currentWindow = e.target.value;
        });
        
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

        // Phase tolerance slider
        const phaseToleranceSlider = document.getElementById("phase-tolerance-slider");
        phaseToleranceSlider.value = phaseStabilityThreshold;
        document.getElementById("phase-tolerance-value").textContent = phaseStabilityThreshold.toFixed(2);
        phaseToleranceSlider.addEventListener("input", function(e) {
            phaseStabilityThreshold = parseFloat(e.target.value);
            document.getElementById("phase-tolerance-value").textContent = phaseStabilityThreshold.toFixed(2);
        });
        
        // setupRecording(canvas, audioStream);
        
        // Initialize pitch tracker
        const historySize = calculateHistorySize(canvasInfo.canvas.width);
        const pitchTracker = createPitchTracker(historySize, sampleRate);
        
        let lastWarn = 0;
        let update = async function() {
            const startTime = performance.now();
            const signal = getAudioData(analyser);
            await pitchTracker.updateState(signal);
            const endTime = performance.now();
            const duration = endTime - startTime;
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

        let visualize = async function() {
            const startTime = performance.now();
            renderVisualization(canvasInfo, historySize, pitchTracker.state);
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
