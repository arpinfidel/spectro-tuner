import webfft from 'webfft';

/**
 * Window functions for spectral analysis
 */

/**
 * Creates a Blackman-Harris window function (minimum 4-term, 92 dB side lobe)
 * @param {number} length - Length of the window
 * @returns {Float32Array} - Blackman-Harris window function values
 */
function blackmanHarrisWindow(length) {
    const window = new Float32Array(length);
    const a0 = 0.35875;
    const a1 = 0.48829;
    const a2 = 0.14128;
    const a3 = 0.01168;
    
    for (let i = 0; i < length; i++) {
        const term1 = a1 * Math.cos(2 * Math.PI * i / (length - 1));
        const term2 = a2 * Math.cos(4 * Math.PI * i / (length - 1));
        const term3 = a3 * Math.cos(6 * Math.PI * i / (length - 1));
        window[i] = a0 - term1 + term2 - term3;
    }
    
    return window;
}

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

/**
 * Creates a Hamming window function
 * @param {number} length - Length of the window
 * @returns {Float32Array} - Hamming window function values
 */
function hammingWindow(length) {
    const window = new Float32Array(length);
    for (let i = 0; i < length; i++) {
        window[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (length - 1));
    }
    return window;
}

/**
 * Creates a Flat-top window function
 * @param {number} length - Length of the window
 * @returns {Float32Array} - Flat-top window function values
 */
function flatTopWindow(length) {
    const window = new Float32Array(length);
    const a0 = 0.21557895;
    const a1 = 0.41663158;
    const a2 = 0.277263158;
    const a3 = 0.083578947;
    const a4 = 0.006947368;
    
    for (let i = 0; i < length; i++) {
        const term1 = a1 * Math.cos(2 * Math.PI * i / (length - 1));
        const term2 = a2 * Math.cos(4 * Math.PI * i / (length - 1));
        const term3 = a3 * Math.cos(6 * Math.PI * i / (length - 1));
        const term4 = a4 * Math.cos(8 * Math.PI * i / (length - 1));
        window[i] = a0 - term1 + term2 - term3 + term4;
    }
    return window;
}

function harmonicProductSpectrum(magnitudes, compressionFactors = [1, 2, 3]) {
    const product = new Float32Array(magnitudes.length);
    
    // Initialize with original spectrum
    for (let i = 0; i < magnitudes.length; i++) {
        product[i] = magnitudes[i];
    }

    // Multiply with compressed spectra
    for (const factor of compressionFactors.slice(1)) {
        const compressedLength = Math.floor(magnitudes.length / factor);
        for (let i = 0; i < compressedLength; i++) {
            product[i] *= magnitudes[i * factor];
        }
        // Zero out remaining bins
        for (let i = compressedLength; i < magnitudes.length; i++) {
            product[i] = 0;
        }
    }

    return product;
}

/**
 * TODO: doesn't work
 * Performs cepstral analysis to suppress harmonics
 * @param {Float32Array} magnitudes - Magnitude spectrum
 * @returns {Float32Array} - Spectrum with reduced harmonics
 */
function computeCepstrum(magnitudes) {
    // 1. Compute log spectrum (add small epsilon to avoid log(0))
    const logSpectrum = new Float32Array(magnitudes.length * 2);
    for (let i = 0; i < magnitudes.length; i++) {
        logSpectrum[i*2] = Math.log(magnitudes[i] + 1e-10);
        logSpectrum[i*2 + 1] = 0;
    }

    // 2. Compute complex cepstrum (inverse FFT of log spectrum)
    const fft = new webfft(magnitudes.length);
    const cepstrum = fft.fft(logSpectrum);

    // 3. Liftering - remove harmonic components
    // Keep only low quefrency components (fundamental frequency)
    const lifterLength = Math.floor(magnitudes.length * 0.05); // Keep first 5%
    for (let i = lifterLength*2; i < cepstrum.length; i++) {
        cepstrum[i] = 0;
    }

    // 4. Reconstruct spectrum (FFT of liftered cepstrum)
    const reconstructed = fft.fft(cepstrum);

    // 5. Convert back to magnitude spectrum
    const result = new Float32Array(magnitudes.length);
    for (let i = 0; i < result.length; i++) {
        const real = reconstructed[i*2];
        const imag = reconstructed[i*2 + 1];
        result[i] = Math.exp(Math.sqrt(real*real + imag*imag));
    }

    return result;
}

export { 
    gaussianWindow, 
    hanningWindow, 
    blackmanHarrisWindow, 
    hammingWindow,
    flatTopWindow,
    applyWindow, 
    logScaleSpectrum, 
    harmonicProductSpectrum,
    computeCepstrum
};
