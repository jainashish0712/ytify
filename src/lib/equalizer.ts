export class Equalizer {
  private ctx: AudioContext;
  private source: MediaElementAudioSourceNode;
  private filters: BiquadFilterNode[];
  private convolver: ConvolverNode;
  private preamp: GainNode;
  private isConvolverEnabled: boolean = false;

  constructor(audio: HTMLAudioElement) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.source = this.ctx.createMediaElementSource(audio);

    // Equalizer filters
    this.filters = [
      this.ctx.createBiquadFilter(), // bass
      this.ctx.createBiquadFilter(), // mid
      this.ctx.createBiquadFilter()  // treble
    ];

    // Bass, Mid, Treble setup
    this.filters[0].type = 'lowshelf';
    this.filters[0].frequency.value = 60;
    this.filters[1].type = 'peaking';
    this.filters[1].frequency.value = 1000;
    this.filters[1].Q.value = 1;
    this.filters[2].type = 'highshelf';
    this.filters[2].frequency.value = 3000;

    // Convolver for reverb
    this.convolver = this.ctx.createConvolver();

    // Preamp gain node (for +3dB when convolver is enabled)
    this.preamp = this.ctx.createGain();
    this.preamp.gain.value = 4; // default unity gain

    // Default: source -> EQ -> destination
    this.connectChain(false);

    // Resume context on play
    audio.addEventListener('play', () => {
      if (this.ctx.state !== 'running') {
        this.ctx.resume();
      }
    });
  }

  // Connect audio graph depending on convolver state
  private connectChain(useConvolver: boolean) {
    // Disconnect everything first
    this.source.disconnect();
    this.filters.forEach(f => f.disconnect());
    this.preamp.disconnect();
    this.convolver.disconnect();

    // Reconnect in order
    this.source.connect(this.filters[0]);
    this.filters[0].connect(this.filters[1]);
    this.filters[1].connect(this.filters[2]);

    if (useConvolver) {
      // Apply +3dB preamp gain before convolver
      this.preamp.gain.value = Math.pow(10, 12 / 20); // ≈ 1.412
      this.filters[2].connect(this.preamp);
      this.preamp.connect(this.convolver);
      this.convolver.connect(this.ctx.destination);
    } else {
      this.filters[2].connect(this.ctx.destination);
    }

    this.isConvolverEnabled = useConvolver;
  }

  // Load impulse response and prepare convolver
  async loadImpulseResponse(url: string) {
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.convolver.buffer = await this.ctx.decodeAudioData(arrayBuffer);

    // Optional: Automatically enable convolver after loading
    this.enableConvolver(true);
  }

  // Enable or disable convolver effect
  enableConvolver(enable: boolean) {
    if (enable !== this.isConvolverEnabled) {
      this.connectChain(enable);
    }
  }

  // Set EQ band gain
  setBandGain(band: 'bass' | 'mid' | 'treble', gain: number) {
    if (band === 'bass') this.filters[0].gain.value = gain;
    if (band === 'mid') this.filters[1].gain.value = gain;
    if (band === 'treble') this.filters[2].gain.value = gain;
  }

  // Frequency response for visualization or analysis
  getFrequencyResponse(band: 'bass' | 'mid' | 'treble', frequencies: Float32Array): Float32Array {
    const magResponse = new Float32Array(frequencies.length);
    const phaseResponse = new Float32Array(frequencies.length);
    const idx = band === 'bass' ? 0 : band === 'mid' ? 1 : 2;
    this.filters[idx].getFrequencyResponse(frequencies, magResponse, phaseResponse);
    return magResponse;
  }
}