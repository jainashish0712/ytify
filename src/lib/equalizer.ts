export class Equalizer {
  private ctx: AudioContext;
  private sourceElement: HTMLAudioElement;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[];
  private convolver: ConvolverNode;
  private preamp: GainNode;
  private isConvolverEnabled: boolean = false;
  private irBuffer: AudioBuffer | null = null;

  // Pitch shifter
  private scriptNode: ScriptProcessorNode | null = null;
  private pitchRatio: number = 1.04; // +4%

  constructor(audio: HTMLAudioElement) {
    this.sourceElement = audio;

    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      sampleRate: 44100
    });

    // Create filters
    this.filters = [
      this.ctx.createBiquadFilter(),
      this.ctx.createBiquadFilter(),
      this.ctx.createBiquadFilter(),
    ];
    this.filters[0].type = 'lowshelf';
    this.filters[0].frequency.value = 55;
    this.filters[1].type = 'peaking';
    this.filters[1].frequency.value = 1000;
    this.filters[1].Q.value = 1;
    this.filters[2].type = 'highshelf';
    this.filters[2].frequency.value = 9000;

    this.convolver = this.ctx.createConvolver();
    this.preamp = this.ctx.createGain();
    this.preamp.gain.value = 1;

    try {
      this.mediaSourceNode = this.ctx.createMediaElementSource(audio);
    } catch (err) {
      console.warn("createMediaElementSource failed", err);
      this.mediaSourceNode = null;
    }

    // AUTO APPLY PITCH SHIFT
    this.applyPitchUp();

    this.connectChain(false);

    audio.addEventListener('play', () => {
      this.unlockAndResume();
    });
  }

  /** REAL PITCH SHIFTER - NO CORS */
  applyPitchUp() {
    // Remove existing pitch shifter if any
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
    }

    // Create pitch shifter
    this.scriptNode = this.ctx.createScriptProcessor(4096, 1, 1);

    let position = 0;

    this.scriptNode.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const output = event.outputBuffer.getChannelData(0);

      // Simple pitch shifting by resampling
      for (let i = 0; i < output.length; i++) {
        const sourceIndex = position;
        const index = Math.floor(sourceIndex);
        const fraction = sourceIndex - index;

        if (index < input.length - 1) {
          // Linear interpolation for smooth audio
          output[i] = input[index] * (1 - fraction) + input[index + 1] * fraction;
        } else {
          output[i] = 0;
        }

        position += 1 / this.pitchRatio; // Pitch shift factor
      }

      // Handle buffer wrapping
      if (position >= input.length) {
        position = 0;
      }
    };

    // Reconnect chain with pitch shifter
    this.connectChain(this.isConvolverEnabled);
  }

  /** Reset to normal pitch */
  resetPitch() {
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode = null;
      this.connectChain(this.isConvolverEnabled);
    }
  }

  private unlockAndResume() {
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(e => {
        console.warn("AudioContext resume error:", e);
      });
    }
  }

  private connectChain(useConvolver: boolean) {
    if (this.mediaSourceNode) this.mediaSourceNode.disconnect();
    if (this.scriptNode) this.scriptNode.disconnect();
    this.filters.forEach(f => f.disconnect());
    this.preamp.disconnect();
    this.convolver.disconnect();

    let inputNode: AudioNode | null = null;

    // Connect media source to pitch shifter, then to filters
    if (this.mediaSourceNode) {
      if (this.scriptNode) {
        this.mediaSourceNode.connect(this.scriptNode);
        inputNode = this.scriptNode;
      } else {
        inputNode = this.mediaSourceNode;
      }
    }

    if (!inputNode) return;

    inputNode.connect(this.filters[0]);
    this.filters[0].connect(this.filters[1]);
    this.filters[1].connect(this.filters[2]);

    if (useConvolver && this.irBuffer) {
      this.preamp.gain.value = Math.pow(10, 12 / 20);
      this.filters[2].connect(this.preamp);
      this.preamp.connect(this.convolver);
      this.convolver.connect(this.ctx.destination);
      this.isConvolverEnabled = true;
    } else {
      this.filters[2].connect(this.ctx.destination);
      this.isConvolverEnabled = false;
    }
  }

  async loadImpulseResponse(url: string) {
    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    try {
      const buf = await this.ctx.decodeAudioData(arrayBuffer);
      this.irBuffer = buf;
      this.convolver.buffer = buf;
    } catch (err) {
      console.error("decodeAudioData failed", err);
    }
  }

  enableConvolver(enable: boolean) {
    if (enable !== this.isConvolverEnabled) {
      this.connectChain(enable);
    }
  }

  setBandGain(band: 'bass' | 'mid' | 'treble', gain: number) {
    if (band === 'bass') this.filters[0].gain.value = gain;
    else if (band === 'mid') this.filters[1].gain.value = gain;
    else if (band === 'treble') this.filters[2].gain.value = gain;
  }

  getFrequencyResponse(band: 'bass' | 'mid' | 'treble', frequencies: Float32Array): Float32Array {
    const mag = new Float32Array(frequencies.length);
    const phase = new Float32Array(frequencies.length);
    const idx = band === 'bass' ? 0 : band === 'mid' ? 1 : 2;
    this.filters[idx].getFrequencyResponse(frequencies, mag, phase);
    return mag;
  }
}