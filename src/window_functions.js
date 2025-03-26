/**
 * Window functions for spectral analysis
 */

/**
 * Creates a Gaussian window function
 * @param {number} length - Length of the window
 * @param {number} alpha - Parameter controlling the width of the window (default: 2.5)
 * @returns {Float32Array} - Gaussian window function values
 */
function gaussianWindow(length, alpha = 2.5) {
    const window = new Float32Array(length);
    const center = (length - 1) / 2;
    
    for (let i = 0; i < length; i++) {
        const x = (i - center) / center;
        window[i] = Math.exp(-0.5 * Math.pow(alpha * x, 2));
    }
    
    return window;
}

/**
 * Creates a Hanning window function
 * @param {number} length - Length of the window
 * @returns {Float32Array} - Hanning window function values
 */
function hanningWindow(length) {
    const window = new Float32Array(length);
    
    for (let i = 0; i < length; i++) {
        window[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (length - 1)));
    }
    
    return window;
}

/**
 * Applies a window function to a signal
 * @param {Float32Array|Uint8Array} signal - Input signal
 * @param {Float32Array} window - Window function
 * @returns {Float32Array} - Windowed signal
 */
function applyWindow(signal, window) {
    const result = new Float32Array(signal.length);
    
    for (let i = 0; i < signal.length; i++) {
        result[i] = signal[i] * window[i];
    }
    
    return result;
}

/**
 * Log-scales a spectrum to emphasize peaks without normalizing between timeframes
 * This transforms Gaussian peaks into parabolic peaks, which are better for parabolic interpolation
 * @param {Float32Array} magnitudes - Magnitude spectrum
 * @returns {Float32Array} - Log-scaled magnitude spectrum that preserves relative magnitudes
 */
function logScaleSpectrum(magnitudes) {
    const result = new Float32Array(magnitudes.length);
    
    // Add a small constant to avoid log(0)
    const epsilon = 1e-10;
    
    // Apply log scaling without normalizing per timeframe
    // This preserves the relative magnitudes between frames
    for (let i = 0; i < magnitudes.length; i++) {
        // Apply log scaling to emphasize peaks while keeping low values low
        result[i] = Math.log(magnitudes[i] + epsilon);
    }
    
    return result;
    
}

export { gaussianWindow, hanningWindow, applyWindow, logScaleSpectrum };