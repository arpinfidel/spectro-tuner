export const make_loop = (appState, interval, fn) => async function() {
	if (!appState.isActive()) {
		setTimeout(make_loop(appState, interval, fn), Math.max(100, interval));
		return;
	}

	await fn();
	setTimeout(make_loop(appState, interval, fn), interval);
} 

export function frequencyToNote(frequency) {
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

export function getOctave(frequency) {
    const C0 = 16.3515978313;
    const octave = Math.floor(Math.log2(frequency / C0));
    return octave;
}