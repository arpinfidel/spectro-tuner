/**
 * Parabolic interpolation for peak detection
 * Based on the qint function from the MATLAB code in Section §F.2
 */

/**
 * Performs quadratic interpolation of three adjacent samples
 * @param {number} ym1 - Sample before the peak
 * @param {number} y0 - Peak sample
 * @param {number} yp1 - Sample after the peak
 * @returns {Object} Object containing the interpolated peak position, height, and half-curvature
 */
function qint(ym1, y0, yp1) {
    // Calculate the extremum location p
    const p = (yp1 - ym1) / (2 * (2 * y0 - yp1 - ym1));
    
    // Calculate the interpolated peak height
    const y = y0 - 0.25 * (ym1 - yp1) * p;
    
    // Calculate the half-curvature
    const a = 0.5 * (ym1 - 2 * y0 + yp1);
    
    return { p, y, a };
}

/**
 * Finds the interpolated peak in frequency domain using parabolic interpolation
 * @param {Float32Array} magnitudes - Array of magnitude values
 * @param {number} peakIndex - Index of the detected peak in the magnitudes array
 * @param {number} sampleRate - Sample rate of the audio
 * @param {number} fftSize - Size of the FFT
 * @returns {Object} Object containing the interpolated frequency and magnitude
 */
function findInterpolatedPeak(magnitudes, peakIndex, sampleRate, fftSize) {
    // Ensure we have valid indices for interpolation
    if (peakIndex <= 0 || peakIndex >= magnitudes.length - 1) {
        // If we can't interpolate, return the original peak
        return {
            frequency: peakIndex * sampleRate / fftSize,
            magnitude: magnitudes[peakIndex]
        };
    }
    
    // Get the three points for interpolation
    const ym1 = magnitudes[peakIndex - 1];
    const y0 = magnitudes[peakIndex];
    const yp1 = magnitudes[peakIndex + 1];
    
    // Perform quadratic interpolation
    const { p, y } = qint(ym1, y0, yp1);
    
    // Calculate the interpolated frequency
    // The peak is at peakIndex + p, where p is the fractional offset
    const interpolatedIndex = peakIndex + p;
    const interpolatedFrequency = interpolatedIndex * sampleRate / fftSize;
    
    return {
        frequency: interpolatedFrequency,
        magnitude: y
    };
}
/**
 * Finds the interpolated peak in frequency domain using sinc interpolation
 * @param {Float32Array} magnitudes - Array of magnitude values
 * @param {number} peakIndex - Index of the detected peak in the magnitudes array
 * @param {number} sampleRate - Sample rate of the audio
 * @param {number} fftSize - Size of the FFT
 * @param {number} lobes - Number of side lobes to use (default: 4)
 * @param {Function} windowFn - Window function to apply (default: Hann)
 * @returns {Object} Object containing the interpolated frequency and magnitude
 */
function findInterpolatedPeakSinc(magnitudes, peakIndex, sampleRate, fftSize, lobes = 4, windowFn = null) {
    // Ensure we have enough samples for interpolation
    if (peakIndex < lobes || peakIndex >= magnitudes.length - lobes) {
        return {
            frequency: peakIndex * sampleRate / fftSize,
            magnitude: magnitudes[peakIndex]
        };
    }

    let sum = 0;
    let weightSum = 0;
    
    // Calculate sinc interpolation
    for (let i = -lobes; i <= lobes; i++) {
        const x = Math.PI * i;
        let sinc = x !== 0 ? Math.sin(x) / x : 1;
        
        // Apply window function if provided
        if (windowFn) {
            const windowValue = windowFn(i / lobes);
            sinc *= windowValue;
        }
        
        sum += magnitudes[peakIndex + i] * sinc;
        weightSum += sinc;
    }

    // Normalize
    const interpolatedMagnitude = sum / weightSum;
    
    // Find fractional bin offset using parabolic interpolation on the interpolated values
    const { p } = qint(
        magnitudes[peakIndex - 1],
        magnitudes[peakIndex],
        magnitudes[peakIndex + 1]
    );
    
    const interpolatedIndex = peakIndex + p;
    const interpolatedFrequency = interpolatedIndex * sampleRate / fftSize;
    
    return {
        frequency: interpolatedFrequency,
        magnitude: interpolatedMagnitude
    };
}

/**
 * Finds the interpolated peak in frequency domain using Quinn's Second Estimator
 * @param {Float32Array} magnitudes - Array of magnitude values
 * @param {number} peakIndex - Index of the detected peak in the magnitudes array
 * @param {number} sampleRate - Sample rate of the audio
 * @param {number} fftSize - Size of the FFT
 * @returns {Object} Object containing the interpolated frequency and magnitude
 */
function findInterpolatedPeakQuinn(magnitudes, peakIndex, sampleRate, fftSize) {
    // Quinn's Second Estimator - more accurate than parabolic for sinusoids
    // Requires at least 2 points on each side of the peak
    if (peakIndex < 2 || peakIndex >= magnitudes.length - 2) {
        return {
            frequency: peakIndex * sampleRate / fftSize,
            magnitude: magnitudes[peakIndex]
        };
    }
    
    const alpha = Math.log(magnitudes[peakIndex+1] / magnitudes[peakIndex-1]) / 2;
    const beta = Math.log(magnitudes[peakIndex+2] / magnitudes[peakIndex-2]) / 4;
    const gamma = alpha / (alpha - beta);
    
    // Refined bin location
    const refinedBin = peakIndex + gamma;
    
    // Calculate frequency and magnitude
    const frequency = refinedBin * sampleRate / fftSize;
    
    // Interpolate magnitude
    const magnitude = magnitudes[peakIndex] * Math.exp(-(alpha * gamma * gamma) / 2);
    
    return { frequency, magnitude };
}

/**
 * Track frequency changes to better handle vibrato and rapid pitch changes
 * @param {Array} currentPeaks - Current detected peaks
 * @param {Array} previousPeaks - Previously detected peaks
 * @param {number} maxDeltaHz - Maximum allowed frequency change in Hz
 * @returns {Array} Tracked peaks with smoothed frequency changes
 */
function trackFrequencyChanges(currentPeaks, previousPeaks, maxDeltaHz = 40) {
    if (!previousPeaks || previousPeaks.length === 0) {
        return currentPeaks;
    }
    
    // Create a copy of current peaks to modify
    const trackedPeaks = [...currentPeaks];
    
    // For each previous peak, find the closest current peak
    previousPeaks.forEach(prevPeak => {
        // Find the closest current peak within maxDeltaHz
        const closestPeakIndex = trackedPeaks.findIndex(peak => 
            Math.abs(peak.frequency - prevPeak.frequency) < maxDeltaHz);
        
        // If we found a close match, smooth the transition
        if (closestPeakIndex >= 0) {
            // Apply a weighted average to smooth frequency changes
            // 70% current, 30% previous for smooth transitions
            trackedPeaks[closestPeakIndex].frequency = 
                0.7 * trackedPeaks[closestPeakIndex].frequency + 
                0.3 * prevPeak.frequency;
        }
    });
    
    return trackedPeaks;
}

class KalmanFilter {
    constructor(processNoise = 1.0, measurementNoise = 1.0, initialState = 0, initialUncertainty = 1.0) {
        this.processNoise = processNoise;
        this.measurementNoise = measurementNoise;
        this.state = initialState;
        this.uncertainty = initialUncertainty;
    }

    update(measurement) {
        // Prediction
        const predictedUncertainty = this.uncertainty + this.processNoise;
        
        // Update
        const kalmanGain = predictedUncertainty / (predictedUncertainty + this.measurementNoise);
        this.state = this.state + kalmanGain * (measurement - this.state);
        this.uncertainty = (1 - kalmanGain) * predictedUncertainty;
        
        return this.state;
    }
}

/**
 * Track frequency changes using Kalman filtering
 * @param {Array} currentPeaks - Current detected peaks
 * @param {Array} previousPeaks - Previously detected peaks
 * @param {number} maxDeltaHz - Maximum allowed frequency change in Hz
 * @param {Object} kalmanFilters - Dictionary of Kalman filters by peak index
 * @returns {Object} Object containing tracked peaks and updated Kalman filters
 */
function trackFrequencyChangesKalman(currentPeaks, previousPeaks, maxDeltaHz = 40, kalmanFilters = {}) {
    if (!previousPeaks || previousPeaks.length === 0) {
        // Initialize Kalman filters for each peak
        currentPeaks.forEach((peak, i) => {
            kalmanFilters[i] = new KalmanFilter(0.1, 1.0, peak.frequency);
        });
        return { peaks: currentPeaks, kalmanFilters };
    }
    
    // Create a copy of current peaks to modify
    const trackedPeaks = [...currentPeaks];
    
    // For each previous peak, find the closest current peak
    previousPeaks.forEach((prevPeak, i) => {
        // Find the closest current peak within maxDeltaHz
        const closestPeakIndex = trackedPeaks.findIndex(peak => 
            Math.abs(peak.frequency - prevPeak.frequency) < maxDeltaHz);
        
        if (closestPeakIndex >= 0) {
            // Update Kalman filter with new measurement
            if (!kalmanFilters[i]) {
                kalmanFilters[i] = new KalmanFilter(0.1, 1.0, prevPeak.frequency);
            }
            trackedPeaks[closestPeakIndex].frequency = 
                kalmanFilters[i].update(trackedPeaks[closestPeakIndex].frequency);
        }
    });
    
    return { peaks: trackedPeaks, kalmanFilters };
}

export { qint, findInterpolatedPeak, findInterpolatedPeakQuinn, findInterpolatedPeakSinc, trackFrequencyChanges, KalmanFilter, trackFrequencyChangesKalman };
