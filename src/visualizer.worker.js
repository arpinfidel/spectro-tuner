// Worker script for handling visualization with OffscreenCanvas

// Constants for visualization
const HISTORY_SCALE = 1;
const CIRCLE_RADIUS = 1;
const BACKGROUND_COLOR = "rgb(16,7,25)";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const SQUISH_FACTOR = 0.3;

// Canvases and rendering contexts
let mainCanvas;
let bgCanvas;
let fftDetailCanvas;
let fftDetailBgCanvas;
let mainCtx;
let bgCtx;
let fftDetailCtx;
let fftDetailBgCtx;

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

// Draw background elements (static)
function drawBackground() {
    if (!bgCanvas || !bgCtx) return;
    
    const notePositions = getPosition(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 
        bgCanvas.height, -0.5, 11.5, 1
    );
    
    // Draw note lines
    for (let i = 0; i < notePositions.length; i++) {
        bgCtx.fillStyle = "rgba(208, 215, 222, 0.5)";
        bgCtx.fillRect(35, bgCanvas.height - notePositions[i], mainCanvas.width, 1);
    }

    // Draw note labels
    for (let i = 0; i < notePositions.length; i++) {
        bgCtx.fillStyle = "rgba(208, 215, 222, 1)";
        bgCtx.fillText(
            `${NOTE_NAMES[i]}`, 
            10, 
            bgCanvas.height - notePositions[i] + 7
        );
    }
}

// Draw dynamic elements
function drawDynamicElements(state) {
    if (!mainCanvas || !mainCtx) return;
    
    if (state.fHistory.length == 0) {
        return;
    }
    
    const shiftAmount = Math.round(state.fHistory.length * SQUISH_FACTOR); 
    mainCtx.drawImage(mainCanvas, shiftAmount, 0, 
        mainCanvas.width - shiftAmount, mainCanvas.height,
        0, 0, mainCanvas.width - shiftAmount, mainCanvas.height);
    
    // Clear rightmost column where new circles will be drawn
    mainCtx.fillStyle = BACKGROUND_COLOR;
    mainCtx.fillRect(mainCanvas.width - shiftAmount, 0, 
        shiftAmount, mainCanvas.height);

    for (let i = 0; i < state.fHistory.length; i++) {
        if (state.fHistory[i] === null || state.fHistory[i].length == 0) continue;
        
        const freqs = state.fHistory[i].slice(0, 30);
        const midiNotes = frequencyToMidiNotes(freqs);
        const noteClasses = getNoteClasses(midiNotes);
        const hues = noteClasses.map(noteClass => (noteClass+3) * (360 / 12));
        
        for (let j = 0; j < midiNotes.length; j++) {
            const hue = hues[j];
            const noteClass = noteClasses[j];
            mainCtx.beginPath();
            mainCtx.fillStyle = `hsla(${hue}, 100%, 70%, ${freqs[j].magnitude})`;
            mainCtx.arc(
                mainCanvas.width - i,
                mainCanvas.height - ((noteClass + 0.5)%12) / 12 * mainCanvas.height,
                CIRCLE_RADIUS,
                0,
                2 * Math.PI
            );
            mainCtx.fill();
        }
    }
}

function renderVisualization(state) {
    drawDynamicElements(state);
}

let maxMagnitude = 0;
// Draw detailed FFT spectrum
function renderFFTDetail(state) {
    if (!fftDetailCanvas || !fftDetailCtx || !state.currentFs) {return};
    if (state.currentRawFs.length === 0) return;

    // Clear canvas
    fftDetailCtx.fillStyle = BACKGROUND_COLOR;
    fftDetailCtx.fillRect(0, 0, fftDetailCanvas.width, fftDetailCanvas.height);

    let freqs = [...state.currentRawFs].sort((a, b) => b.magnitude - a.magnitude).slice(0, 1000);
    const thresholdMagnitude = freqs.length > 0 ? freqs[freqs.length*0.1].magnitude : 1e9;
    maxMagnitude = Math.max(maxMagnitude*0.99995, freqs[0].magnitude);
    freqs = [...freqs].sort((a, b) => a.frequency - b.frequency);
    if (freqs.length === 0) return;

    const minFreq = 20;
    const maxFreq = 20000;

    // Draw frequency spectrum
    fftDetailCtx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
    fftDetailCtx.lineWidth = 2;
    fftDetailCtx.beginPath();

    const logMinFreq = Math.log2(minFreq);
    const logMaxFreq = Math.log2(maxFreq);
    const logFreqRange = logMaxFreq - logMinFreq;

    const dotSize = 2;

    for (let i = 1; i < freqs.length - 1; i++) {
        const logFreq = Math.log2(freqs[i].frequency);
        const x = (logFreq - logMinFreq) / logFreqRange * fftDetailCanvas.width;
        const y = fftDetailCanvas.height - (freqs[i].magnitude/maxMagnitude * fftDetailCanvas.height * 0.9);

        fftDetailCtx.beginPath();
        fftDetailCtx.arc(x, y, dotSize, 0, 2 * Math.PI);
        fftDetailCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        fftDetailCtx.fill();

        // Peak detection (crude)
        if (
            freqs[i].magnitude > thresholdMagnitude
            && y < fftDetailCanvas.height * (1 - 0.1)
            && freqs[i].magnitude > freqs[i - 1].magnitude
            && freqs[i].magnitude > freqs[i + 1].magnitude) {
            fftDetailCtx.fillStyle = 'white';
            fftDetailCtx.font = '12px Signika';
            const midiNote = 12 * Math.log2(freqs[i].frequency / 440) + 69;
            const noteName = NOTE_NAMES[Math.round(midiNote) % 12];
            fftDetailCtx.fillText(
                `${freqs[i].frequency.toFixed(1)} Hz (${noteName})`,
                x,
                y - 10
            );
        }
    }
}

// Initialize the canvas when it's transferred to the worker
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    if (data.isFFTDetail) {
        switch (type) {
            case 'init':
                fftDetailCanvas = data.mainCanvas;
                fftDetailBgCanvas = data.bgCanvas;
                fftDetailCtx = fftDetailCanvas.getContext('2d');
                fftDetailBgCtx = fftDetailBgCanvas.getContext('2d');
                fftDetailCtx.font = "12px Signika";
                break;
                
            case 'render':
                if (data.state) renderFFTDetail(data.state);
                break;
        }
    } else {
        switch (type) {
            case 'init':
                mainCanvas = data.mainCanvas;
                bgCanvas = data.bgCanvas;
                mainCtx = mainCanvas.getContext('2d');
                bgCtx = bgCanvas.getContext('2d');
                bgCtx.font = "20px Signika";
                mainCtx.font = "20px Signika";
                drawBackground();
                break;
                
            case 'render':
                renderVisualization(data.state);
                break;
        }
    }
};
