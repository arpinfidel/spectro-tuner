/**
 * Enhanced frequency interpolation methods for spectral analysis
 * Includes Quinn's Second Estimator with complex FFT data support
 */

/**
 * Helper function for Quinn's method to calculate tau value
 * @param {number} r - Real part ratio
 * @param {number} i - Imaginary part ratio
 * @returns {number} Tau value for Quinn's estimator
 */
function calculateTau(r, i) {
    return 0.5 * i / (r + Math.sqrt(r*r + i*i));
}

/**
 * Finds the interpolated peak using Quinn's Second Estimator with complex FFT data
 * This implementation uses both real and imaginary parts for more accurate estimation
 * @param {Float32Array} spectrum - Interleaved complex FFT data (real, imag, real, imag, ...)
 * @param {number} peakIndex - Index of the detected peak in the magnitude spectrum
 * @param {number} sampleRate - Sample rate of the audio
 * @param {number} fftSize - Size of the FFT
 * @returns {Object} Object containing the interpolated frequency and magnitude
 */
function findInterpolatedPeakQuinnComplex(spectrum, peakIndex, sampleRate, fftSize) {
    // We need at least one bin on each side of the peak
    if (peakIndex <= 0 || peakIndex >= fftSize/2 - 1) {
        // Calculate magnitude for the original peak
        const real = spectrum[peakIndex*2];
        const imag = spectrum[peakIndex*2 + 1];
        const magnitude = Math.sqrt(real*real + imag*imag);
        
        return {
            frequency: peakIndex * sampleRate / fftSize,
            magnitude: magnitude
        };
    }
    
    // Get complex values at peak and adjacent bins
    const realM1 = spectrum[(peakIndex-1)*2];
    const imagM1 = spectrum[(peakIndex-1)*2 + 1];
    const real0 = spectrum[peakIndex*2];
    const imag0 = spectrum[peakIndex*2 + 1];
    const realP1 = spectrum[(peakIndex+1)*2];
    const imagP1 = spectrum[(peakIndex+1)*2 + 1];
    
    // Calculate magnitude at peak
    const magnitude = Math.sqrt(real0*real0 + imag0*imag0);
    
    // Calculate complex ratios for adjacent bins
    // X(k+1)/X(k)
    const rp = (real0 * realP1 + imag0 * imagP1) / (real0*real0 + imag0*imag0);
    const ip = (imag0 * realP1 - real0 * imagP1) / (real0*real0 + imag0*imag0);
    
    // X(k-1)/X(k)
    const rm = (real0 * realM1 + imag0 * imagM1) / (real0*real0 + imag0*imag0);
    const im = (imag0 * realM1 - real0 * imagM1) / (real0*real0 + imag0*imag0);
    
    // Calculate tau values
    const taup = calculateTau(rp, ip);
    const taum = calculateTau(rm, im);
    
    // Calculate delta using Quinn's second estimator
    let delta;
    if (taup > 0 && taum > 0) {
        delta = taup;
    } else if (taup < 0 && taum < 0) {
        delta = taum;
    } else {
        delta = (taup - taum) / 2;
    }
    
    // Refined bin location
    const refinedBin = peakIndex + delta;
    
    // Calculate interpolated frequency
    const frequency = refinedBin * sampleRate / fftSize;
    
    return {
        frequency: frequency,
        magnitude: magnitude
    };
}

/**
 * Finds the interpolated peak using Jacobsen's method with complex FFT data
 * This is another accurate method for sinusoidal signals
 * @param {Float32Array} spectrum - Interleaved complex FFT data (real, imag, real, imag, ...)
 * @param {number} peakIndex - Index of the detected peak in the magnitude spectrum
 * @param {number} sampleRate - Sample rate of the audio
 * @param {number} fftSize - Size of the FFT
 * @returns {Object} Object containing the interpolated frequency and magnitude
 */
function findInterpolatedPeakJacobsen(spectrum, peakIndex, sampleRate, fftSize) {
    // We need at least one bin on each side of the peak
    if (peakIndex <= 0 || peakIndex >= fftSize/2 - 1) {
        // Calculate magnitude for the original peak
        const real = spectrum[peakIndex*2];
        const imag = spectrum[peakIndex*2 + 1];
        const magnitude = Math.sqrt(real*real + imag*imag);
        
        return {
            frequency: peakIndex * sampleRate / fftSize,
            magnitude: magnitude
        };
    }
    
    // Get complex values at peak and adjacent bins
    const realM1 = spectrum[(peakIndex-1)*2];
    const imagM1 = spectrum[(peakIndex-1)*2 + 1];
    const real0 = spectrum[peakIndex*2];
    const imag0 = spectrum[peakIndex*2 + 1];
    const realP1 = spectrum[(peakIndex+1)*2];
    const imagP1 = spectrum[(peakIndex+1)*2 + 1];
    
    // Calculate magnitude at peak
    const magnitude = Math.sqrt(real0*real0 + imag0*imag0);
    
    // Calculate real and imaginary parts of X(k+1)/X(k-1)
    const r = (realP1 * realM1 + imagP1 * imagM1) / (realM1*realM1 + imagM1*imagM1);
    const i = (imagP1 * realM1 - realP1 * imagM1) / (realM1*realM1 + imagM1*imagM1);
    
    // Calculate delta using Jacobsen's formula
    const delta = Math.atan2(i, r) / (2 * Math.PI);
    
    // Refined bin location
    const refinedBin = peakIndex + delta;
    
    // Calculate interpolated frequency
    const frequency = refinedBin * sampleRate / fftSize;
    
    return {
        frequency: frequency,
        magnitude: magnitude
    };
}

export { 
    findInterpolatedPeakQuinnComplex,
    findInterpolatedPeakJacobsen,
    calculateTau
};