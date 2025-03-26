// Worker script for handling visualization with OffscreenCanvas

// Import required functions
import { gaussianWindow, hanningWindow } from './window_functions.js';

// Constants for visualization
const HISTORY_SCALE = 1;
const CIRCLE_RADIUS = 1.5;
const BACKGROUND_COLOR = "rgb(16,7,25)";
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// Canvas and rendering context
let canvas;
let ctx;
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

// Draw visualization components
function renderVisualization(state) {
    if (!canvas || !ctx) return;
    
    // Clear canvas
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, historySize * HISTORY_SCALE, canvas.height);
    
    const notePositions = getPosition(
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 
        canvas.height, -0.5, 11.5, 1
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
        const hues = noteClasses.map(noteClass => (noteClass+3) * (360 / 12));
        for (let j = 0; j < midiNotes.length; j++) {
            const hue = hues[j];
            const noteClass = noteClasses[j];
            ctx.beginPath();
            ctx.fillStyle = `hsla(${hue}, 100%, 70%, ${freqs[j].magnitude})`;
            ctx.arc(
                i * HISTORY_SCALE + 4 * HISTORY_SCALE, 
                canvas.height - ((noteClass + 0.5)%12) / 12 * canvas.height, 
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
            `${NOTE_NAMES[i]}${state.currentOctave}`, 
            10, 
            canvas.height - notePositions[i] + 7
        );
    }
}

// Initialize the canvas when it's transferred to the worker
self.onmessage = function(e) {
    const { type, data } = e.data;
    
    switch (type) {
        case 'init':
            // Initialize canvas
            canvas = e.data.canvas;
            historySize = e.data.historySize;
            ctx = canvas.getContext('2d');
            ctx.font = "20px Signika";
            break;
            
        case 'render':
            // Render visualization with the provided state
            renderVisualization(data.state);
            break;
            
        case 'resize':
            // Handle canvas resize
            canvas.width = data.width;
            canvas.height = data.height;
            historySize = data.historySize;
            ctx.font = "20px Signika";
            break;
    }
};