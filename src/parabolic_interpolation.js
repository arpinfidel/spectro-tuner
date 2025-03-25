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

export { qint, findInterpolatedPeak, trackFrequencyChanges };
