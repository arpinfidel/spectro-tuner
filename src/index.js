import { findInterpolatedPeak } from './parabolic_interpolation.js';
import { gaussianWindow } from './window_functions.js';
import webfft from 'webfft';

// Constants for audio processing
const FFT_SIZE = 4096*2;
const HISTORY_SCALE = 1.5;
const CIRCLE_RADIUS = 1.5;
const calculateHistorySize = width => Math.round(width / HISTORY_SCALE);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"];
const BACKGROUND_COLOR = "rgb(16,7,25)";
const gWindow = gaussianWindow(FFT_SIZE);

// Configuration for parabolic interpolation
let useParabolicInterpolation = true; // Default to enabled
let usePeakInterpolation = true; // Default to enabled
let useGaussianWindow = true; // Default to enabled

// Threshold values for pitch detection
let th_1 = 0.0001; // Minimum magnitude threshold
let th_2 = 0.0001; // Peak detection threshold
let th_3 = 0.0001; // Magnitude filtering threshold
let defaultMaxMagnitude = 0.0005; // Default maximum magnitude


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


// Pitch detection using autocorrelation with subharmonic filtering
async function detectPitch(signal, sampleRate) {
    // Using global threshold values defined at the top of the file

    // Create a temporary audio context for processing
    const tempContext = new OfflineAudioContext(1, FFT_SIZE, sampleRate);
    
    // Create a buffer with our signal data
    const audioBuffer = tempContext.createBuffer(1, signal.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Copy signal data to the buffer
    for (let i = 0; i < signal.length; i++) {
        channelData[i] = (signal[i]-128.0) / 128.0;
    }
    
    // Apply Gaussian window to the signal before FFT
    // This reduces spectral leakage and improves frequency resolution
    if (useGaussianWindow) {
        for (let i = 0; i < signal.length; i++) {
            channelData[i] = channelData[i] * gWindow[i];
        }
    }
    
    // Create an analyzer node
    const analyser = tempContext.createAnalyser();
    analyser.fftSize = FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    
    // Create a source node from our buffer and connect to the analyzer
    const source = tempContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    source.connect(tempContext.destination);
    
    // Start the source and wait for rendering to complete
    source.start(0);
    await tempContext.startRendering();
    
    // Get frequency data
    const frequencyBinCount = analyser.frequencyBinCount;
    const frequencyData = new Float32Array(frequencyBinCount);
    analyser.getFloatFrequencyData(frequencyData);
    
    // Convert to magnitudes
    const magnitudes = new Float32Array(frequencyBinCount);
    for (let i = 0; i < frequencyBinCount; i++) {
        magnitudes[i] = Math.pow(10, frequencyData[i] / 20);
    }

    let maxMagnitude = Math.max(...magnitudes);
    console.log("maxMagnitude", maxMagnitude)
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
                i =>
                    magnitudes[i] > magnitudes[i-1]
                    && magnitudes[i] > magnitudes[i+1]
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
    
    maxMagnitude = Math.max(...freqs.map(f => f.magnitude));
    console.log("maxMagnitude", maxMagnitude)
    maxMagnitude = Math.max(defaultMaxMagnitude, maxMagnitude);

    freqs = freqs.map(f => {
        f.magnitude /= maxMagnitude;
        return f;
    })
    
    freqs = freqs.map(f => {
        if (f.magnitude < th_3) {
            f.magnitude = 0.0000001;
        }
        return f;
    })

    freqs.sort((a, b) => b.magnitude - a.magnitude);
    freqs = freqs.filter(f => !isNaN(f.frequency) && !isNaN(f.magnitude));
    freqs = freqs.slice(0, 30);
    freqs = freqs.map(f => {
        f.magnitude = f.magnitude*f.magnitude
        return f;
    })

    // Return the strongest frequency, or 0 if none found
    return freqs;
}

// Convert frequency to MIDI note number
function frequencyToMidiNotes(frequencies) {
    return frequencies.map(frequency => frequency.frequency > 31 ? 12 * Math.log2(frequency.frequency / 440) + 69 : 0);
}

// Get note class (0-11) from MIDI note number
function getNoteClasses(midiNotes) {
    return midiNotes.map(midiNote => midiNote % 12);
}

function getPosition(values, height, min, max, exponent = 2) {
    return values.map(value => height * ((value - min) / (max - min)) ** exponent);
}

// Create state manager for pitch tracking
const createPitchTracker = (historySize, sampleRate) => {
    const state = {
        fHistory: [],
        currentOctave: 1,
        currentFs: []
    };

    function getOctave(frequency) {
        const C0 = 16.3515978313;
        return Math.floor(Math.log2(frequency / C0));
    }
    async function detectPitchAndOctave(signal) {
        const frequencies = await detectPitch(signal, sampleRate, 0.07);
        
        if (frequencies.length == 0) {
            return [state.currentOctave, []];
        }
        
        // TODO: do for each note
        let octave = getOctave(frequencies[0].frequency);
        
        return [octave, frequencies];
    }

    async function updateState(signal) {
        const [octave, frequencies] = await detectPitchAndOctave(signal);
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

// Set up canvas with proper dimensions
function setupCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.font = "20px Signika";
    
    return {
        canvas,
        ctx
    };
}

// Draw visualization components
function renderVisualization(ctx, historySize, canvas, state) {
    // Clear canvas
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, historySize * HISTORY_SCALE, canvas.height);
    
    
    const notePositions = getPosition(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 
        canvas.height, -0.5, 12.5, 1
    );
    
    for (let i = 0; i < notePositions.length; i++) {
        ctx.fillStyle = "#D0D7DE";
        ctx.fillRect(50, canvas.height - notePositions[i], historySize * HISTORY_SCALE, 1);
    }
    
    // Draw frequency history
    for (let i = 0; i < state.fHistory.length; i++) {
        if (state.fHistory[i] === null) {
            continue;
        }
        
        const freqs = state.fHistory[i];
        const midiNotes = frequencyToMidiNotes(freqs);
        const noteClasses = getNoteClasses(midiNotes);
        const hues = noteClasses.map(noteClass => noteClass * (360 / 12));
        
        for (let j = 0; j < midiNotes.length; j++) {
            const hue = hues[j];
            const noteClass = noteClasses[j];
            ctx.beginPath();
            ctx.fillStyle = `hsla(${hue}, 100%, 50%, ${freqs[j].magnitude})`;
            ctx.arc(
                i * HISTORY_SCALE + 4 * HISTORY_SCALE, 
                canvas.height - (noteClass + 0.5) / (12.5 + 0.5) * canvas.height, 
                CIRCLE_RADIUS, 
                0, 
                2 * Math.PI
            );
            ctx.fill();
        }
    }
    
    for (let i = 0; i < notePositions.length; i++) {
        ctx.fillStyle = "#D0D7DE";
        ctx.fillText(
            `${NOTE_NAMES[i]}${i == 12 ? state.currentOctave + 1 : state.currentOctave}`, 
            10, 
            canvas.height - notePositions[i] + 7
        );
    }
    
    if (state.currentFs) {
        ctx.fillText(
            `f[Hz]: ${state.currentFs && state.currentFs.slice(0, 2).map(f => Math.round(f.frequency)).join(", ")}`, 
            canvas.width - 150, 
            20
        );
    }
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
    
    analyzer.smoothingTimeConstant = 0;
    source.connect(gainNode).connect(analyzer);
    analyzer.fftSize = FFT_SIZE;
    
    return {
        analyser: analyzer,
        sampleRate: audioContext.sampleRate,
    };
}

// Get audio data from analyzer
function getAudioData(analyzer) {
    const timeData = new Uint8Array(FFT_SIZE);
    analyzer.getByteTimeDomainData(timeData);
    
    const signal = Array.from(timeData);
    
    return signal;
}

// Initialize spectrum analyzer
async function initializeSpectrumAnalyzer() {
    try {
        // Initialize audio
        const {analyser, sampleRate} = await initializeAudioAnalyzer();
        await preventScreenSleep();
        
        // Set up canvas
        const {canvas, ctx} = setupCanvas("spectrumCanvas");
        
        // Hide mic button, show record button and set up recording
        document.getElementById("enable-mic-button").style.display = "none";
        
        // Show interpolation toggle
        const interpolationToggle = document.getElementById("interpolation-toggle");
        interpolationToggle.classList.remove("hidden");
        interpolationToggle.style.display = "flex";
        
        // Add event listener for interpolation toggle
        document.getElementById("enable-interpolation").addEventListener("change", function(e) {
            useParabolicInterpolation = e.target.checked;
        });
        document.getElementById("peak-interpolation").addEventListener("change", function(e) {
            usePeakInterpolation = e.target.checked;
        });
        document.getElementById("gaussian-window").addEventListener("change", function(e) {
            useGaussianWindow = e.target.checked;
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
        
        // setupRecording(canvas, audioStream);
        
        // Initialize pitch tracker
        const historySize = calculateHistorySize(canvas.width);
        const pitchTracker = createPitchTracker(historySize, sampleRate);
        
        let animate = function() {
            const signal = getAudioData(analyser);
            pitchTracker.updateState(signal);
            renderVisualization(ctx, historySize, canvas, pitchTracker.state);
            requestAnimationFrame(animate);
        };

        // Start animation loop
        requestAnimationFrame(animate);
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
            enableTunerMicButton.addEventListener("click", initializeTuner);
        }
    }
});
