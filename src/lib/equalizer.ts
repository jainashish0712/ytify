export class Equalizer {
  private ctx: AudioContext;
  private sourceElement: HTMLAudioElement;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private bufferSourceNode: AudioBufferSourceNode | null = null;
  private filters: BiquadFilterNode[];
  private convolver: ConvolverNode;
  private preamp: GainNode;
  private isConvolverEnabled: boolean = false;
  private usingBufferSource: boolean = false;  // whether fallback path in use
  private irBuffer: AudioBuffer | null = null;

  constructor(audio: HTMLAudioElement) {
    this.sourceElement = audio;

    // Create AudioContext (optionally with sampleRate hint)
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)({
      // on some platforms, it helps to force 44100 or match device sample rate
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

    // Try to set up mediaElement path
    try {
      this.mediaSourceNode = this.ctx.createMediaElementSource(audio);
    } catch (err) {
      console.warn("createMediaElementSource failed, will fallback to buffer source", err);
      this.mediaSourceNode = null;
    }

    // Default initial chain: no convolver
    this.connectChain(false);

    // Ensure context is resumed / unlocked on play
    audio.addEventListener('play', () => {
      this.unlockAndResume();
    });
  }

  private isIOSorSafari(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
  }

  /** Try to “unlock” WebAudio and resume context */
  private unlockAndResume() {
    if (this.ctx.state !== 'running') {
      this.ctx.resume().catch(e => {
        console.warn("AudioContext resume error:", e);
      });
    }
    // Play a silent buffer to “prime” the engine
    const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    src.start();
  }

  /** Connect the audio graph, optionally with convolver */
  private connectChain(useConvolver: boolean) {
    // Disconnect all existing nodes
    if (this.mediaSourceNode) this.mediaSourceNode.disconnect();
    if (this.bufferSourceNode) this.bufferSourceNode.disconnect();
    this.filters.forEach(f => f.disconnect());
    this.preamp.disconnect();
    this.convolver.disconnect();

    // Choose which input node to use
    let inputNode: AudioNode | null = null;
    if (this.mediaSourceNode && !this.usingBufferSource) {
      inputNode = this.mediaSourceNode;
    } else if (this.bufferSourceNode) {
      inputNode = this.bufferSourceNode;
    } else {
      // No valid input; abort
      console.error("No valid audio source node available");
      return;
    }

    // Chain filters
    inputNode.connect(this.filters[0]);
    this.filters[0].connect(this.filters[1]);
    this.filters[1].connect(this.filters[2]);

    if (useConvolver && this.irBuffer) {
      // Preamp gain before convolver
      this.preamp.gain.value = Math.pow(10, 12 / 20);
      this.filters[2].connect(this.preamp);
      this.preamp.connect(this.convolver);
      this.convolver.connect(this.ctx.destination);
      this.isConvolverEnabled = true;
    } else {
      // Dry path
      this.filters[2].connect(this.ctx.destination);
      this.isConvolverEnabled = false;
    }
  }

  /** Load IR file, decode, store buffer */
  async loadImpulseResponse(url: string) {
    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    try {
      const buf = await this.ctx.decodeAudioData(arrayBuffer);
      this.irBuffer = buf;
      this.convolver.buffer = buf;
      // Reconnect chain (attempt to enable)
      this.connectChain(true);
    } catch (err) {
      console.error("decodeAudioData failed", err);
    }
  }

  /** Enable or disable convolver (if possible) */
  enableConvolver(enable: boolean) {
    if (enable !== this.isConvolverEnabled) {
      this.connectChain(enable);
    }
  }

  /** Switch to buffer-source mode: load the audio via fetch / decode and play via buffer source */
  async switchToBufferSourceMode() {
    try {
      const resp = await fetch(this.sourceElement.src);
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
      // Create buffer source
      this.bufferSourceNode = this.ctx.createBufferSource();
      this.bufferSourceNode.buffer = audioBuf;
      this.bufferSourceNode.loop = this.sourceElement.loop;
      this.bufferSourceNode.start(0);
      // Mark using buffer path
      this.usingBufferSource = true;
      // Reconnect chain
      this.connectChain(true);
    } catch (err) {
      console.error("switchToBufferSourceMode failed:", err);
    }
  }

  /** Set band gain */
  setBandGain(band: 'bass' | 'mid' | 'treble', gain: number) {
    if (band === 'bass') this.filters[0].gain.value = gain;
    else if (band === 'mid') this.filters[1].gain.value = gain;
    else if (band === 'treble') this.filters[2].gain.value = gain;
  }

  /** Get frequency response */
  getFrequencyResponse(band: 'bass' | 'mid' | 'treble', frequencies: Float32Array): Float32Array {
    const mag = new Float32Array(frequencies.length);
    const phase = new Float32Array(frequencies.length);
    const idx = band === 'bass' ? 0 : band === 'mid' ? 1 : 2;
    this.filters[idx].getFrequencyResponse(frequencies, mag, phase);
    return mag;
  }
}
