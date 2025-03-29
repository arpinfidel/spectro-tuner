import webfft from 'webfft'
import { getOctave, make_loop } from './util'
import { applyWindow, blackmanHarrisWindow, flatTopWindow, gaussianWindow, hammingWindow, hanningWindow } from './window_functions'
import { findInterpolatedPeak, findInterpolatedPeakQuinn } from './parabolic_interpolation'
import { findInterpolatedPeakJacobsen, findInterpolatedPeakQuinnComplex } from './enhanced_interpolation'


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

function detectFundamentalsFromPeaks(peaks, options = {}) {
	// Default options
	const {
		minFrequency = 50,
		maxFrequency = 5000,
		harmonicTolerance = 0.05,
		preferLowerFundamentals = true, // Bias toward identifying lower fundamentals
		strictHarmonicRatios = true, // Only allow standard harmonic ratios (2x, 3x, etc.)
		overrideThreshold = 0.7, // How strong a subharmonic pattern needs to be to override
	} = options

	// Early return if insufficient peaks
	if (!peaks || peaks.length < 2) return peaks || []

	// Step 1: Sort and filter peaks
	const validPeaks = [...peaks]
		.filter((p) => p.frequency >= minFrequency && p.frequency <= maxFrequency)
		.sort((a, b) => a.frequency - b.frequency) // Sort by frequency

	// Step 2: Build harmonic relationship matrix
	const relationshipMatrix = []

	for (let i = 0; i < validPeaks.length; i++) {
		const potential = validPeaks[i]
		const relationships = []

		// For each peak, check if other peaks could be its harmonics
		for (let j = 0; j < validPeaks.length; j++) {
			if (i === j) continue

			const candidate = validPeaks[j]

			// Skip if frequency is lower (can't be a harmonic)
			if (candidate.frequency <= potential.frequency) continue

			// Calculate ratio and check if it's close to an integer
			const ratio = candidate.frequency / potential.frequency
			const nearestHarmonic = Math.round(ratio)

			// Skip ratios that don't make sense harmonically
			if (strictHarmonicRatios && (nearestHarmonic < 2 || nearestHarmonic > 8))
				continue

			// Calculate error
			const error = Math.abs(ratio - nearestHarmonic) / nearestHarmonic

			if (error < harmonicTolerance) {
				relationships.push({
					peak: candidate,
					harmonicNumber: nearestHarmonic,
					error,
					strength: candidate.magnitude / potential.magnitude,
				})
			}
		}

		// For each peak, also check if it could be a harmonic of a lower peak
		const subharmonicRelationships = []

		for (let j = 0; j < i; j++) {
			const lowerPeak = validPeaks[j]
			const ratio = potential.frequency / lowerPeak.frequency
			const nearestHarmonic = Math.round(ratio)

			if (strictHarmonicRatios && (nearestHarmonic < 2 || nearestHarmonic > 8))
				continue

			const error = Math.abs(ratio - nearestHarmonic) / nearestHarmonic

			if (error < harmonicTolerance) {
				subharmonicRelationships.push({
					peak: lowerPeak,
					harmonicNumber: nearestHarmonic,
					error,
					strength: lowerPeak.magnitude / potential.magnitude,
				})
			}
		}

		relationshipMatrix.push({
			peak: potential,
			harmonics: relationships,
			isHarmonicOf: subharmonicRelationships,
			fundamentalConfidence: 0, // Will calculate later
		})
	}

	// Step 3: Calculate confidence scores
	for (const entry of relationshipMatrix) {
		// Higher confidence for peaks with clear harmonics
		const harmonicCount = entry.harmonics.length

		// Calculate harmonic strength (average magnitude ratio of harmonics to fundamental)
		const harmonicStrength =
			entry.harmonics.length > 0
				? entry.harmonics.reduce((sum, h) => sum + h.strength, 0) /
					entry.harmonics.length
				: 0

		// Calculate how many harmonic patterns this peak fits into
		const subharmonicCount = entry.isHarmonicOf.length

		// Base score on number of harmonics
		entry.fundamentalConfidence = harmonicCount * 1.5

		// Bonus for having strong harmonics
		entry.fundamentalConfidence += harmonicStrength * 0.9

		// Penalty for being a likely harmonic of another peak
		if (subharmonicCount > 0) {
			// If this peak is very likely a harmonic, reduce confidence significantly
			const subharmonicEvidence = entry.isHarmonicOf.reduce((max, rel) => {
				// Calculate evidence based on error and strength
				const evidence =
					(1 - rel.error * 10) * (rel.peak.magnitude / entry.peak.magnitude)
				return Math.max(max, evidence)
			}, 0)

			if (subharmonicEvidence > overrideThreshold) {
				entry.fundamentalConfidence *= 1 - subharmonicEvidence
			}
		}

		// Apply preference for lower frequencies as fundamentals
		if (preferLowerFundamentals) {
			// Boost lower frequencies
			const frequencyFactor = Math.max(0.2, 1 - entry.peak.frequency / 1000)
			entry.fundamentalConfidence *= 1 + frequencyFactor
		}
	}

	// Step 4: Group by frequency regions to avoid duplicates
	const frequencyBins = new Map()
	const binSize = 10 // Hz

	for (const entry of relationshipMatrix) {
		const bin = Math.floor(entry.peak.frequency / binSize)

		if (
			!frequencyBins.has(bin) ||
			frequencyBins.get(bin).fundamentalConfidence < entry.fundamentalConfidence
		) {
			frequencyBins.set(bin, entry)
		}
	}

	// Step 5: Advanced filtering for special cases
	// Specifically handle the case of missing or weak fundamentals

	// For each detected fundamental, check if there might be a lower fundamental
	// that explains the harmonic pattern better
	for (const [bin, entry] of frequencyBins.entries()) {
		// Only consider entries with at least one harmonic
		if (entry.harmonics.length > 0) {
			const frequency = entry.peak.frequency

			// Check for potential subharmonics (f/2, f/3, f/4, etc.)
			for (let divisor = 2; divisor <= 4; divisor++) {
				const potentialFundamental = frequency / divisor

				// Skip if below minimum frequency
				if (potentialFundamental < minFrequency) continue

				// Find the bin this would belong to
				const potentialBin = Math.floor(potentialFundamental / binSize)

				// If we don't already have this fundamental detected
				if (!frequencyBins.has(potentialBin)) {
					// Check if this would create a more coherent harmonic series
					let evidenceCount = 0

					// Look for other peaks that would be harmonics of this potential fundamental
					for (const peak of validPeaks) {
						const ratio = peak.frequency / potentialFundamental
						const nearestHarmonic = Math.round(ratio)

						if (nearestHarmonic >= 1 && nearestHarmonic <= 16) {
							const error = Math.abs(ratio - nearestHarmonic) / nearestHarmonic

							if (error < harmonicTolerance) {
								evidenceCount++
							}
						}
					}

					// If we found substantial evidence, add this as a fundamental
					if (evidenceCount >= 3) {
						frequencyBins.set(potentialBin, {
							peak: {
								frequency: potentialFundamental,
								magnitude: entry.peak.magnitude / divisor, // Estimate magnitude
							},
							harmonics: [],
							isHarmonicOf: [],
							fundamentalConfidence: entry.fundamentalConfidence * 0.8, // Slightly lower confidence
							inferred: true, // Mark as inferred rather than directly observed
						})
					}
				}
			}
		}
	}

	// Step 6: Final sorting and output formatting
	return Array.from(frequencyBins.values())
		.sort((a, b) => b.fundamentalConfidence - a.fundamentalConfidence)
		.filter((entry) => entry.fundamentalConfidence > 0.5) // Only return confident results
		.map((entry) => ({
			frequency: entry.peak.frequency,
			magnitude: entry.peak.magnitude,
			confidence: entry.fundamentalConfidence,
			inferred: entry.inferred || false,
		}))
}

export class PitchTracker {
    // const
    state = {
        fHistory: [],
        currentOctave: 1,
        currentFs: [],
        currentRawFs: [],
    };
    avgDurationWeight = 0.1;

    // DOM
    updateCounter
    
    // deps
    analyzer
	fft

    // config
	fftSize
	paddingFactor
    sampleRate
	historySize

    // vars
    kalmanFilters = {};
    avgDuration = 0;
    previousMagnitudes = null; // Store the previous FFT frame magnitudes
	windows
	tracks = [];
    
    constructor(appState, { updateCounter }, { analyzer }, { fftSize, paddingFactor, sampleRate, historySize }) {
        this.appState = appState;

		// DOM
        this.updateCounter = updateCounter;
        
		// config
		this.fftSize = fftSize;
		this.paddingFactor = paddingFactor;
		this.historySize = historySize;
        
		// deps
		this.analyzer = analyzer;
		this.fft = new webfft(fftSize);
		this.fft.profile(); // Profile to find fastest implementation
		
		// vars
        this.sampleRate = sampleRate;
		this.windows = {
			'hanning': hanningWindow(fftSize),
			'gaussian': gaussianWindow(fftSize),
			'blackman-harris': blackmanHarrisWindow(fftSize),
			'hamming': hammingWindow(fftSize),
			'flat-top': flatTopWindow(fftSize)
		};
    }

	toComplexArray = function(realSamples) {
		const complexArray = new Float32Array(this.fftSize * 2); // 2x size for interleaved
		for (let i = 0; i < this.fftSize; i++) {
			complexArray[i*2] = realSamples[i]; // Real part
			complexArray[i*2 + 1] = 0;         // Imaginary part (0 for real signals)
		}
		for (let i = this.fftSize; i < this.fftSize * 2; i++) {
			complexArray[i*2] = 0; // Real part
			complexArray[i*2 + 1] = 0;         // Imaginary part (0 for real signals)
		}
		return complexArray;
	}
	
	getAudioData = function() {
		const timeData = new Float32Array(this.fftSize);
		this.analyzer.getFloatTimeDomainData(timeData);

		const windowedData = applyWindow(timeData, this.windows[this.appState.currentWindow]);

		// Zero-pad the data
		const paddedData = new Float32Array(this.fftSize * this.paddingFactor);
		paddedData.set(windowedData, 0); // Copy windowed data to the beginning
		for (let i = this.fftSize; i < this.fftSize * 2; i++) {
			paddedData[i] = 0; // Fill the rest with zeros
		}

		return paddedData;
	}

    detectPitchAndOctave = async function(signal) {
        const complexSignal = this.toComplexArray(signal);
        const spectrum = this.fft.fft(complexSignal);        
        const [rawfreqs, frequencies] = await this.detectPitch(spectrum, this.sampleRate, 0.07);
        
        if (frequencies.length == 0) {
            return [state.currentOctave, [], []];
        }
        
        // TODO: do for each note
        let octave = getOctave(frequencies[0].frequency);
        
        return [octave, rawfreqs, frequencies];
    }

    
    // Pitch detection using FFT spectrum
    detectPitch = async function(spectrum) {
        // Convert interleaved complex FFT output to magnitudes
        const frequencyBinCount = this.fftSize / 2;
        let magnitudes = new Float32Array(frequencyBinCount);
        for (let i = 0; i < frequencyBinCount; i++) {
            const real = spectrum[i*2];
            const imag = spectrum[i*2 + 1];
            magnitudes[i] = Math.sqrt(real*real + imag*imag);
        }

        // Apply weighted frame averaging
        if (this.appState.fftFrameSmoothingFactor > 1e-9 && this.previousMagnitudes) {
            magnitudes = magnitudes.map((magnitude, i) => {
                return this.appState.fftFrameSmoothingFactor * this.previousMagnitudes[i] + (1 - this.appState.fftFrameSmoothingFactor) * magnitude;
            });
        }

        // Store the current frame for the next iteration
        this.previousMagnitudes = magnitudes.slice();

        // Apply spectral whitening if enabled
        if (this.appState.useSpectralWhitening) {
            magnitudes = applySpectralWhitening(magnitudes);
        }

        let maxMagnitude = Math.max(...magnitudes);
        if (maxMagnitude < this.appState.th_1) {
            return [[], []];
        }

        // Find peaks in the frequency domain
        let rawfreqs = [];
        let freqs = [];
        
        for (let i = 1; i < frequencyBinCount; i++) {
            const frequency = i * this.sampleRate / this.fftSize;
            rawfreqs.push({
                frequency: frequency,
                magnitude: magnitudes[i]
            });
        }
        
        if (this.appState.interpolationMethod === "none") {
            freqs = JSON.parse(JSON.stringify(rawfreqs));
        } else {
            const findPeaks = (start, end, conditionFn, peakFn) => {
                for (let i = start; i < end; i++) {
                    if (!conditionFn(i) || magnitudes[i] < this.appState.th_2) {
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

            switch (this.appState.interpolationMethod) {
                case "parabolic":
                    findPeaks(2, frequencyBinCount - 2,
                        i =>
                            magnitudes[i] > magnitudes[i-1]
                            && magnitudes[i] > magnitudes[i+1],
                        i => findInterpolatedPeak(magnitudes, i, this.sampleRate, this.fftSize),
                    );
                    break;
                case "quinn":
                    findPeaks(3, frequencyBinCount - 2,
                        i =>
                            magnitudes[i] > magnitudes[i-1]
                            && magnitudes[i] > magnitudes[i+1]
                            && magnitudes[i] > magnitudes[i-2]
                            && magnitudes[i] > magnitudes[i+2],
                        i => findInterpolatedPeakQuinn(magnitudes, i, this.sampleRate, this.fftSize),
                    );
                    break;
                case "quinn-complex":
                    findPeaks(3, frequencyBinCount - 2,
                        i =>
                            magnitudes[i] > magnitudes[i-1]
                            && magnitudes[i] > magnitudes[i+1]
                            && magnitudes[i] > magnitudes[i-2]
                            && magnitudes[i] > magnitudes[i+2],
                        i => findInterpolatedPeakQuinnComplex(spectrum, i, this.sampleRate, this.fftSize),
                    );
                    break;
                case "jacobsen":
                    findPeaks(3, frequencyBinCount - 2,
                        i =>
                            magnitudes[i] > magnitudes[i-1]
                            && magnitudes[i] > magnitudes[i+1]
                            && magnitudes[i] > magnitudes[i-2]
                            && magnitudes[i] > magnitudes[i+2],
                        i => findInterpolatedPeakJacobsen(spectrum, i, this.sampleRate, this.fftSize),
                    );
                    break;
            }
        }
        
        if (freqs.length == 0) {
            return [rawfreqs, freqs];
        }
        
        freqs.sort((a, b) => b.magnitude - a.magnitude);
        freqs = freqs.slice(0, 100);

        if (this.appState.useHarmonicFiltering) {
            const options = {
                minFrequency: 80,
                maxFrequency: 21000,
                harmonicTolerance: 0.03,
                preferLowerFundamentals: true,
                strictHarmonicRatios: true,
                overrideThreshold: 0.15  // Adjust this based on how aggressive you want the filtering
            };
            
            freqs = detectFundamentalsFromPeaks(freqs, options);
            const maxConfidence = Math.max(...freqs.map(f => f.confidence));
            freqs = freqs.map(f => {
                f.confidence = f.confidence / maxConfidence;
                f.confidence **= 1.3;
                f.magnitude = f.magnitude * f.confidence;
                return f;
            })
            freqs.sort((a, b) => b.magnitude - a.magnitude);
        }

        const max2Magnitude = Math.max(this.appState.defaultMaxMagnitude, freqs.length > 1 ? freqs[0].magnitude : 1);
        freqs = freqs.map(f => {
            f.magnitude = Math.min(1, f.magnitude / max2Magnitude);
            return f;
        })
        freqs = freqs.map(f => {
            f.magnitude = f.magnitude ** 1.7;
            return f;
        });
        freqs = freqs.filter(f => f.frequency >= 30 && f.magnitude >= this.appState.th_3)

        freqs = freqs.filter(f => !isNaN(f.frequency) && !isNaN(f.magnitude));
        freqs.sort((a, b) => b.magnitude - a.magnitude);
        freqs = freqs.slice(0, 30);
        
        if (this.appState.fftTrackSmoothingFactor) {
            const candidates = this.tracks.map(() => []);

            for (let i = 0; i < freqs.length; i++) {
                let found = false;
                for (let j = 0; j < this.tracks.length; j++) {
                    const freq = freqs[i];
                    const track = this.tracks[j];
                    if (Math.max(freq.frequency, track.frequency) / Math.min(freq.frequency, track.frequency) > 1.05) {
                        continue;
                    }
                    found = true;
                    candidates[j].push({ frequency: freq.frequency, magnitude: freq.magnitude });
                    const distance = Math.abs(freq.frequency - track.frequency);
                    const strength = (this.appState.fftTrackSmoothingFactor * track.magnitude / freq.magnitude * 1.5) * Math.exp(-distance / 100);
                    freq.frequency = strength * track.frequency + (1 - strength) * freq.frequency;
                }
                if (!found) {
                    this.tracks.push({ frequency: freqs[i].frequency, magnitude: freqs[i].magnitude });
                    candidates.push([{ frequency: freqs[i].frequency, magnitude: freqs[i].magnitude }]);
                }
            }

            const newTracks = [];
            for (let i = 0; i < candidates.length; i++) {
                const sumMagnitude = candidates[i].reduce((a, b) => a + b.magnitude, 0);
                const sumFrequency = candidates[i].reduce((a, b) => a + b.magnitude * b.frequency, 0);
                if (sumMagnitude > 0) {
                    newTracks.push({
                        frequency: sumFrequency / sumMagnitude,
                        magnitude: sumMagnitude / candidates[i].length,
                    });
                }
            }

            this.tracks = newTracks;
        }
        
        return [rawfreqs, freqs];
    }
    

    updateState = async function(signal) {
        const [octave, rawfreqs, frequencies] = await this.detectPitchAndOctave(signal);
        if (this.state.fHistory.length >= this.historySize) {
            this.state.fHistory.shift();
        }
        if (frequencies.length > 0) {
            if (this.appState.useKalmanFilters) {
                // Apply Kalman filtering to frequencies
                const { peaks, kalmanFilters: updatedFilters } = trackFrequencyChangesKalman(
                    frequencies,
                    this.state.currentFs,
                    40,
                    this.kalmanFilters
                );
                
                this.kalmanFilters = updatedFilters;
                frequencies = peaks;
            }
            this.state.fHistory.push(frequencies);
            this.state.currentFs = frequencies;
            this.state.currentRawFs = rawfreqs;
            
            this.state.currentOctave = Math.round(octave) || this.state.currentOctave;
        } else {
            this.state.fHistory.push(null);
            this.state.currentFs = null;
        }
    }

    loop = async function() {
        const self = this;
        make_loop(self.appState, self.appState.updateIntervalMs, async function() {
            const startTime = performance.now();
            const signal = self.getAudioData(self.fftSize, self.analyzer);
            await self.updateState(signal);
            const endTime = performance.now();
            const duration = endTime - startTime;
            self.avgDuration = (1 - self.avgDurationWeight) * self.avgDuration + self.avgDurationWeight * duration;
        })()

        make_loop(self.appState, 1000, async function() {
            const updatesPerSecond = 1000 / self.avgDuration;
			const maxUpdatesPerSecond = 1000 / self.appState.updateIntervalMs;
            self.updateCounter.textContent = `update/s: ${Math.round(Math.min(maxUpdatesPerSecond, updatesPerSecond))} (avg: ${self.avgDuration.toFixed(1)}ms)`;
        })();
    }
}
