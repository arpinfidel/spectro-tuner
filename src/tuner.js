import { make_loop, frequencyToNote} from './util'

export class Tuner {
    // const
    avgFreqWeight = 0.1;

	appState

	// DOM
    display
    displayText

	// deps
    pitchTracker
    
	// vars
    avgFreq = 0;

    constructor(appState, { display, displayText }, pitchTracker) {
		this.appState = appState;

        this.display = display;
        this.displayText = displayText;

        this.pitchTracker = pitchTracker;
    }

    // Update tuner display with current note and cents
    updateTunerDisplay = async function() {
        const centsThreshold = 5;

        let freqs = this.pitchTracker.state.currentFs;
        if (freqs && freqs.length > 0) {
            freqs = freqs.sort((a, b) => b.magnitude - a.magnitude);
        }

        let invalid = false;
        let freq;
        if (!freqs
            || freqs.length === 0
            || freqs[0].frequency === 0
            || freqs[0].magnitude < 2*freqs[Math.floor(freqs.length / 2)].magnitude
        ) {
            invalid = true;
            freq = 0;
        } else {
            freq = freqs[0].frequency;
        }

        this.avgFreq = this.avgFreqWeight * this.avgFreq + (1 - this.avgFreqWeight) * freq;
        let {note, octave, cents} = frequencyToNote(this.avgFreq);
        if (!octave || octave < 0) {
            invalid = true;
        }

        let style, noteName;
        if (invalid) {
            style = `--value: 50; --content: '-'; --primary: #777777; --secondary: #555555`
            noteName = "-";
        } else {
            style = `--value: ${50+cents}; --content: '${Math.round(cents, 1)}'; --primary: ${Math.abs(cents) > centsThreshold ? '#ff4444' : '#44ff44'}; --secondary: #555555`
            noteName = `${note} ${octave}`;
        }

        this.display.style = style;
        this.displayText.innerText = noteName;
    }

    loop = async function() {
        const self = this;
        make_loop(this.appState, 100, async function() {
            await self.updateTunerDisplay();
        })();
    }
};