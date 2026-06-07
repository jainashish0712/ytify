// src/lib/modules/james-dsp-processor.ts

class JamesDSPProcessor extends AudioWorkletProcessor {
    private dsp: any;
    private inputPtr: number | null = null;
    private outputPtr: number | null = null;
    private inputBuffer: Float32Array | null = null;
    private outputBuffer: Float32Array | null = null;
    private blockSize: number;
    private enabled: boolean = false; // DSP is disabled by default

    constructor() {
        super();
        this.blockSize = 128; // The default block size for AudioWorklet
        this.dsp = null;

        // Handle messages from the main thread
        this.port.onmessage = (event) => {
            if (event.data.type === 'SET_ENABLED') {
                this.enabled = event.data.value;
                console.log(`[JamesDSPProcessor] DSP enabled state set to: ${this.enabled}`);
            } else if (event.data.type === 'SET_BASSBOOST_STRENGTH') {
                if (this.dsp) {
                    this.dsp._set_bass_boost_strength(event.data.value);
                }
            }
        };

        // Bypass Vite's import analysis by fetching and executing the script manually.
        fetch('/jamesdsp.js')
            .then(response => response.text())
            .then(scriptText => {
                // Execute the glue script in the worklet's global scope
                new Function(scriptText)();

                // The script attaches the module to the global 'self' object in the worklet
                const JamesDSPModule = (self as any).JamesDSPModule;

                if (!JamesDSPModule) {
                    console.error('[JamesDSPProcessor] Failed to load JamesDSPModule from glue script.');
                    return;
                }

                JamesDSPModule.default().then((module: any) => {
                    this.dsp = module;
                    // Initialize DSP
                    this.dsp._init_dsp(sampleRate, this.blockSize);

                    // Allocate memory for audio buffers inside the WASM module
                    const bufferSize = this.blockSize * 2 * 4; // 2 channels, 4 bytes per float
                    this.inputPtr = this.dsp._malloc(bufferSize);
                    this.outputPtr = this.dsp._malloc(bufferSize);

                    // Create views into the WASM memory
                    this.inputBuffer = new Float32Array(this.dsp.HEAPF32.buffer, this.inputPtr, this.blockSize * 2);
                    this.outputBuffer = new Float32Array(this.dsp.HEAPF32.buffer, this.outputPtr, this.blockSize * 2);

                    console.log('[JamesDSPProcessor] JamesDSP WASM module loaded and initialized.');
                });
            }).catch(error => {
                console.error('[JamesDSPProcessor] Error fetching or executing JamesDSP glue script:', error);
            });
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
        const input = inputs[0];
        const output = outputs[0];

        // Pass audio through if DSP is not ready or is disabled
        if (!this.enabled || !this.dsp || !this.inputBuffer || !this.outputBuffer || !this.inputPtr || !this.outputPtr) {
            if (input && output) {
                for (let channel = 0; channel < input.length; channel++) {
                    if (input[channel] && output[channel]) {
                        output[channel].set(input[channel]);
                    }
                }
            }
            return true;
        }

        // Assuming stereo input and output
        const inputLeft = input[0];
        const inputRight = input[1];
        const outputLeft = output[0];
        const outputRight = output[1];

        // Interleave the stereo input into the WASM input buffer
        for (let i = 0; i < this.blockSize; i++) {
            this.inputBuffer[i * 2] = inputLeft[i];
            this.inputBuffer[i * 2 + 1] = inputRight[i];
        }

        // Process the audio using the WASM function
        this.dsp._process_dsp(this.inputPtr, this.outputPtr, this.blockSize);

        // De-interleave the processed stereo output from the WASM output buffer
        for (let i = 0; i < this.blockSize; i++) {
            outputLeft[i] = this.outputBuffer[i * 2];
            outputRight[i] = this.outputBuffer[i * 2 + 1];
        }

        return true;
    }
}

registerProcessor('james-dsp-processor', JamesDSPProcessor);
