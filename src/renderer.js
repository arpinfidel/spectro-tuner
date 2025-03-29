import { make_loop } from './util'

// Set up canvas with proper dimensions and transfer to worker if supported
function setupCanvas(mainCanvas, bgCanvas, isFFTDetail=false) {
    if (!mainCanvas || !bgCanvas) {
        console.error('Canvas elements not found');
        return null;
    }
    
    mainCanvas.style.width = "100%";
    mainCanvas.style.height = "100%";
    mainCanvas.width = mainCanvas.offsetWidth;
    mainCanvas.height = mainCanvas.offsetHeight;
    bgCanvas.style.width = "100%";
    bgCanvas.style.height = "100%";
    bgCanvas.width = bgCanvas.offsetWidth;
    bgCanvas.height = bgCanvas.offsetHeight;
    
    // Check if OffscreenCanvas is supported for main canvas
    if (!('transferControlToOffscreen' in mainCanvas)) {
        throw new Error('OffscreenCanvas is not supported');
    }

    // Create a worker for rendering
    const worker = new Worker(new URL('./visualizer.worker.js', import.meta.url), { type: 'module' });
    
    // Transfer canvases to the worker
    const mainOffscreen = mainCanvas.transferControlToOffscreen();
    const bgOffscreen = bgCanvas.transferControlToOffscreen();
    
    worker.postMessage({
        type: 'init',
		data: {
			isFFTDetail: isFFTDetail,
			mainCanvas: mainOffscreen,
			bgCanvas: bgOffscreen,
		}
    }, [mainOffscreen, bgOffscreen]);
	
    return {
        canvas: mainCanvas,
        worker,
        isOffscreen: true
    };
}

export class Renderer {
	// const
	avgDurationWeight = 0.1;
	
	// deps
	pitchTracker

    // vars
    spectrumCanvasInfo
    fftDetailCanvasInfo
	avgDuration = 0;

    constructor(appState, { spectrumCanvas, spectrumCanvasBg, fftCanvas, fftCanvasBg }, { pitchTracker }) {
		this.appState = appState

        this.spectrumCanvasInfo = setupCanvas(spectrumCanvas, spectrumCanvasBg)
        this.fftDetailCanvasInfo = setupCanvas(fftCanvas, fftCanvasBg, true)
        
		this.pitchTracker = pitchTracker
    }

    // Draw visualization components - handles both OffscreenCanvas and regular canvas
    renderVisualization = function(state, isFFTDetail=false) {
        // Send state to worker for rendering
        (isFFTDetail ? this.fftDetailCanvasInfo : this.spectrumCanvasInfo).worker.postMessage({
            type: 'render',
            data: {
                isFFTDetail: isFFTDetail,
                state: state,
            }
        });
        state.fHistory = [];
    }

	
	loop = async function() {
		const self = this;
		make_loop(self.appState, self.appState.renderIntervalMs, async function() {
			const startTime = performance.now();
			self.renderVisualization(self.pitchTracker.state);
			self.renderVisualization(self.pitchTracker.state, true);
			const endTime = performance.now();
			const duration = endTime - startTime;
			self.avgDuration = (1 - self.avgDurationWeight) * self.avgDuration + self.avgDurationWeight * duration;
			
			if (duration > self.appState.renderIntervalMs) {
				console.warn('Visualization is taking longer than expected:', duration, 'ms');
			}
		})();
		
		const renderCounter = document.getElementById("render-counter");
		make_loop(self.appState, 1000, async function() {
			const rendersPerSecond = 1000 / self.avgDuration;
			const maxRendersPerSecond = 1000 / self.appState.renderIntervalMs;
			renderCounter.textContent = `render/s: ${Math.round(Math.min(maxRendersPerSecond, rendersPerSecond))} (avg: ${self.avgDuration.toFixed(1)}ms)`;
		})();
	};
}
