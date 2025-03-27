import * as dat from 'dat.gui';
const audioCtx = new AudioContext();
// const audioPlayer = document.getElementById('audio');
// const localAudioElement = document.getElementById('audioFileInput');
// localAudioElement.addEventListener('change', loadLocalFile);
const canvas = document.getElementById('spectrumCanvas'),
      ctx = canvas.getContext('2d'),
      container = document.getElementById('canvasContainer');
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
      autoGainControl: false,
      echoCancellation: false,
      noiseSuppression: false,
      latency: 0
  }
});

const audioSource = audioCtx.createMediaStreamSource(stream);
// const audioSource = audioCtx.createMediaElementSource(audioPlayer);

const analyser = audioCtx.createAnalyser();
audioSource.connect(analyser);
analyser.fftSize = 32768; // maxes out FFT size
const dataArray = new Float32Array(analyser.fftSize);
const currentSpectrum = [],
      peaks = [],
      peakHolds = [],
      peakAccels = [];
const delay = audioCtx.createDelay();
audioSource.connect(delay);
// delay.connect(audioCtx.destination);
//audioSource.connect(audioCtx.destination);
audioSource.connect(analyser);

const visualizerSettings = {
  type: 'fft',
  numBands: 96,
  fftSize: 4096,
  minFreq: 20,
  maxFreq: 20000,
  minNote: 4,
  maxNote: 124,
  noteTuning: 440,
  octaves: 12,
  detune: 0,
  bandwidth: 0.5,
  bandwidthOffset: 1,
  freqDist: 'octaves',
  fscale: 'logarithmic',
  windowFunction: 'hann',
  windowParameter: 1,
  windowSkew: 0,
  bpBandwidth: 6,
  bpCap: 100,
  bpKernel: 'nuttall',
  bpKernelParameter: 1,
  bpAsymmetry: 0,
  timeAlignment: 1,
  downsample: 0,
  granularDownsample: false,
  granularBW: true,
  averageSamplesInstead: false,
  interpSize: 32,
  summationMode: 'max',
  useComplex: true,
  smoothInterp: true,
  smoothSlope: true,
  smoothingTimeConstant: 0,
  smoothingMode: 'avg',
  holdTime: 30,
  fallRate: 0.5,
  peakDecay: 80,
  clampMain: true,
  clampPeaks: true,
  peakMode: 'gravity',
  useActualPeak: false,
  showPeaks: true,
  hzLinearFactor: 0,
  minDecibels: -90,
  maxDecibels: 0,
  useDecibels: true,
  gamma: 1,
  useAbsolute: true,
  equalizeAmount: 0,
  equalizeOffset: 44100,
  equalizeDepth: 1024,
  slope: 0,
  slopeOffset: 1000,
  weightingAmount: 0,
  weightingType: 'k',
  slopeFunctionsOffset: 1,
  freeze: false,
  color: 'none',
  rainbowColorOffset: 0,
  reverseRainbow: false,
  showLabels: true,
  showLabelsY: true,
  amplitudeLabelInterval: 6,
  labelTuning: 440,
  showDC: true,
  showNyquist: true,
  mirrorLabels: true,
  labelTextAlign: 'start',
  labelTextBaseline: 'alphabetic',
  diffLabels: false,
  labelMode : 'decade',
  barSpacing: 1,
  spacingMode: 'smooth',
  centerBars: false,
  peakHeight: 1,
  solidPeaks: false,
  useLED: false,
  spaceV: 4,
  ledStrips: 128,
  darkMode: false,
  compensateDelay: true,
  debugFFTData: false,
  noOverlayOnDebug: true,
  displayWindowFunction: true,
  resetPeaks: resetSmoothedValues
},
      windowFunctionSettings = {
        'Rectangular': 'rectangular',
        'Triangular (Bartlett)': 'triangular',
        'Quadratic': 'quadratic spline',
        'Parzen': 'parzen',
        'Welch': 'welch',
        'Power of sine': 'power of sine',
        'Power of circle': 'circle',
        'Tukey (tapered cosine)': 'tukey',
        'Vorbis': 'vorbis',
        'Cascaded sine': 'cascaded sine',
        'Hann': 'hann',
        'Hamming': 'hamming',
        'Blackman': 'blackman',
        'Nuttall': 'nuttall',
        'Flat top': 'flattop',
        'Gaussian': 'gauss',
        'Hyperbolic cosine': 'cosh',
        'Hyperbolic cosine 2': 'cosh 2',
        'Kaiser': 'kaiser',
        'Poisson': 'exponential',
        'Hyperbolic secant': 'sech',
        'Galss': 'galss', // Name derived from a particular program name (Aimp Galss Player) in Titanic Tools that pre-installed on Windows 7 Titanic Edition
        'Glizzy': 'glizzy'
      },
      fscaleSettings = {
        'Bark': 'bark',
        'ERB': 'erb',
        'Cams': 'cam',
        'Mel (AIMP)': 'mel',
        'Linear': 'linear',
        'Logarithmic': 'logarithmic',
        'Hyperbolic sine': 'sinh',
        'Shifted logarithmic': 'shifted log',
        'Nth root': 'nth root',
        'Negative exponential': 'negative exponential',
        'Adjustable Bark': 'adjustable bark',
        'Period': 'period'
        },
      freqDistSettings = {
        'Octave bands': 'octaves',
        'Frequency bands': 'freqs',
        'Avee Player': 'avee'
      },
      typeSettings = {
        'Simple FFT': 'rough integral',
        'Sinc-interpolated FFT': 'fft',
        'CQT': 'cqt',
        'Brown-Puckette': 'bpcqt',
        'Filter bank energies': 'filterbank'
      },
      colorSettings = {
        'None': 'none',
        'Classic': 'classic',
        'RGB': 'rgb',
        'foo_enhanced_spectrum_analyzer': 'esa',
        'foo_enhanced_spectrum_analyzer 2.x.x.x': 'esa2',
        'Rainbow': 'rainbow',
        'Rainbow (tracking)': 'tracking rainbow',
        'Rainbow (intensity)': 'intensity rainbow',
        'Tracking rainbow revealed': 'tracking intensity rainbow',
        'Voice-Change-o-Matic': 'mdn',
        'foobar2000': 'fb2k',
        'foobar2000 (classic)': 'fb2k 2',
        'Prism': 'prism 2',
        'Prism (foo_musical_spectrum)': 'prism',
        'Prism (classic)': 'prism 3',
        'Audition': 'audition',
        'WMP Bars': 'wmp',
        'Ocean Mist': 'ocean',
        'Fire Storm': 'firestorm',
        'Scrappy': 'scrappy',
        'Scaled gradient': 'shade',
        'Shifted gradient': 'shade 2'
      },
      averagingOptions = {
        'Average': 'avg',
        'RMS': 'rms',
        'Peak': 'peak',
        'Smoothed peak': 'exponential peak',
        'Peak (aesthetic)': 'aesthetic peak',
        'Peak (aesthetic, exponential)': 'exponential aesthetic',
        'Average (aesthetic)': 'aesthetic average',
        'FabFilter': 'aesthetic exponential peak',
      },
      bandpowerAttributes = {
        'Maximum': 'max',
        'Minimum': 'min',
        'Average': 'avg',
        'RMS': 'rms',
        'Sum': 'sum',
        'RMS sum': 'rms sum',
        'Median': 'median',
        'foobar2000': 'fb2k'
      },
      labelModes = {
        'Decades': 'decade',
        'Decades (coarse)': 'decade 2',
        'Decades (without minor gridlines)': 'decade 3',
        'Octaves': 'octave',
        'Powers of two': 'powers of two',
        'Notes': 'note',
        'Critical bands': 'bark',
        'Linear': 'linear',
        'Automatic': 'auto'
      },
      peakModes = {
        'Classic': 'classic',
        'Gravity': 'gravity',
        'AIMP': 'aimp',
        'Analysis': 'analysis'
      },
      weightingTypes = {
        'A': 'a',
        'B': 'b',
        'C': 'c',
        'D': 'd',
        'ITU-R 468': 'm',
        'K': 'k'
      },
      loader = {
        url: '',
        load: function() {
          audioPlayer.src = this.url;
          audioPlayer.play();
        },
        loadLocal: function() {
          localAudioElement.click();
        },
        toggleFullscreen: _ => {
          if (document.fullscreenElement === canvas)
            document.exitFullscreen();
          else
            canvas.requestFullscreen();
        }
      };

let gui = new dat.GUI();
gui.add(loader, 'url').name('URL');
gui.add(loader, 'load').name('Load');
gui.add(loader, 'loadLocal').name('Load from local device');
let settings = gui.addFolder('Visualization settings');
const freqDistFolder = settings.addFolder('Frequency distribution');
freqDistFolder.add(visualizerSettings, 'freqDist', freqDistSettings).name('Frequency band distribution');
// up to 192kHz sample rate is supported for full-range visualization
freqDistFolder.add(visualizerSettings, 'minFreq', 0, 96000).name('Minimum frequency');
freqDistFolder.add(visualizerSettings, 'maxFreq', 0, 96000).name('Maximum frequency');
freqDistFolder.add(visualizerSettings, 'minNote', 0, 128).name('Minimum note');
freqDistFolder.add(visualizerSettings, 'maxNote', 0, 128).name('Maximum note');
freqDistFolder.add(visualizerSettings, 'noteTuning', 0, 96000).name('Octave bands tuning (nearest note = tuning frequency in Hz)');
freqDistFolder.add(visualizerSettings, 'detune', -24, 24).name('Detune');
freqDistFolder.add(visualizerSettings, 'fscale', fscaleSettings).name('Frequency scale');
freqDistFolder.add(visualizerSettings, 'hzLinearFactor', 0, 100).name('Hz linear factor');
freqDistFolder.add(visualizerSettings, 'numBands', 2, 1920, 1).name('Number of bands');
freqDistFolder.add(visualizerSettings, 'octaves', 1, 192).name('Bands per octave');
const transformFolder = settings.addFolder('Transform algorithm');
transformFolder.add(visualizerSettings, 'type', typeSettings).name('Visualization algorithm');
transformFolder.add(visualizerSettings, 'fftSize', 32, 32768, 1).name('FFT size (samples)');
transformFolder.add(visualizerSettings, 'useComplex').name('Use complex FFT coefficients as input');
transformFolder.add(visualizerSettings, 'windowFunction', windowFunctionSettings).name('Window function');
transformFolder.add(visualizerSettings, 'windowParameter', 0, 10).name('Window parameter');
transformFolder.add(visualizerSettings, 'windowSkew', -1, 1).name('Window skew');
const bandpowerFolder = transformFolder.addFolder('Bandpower properties');
bandpowerFolder.add(visualizerSettings, 'interpSize', 1, 64, 1).name('Lanczos interpolation kernel size');
bandpowerFolder.add(visualizerSettings, 'smoothInterp').name('Smoother bin interpolation on lower frequencies');
bandpowerFolder.add(visualizerSettings, 'summationMode', bandpowerAttributes).name('Bandpower summation mode');
bandpowerFolder.add(visualizerSettings, 'smoothSlope').name('Smoother frequency slope on sum modes');
const cqtFolder = transformFolder.addFolder('Constant-Q/variable-Q transform properties');
cqtFolder.add(visualizerSettings, 'bandwidth', 0, 64).name('Bandwidth');
cqtFolder.add(visualizerSettings, 'bandwidthOffset', 0, 1).name('Transition smoothness');
cqtFolder.add(visualizerSettings, 'granularBW').name('Unlock input length from power of two');
const goertzelFolder = cqtFolder.addFolder('Goertzel algorithm-specific');
goertzelFolder.add(visualizerSettings, 'timeAlignment', -1, 1).name('CQT kernel time alignment');
goertzelFolder.add(visualizerSettings, 'downsample', 0, 100).name('Downsample amount');
goertzelFolder.add(visualizerSettings, 'granularDownsample').name('Unlock downsampling amount from power of two');
goertzelFolder.add(visualizerSettings, 'averageSamplesInstead').name('Average samples instead of skipping for downsampled part of CQT');
const bpFolder = cqtFolder.addFolder('Brown-Puckette kernel-specific');
bpFolder.add(visualizerSettings, 'bpBandwidth', 0, 256).name('Brown-Puckette kernel size');
bpFolder.add(visualizerSettings, 'bpCap', 0, 100).name('Minimum Brown-Puckette kernel size');
bpFolder.add(visualizerSettings, 'bpKernel', windowFunctionSettings).name('Kernel shape');
bpFolder.add(visualizerSettings, 'bpKernelParameter', 0, 10).name('Kernel shape parameter');
bpFolder.add(visualizerSettings, 'bpAsymmetry', -1, 1).name('Kernel asymmetry');
const peakFolder = settings.addFolder('Time averaging and peak decay settings');
peakFolder.add(visualizerSettings, 'smoothingTimeConstant', 0, 100).name('Smoothing time constant');
peakFolder.add(visualizerSettings, 'smoothingMode', averagingOptions).name('Time smoothing method');
peakFolder.add(visualizerSettings, 'holdTime', 0, 240).name('Peak hold time');
peakFolder.add(visualizerSettings, 'fallRate', 0, 32).name('Peak fall rate');
peakFolder.add(visualizerSettings, 'peakMode', peakModes).name('Peak decay behavior');
peakFolder.add(visualizerSettings, 'peakDecay', 0, 100).name('Peak decay time constant');
peakFolder.add(visualizerSettings, 'useActualPeak').name('Use actual peak');
peakFolder.add(visualizerSettings, 'clampPeaks').name('Clamp peaks');
peakFolder.add(visualizerSettings, 'clampMain').name('Clamp main bar decay');
peakFolder.add(visualizerSettings, 'resetPeaks').name('Reset time smoothing and peaks');
const amplitudeFolder = settings.addFolder('Amplitude');
amplitudeFolder.add(visualizerSettings, 'useDecibels').name('Use logarithmic amplitude/decibel scale');
amplitudeFolder.add(visualizerSettings, 'useAbsolute').name('Use absolute value');
amplitudeFolder.add(visualizerSettings, 'gamma', 0.5, 10).name('Gamma');
amplitudeFolder.add(visualizerSettings, 'minDecibels', -120, 6).name('Lower amplitude range');
amplitudeFolder.add(visualizerSettings, 'maxDecibels', -120, 6).name('Higher amplitude range');
const weightingFolder = amplitudeFolder.addFolder('Frequency weighting');
weightingFolder.add(visualizerSettings, 'slope', -12, 12).name('Frequency slope (dB per-octave)');
weightingFolder.add(visualizerSettings, 'slopeOffset', 0, 96000).name('Slope offset (Hz = 0dB)');
weightingFolder.add(visualizerSettings, 'equalizeAmount', -12, 12).name('Equalize amount');
weightingFolder.add(visualizerSettings, 'equalizeOffset', 0, 96000).name('Equalize offset');
weightingFolder.add(visualizerSettings, 'equalizeDepth', 0, 96000).name('Equalize depth');
weightingFolder.add(visualizerSettings, 'weightingAmount', -100, 100).name('Weighting amount');
weightingFolder.add(visualizerSettings, 'weightingType', weightingTypes).name('Weighting type');
weightingFolder.add(visualizerSettings, 'slopeFunctionsOffset', 0, 8).name('Slope functions offset (offset by sample rate/FFT size in samples)');
const labelFolder = settings.addFolder('Labels and grid');
labelFolder.add(visualizerSettings, 'showLabels').name('Show horizontal-axis labels');
labelFolder.add(visualizerSettings, 'showLabelsY').name('Show vertical-axis labels');
labelFolder.add(visualizerSettings, 'amplitudeLabelInterval', 0.5, 48).name('dB label interval');
labelFolder.add(visualizerSettings, 'showDC').name('Show DC label');
labelFolder.add(visualizerSettings, 'showNyquist').name('Show Nyquist frequency label');
labelFolder.add(visualizerSettings, 'mirrorLabels').name('Mirror Y-axis labels');
labelFolder.add(visualizerSettings, 'diffLabels').name('Use difference coloring for labels');
labelFolder.add(visualizerSettings, 'labelMode', labelModes).name('Frequency label mode');
labelFolder.add(visualizerSettings, 'labelTuning', 0, 96000).name('Note labels tuning (nearest note = tuning frequency in Hz)');
labelFolder.add(visualizerSettings, 'labelTextAlign', {
  'Start': 'start',
  'Center': 'center',
  'End': 'end'
}).name('X-axis label text alignment');
labelFolder.add(visualizerSettings, 'labelTextBaseline', {
  'Alphabetic': 'alphabetic',
  'Middle': 'middle',
  'Hanging': 'hanging'
}).name('Y-axis label text alignment');
const appearanceFolder = settings.addFolder('Appearance');
appearanceFolder.add(visualizerSettings, 'showPeaks').name('Show peaks');
appearanceFolder.add(visualizerSettings, 'solidPeaks').name('Draw peaks as fill instead');
appearanceFolder.add(visualizerSettings, 'peakHeight', 0.5, 32).name('Peak indicator height');
appearanceFolder.add(visualizerSettings, 'color', colorSettings).name('Visualization color');
appearanceFolder.add(visualizerSettings, 'rainbowColorOffset', -360, 360).name('Rainbow color offset');
appearanceFolder.add(visualizerSettings, 'reverseRainbow').name('Reverse rainbow coloring');
appearanceFolder.add(visualizerSettings, 'barSpacing', 0, 1024).name('Bar spacing');
appearanceFolder.add(visualizerSettings, 'spacingMode', ['rough', 'smooth', 'pixel perfect']).name('Bar spacing mode');
appearanceFolder.add(visualizerSettings, 'centerBars').name('Center bars');
appearanceFolder.add(visualizerSettings, 'useLED').name('Use LEDs');
appearanceFolder.add(visualizerSettings, 'spaceV', 0, 32).name('LED vertical spacing');
appearanceFolder.add(visualizerSettings, 'ledStrips', 2, 1080, 1).name('Max LED strip count');
appearanceFolder.add(visualizerSettings, 'darkMode').name('Dark mode');
const debuggingFolder = settings.addFolder('FFT input display (debugging)');
debuggingFolder.add(visualizerSettings, 'debugFFTData').name('Display oscilloscope view instead for debugging');
debuggingFolder.add(visualizerSettings, 'noOverlayOnDebug').name('Replace with debugging oscilloscope view');
debuggingFolder.add(visualizerSettings, 'displayWindowFunction').name('Display window function');
settings.add(visualizerSettings, 'freeze').name('Freeze analyser');
settings.add(visualizerSettings, 'compensateDelay').name('Compensate for delay');
// gui.add(loader, 'toggleFullscreen').name('Toggle fullscreen mode');

function resizeCanvas() {
  const scale = devicePixelRatio,
        isFullscreen = document.fullscreenElement === canvas;
  canvas.width = (isFullscreen ? innerWidth : container.clientWidth)*scale;
  canvas.height = (isFullscreen ? innerHeight : container.clientHeight)*scale;
}

function resetSmoothedValues() {
  currentSpectrum.length = 0;
  peaks.length = 0;
  peakHolds.length = 0;
  peakAccels.length = 0;
}

addEventListener('click', () => {
  if (audioCtx.state == 'suspended')
    audioCtx.resume();
});
addEventListener('resize', resizeCanvas);
resizeCanvas();

function loadLocalFile(event) {
  const file = event.target.files[0],
        reader = new FileReader();
  reader.onload = (e) => {
    audioPlayer.src = e.target.result;
    audioPlayer.play();
  };

  reader.readAsDataURL(file);
}


function map(x, min, max, targetMin, targetMax) {
  return (x - min) / (max - min) * (targetMax - targetMin) + targetMin;
}

function clamp(x, min, max) {
  return Math.min(Math.max(x, min), max);
}

function idxWrapOver(x, length) {
  return (x % length + length) % length;
}
  // Hz and FFT bin conversion
function hertzToFFTBin(x, y = 'round', bufferSize = 4096, sampleRate = 44100) {
  const bin = x * bufferSize / sampleRate;
  let func = y;
  
  if (!['floor','ceil','trunc'].includes(func))
    func = 'round'; // always use round if you specify an invalid/undefined value
  
  return Math[func](bin);
}

function fftBinToHertz(x, bufferSize = 4096, sampleRate = 44100) {
  return x * sampleRate / bufferSize;
}
  

// Calculate the FFT
function calcFFT(input) {
  let fft = input.map(x => x);
  let fft2 = input.map(x => x);
  transform(fft, fft2);
  let output = new Array(Math.round(fft.length/2)).fill(0);
  for (let i = 0; i < output.length; i++) {
    output[i] = Math.hypot(fft[i], fft2[i])/(fft.length);
  }
  return output;
}

function calcComplexFFT(input) {
  let fft = input.map(x => x);
  let fft2 = input.map(x => x);
  transform(fft, fft2);
  return input.map((_, i, arr) => {
    return {
      re: fft[i]/(arr.length/2),
      im: fft2[i]/(arr.length/2),
      magnitude: Math.hypot(fft[i], fft2[i])/(arr.length/2),
      phase: Math.atan2(fft2[i], fft[i])
    };
  });
}
  
/**
 * FFT and convolution (JavaScript)
 * 
 * Copyright (c) 2017 Project Nayuki. (MIT License)
 * https://www.nayuki.io/page/free-small-fft-in-multiple-languages
 */

/* 
 * Computes the discrete Fourier transform (DFT) of the given complex vector, storing the result back into the vector.
 * The vector can have any length. This is a wrapper function.
 */
function transform(real, imag) {
	const n = real.length;
	if (n != imag.length)
		throw "Mismatched lengths";
	if (n <= 0)
		return;
	else if ((2 ** Math.trunc(Math.log2(n))) === n)  // Is power of 2
		transformRadix2(real, imag);
	else  // More complicated algorithm for arbitrary sizes
		transformBluestein(real, imag);
}


/* 
 * Computes the inverse discrete Fourier transform (IDFT) of the given complex vector, storing the result back into the vector.
 * The vector can have any length. This is a wrapper function. This transform does not perform scaling, so the inverse is not a true inverse.
 */
function inverseTransform(real, imag) {
	transform(imag, real);
}


/* 
 * Computes the discrete Fourier transform (DFT) of the given complex vector, storing the result back into the vector.
 * The vector's length must be a power of 2. Uses the Cooley-Tukey decimation-in-time radix-2 algorithm.
 */
function transformRadix2(real, imag) {
	// Length variables
	const n = real.length;
	if (n != imag.length)
		throw "Mismatched lengths";
	if (n <= 1)  // Trivial transform
		return;
	const logN = Math.log2(n);
	if ((2 ** Math.trunc(logN)) !== n)
		throw "Length is not a power of 2";
	
	// Trigonometric tables
	let cosTable = new Array(n / 2);
	let sinTable = new Array(n / 2);
	for (let i = 0; i < n / 2; i++) {
		cosTable[i] = Math.cos(2 * Math.PI * i / n);
		sinTable[i] = Math.sin(2 * Math.PI * i / n);
	}
	
	// Bit-reversed addressing permutation
	for (let i = 0; i < n; i++) {
		let j = reverseBits(i, logN);
		if (j > i) {
			let temp = real[i];
			real[i] = real[j];
			real[j] = temp;
			temp = imag[i];
			imag[i] = imag[j];
			imag[j] = temp;
		}
	}
	
	// Cooley-Tukey decimation-in-time radix-2 FFT
	for (let size = 2; size <= n; size *= 2) {
		let halfsize = size / 2;
		let tablestep = n / size;
		for (let i = 0; i < n; i += size) {
			for (let j = i, k = 0; j < i + halfsize; j++, k += tablestep) {
				const l = j + halfsize;
				const tpre =  real[l] * cosTable[k] + imag[l] * sinTable[k];
				const tpim = -real[l] * sinTable[k] + imag[l] * cosTable[k];
				real[l] = real[j] - tpre;
				imag[l] = imag[j] - tpim;
				real[j] += tpre;
				imag[j] += tpim;
			}
		}
	}
	
	// Returns the integer whose value is the reverse of the lowest 'bits' bits of the integer 'x'.
	function reverseBits(x, bits) {
		let y = 0;
		for (let i = 0; i < bits; i++) {
			y = (y << 1) | (x & 1);
			x >>>= 1;
		}
		return y;
	}
}


/* 
 * Computes the discrete Fourier transform (DFT) of the given complex vector, storing the result back into the vector.
 * The vector can have any length. This requires the convolution function, which in turn requires the radix-2 FFT function.
 * Uses Bluestein's chirp z-transform algorithm.
 */
function transformBluestein(real, imag) {
	// Find a power-of-2 convolution length m such that m >= n * 2 + 1
	const n = real.length;
	if (n != imag.length)
		throw "Mismatched lengths";
	const m = 2 ** Math.trunc(Math.log2(n*2)+1);
	
	// Trignometric tables
	let cosTable = new Array(n);
	let sinTable = new Array(n);
	for (let i = 0; i < n; i++) {
		let j = i * i % (n * 2);  // This is more accurate than j = i * i
		cosTable[i] = Math.cos(Math.PI * j / n);
		sinTable[i] = Math.sin(Math.PI * j / n);
	}
	
	// Temporary vectors and preprocessing
	let areal = newArrayOfZeros(m);
	let aimag = newArrayOfZeros(m);
	for (let i = 0; i < n; i++) {
		areal[i] =  real[i] * cosTable[i] + imag[i] * sinTable[i];
		aimag[i] = -real[i] * sinTable[i] + imag[i] * cosTable[i];
	}
	let breal = newArrayOfZeros(m);
	let bimag = newArrayOfZeros(m);
	breal[0] = cosTable[0];
	bimag[0] = sinTable[0];
	for (let i = 1; i < n; i++) {
		breal[i] = breal[m - i] = cosTable[i];
		bimag[i] = bimag[m - i] = sinTable[i];
	}
	
	// Convolution
	let creal = new Array(m);
	let cimag = new Array(m);
	convolveComplex(areal, aimag, breal, bimag, creal, cimag);
	
	// Postprocessing
	for (let i = 0; i < n; i++) {
		real[i] =  creal[i] * cosTable[i] + cimag[i] * sinTable[i];
		imag[i] = -creal[i] * sinTable[i] + cimag[i] * cosTable[i];
	}
}


/* 
 * Computes the circular convolution of the given real vectors. Each vector's length must be the same.
 */
function convolveReal(x, y, out) {
	const n = x.length;
	if (n != y.length || n != out.length)
		throw "Mismatched lengths";
	convolveComplex(x, newArrayOfZeros(n), y, newArrayOfZeros(n), out, newArrayOfZeros(n));
}

/* 
 * Computes the circular convolution of the given complex vectors. Each vector's length must be the same.
 */
function convolveComplex(xreal, ximag, yreal, yimag, outreal, outimag) {
	const n = xreal.length;
	if (n != ximag.length || n != yreal.length || n != yimag.length
			|| n != outreal.length || n != outimag.length)
		throw "Mismatched lengths";
	
	xreal = xreal.slice();
	ximag = ximag.slice();
	yreal = yreal.slice();
	yimag = yimag.slice();
	transform(xreal, ximag);
	transform(yreal, yimag);
	
	for (let i = 0; i < n; i++) {
		const temp = xreal[i] * yreal[i] - ximag[i] * yimag[i];
		ximag[i] = ximag[i] * yreal[i] + xreal[i] * yimag[i];
		xreal[i] = temp;
	}
	inverseTransform(xreal, ximag);
	
	for (let i = 0; i < n; i++) {  // Scaling (because this FFT implementation omits it)
		outreal[i] = xreal[i] / n;
		outimag[i] = ximag[i] / n;
	}
}


function newArrayOfZeros(n) {
	let result = new Array(n).fill(0);
	return result;
}

visualize();
function visualize() {
  delay.delayTime.value = visualizerSettings.compensateDelay ? map(visualizerSettings.type === 'cqt' ? visualizerSettings.timeAlignment : ((visualizerSettings.type === 'bpcqt' || visualizerSettings.type === 'filterbank') && visualizerSettings.useComplex) ? 0 : -1, -1, 1, visualizerSettings.fftSize/audioCtx.sampleRate, 0) : 0;
  if (!visualizerSettings.freeze) {
    analyser.getFloatTimeDomainData(dataArray);
  }
  const fftData = new Array(visualizerSettings.fftSize),
        windowingData = new Array(visualizerSettings.fftSize),
        isNumerical = visualizerSettings.freqDist === 'avee',
        hzLinearFactor = visualizerSettings.hzLinearFactor/100,
        bandwidth = visualizerSettings.type === 'cqt' || visualizerSettings.type === 'bpcqt' || visualizerSettings.type === 'filterbank' ? visualizerSettings.bandwidth : 0.5;
  let norm = 0;
  for (let i = 0; i < visualizerSettings.fftSize; i++) {
    const magnitude = dataArray[i+analyser.fftSize-visualizerSettings.fftSize],
          w = visualizerSettings.type === 'cqt' ? 2 : applyWindow(map(i, 0, visualizerSettings.fftSize-1, -1, 1), visualizerSettings.windowFunction, visualizerSettings.windowParameter, true, visualizerSettings.windowSkew);
    fftData[i] = magnitude * w;
    windowingData[i] = w;
    norm += w;
  }
  let freqBands = [];
  switch (visualizerSettings.freqDist) {
    case 'octaves':
      freqBands = generateOctaveBands(visualizerSettings.octaves, visualizerSettings.minNote, visualizerSettings.maxNote, visualizerSettings.detune, visualizerSettings.noteTuning, bandwidth);
      break;
    case 'avee':
      freqBands = generateAveePlayerFreqs(visualizerSettings.numBands, visualizerSettings.minFreq, visualizerSettings.maxFreq, hzLinearFactor, bandwidth);
      break;
    default:
    freqBands = generateFreqBands(visualizerSettings.numBands, visualizerSettings.minFreq, visualizerSettings.maxFreq, visualizerSettings.fscale, hzLinearFactor, bandwidth);
  }
  let spectrum;
  if (visualizerSettings.type === 'cqt')
    spectrum = cqt(fftData, freqBands, audioCtx.sampleRate, visualizerSettings.bandwidthOffset, visualizerSettings.timeAlignment, (x) => applyWindow(x, visualizerSettings.windowFunction, visualizerSettings.windowParameter, true, visualizerSettings.windowSkew), visualizerSettings.downsample/100, visualizerSettings.granularDownsample, visualizerSettings.averageSamplesInstead, visualizerSettings.granularBW);
  else {
    const complexSpectrum = calcComplexFFT(fftData.map(x => x*fftData.length/norm/Math.SQRT2)),
          fullSpectrum = complexSpectrum.map(x => x.magnitude),
          useComplex = visualizerSettings.useComplex;
    if (visualizerSettings.type === 'filterbank')
      spectrum = calcFilterBankEnergies(freqBands, useComplex ? complexSpectrum : fullSpectrum, useComplex, fftData.length, audioCtx.sampleRate);
    else if (visualizerSettings.type === 'bpcqt')
      spectrum = bpCQT(useComplex ? complexSpectrum : fullSpectrum, freqBands, useComplex, fftData.length, audioCtx.sampleRate, visualizerSettings.bandwidthOffset, visualizerSettings.bpCap/100, visualizerSettings.bpBandwidth, (x) => applyWindow(x, visualizerSettings.bpKernel, visualizerSettings.bpKernelParameter, true, visualizerSettings.bpAsymmetry), visualizerSettings.granularBW);
    else if (visualizerSettings.type === 'rough integral')
      spectrum = calcRoughSpectrum(useComplex ? complexSpectrum : fullSpectrum, freqBands, useComplex, fftData.length, audioCtx.sampleRate);
    else
      spectrum = calcSpectrum(useComplex ? complexSpectrum : fullSpectrum, freqBands, visualizerSettings.interpSize, visualizerSettings.summationMode, useComplex, visualizerSettings.smoothInterp, visualizerSettings.smoothSlope, fftData.length, audioCtx.sampleRate);
    
  }
  const bgGrad = ctx.createLinearGradient(0, visualizerSettings.color === 'esa2' ? canvas.height : 0, 0, visualizerSettings.color === 'esa2' ? 0 : canvas.height);
  bgGrad.addColorStop(0, visualizerSettings.darkMode ? '#000' : '#fff');
  bgGrad.addColorStop(1, visualizerSettings.darkMode ? '#404040' : '#c0c0c0');
  const minLabelRange = Math.min(...freqBands.map(x => x.ctr)),
        maxLabelRange = Math.max(...freqBands.map(x => x.ctr)),
        bgColor = visualizerSettings.color === 'esa' || visualizerSettings.color === 'esa2' ? bgGrad : visualizerSettings.darkMode ? (visualizerSettings.color === 'fb2k' ? '#202020' : '#000') : '#fff',
        fgColor = visualizerSettings.darkMode ? (visualizerSettings.color === 'fb2k' || visualizerSettings.color === 'esa' || visualizerSettings.color === 'esa2' ? '#c0c0c0' : '#fff') : '#000',
        nLEDs = Math.round(Math.min(visualizerSettings.ledStrips, canvas.height / (visualizerSettings.spaceV))),
        ledStripHeight = Math.min(canvas.height / nLEDs, visualizerSettings.peakHeight),
        isAestheticDecay = visualizerSettings.smoothingMode === 'aesthetic peak' || visualizerSettings.smoothingMode === 'exponential aesthetic' || visualizerSettings.smoothingMode === 'aesthetic average' || visualizerSettings.smoothingMode === 'aesthetic exponential peak',
        isAnalytic = visualizerSettings.peakMode === 'analysis';
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = bgColor;
  ctx.strokeStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let grad,
      peakColor = fgColor;
  switch (visualizerSettings.color) {
    default:
      if (visualizerSettings.color === 'wmp') {
        grad = '#a7ed03';
        peakColor = '#e7f0ef';
      }
      else if (visualizerSettings.color === 'ocean') {
        grad = '#00f';
        peakColor = '#fff';
      }
      else if (visualizerSettings.color === 'firestorm') {
        grad = '#fea500';
        peakColor = '#f00';
      }
      else if (visualizerSettings.color === 'scrappy') {
        grad = visualizerSettings.darkMode ? 'rgb(82, 126, 54)' : 'rgb(173, 129, 201)';
        peakColor = visualizerSettings.darkMode ? 'rgb(6, 145, 111)' : 'rgb(249, 110, 144)';
      }
      ctx.fillStyle = fgColor;
  }
  ctx.strokeStyle = fgColor;
  const weightedSpectrum = spectrum.map((x, y) => x * weightSpectrumAtFreq(freqBands[y].ctr + visualizerSettings.slopeFunctionsOffset * audioCtx.sampleRate / fftData.length)),
        clampedSpectrum = weightedSpectrum.map(x => visualizerSettings.clampMain ? clamp(ascale(x), 0, 1) : ascale(x));
  currentSpectrum.length = spectrum.length;
  /*peaks.length = currentSpectrum.length;
  peakHolds.length = peaks.length;
  peakAccels.length = peaks.length;*/
  switch(visualizerSettings.smoothingMode) {
    case 'aesthetic average':
    case 'avg':
      calcSmoothingTimeConstant(currentSpectrum, isAestheticDecay ? clampedSpectrum : weightedSpectrum, visualizerSettings.smoothingTimeConstant/100);
      break;
    case 'rms':
      calcExponentialRMS(currentSpectrum, weightedSpectrum, visualizerSettings.smoothingTimeConstant/100);
      break;
    case 'exponential aesthetic':
    case 'peak':
      calcPeakDecay(currentSpectrum, isAestheticDecay ? clampedSpectrum : weightedSpectrum, visualizerSettings.smoothingTimeConstant/100);
      break;
    case 'aesthetic peak':
      calcLinearDecay(currentSpectrum, clampedSpectrum, visualizerSettings.smoothingTimeConstant/100)
      break;
    case 'exponential peak':
    case 'aesthetic exponential peak':
      calcSmoothedPeakDecay(currentSpectrum, isAestheticDecay ? clampedSpectrum : weightedSpectrum, visualizerSettings.smoothingTimeConstant/100)
      break;
    default:
      calcSmoothingTimeConstant(currentSpectrum, weightedSpectrum, 0);
  }
  calcDecay(visualizerSettings.useActualPeak ?
            weightedSpectrum.map(x => isAnalytic ? x : ascale(x)) : currentSpectrum.map(x => isAnalytic ?
  isAestheticDecay ? invAscale(x) : x : 
  isAestheticDecay ? x : ascale(x)), peaks, peakHolds, peakAccels)
  let trackingPeakPos = visualizerSettings.labelTuning,
      trackingPeakValue = 0;
  const isTrackingRainbow = visualizerSettings.color === 'tracking rainbow' || visualizerSettings.color === 'tracking intensity rainbow',
        isIntensityRainbow = visualizerSettings.color === 'intensity rainbow' || visualizerSettings.color === 'tracking intensity rainbow';
  if (isTrackingRainbow) {
    for (let i = 0; i < currentSpectrum.length; i++) {
      if (currentSpectrum[i] > trackingPeakValue) {
        trackingPeakValue = currentSpectrum[i];
        trackingPeakPos = freqBands[i].ctr;
      }
    }
  }
  const scaledSpectrum = currentSpectrum.map(x => isAestheticDecay ? x : ascale(x));
  scaledSpectrum.map((x, i, arr) => {
    const frequencyInNotes = Math.log2(freqBands[i].ctr/trackingPeakPos),
          peak = isAnalytic ? ascale(peaks[i]) : peaks[i];
    let gradient,
        currentColor;
    switch(visualizerSettings.color) {
      case 'mdn':
        currentColor = `rgb(${isNaN(x) ? 0 : map(Math.max(Math.min(x, 1), 0), 0, 1, 0, 255)}, 50, 50)`;
        break;
      case 'tracking rainbow':
      case 'intensity rainbow':
      case 'tracking intensity rainbow':
      case 'rainbow':
        const color = `hsl(${isFinite(frequencyInNotes) ? ((frequencyInNotes) * 360 + visualizerSettings.rainbowColorOffset) * (1 - visualizerSettings.reverseRainbow * 2) : 0}, ${isFinite(frequencyInNotes) ? (isFinite(x) && isIntensityRainbow ? x*120 : 100) : 0}%, ${isIntensityRainbow && isFinite(x) ? x*34+16 * (isFinite(frequencyInNotes) ? 1 : 2) : isFinite(frequencyInNotes) ? 50 : (visualizerSettings.darkMode * 100)}%)`;
        currentColor = color;
        break;
      case 'shade':
      case 'shade 2':
        const shadeMode = visualizerSettings.color === 'shade 2',
              startStop = canvas.height-x*canvas.height,
              endStop = shadeMode ? canvas.height*2-x*canvas.height : canvas.height;
        gradient = ctx.createLinearGradient(0, isFinite(startStop) ? startStop : 0, 0, isFinite(endStop) ? endStop : 0);
        gradient.addColorStop(0, visualizerSettings.darkMode ? '#fff' : '#000');
        gradient.addColorStop(1, visualizerSettings.darkMode ? '#222' : '#ddd');
        currentColor = gradient;
    }
    /*
    if (ascale(x) >= peaks[i] || isNaN(peaks[i]) || peaks[i] <= 0) {
      peaks[i] = ascale(x);
      peakHolds[i] = visualizerSettings.holdTime;
      peakAccels[i] = 0;
    }
    else if (peakHolds[i] > 0)
      peakHolds[i] -= 1;
    else {
      peakAccels[i] += visualizerSettings.fallRate / 256;
      peaks[i] -= peakAccels[i];
    }*/
    const pos = Math[visualizerSettings.spacingMode === 'smooth' ? 'max' : 'trunc'](i * canvas.width / arr.length) + Math.min(visualizerSettings.barSpacing, canvas.width / arr.length)/2 * visualizerSettings.centerBars,
          width = Math.max(1, (visualizerSettings.spacingMode === 'pixel perfect' ? Math.trunc((i+1) * canvas.width / arr.length)-Math.trunc(i * canvas.width / arr.length) : Math[visualizerSettings.spacingMode === 'smooth' ? 'max' : 'trunc'](canvas.width / arr.length))-visualizerSettings.barSpacing);
    ctx.fillStyle = peakColor;
    if (visualizerSettings.showPeaks && visualizerSettings.solidPeaks) {
      if (visualizerSettings.useLED)
        ctx.fillRect(pos, canvas.height, width, map(Math.round(Math.max(peak, 0)*nLEDs), 0, nLEDs, 0, -canvas.height));
      else
        ctx.fillRect(pos, canvas.height, width, map(Math.max(peak, 0), 0, 1, 0, -canvas.height));
    }
    ctx.fillStyle = grad !== undefined ? grad : currentColor !== undefined ? currentColor : fgColor;
    if (visualizerSettings.useLED)
      ctx.fillRect(pos, canvas.height, width, map(Math.round(Math.max(x, 0)*nLEDs), 0, nLEDs, 0, -canvas.height));
    else
      ctx.fillRect(pos, canvas.height, width, map(Math.max(x, 0), 0, 1, 0, -canvas.height));
    ctx.fillStyle = peakColor;
    if (visualizerSettings.showPeaks && !visualizerSettings.solidPeaks) {
      if (visualizerSettings.useLED)
        ctx.fillRect(pos, Math.round(map(peak, 0, 1, nLEDs, 0))*canvas.height/nLEDs, width, canvas.height/nLEDs);
      else
        ctx.fillRect(pos, map(peak, 0, 1, canvas.height, 0), width, visualizerSettings.peakHeight);
    }
  });
  ctx.fillStyle = bgColor;
  if (visualizerSettings.useLED) {
    for (let i = 0; i < nLEDs; i++) {
      const size = canvas.height / nLEDs;
      ctx.fillRect(0, i * size, canvas.width, ledStripHeight);
    }
  }
  ctx.globalCompositeOperation = visualizerSettings.diffLabels ? 'difference' : 'source-over';
  ctx.fillStyle = visualizerSettings.diffLabels ? '#fff' : fgColor;
  ctx.strokeStyle = visualizerSettings.diffLabels ? '#fff' : fgColor;
  // label part
  ctx.font = `${Math.trunc(10*devicePixelRatio)}px sans-serif`;
  ctx.textAlign = visualizerSettings.labelTextAlign //'start';
  // Frequency label part
  if (visualizerSettings.showLabels || visualizerSettings.showDC || visualizerSettings.showNyquist) {
    const labelScale = visualizerSettings.freqDist === 'octaves' ? 'log' : visualizerSettings.fscale;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([]);
    
    const freqLabels = [],
          isNote = visualizerSettings.labelMode === 'note',
          notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    let freqsTable;
    switch(visualizerSettings.labelMode) {
      case 'decade':
        freqsTable = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 20000];
        break;
      case 'decade 2':
        freqsTable = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
        break;
      case 'decade 3':
        freqsTable = [10, 100, 1000, 10000];
        break;
      case 'octave':
        freqsTable = [31, 63.5, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        break;
      case 'powers of two':
        freqsTable = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384];
        break;
      case 'note':
        freqsTable = generateOctaveBands(12, 0, 132, 0, visualizerSettings.labelTuning).map(x => x.ctr);
        break;
      case 'bark':
        freqsTable = [50, 150, 250, 350, 450, 570, 700, 840, 1000, 1170, 1370, 1600, 1850, 2150, 2500, 2900, 3400, 4000, 4800, 5800, 7000, 8500, 10500, 13500];
        break;
      case 'linear':
        freqsTable = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000, 11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000];
        break;
      default:
        freqsTable = freqBands.map(x => x.ctr);
    }
    if (visualizerSettings.showLabels)
      freqLabels.push(...freqsTable);
    if (visualizerSettings.showDC)
      freqLabels.push(0);
    if (visualizerSettings.showNyquist)
      freqLabels.push(audioCtx.sampleRate/2);
    
    freqLabels.map(x => {
      const note = isFinite(Math.log2(x)) ? notes[idxWrapOver(Math.round(Math.log2(x)*12), notes.length)] : 'DC',
      isSharp = note.includes('#'),
      isC = note === 'C';
      
      ctx.globalAlpha = isNote ? (isSharp ? 0.2 : isC ? 0.8 : 0.5) : 0.5;
      const label = x === audioCtx.sampleRate/2 && visualizerSettings.showNyquist ? 'Nyquist' : isNote || x === 0 ? `${note}${isC ? Math.trunc(Math.log2(x)-4) : ''}` : (x >= 1000) ? `${x / 1000}kHz` : `${x}Hz`,
            posX = isNumerical ? getLabelPosFromFreqBands(freqBands, x)*canvas.width/freqBands.length : map(fscale(x, labelScale, visualizerSettings.hzLinearFactor/100), fscale(minLabelRange, labelScale, visualizerSettings.hzLinearFactor/100), fscale(maxLabelRange, labelScale, visualizerSettings.hzLinearFactor/100), canvas.width/spectrum.length/2, canvas.width - canvas.width/spectrum.length/2);
      ctx.beginPath();
      ctx.lineTo(posX, canvas.height);
      ctx.lineTo(posX, 0);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillText(label, posX, canvas.height);
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
  }
  // Amplitude/decibel label part
  if (visualizerSettings.showLabelsY) {
    const dBLabelData = [-Infinity],
          mindB = Math.min(visualizerSettings.minDecibels, visualizerSettings.maxDecibels),
          maxdB = Math.max(visualizerSettings.minDecibels, visualizerSettings.maxDecibels),
          minLabelIdx = Math.round(mindB/visualizerSettings.amplitudeLabelInterval),
          maxLabelIdx = Math.round(maxdB/visualizerSettings.amplitudeLabelInterval);
    
    if (isFinite(minLabelIdx) && isFinite(maxLabelIdx)) {
      for (let i = maxLabelIdx; i >= minLabelIdx; i--) {
        dBLabelData.push(i*visualizerSettings.amplitudeLabelInterval);
      }
    }
    
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([]);
    ctx.textBaseline = visualizerSettings.labelTextBaseline;
    dBLabelData.map(x => {
      ctx.globalAlpha = 0.5;
      const label = `${x}dB`,
            posY = map(ascale(10 ** (x/20)), 0, 1, canvas.height, 0);
      ctx.beginPath();
      ctx.lineTo(0, posY);
      ctx.lineTo(canvas.width, posY);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.textAlign = visualizerSettings.mirrorLabels ? 'end' : 'start'
      ctx.fillText(label, canvas.width * visualizerSettings.mirrorLabels, posY);
    });
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'start';
    ctx.textBaseline = 'alphabetic';
  }
  // for debugging purposes per https://github.com/stuerp/foo_vis_spectrum_analyzer/issues/5
  if (visualizerSettings.debugFFTData) {
    if (visualizerSettings.noOverlayOnDebug) {
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = fgColor;
    ctx.strokeStyle = ctx.fillStyle;
    ctx.beginPath();
    for (let i = 0; i < fftData.length; i++) {
      ctx.lineTo(map(i, 0, fftData.length-1, 0.5, canvas.width-0.5), map(fftData[i], -1, 1, canvas.height, 0));
    }
    ctx.stroke();
    if (visualizerSettings.displayWindowFunction) {
      ctx.beginPath();
      for (let i = 0; i < windowingData.length; i++) {
        ctx.lineTo(map(i, 0, windowingData.length-1, 0.5, canvas.width-0.5), map(windowingData[i], -1, 1, canvas.height, 0));
      }
      ctx.stroke();
    }
  }
  requestAnimationFrame(visualize);
}

function applyWindow(posX, windowType = 'Hann', windowParameter = 1, truncate = true, windowSkew = 0) {
  let x = windowSkew > 0 ? ((posX/2-0.5)/(1-(posX/2-0.5)*10*(windowSkew ** 2)))/(1/(1+10*(windowSkew ** 2)))*2+1 :
                           ((posX/2+0.5)/(1+(posX/2+0.5)*10*(windowSkew ** 2)))/(1/(1+10*(windowSkew ** 2)))*2-1;
  
  if (truncate && Math.abs(x) > 1)
    return 0;
  
  switch (windowType.toLowerCase()) {
    default:
      return 1;
    case 'hanning':
    case 'cosine squared':
    case 'hann':
      return Math.cos(x*Math.PI/2) ** 2;
    case 'raised cosine':
    case 'hamming':
      return 0.54 + 0.46 * Math.cos(x*Math.PI);
    case 'power of sine':
      return Math.cos(x*Math.PI/2) ** windowParameter;
    case 'circle':
    case 'power of circle':
      return Math.sqrt(1 - (x ** 2)) ** windowParameter;
    case 'tapered cosine':
    case 'tukey':
      return Math.abs(x) <= 1-windowParameter ? 1 : 
      (x > 0 ? 
       (-Math.sin((x-1)*Math.PI/windowParameter/2)) ** 2 :
       Math.sin((x+1)*Math.PI/windowParameter/2) ** 2);
    case 'blackman':
      return 0.42 + 0.5 * Math.cos(x*Math.PI) + 0.08 * Math.cos(x*Math.PI*2);
    case 'nuttall':
      return 0.355768 + 0.487396 * Math.cos(x*Math.PI) + 0.144232 * Math.cos(2*x*Math.PI) + 0.012604 * Math.cos(3*x*Math.PI);
    case 'flat top':
    case 'flattop':
      return 0.21557895 + 0.41663158 * Math.cos(x*Math.PI) + 0.277263158 * Math.cos(2*x*Math.PI) + 0.083578947 * Math.cos(3*x*Math.PI) + 0.006947368 * Math.cos(4*x*Math.PI);
    case 'kaiser':
      return Math.cosh(Math.sqrt(1-(x ** 2))*(windowParameter ** 2))/Math.cosh(windowParameter ** 2);
    case 'gauss':
    case 'gaussian':
      return Math.exp(-(windowParameter ** 2)*(x ** 2));
    case 'cosh':
    case 'hyperbolic cosine':
      return Math.E ** (-(windowParameter ** 2)*(Math.cosh(x)-1));
    case 'cosh 2':
    case 'hyperbolic cosine 2':
      return Math.E ** (-(Math.cosh(x*windowParameter)-1));
    case 'bartlett':
    case 'triangle':
    case 'triangular':
      return 1 - Math.abs(x);
    case 'poisson':
    case 'exponential':
      return Math.exp(-Math.abs(x * (windowParameter ** 2)));
    case 'hyperbolic secant':
    case 'sech':
      return 1/Math.cosh(x * (windowParameter ** 2));
    case 'quadratic spline':
      return Math.abs(x) <= 0.5 ? -((x*Math.sqrt(2)) ** 2)+1 : (Math.abs(x*Math.sqrt(2))-Math.sqrt(2)) ** 2;
    case 'parzen':
      return Math.abs(x) > 0.5 ? -2 * ((-1 + Math.abs(x)) ** 3) : 1 - 24 * (Math.abs(x/2) ** 2) + 48 * (Math.abs(x/2) ** 3);
    case 'welch':
      return (1 - (x ** 2)) ** windowParameter;
    case 'ogg':
    case 'vorbis':
      return Math.sin(Math.PI/2 * Math.cos(x*Math.PI/2) ** 2);
    case 'cascaded sine':
    case 'cascaded cosine':
    case 'cascaded sin':
    case 'cascaded cos':
      return 1 - Math.sin(Math.PI/2 * Math.sin(x*Math.PI/2) ** 2);
    case 'galss':
      return (((1-1/(x+2))*(1-1/(-x+2)))*4) ** 2 * -(Math.tanh(Math.SQRT2*(-x+1))*Math.tanh(Math.SQRT2*(-x-1)))/(Math.tanh(Math.SQRT2) ** 2);
    case 'glizzy':
    return (Math.cos(x*Math.PI/2) ** 2) * (
           0.5 +
           Math.cos(x*Math.PI) * 0.853553390593 +
           Math.cos(x*Math.PI*2) * 0.5 +
           Math.cos(x*Math.PI*3) * 0.146446609407
           ) / 2;
  }
}

function fscale(x, freqScale = 'logarithmic', freqSkew = 0.5) {
  switch(freqScale.toLowerCase()) {
    default:
      return x;
    case 'log':
    case 'logarithmic':
      return Math.log2(x);
    case 'mel':
      return Math.log2(1+x/700);
    case 'critical bands':
    case 'bark':
      return (26.81*x)/(1960+x)-0.53;
    case 'equivalent rectangular bandwidth':
    case 'erb':
      return Math.log2(1+0.00437*x);
    case 'cam':
    case 'cams':
      return Math.log2((x/1000+0.312)/(x/1000+14.675));
    case 'sinh':
    case 'arcsinh':
    case 'asinh':
      return Math.asinh(x/(10 ** (freqSkew*4)));
    case 'shifted log':
    case 'shifted logarithmic':
      return Math.log2((10 ** (freqSkew*4))+x);
    case 'nth root':
      return x ** (1/(11-freqSkew*10));
    case 'negative exponential':
      return -(2 ** (-x/(2 ** (7+freqSkew*8))));
    case 'adjustable bark':
      return (26.81 * x)/((10 ** (freqSkew*4)) + x);
    case 'period':
      return 1/x;
  }
}

function invFscale(x, freqScale = 'logarithmic', freqSkew = 0.5) {
  switch(freqScale.toLowerCase()) {
    default:
      return x;
    case 'log':
    case 'logarithmic':
      return 2 ** x;
    case 'mel':
      return 700 * ((2 ** x) - 1);
    case 'critical bands':
    case 'bark':
      return 1960 / (26.81/(x+0.53)-1);
    case 'equivalent rectangular bandwidth':
    case 'erb':
      return (1/0.00437) * ((2 ** x) - 1);
    case 'cam':
    case 'cams':
      return (14.675 * (2 ** x) - 0.312)/(1-(2 ** x)) * 1000;
    case 'sinh':
    case 'arcsinh':
    case 'asinh':
      return Math.sinh(x)*(10 ** (freqSkew*4));
    case 'shifted log':
    case 'shifted logarithmic':
      return (2 ** x) - (10 ** (freqSkew*4));
    case 'nth root':
      return x ** ((11-freqSkew*10));
    case 'negative exponential':
      return -Math.log2(-x)*(2 ** (7+freqSkew*8));
    case 'adjustable bark':
      return (10 ** (freqSkew*4)) / (26.81 / x - 1);
    case 'period':
      return 1/x;
  }
}
function ascale(x) {
  if (visualizerSettings.useDecibels)
    return map(20*Math.log10(x), visualizerSettings.minDecibels, visualizerSettings.maxDecibels, 0, 1);
  else
    return map(x ** (1/visualizerSettings.gamma), !visualizerSettings.useAbsolute * (10 ** (visualizerSettings.minDecibels/20)) ** (1/visualizerSettings.gamma), (10 ** (visualizerSettings.maxDecibels/20)) ** (1/visualizerSettings.gamma), 0, 1);
}

function invAscale(x) {
  if (visualizerSettings.useDecibels)
    return 10 ** (map(x, 0, 1, visualizerSettings.minDecibels, visualizerSettings.maxDecibels)/20);
  else
    return map(x, 0, 1, !visualizerSettings.useAbsolute ? (10 ** (visualizerSettings.minDecibels/2)) ** (1/visualizerSettings.gamma): 0, (10 ** (visualizerSettings.maxDecibels/2)) ** (1/visualizerSettings.gamma)) ** visualizerSettings.gamma;
}

/**
 * Constant-Q Transform (CQT) calculated using Goertzel algorithm
 *
 * This by itself doesn't need Web Audio API in order to work but it is necessary for real-time visualizations
 *
 * Real-time usage:
 * analyserNode.getFloatTimeDomainData(dataArray);
 * const spectrum = cqt(dataArray, freqBands, audioCtx.sampleRate, bandwidthOffset, windowFunction);
 *
 * Note: the implementation of this CQT is slow compared to FFT
 */

function cqt(waveform, hzArray = generateOctaveBands(), sampleRate = 44100, bandwidthOffset = 1, alignment = 1, windowFunction = applyWindow, downsample = 0, granularDownsample = false, averageSamplesInstead = false, granularBW = true) {
  return hzArray.map(x => {
    const bandwidth = Math.abs(x.hi - x.lo) + (sampleRate/waveform.length) * bandwidthOffset,
          tlen = Math.min(1/bandwidth, waveform.length/sampleRate),
          granularDownsampleAmount = Math.max(1, Math.trunc((sampleRate*downsample) / (x.ctr + tlen))),
          downsampleAmount = granularDownsample ? granularDownsampleAmount : 2 ** Math.trunc(Math.log2(granularDownsampleAmount));
    const coeff = 2 * Math.cos(2*Math.PI*x.ctr/sampleRate*downsampleAmount);
    let f1 = 0,
        f2 = 0,
        sine,
        actualLength = granularBW ? (tlen*sampleRate) : Math.min(Math.trunc(2 ** Math.round(Math.log2(tlen*sampleRate))), waveform.length),
        offset = Math.trunc((waveform.length-actualLength)*(0.5+alignment/2)),
        lowerIdx = offset,
        higherIdx = Math.trunc(actualLength)+offset-1,
        norm = 0;
    for (let i = Math.trunc(lowerIdx/downsampleAmount); i <= Math.trunc(higherIdx/downsampleAmount); i++) {
      let data = 0;
      if (averageSamplesInstead && isFinite(downsampleAmount)) {
        for (let j = 0; j < downsampleAmount; j++) {
          data += (i*downsampleAmount+j) < waveform.length ? waveform[i*downsampleAmount+j] : 0;
        }
        data /= downsampleAmount;
      }
      else {
        data = waveform[i*downsampleAmount];
      }
      let posX = (i*downsampleAmount - lowerIdx) / (higherIdx - lowerIdx) * 2 - 1;
      let w = windowFunction(posX);
      norm += w;
      
      // Goertzel transform
      sine = data*w + coeff * f1 - f2;
      f2 = f1;
      f1 = sine;
    }
    return Math.sqrt(f1 ** 2 + f2 ** 2 - coeff * f1 * f2) / norm;
  });
}

function generateFreqBands(N = 128, low = 20, high = 20000, freqScale, freqSkew, bandwidth = 0.5) {
  let freqArray = [];
  for (let i = 0; i < N; i++) {
    freqArray.push({
      lo: invFscale( map(i-bandwidth, 0, N-1, fscale(low, freqScale, freqSkew), fscale(high, freqScale, freqSkew)), freqScale, freqSkew),
      ctr: invFscale( map(i, 0, N-1, fscale(low, freqScale, freqSkew), fscale(high, freqScale, freqSkew)), freqScale, freqSkew),
      hi: invFscale( map(i+bandwidth, 0, N-1, fscale(low, freqScale, freqSkew), fscale(high, freqScale, freqSkew)), freqScale, freqSkew)
    });
  }
  return freqArray;
}

function generateOctaveBands(bandsPerOctave = 12, lowerNote = 4, higherNote = 123, detune = 0, tuningFreq = 440, bandwidth = 0.5) {
  const tuningNote = isFinite(Math.log2(tuningFreq)) ? Math.round((Math.log2(tuningFreq)-4)*12)*2 : 0,
        root24 = 2 ** ( 1 / 24 ),
        c0 = tuningFreq * root24 ** -tuningNote, // ~16.35 Hz
        groupNotes = 24/bandsPerOctave;
  let bands = [];
  for (let i = Math.round(lowerNote*2/groupNotes); i <= Math.round(higherNote*2/groupNotes); i++) {
    bands.push({
      lo: c0 * root24 ** ((i-bandwidth)*groupNotes+detune),
      ctr: c0 * root24 ** (i*groupNotes+detune),
      hi: c0 * root24 ** ((i+bandwidth)*groupNotes+detune)
    });
  }
  return bands;
}

// Calculate band frequencies, method derived from Avee Player
function generateAveePlayerFreqs(N, minFreq = 20, maxFreq = 20000, hzLinearFactor = 0, bandwidth = 0.5) {
  const freqBands = [];
  for (let i = 0; i < N; i++) {
    freqBands[i] = {
      lo: logSpace(minFreq, maxFreq, i-bandwidth, N-1, hzLinearFactor),
      ctr: logSpace(minFreq, maxFreq, i, N-1, hzLinearFactor),
      hi: logSpace(minFreq, maxFreq, i+bandwidth, N-1, hzLinearFactor),
      lowerBound: logSpace(minFreq, maxFreq, i-0.5, N-1, hzLinearFactor),
      higherBound: logSpace(minFreq, maxFreq, i+0.5, N-1, hzLinearFactor)
    };
  }
  return freqBands;
}

function logSpace(x, y, z, w, l) {
  const centerFreq = x * ((y/x) ** (z/w));
  return centerFreq * (1-l) + (x + ((y - x) * z * (1/w))) * l;
}

// needed for positioning Hz labels and ticks correctly where frequency band values are derived numerically rather than from closed-form frequency scale equations
function getLabelPosFromFreqBands(freqBands, x) {
  let idx = 0;
  if (x <= freqBands[0].lowerBound || x >= freqBands[freqBands.length-1].higherBound) {
    idx = (freqBands.length-1) * (x >= freqBands[freqBands.length-1].higherBound);
  }
  else {
    for (let i = 0; i < freqBands.length; i++) {
      if ((x >= freqBands[i].lowerBound && x <= freqBands[i].higherBound)) {
        idx = i;
        break;
      }
    }
  }
  return map(x, freqBands[idx].lowerBound, freqBands[idx].higherBound, idx, idx+1);
}

// Calculates bandpower from FFT (foobar2000 flavored, can be enhanced by using complex FFT coefficients instead of magnitude-only FFT data)
function calcSpectrum(fftCoeffs, freqBands, interpSize = 4, summationMode = 'max', useComplex = false, smoothInterp = true, smoothGainTransition = true, bufferSize = 4410, sampleRate = 44100) {
  return freqBands.map(x => {
    const minIdx = hertzToFFTBin(Math.min(x.hi, x.lo), 'ceil', bufferSize, sampleRate),
          maxIdx = hertzToFFTBin(Math.max(x.hi, x.lo), 'floor', bufferSize, sampleRate),
          minIdx2 = smoothInterp ? hertzToFFTBin(Math.min(x.hi, x.lo), 'round', bufferSize, sampleRate) + 1 : minIdx,
          maxIdx2 = smoothInterp ? hertzToFFTBin(Math.max(x.hi, x.lo), 'round', bufferSize, sampleRate) - 1 : maxIdx,
          minIdx3 = hertzToFFTBin(Math.min(x.hi, x.lo), 'round', bufferSize, sampleRate),
          maxIdx3 = hertzToFFTBin(Math.max(x.hi, x.lo), 'round', bufferSize, sampleRate),
          bandGain = smoothGainTransition && (summationMode === 'sum' || summationMode === 'rms sum') ? Math.hypot(1, ((x.hi - x.lo) * bufferSize / sampleRate) ** (1-(summationMode === 'rms' || summationMode === 'rms sum')/2)) : 1;
    
    if (minIdx2 > maxIdx2)
      return Math.abs(lanzcos(fftCoeffs, x.ctr * bufferSize / sampleRate, interpSize, useComplex)) * bandGain;
    else {
      let sum = summationMode === 'min' ? Infinity : summationMode === 'fb2k' ? (lanzcos(fftCoeffs, x.ctr * bufferSize / sampleRate, interpSize, useComplex)) ** 2 : 0,
          diff = 0;
      const overflowCompensation = Math.max(maxIdx - minIdx - bufferSize, 0),
            isAverage = (summationMode === 'avg' || summationMode === 'rms') || ((summationMode === 'sum' || summationMode === 'rms sum') && smoothGainTransition),
            isRMS = summationMode === 'rms' || summationMode === 'rms sum',
            isMedian = summationMode === 'median',
            medianData = [];
      if (summationMode === 'fb2k') {
        // inexact/crude approximation of what foobar2000's built-in Spectrum visualization aggregate FFT bins into frequency buckets defined by frequency bands data
        const overflowCompensation2 = Math.max(maxIdx3 - minIdx3 - bufferSize, 0);
        let gr = 0,
            preSum = 0;
        for (let i = minIdx3; i <= maxIdx3 - overflowCompensation; i++) {
          const binIdx = (i % fftCoeffs.length + fftCoeffs.length) % fftCoeffs.length;
          preSum += (useComplex ? fftCoeffs[binIdx].magnitude : fftCoeffs[binIdx]) ** 2;
          gr++;
        }
        sum = Math.sqrt(preSum+sum) / gr;
      }
      for (let i = minIdx; i <= maxIdx - overflowCompensation; i++) {
        const binIdx = (i % fftCoeffs.length + fftCoeffs.length) % fftCoeffs.length,
              data = useComplex ? fftCoeffs[binIdx].magnitude : fftCoeffs[binIdx];
        switch(summationMode) {
          case 'max':
          case 'fb2k':
            sum = Math.max(data, sum)
            break;
          case 'min':
            sum = Math.min(data, sum);
            break;
          case 'avg':
          case 'rms':
          case 'sum':
          case 'rms sum':
            sum += data ** (1 + isRMS);
            break;
          case 'median':
            medianData.push(data);
            break;
          default:
            sum = data;
        }
        diff++;
      }
      if (isMedian)
        sum = median(medianData);
      else
        sum /= isAverage ? diff : 1;
      return (isRMS ? Math.sqrt(sum) : sum) * bandGain;
    }
  });
}

// Generate a spectrum visualization similar to Bars and Waves visualization from Windows Media Player
function calcRoughSpectrum(fftData, freqBands, useComplex = false, bufferSize = 4410, sampleRate = 44100) {
  if (freqBands.length <= 0)
    return;
  const magnitudeBands = new Array(freqBands.length).fill(0),
        realBands = Array.from(magnitudeBands),
        imagBands = Array.from(magnitudeBands);
  let iBin = hertzToFFTBin(freqBands[0].ctr, 'floor', bufferSize, sampleRate),
      iBand = 0,
      f0 = freqBands.length > 1 ? freqBands[0].ctr * 2 - freqBands[1].ctr : freqBands[0].ctr,
      overflowCompensationCount = 0;
  while (iBand < freqBands.length) {
    const fLin = fftBinToHertz(iBin+0.5, bufferSize, sampleRate),
          fScaled = freqBands[iBand].ctr,
          magnitudeData = !useComplex ? fftData[idxWrapOver(iBin, fftData.length)] ** 2 : 0,
          realData = useComplex ? fftData[idxWrapOver(iBin, fftData.length)].re : 0,
          imagData = useComplex ? fftData[idxWrapOver(iBin, fftData.length)].im : 0;
    if (fLin <= fScaled && overflowCompensationCount < fftData.length) {
      magnitudeBands[iBand] += magnitudeData * (fLin-f0);
      realBands[iBand] += realData * Math.sqrt(fLin-f0);
      imagBands[iBand] += imagData * Math.sqrt(fLin-f0);
      f0 = fLin;
      iBin++;
      overflowCompensationCount++; // expect incorrect center frequency band when it reaches the threshold in which full FFT data index wraps around
    }
    else {
      magnitudeBands[iBand] += magnitudeData * (fScaled-f0);
      realBands[iBand] += realData * Math.sqrt(fScaled-f0);
      imagBands[iBand] += imagData * Math.sqrt(fScaled-f0);
      f0 = fScaled;
      iBand++;
      overflowCompensationCount = 0;
    }
  }
  return magnitudeBands.map((x, i) => useComplex ? Math.hypot(realBands[i], imagBands[i]) : Math.sqrt(x));
}

// Calculates spectrum based on Mel (or actually arbitrary frequency) filter bank energies
function calcFilterBankEnergies(freqBands, fftData, useComplex = false, bufferSize = 4096, sampleRate = 44100) {
  return freqBands.map(x => {
    let sum = 0,
        re = 0,
        im = 0;
    const minBin = Math.min(x.lo, x.hi) * bufferSize / sampleRate,
          midBin = x.ctr * bufferSize / sampleRate,
          maxBin = Math.max(x.lo, x.hi) * bufferSize / sampleRate,
          overflowCompensation = Math.max(0, maxBin-minBin-bufferSize);
    for (let i = Math.floor(midBin); i >= Math.floor(minBin+overflowCompensation); i--) {
      if (useComplex) {
        const sign = idxWrapOver(i, 2) * 2 - 1,
              amplitude = Math.max(map(i, minBin, midBin, 0, 1), 0);
        re += fftData[idxWrapOver(i, fftData.length)].re * amplitude * sign;
        im += fftData[idxWrapOver(i, fftData.length)].im * amplitude * sign;
      }
      else
        sum += (fftData[idxWrapOver(i, fftData.length)] * Math.max(map(i, minBin, midBin, 0, 1), 0)) ** 2;
    }
    for (let i = Math.ceil(midBin); i <= Math.ceil(maxBin-overflowCompensation); i++) {
      if (useComplex) {
        const sign = idxWrapOver(i, 2) * 2 - 1,
              amplitude = Math.max(map(i, maxBin, midBin, 0, 1), 0);
        re += fftData[idxWrapOver(i, fftData.length)].re * amplitude * sign;
        im += fftData[idxWrapOver(i, fftData.length)].im * amplitude * sign;
      }
      else
        sum += (fftData[idxWrapOver(i, fftData.length)] * Math.max(map(i, maxBin, midBin, 0, 1), 0)) ** 2;
    }
    return useComplex ? Math.hypot(re, im) : Math.sqrt(sum);
  });
}

function lanzcos(data, x, kernelSize = 4, inSpectrum = false) {
  let sum = 0,
      complexSum = {
        re: 0,
        im: 0
      };
  for (let i = -kernelSize + 1; i <= kernelSize; i++) {
    const pos = Math.floor(x)+i,//i+x,
          twiddle = x-pos,//-pos+Math.round(pos)+i,
          w = Math.abs(twiddle) <= 0 ? 1 : Math.sin(twiddle*Math.PI)/(twiddle*Math.PI) * Math.sin(Math.PI*twiddle/kernelSize)/(Math.PI*twiddle/kernelSize),
          idx = (pos % data.length + data.length) % data.length;
    if (inSpectrum) {
      complexSum.re += data[idx].re * w * (-1 + (i % 2 + 2) % 2 * 2);
      complexSum.im += data[idx].im * w * (-1 + (i % 2 + 2) % 2 * 2);
    }
    else
      sum += data[idx] * w;
  }
  if (inSpectrum)
    return Math.hypot(complexSum.re, complexSum.im);
  else
    return sum;
}

function bpCQT(fftData, hzArray, useComplex = true, bufferSize = 4096, sampleRate = 44100, bandwidthOffset = 1, bandwidthCap = 1, bandwidthAmount = 4, windowFunction = applyWindow, granularBW = true) {
  return hzArray.map(x => {
    let sum = 0,
        re = 0,
        im = 0;
    const centerBin = x.ctr * bufferSize / sampleRate,
          bandwidth = Math.abs(x.hi - x.lo) + (sampleRate/bufferSize) * bandwidthOffset,
          tlen = Math.min(1/bandwidth, bufferSize/sampleRate/bandwidthCap),
          actualLength = granularBW ? tlen * sampleRate : Math.min(Math.trunc(2 ** Math.round(Math.log2(tlen*sampleRate))), bufferSize/bandwidthCap),
          flen = Math.min(bandwidthAmount * bufferSize / actualLength, bufferSize),
          start = Math.ceil(centerBin - flen/2),
          end = Math.floor(centerBin + flen/2);
    if (isFinite(start) && isFinite(end)) {
      for (let i = start; i <= end; i++) {
        const sign = (i & 1) ? (-1) : (1),
              posX = 2 * (i - centerBin) / flen,
              w = windowFunction(posX),
              u = w*sign,
              idx = (i % fftData.length + fftData.length) % fftData.length;
        if (useComplex) {
          re += fftData[idx].re*u;
          im += fftData[idx].im*u;
        }
        else
          sum += (fftData[idx] * w) ** 2;
      }
    }
    return useComplex ? Math.hypot(re, im) : Math.sqrt(sum);
  });
}

function calcSmoothingTimeConstant(targetArr, sourceArr, factor = 0.5) {
  for (let i = 0; i < targetArr.length; i++) {
    targetArr[i] = (isFinite(targetArr[i]) ? targetArr[i] : 0)*(factor)+(isFinite(sourceArr[i]) ? sourceArr[i] : 0)*(1-factor);
  }
}

function calcExponentialRMS(x, y, amount = 0.8) {
  const factor1 = amount ** 2,
        factor2 = 1-factor1;
  for (let i = 0; i < x.length; i++) {
    x[i] = Math.hypot(
      (isFinite(x[i]) ? x[i]*Math.sqrt(factor1) : 0),
      (isFinite(y[i]) ? y[i]*Math.sqrt(factor2) : 0)
    );
  }
}

function calcSmoothedPeakDecay(targetArr, sourceArr, factor = 0.5) {
  for (let i = 0; i < targetArr.length; i++) {
    targetArr[i] = Math.max((isFinite(targetArr[i]) ? targetArr[i] : 0) * factor + (isFinite(sourceArr[i]) ? sourceArr[i] : 0) * (1-factor), isFinite(sourceArr[i]) ? sourceArr[i] : 0);
  }
}

function calcPeakDecay(targetArr, sourceArr, factor = 0.5) {
  for (let i = 0; i < targetArr.length; i++) {
    targetArr[i] = Math.max(isFinite(targetArr[i]) ? targetArr[i] * factor : 0, isFinite(sourceArr[i]) ? sourceArr[i] : 0);
  }
}

function calcLinearDecay(targetArr, sourceArr, factor = 0.5) {
  factor = (1/(-factor) + 1)/4;
  for (let i = 0; i < targetArr.length; i++) {
    targetArr[i] = Math.max(isFinite(targetArr[i]) ? targetArr[i]+factor : 0, isFinite(sourceArr[i]) ? sourceArr[i] : 0);
  }
}

function median(data) {
  if (!data.length)
    return NaN;
  else if (data.length <= 1)
    return data[0];
  
  const sortedData = data.slice().sort((x, y) => x-y),
        half = Math.trunc(data.length/2);
  
  if (data.length % 2)
    return sortedData[half];
  
  return (sortedData[half-1] + sortedData[half]) / 2;
}

// Peak decay calculation
function calcDecay(source, p, h, a) {
  const isAnalytic = visualizerSettings.peakMode === 'analysis';
  p.length = source.length;
  h.length = p.length;
  a.length = p.length;
  for (let i = 0; i < p.length; i++) {
    p[i] = isFinite(p[i]) ? p[i] : 0;
    if (source[i] >= p[i]) {
      h[i] = visualizerSettings.peakMode === 'aimp' ? (isFinite(h[i]) ? h[i] : 0) + ((visualizerSettings.clampPeaks ? Math.max(Math.min(source[i], 1), 0) : source[i]) - p[i]) * visualizerSettings.holdTime : visualizerSettings.holdTime;
      p[i] = source[i];
      a[i] = 0;
    }
    else if (h[i] >= 0) {
      if (visualizerSettings.peakMode === 'aimp')
        p[i] += (h[i] - Math.max(h[i]-1, 0))/visualizerSettings.holdTime;
      h[i] -= 1;
      h[i] = Math.min(h[i], visualizerSettings.holdTime/(visualizerSettings.peakMode !== 'aimp'));
    }
    else {
      switch (visualizerSettings.peakMode) {
        case 'gravity':
          a[i] += visualizerSettings.fallRate / 256;
          break;
        case 'aimp':
          a[i] = visualizerSettings.fallRate / 256 * ((p[i] < 0.5)+1);
          break;
        case 'analysis':
          a[i] = visualizerSettings.peakDecay / 100;
          break;
        default:
          a[i] = visualizerSettings.fallRate / 256
      }
      if (isAnalytic)
        p[i] *= a[i];
      else
        p[i] -= a[i];
    }
    p[i] = visualizerSettings.clampPeaks && !isAnalytic ? Math.max(Math.min(p[i], 1), 0) : Math.max(p[i], isAnalytic ? source[i] : -Infinity);
  }
}

// Weighting and frequency slope functions
function calcFreqTilt(x, amount = 3, offset = 1000) {
  return (x/offset) ** (amount/6);
}

function applyEqualize(x, amount = 6, depth = 1024, offset = 44100) {
  const pos = x * depth / offset,
        bias = 1.0025 ** (-pos) * 0.04;
  return (10 * Math.log10(1 + bias + (pos + 1) * (9 - bias)/depth)) ** (amount/6);
}

function applyWeight(x, weightAmount = 1, weightType = 'a') {
  const f2 = x ** 2;
  switch (weightType) {
    case 'a':
      return (1.2588966 * 148840000 * (f2 ** 2) /
      ((f2 + 424.36) * Math.sqrt((f2 + 11599.29) * (f2 + 544496.41)) * (f2 + 148840000))) ** weightAmount;
    case 'b':
      return (1.019764760044717 * 148840000 * (x ** 3) /
      ((f2 + 424.36) * Math.sqrt(f2 + 25122.25) * (f2 + 148840000))) ** weightAmount;
    case 'c':
      return (1.0069316688518042 * 148840000 * f2 /
      ((f2 + 424.36) * (f2 + 148840000))) ** weightAmount;
    case 'd':
      return ((x / 6.8966888496476e-5) * Math.sqrt(
               (
                 ((1037918.48 - f2)*(1037918.48 - f2) + 1080768.16*f2) /
                 ((9837328 - f2)*(9837328 - f2) + 11723776*f2)
               ) / ((f2 + 79919.29) * (f2 + 1345600))
             )) ** weightAmount;
    case 'm':
      const h1 = -4.737338981378384e-24*(f2 ** 3) + 2.043828333606125e-15*(f2 ** 2) - 1.363894795463638e-7*f2 + 1,
            h2 = 1.306612257412824e-19*(x ** 5) - 2.118150887518656e-11*(x ** 3) + 5.559488023498642e-4*x;

      return (8.128305161640991 * 1.246332637532143e-4 * x / Math.hypot(h1, h2)) ** weightAmount;
    case 'k':
      const c2 = 4284900, // from 2070
            z2 = 1690000, // from 1300
            f = 80,
            s = Math.sqrt((1 + (f2) / z2) / (1 + (f2) / c2)), // shelving part
            l = ((x/f) ** 2)/Math.sqrt(0.5*(1 - (x/f) ** 2) ** 2 + (x/f) ** 2) / Math.SQRT2; // lowpass part
      
      return (s*l) ** weightAmount;
    default:
      return 1;
  }
}

function weightSpectrumAtFreq(x) {
  return calcFreqTilt(x, visualizerSettings.slope, visualizerSettings.slopeOffset) * applyEqualize(x, visualizerSettings.equalizeAmount, visualizerSettings.equalizeDepth, visualizerSettings.equalizeOffset) * applyWeight(x, visualizerSettings.weightingAmount/100, visualizerSettings.weightingType)
}
