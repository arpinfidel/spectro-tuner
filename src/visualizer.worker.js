// Worker script for handling visualization with OffscreenCanvas

// Import required functions
import { gaussianWindow, hanningWindow } from './window_functions.js';

// Constants for visualization
const HISTORY_SCALE = 1;
const CIRCLE_RADIUS = 1.5;
const BACKGROUND_COLOR = "rgb(16,7,25)";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Canvases and rendering contexts
let mainCanvas;
let bgCanvas;
let mainCtx;
let bgCtx;
let historySize;

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
    
    // Clear background canvas
    // bgCtx.fillStyle = BACKGROUND_COLOR;
    // bgCtx.fillRect(0, 0, historySize * HISTORY_SCALE, bgCanvas.height);
    
    const notePositions = getPosition(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 
        bgCanvas.height, -0.5, 11.5, 1
    );
    
    // Draw note lines
    for (let i = 0; i < notePositions.length; i++) {
        bgCtx.fillStyle = "rgba(208, 215, 222, 0.5)";
        bgCtx.fillRect(35, bgCanvas.height - notePositions[i], historySize * HISTORY_SCALE, 1);
    }
    
    // Draw note labels
    for (let i = 0; i < notePositions.length; i++) {
        bgCtx.fillStyle = "rgba(208, 215, 222, 0.5)";
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
    
    const shiftAmount = state.fHistory.length; 
    mainCtx.drawImage(mainCanvas, shiftAmount, 0, 
        mainCanvas.width - shiftAmount, mainCanvas.height,
        0, 0, mainCanvas.width - shiftAmount, mainCanvas.height);
    
    // Clear rightmost column where new circles will be drawn
    mainCtx.fillStyle = BACKGROUND_COLOR;
    mainCtx.fillRect(mainCanvas.width - shiftAmount, 0, 
        shiftAmount, mainCanvas.height);

    for (let i = 0; i < state.fHistory.length - 1; i++) {
        if (state.fHistory[i] === null || state.fHistory[i].length == 0) continue;
        
        const freqs = state.fHistory[i];
        const midiNotes = frequencyToMidiNotes(freqs);
        const noteClasses = getNoteClasses(midiNotes);
        const hues = noteClasses.map(noteClass => (noteClass+3) * (360 / 12));
        
        for (let j = 0; j < midiNotes.length; j++) {
            const hue = hues[j];
            const noteClass = noteClasses[j];
            mainCtx.beginPath();
            mainCtx.fillStyle = `hsla(${hue}, 100%, 70%, ${freqs[j].magnitude})`;
            mainCtx.arc(
                mainCanvas.width - CIRCLE_RADIUS * 2,
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
    // Draw circles first (main content)
    drawDynamicElements(state);
    // Then draw semi-transparent background on top
    drawBackground();
}

// Initialize the canvas when it's transferred to the worker
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            // Initialize canvases
            mainCanvas = e.data.mainCanvas;
            bgCanvas = e.data.bgCanvas;
            historySize = e.data.historySize;
            
            mainCtx = mainCanvas.getContext('2d');
            bgCtx = bgCanvas.getContext('2d');
            
            bgCtx.font = "20px Signika";
            mainCtx.font = "20px Signika";
            
            // Draw initial background
            drawBackground();
            break;
            
        case 'render':
            // Render visualization with the provided state
            renderVisualization(data.state);
            break;
            
        case 'resize':
            // Handle canvas resize
            mainCanvas.width = data.width;
            mainCanvas.height = data.height;
            bgCanvas.width = data.width;
            bgCanvas.height = data.height;
            historySize = data.historySize;
            
            bgCtx.font = "20px Signika";
            mainCtx.font = "20px Signika";
            
            // Redraw background after resize
            drawBackground();
            break;
    }
};
