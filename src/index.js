import { findInterpolatedPeak } from './parabolic_interpolation.js';
import webfft from 'webfft';

// Constants for audio processing
const FFT_SIZE = 4096*4;
const POWER_THRESHOLD = 0.01;
const HISTORY_SCALE = 2;
const CIRCLE_RADIUS = 1.5;
const OCTAVE_HISTORY_LENGTH = 5;
const calculateHistorySize = width => Math.round(width / HISTORY_SCALE);
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"];
const BACKGROUND_COLOR = "rgb(16,7,25)";

// Configuration for parabolic interpolation
let useParabolicInterpolation = true; // Default to enabled
let usePeakInterpolation = true; // Default to enabled

// Check if microphone permission was previously granted
async function checkMicrophonePermission() {
    if (localStorage.getItem("micPermission") === "yes") {
        try {
            return (await navigator.permissions.query({
                name: "microphone"
            })).state === "granted" ? true : (
                console.error("New session detected, please enable the microphone again."),
                false
            );
        } catch {
            return console.error("You are on Firefox, need to enable mic manually again."),
            false;
        }
    }
    return false;
}

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

// Helper function to check for subharmonic artifacts
function isSubharmonic(frequency, frequencies, tolerance = 0.08) {
    return false;
}

// Pitch detection using autocorrelation with subharmonic filtering
async function detectPitch(signal, sampleRate, threshold = 0.1) {
    const fft = new Float32Array(FFT_SIZE);
    const fftData = new Float32Array(FFT_SIZE);
    
    // Create a temporary audio context for processing
    const tempContext = new OfflineAudioContext(1, FFT_SIZE, sampleRate);
    
    // Create a buffer with our signal data
    const audioBuffer = tempContext.createBuffer(1, signal.length, sampleRate);
    const channelData = audioBuffer.getChannelData(0);
    
    // Copy signal data to the buffer
    for (let i = 0; i < signal.length; i++) {
        channelData[i] = signal[i] / 128.0;
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
    
    // Convert to magnitudes and find max
    const magnitudes = new Float32Array(frequencyBinCount);
    
    let maxMagnitude = 0;
    for (let i = 0; i < frequencyBinCount; i++) {
        magnitudes[i] = Math.pow(10, frequencyData[i] / 20);
        maxMagnitude = Math.max(maxMagnitude, magnitudes[i]);
    }
    console.log("maxMagnitude", maxMagnitude)
    if (maxMagnitude < 0.001) {
        return [];
    }

    // Find peaks in the frequency domain
    let peaks = [];
    
    if (useParabolicInterpolation) {
        // const minPeakHeight = 0
        // // First identify local maxima in the spectrum with improved sensitivity for vibrato
        const localMaxima = [];
        
        if (usePeakInterpolation) {
            // Find local maxima (peaks) in the spectrum with enhanced sensitivity
            for (let i = 2; i < frequencyBinCount - 2; i++) {
                // Enhanced peak detection that's more sensitive to rapid changes
                if (magnitudes[i] > magnitudes[i-1] && 
                    magnitudes[i] > magnitudes[i+1]) {
                    localMaxima.push(i);
                }
            }
            
            for (const i of localMaxima) {
                if (magnitudes[i] < 0.002) {
                    continue;
                }
                const interpolatedPeak = findInterpolatedPeak(magnitudes, i, sampleRate, FFT_SIZE);
                if (interpolatedPeak.frequency < 20 || interpolatedPeak.frequency > 22000) {
                    continue;
                }
                peaks.push(interpolatedPeak);
            }
        } else {
            for (let i = 1; i < frequencyBinCount; i++) {
                if (magnitudes[i] < 0.003) {
                    continue;
                }
                const interpolatedPeak = findInterpolatedPeak(magnitudes, i, sampleRate, FFT_SIZE);
                if (interpolatedPeak.frequency < 20 || interpolatedPeak.frequency > 22000) {
                    continue;
                }
                peaks.push(interpolatedPeak);
            }
        }
    } else {
        // Use simple peak detection without interpolation
        // Skip the first few bins (DC and very low frequencies)
        for (let i = 1; i < frequencyBinCount; i++) {
            const frequency = i * sampleRate / FFT_SIZE;
            peaks.push({
                frequency: frequency,
                magnitude: magnitudes[i]
            });
        }
    }
    
    // for (let i = 0; i < frequencyBinCount; i++) {
    //     if (magnitudes[i] < 0.00005) {
    //         magnitudes[i] = 0.0000001;
    //     }
    // }
    
    // // Normalize magnitudes if we have valid data
    // if (maxMagnitude > 0 && isFinite(maxMagnitude)) {
    //     for (let i = 0; i < frequencyBinCount; i++) {
    //         magnitudes[i] /= maxMagnitude;
    //     }
    // }
    maxMagnitude = 0.015;
    maxMagnitude = Math.max(...peaks.map(f => f.magnitude));

    peaks = peaks.map(f => {
        f.magnitude /= maxMagnitude;
        return f;
    })
    
    peaks = peaks.map(f => {
        if (f.magnitude < 0.005) {
            f.magnitude = 0.0000001;
        }
        return f;
    })

    // Sort peaks by magnitude (strongest first)
    peaks.sort((a, b) => b.magnitude - a.magnitude);

    // Filter out NaN values from peaks
    peaks = peaks.filter(peak => !isNaN(peak.frequency) && !isNaN(peak.magnitude));
                
    peaks = peaks.slice(0, 30);
    
    peaks = peaks.map(f => {
        f.magnitude = f.magnitude*f.magnitude
        return f;
    })


    console.log("peaks", peaks)

    // Return the strongest frequency, or 0 if none found
    return peaks;
}

// Convert frequency to MIDI note number
function frequencyToMidiNotes(frequencies) {
    return frequencies.map(frequency => frequency.frequency > 31 ? 12 * Math.log2(frequency.frequency / 440) + 69 : 0);
}

// Get note class (0-11) from MIDI note number
function getNoteClasses(midiNotes) {
    return midiNotes.map(midiNote => midiNote % 12);
}

// Scale values for visualization
function scaleValues(values, height, min, max, exponent = 2) {
    return values.map(value => height * ((value - min) / (max - min)) ** exponent);
}

// Create state manager for pitch tracking
const createPitchTracker = (historySize, sampleRate) => {
    const state = {
        f0History: [],
        f0PowerHistory: [],
        octaveHistory: [],
        currentOctaveHistory: [],
        currentOctave: 1,
        currentFs: []
    };

    async function detectPitchAndOctave(signal) {
        const frequencies = await detectPitch(signal, sampleRate, 0.07);
        
        if (frequencies.length == 0) {
            return [state.currentOctave, []];
        }
        
        let octave = state.currentOctave;
        // Check which octave the frequency belongs to
        for (let oct = 1; oct <= 7; oct++) {
            const minFreq = 32.703195662574764 * Math.pow(2, oct - 1);
            const maxFreq = minFreq * Math.pow(2, 1);
            
            if (frequencies >= minFreq && frequencies <= maxFreq) {
                octave = oct;
            }
        }
        
        return [octave, frequencies];
    }

    async function updateState(signal, power) {
        const [octave, frequencies] = await detectPitchAndOctave(signal);
        if (frequencies.length > 0) {
        //if (!isNaN(power) && power >= POWER_THRESHOLD) {
            console.log("frequencies", frequencies);
            
            state.currentFs = frequencies;
            
            if (state.f0History.length >= historySize) {
                state.f0History.shift();
                state.f0PowerHistory.shift();
                state.octaveHistory.shift();
            }
            
            state.f0History.push(frequencies);
            state.f0PowerHistory.push(Math.min(10 * power, 1));
            state.octaveHistory.push(octave);
            
            if (state.currentOctaveHistory.length >= OCTAVE_HISTORY_LENGTH) {
                state.currentOctaveHistory.shift();
            }
            
            state.currentOctaveHistory.push(octave || state.currentOctave);
            state.currentOctave = Math.round(
                state.currentOctaveHistory.reduce((sum, value) => sum + value, 0) / 
                state.currentOctaveHistory.length
            ) || state.currentOctave;
        } else {
            if (state.f0History.length >= historySize) {
                state.f0History.shift();
                state.f0PowerHistory.shift();
                state.octaveHistory.shift();
            }
            
            state.f0History.push(null);
            state.f0PowerHistory.push(null);
            state.octaveHistory.push(null);
            state.currentFs = null;
        }
    }

    return {
        state,
        updateState
    };
};

// Clear and hide an element
function clearElement(elementId) {
    const element = document.getElementById(elementId);
    element.style.display = "none";
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
}

// Set up canvas with proper dimensions
function setupCanvas(canvasId) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext("2d");
    
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    ctx.font = "20px Signika";
    
    console.log("canvas.width", canvas.width);
    
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
    
    // Draw frequency history
    for (let i = 0; i < state.f0History.length; i++) {
        if (state.f0History[i] === null || 
            state.f0PowerHistory[i] === null || 
            state.octaveHistory[i] === null) {
            continue;
        }
        
        const freqs = state.f0History[i];
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
    
    // Draw note grid
    const notePositions = scaleValues(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 
        canvas.height, -0.5, 12.5, 1
    );
    
    for (let i = 0; i < notePositions.length; i++) {
        ctx.fillStyle = "#D0D7DE";
        ctx.fillText(
            `${NOTE_NAMES[i]}${i == 12 ? state.currentOctave + 1 : state.currentOctave}`, 
            10, 
            canvas.height - notePositions[i] + 7
        );
        ctx.fillRect(50, canvas.height - notePositions[i], historySize * HISTORY_SCALE, 1);
    }
    
    if (state.currentFs) {
        ctx.fillText(
            `f0 [Hz]: ${state.currentFs && state.currentFs.slice(0, 2).map(f => Math.round(f.frequency)).join(", ")}`, 
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
    
    analyzer.smoothingTimeConstant = 1;
    source.connect(gainNode).connect(analyzer);
    analyzer.fftSize = FFT_SIZE;
    
    return {
        analyser: analyzer,
        sampleRate: audioContext.sampleRate,
        audioStream: stream
    };
}

// Get audio data from analyzer
function getAudioData(analyzer) {
    const timeData = new Uint8Array(FFT_SIZE);
    analyzer.getByteTimeDomainData(timeData);
    
    const signal = Array.from(timeData).map(value => value - 128);
    const power = Math.sqrt(signal.reduce((sum, value) => sum + value ** 2, 0)) / signal.length;
    
    return {
        signal,
        power
    };
}

// Set up recording functionality
function setupRecording(canvas, audioStream) {
    const recordButton = document.getElementById("record-button");
    const MAX_RECORDING_SECONDS = 60;
    let mediaRecorder = null;
    let recordedChunks = [];
    let startTime;
    let countdownInterval;
    
    const toggleRecording = () => {
        if (!mediaRecorder || mediaRecorder.state === "inactive") {
            // Start recording
            recordedChunks = [];
            
            // Create MediaRecorder
            const canvasStream = canvas.captureStream();
            const audioTracks = audioStream.getAudioTracks();
            const combinedStream = new MediaStream();
            
            canvasStream.getVideoTracks().forEach(track => {
                combinedStream.addTrack(track);
            });
            
            audioTracks.forEach(track => {
                combinedStream.addTrack(track);
            });
            
            mediaRecorder = new MediaRecorder(combinedStream, {
                mimeType: "video/webm; codecs=vp8,opus"
            });
            
            mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };
            
            mediaRecorder.onstop = () => {
                clearInterval(countdownInterval);
                recordButton.innerHTML = 'Processing... <span class="inline-block animate-spin">⌛</span>';
                recordButton.disabled = true;
                
                const webmBlob = new Blob(recordedChunks, {
                    type: "video/webm"
                });
                
                const videoUrl = URL.createObjectURL(webmBlob);
                recordButton.disabled = false;
                recordButton.innerText = "Download";
                
                const handleDownload = () => {
                    const downloadLink = document.getElementById("download-button");
                    if (downloadLink instanceof HTMLAnchorElement) {
                        downloadLink.style.display = "none";
                        downloadLink.href = videoUrl;
                        downloadLink.download = "recording.webm";
                        downloadLink.click();
                        URL.revokeObjectURL(videoUrl);
                        
                        setTimeout(() => {
                            recordButton.innerHTML = 'Record <span class="text-xs opacity-75 flex items-center">(max 60s)</span>';
                            mediaRecorder = null;
                            recordButton.addEventListener("click", toggleRecording);
                        }, 1000);
                    }
                };
                
                recordButton.removeEventListener("click", toggleRecording);
                recordButton.addEventListener("click", handleDownload, {
                    once: true
                });
            };
            
            mediaRecorder.start();
            startTime = Date.now();
            
            countdownInterval = window.setInterval(() => {
                const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
                const remainingSeconds = MAX_RECORDING_SECONDS - elapsedSeconds;
                
                if (remainingSeconds <= 0 && mediaRecorder) {
                    mediaRecorder.stop();
                } else {
                    recordButton.innerText = `Stop (${String(remainingSeconds)}s)`;
                }
            }, 1000);
            
            recordButton.innerText = `Stop (${String(MAX_RECORDING_SECONDS)}s)`;
        } else if (mediaRecorder.state === "recording") {
            // Stop recording
            mediaRecorder.stop();
        }
    };
    
    recordButton.addEventListener("click", toggleRecording);
}

// Initialize spectrum analyzer
async function initializeSpectrumAnalyzer() {
    try {
        // Animation function
        let animate = function() {
            const {signal, power} = getAudioData(analyser);
            pitchTracker.updateState(signal, power);
            renderVisualization(ctx, historySize, canvas, pitchTracker.state);
            requestAnimationFrame(animate);
        };
        
        // Initialize audio
        const {analyser, sampleRate, audioStream} = await initializeAudioAnalyzer();
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
            console.log("Parabolic interpolation:", useParabolicInterpolation ? "enabled" : "disabled");
        });
        document.getElementById("peak-interpolation").addEventListener("change", function(e) {
            usePeakInterpolation = e.target.checked;
            console.log("Parabolic interpolation:", usePeakInterpolation ? "enabled" : "disabled");
        });
        
        // setupRecording(canvas, audioStream);
        
        // Initialize pitch tracker
        const historySize = calculateHistorySize(canvas.width);
        console.log("N_HISTORY", historySize);
        const pitchTracker = createPitchTracker(historySize, sampleRate);
        
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
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
