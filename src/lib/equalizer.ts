export class Equalizer {
  private ctx: AudioContext | null = null;
  private sourceElement: HTMLAudioElement;
  private mediaSourceNode: MediaElementAudioSourceNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private convolver: ConvolverNode | null = null;
  private preamp: GainNode | null = null;
  private irBuffer: AudioBuffer | null = null;
  private isInitialized: boolean = false;

  constructor(audio: HTMLAudioElement) {
    this.sourceElement = audio;

    try {
      this.sourceElement.crossOrigin = 'anonymous';
    } catch (e) {
      // ignore
    }

    // Initialize AudioContext
    this.initializeContext();
  }

  private initializeContext(): void {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) {
        console.error('AudioContext not supported in this browser');
        return;
      }
      this.ctx = new AudioContextClass();
      console.log('AudioContext created:', this.ctx.state);

      if (!this.ctx) {
        console.error('AudioContext is null after creation');
        return;
      }

      // Create filter nodes
      this.createFilters();
      this.isInitialized = true;
    } catch (e) {
      console.error('Failed to initialize AudioContext:', e);
    }
  }

  private createFilters(): void {
    if (!this.ctx) {
      console.warn('Cannot create filters: no AudioContext');
      return;
    }

    try {
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
    } catch (e) {
      console.error('Failed to create filter nodes:', e);
    }
  }

  private ensureMediaSource(): boolean {
    if (this.mediaSourceNode) return true;
    if (!this.ctx) return false;

    try {
      console.log('Creating MediaElementSource...');
      this.mediaSourceNode = this.ctx.createMediaElementSource(this.sourceElement);
      console.log('MediaElementSource created successfully');

      // Now connect the chain
      this.connectChain(false);
      return true;
    } catch (e) {
      console.error('Failed to create MediaElementSource:', e);
      return false;
    }
  }

  private isIOSorSafari(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
  }

  public requiresUserGesture(): boolean {
    return this.isIOSorSafari();
  }

  public isContextRunning(): boolean {
    return this.ctx?.state === 'running';
  }

  public async unlockAudioContext(): Promise<void> {
    if (!this.ctx) return;
    if (this.ctx.state === 'running') return;

    try {
      await this.ctx.resume();
      this.ensureMediaSource();
      await this.primeSilentBuffer();
      return;
    } catch (e) {
      console.warn('Failed to resume context:', e);
    }

    if (this.ctx.state === 'suspended') {
      await new Promise<void>((resolve) => {
        const onGesture = async () => {
          try {
            if (this.ctx) {
              await this.ctx.resume();
              this.ensureMediaSource();
              await this.primeSilentBuffer();
            }
          } catch (err) {
            console.warn('AudioContext resume after gesture failed:', err);
          } finally {
            document.body.removeEventListener('click', onGesture);
            document.body.removeEventListener('touchstart', onGesture);
            resolve();
          }
        };
        document.body.addEventListener('click', onGesture, { once: true });
        document.body.addEventListener('touchstart', onGesture, { once: true });
      });
    }
  }

  private async primeSilentBuffer(): Promise<void> {
    if (!this.ctx) return;

    try {
      if (this.ctx.state !== 'running') {
        await this.ctx.resume();
      }
    } catch (e) {
      // ignore
    }
    try {
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.ctx.destination);
      src.start(0);
      src.stop(0.01);
    } catch (e) {
      console.warn('priming silent buffer failed:', e);
    }
  }

  private connectChain(useConvolver: boolean) {
    if (!this.ctx || !this.mediaSourceNode) return;

    try {
      if (this.mediaSourceNode) this.mediaSourceNode.disconnect();
    } catch {}
    this.filters.forEach(f => { try { f?.disconnect(); } catch {} });
    if (this.preamp) try { this.preamp.disconnect(); } catch {}
    if (this.convolver) try { this.convolver.disconnect(); } catch {}

    this.mediaSourceNode.connect(this.filters[0]);
    this.filters[0].connect(this.filters[1]);
    this.filters[1].connect(this.filters[2]);

    if (useConvolver && this.irBuffer && this.convolver && this.preamp) {
      this.preamp.gain.value = Math.pow(10, 12 / 20);
      this.filters[2].connect(this.preamp);
      this.preamp.connect(this.convolver);
      this.convolver.connect(this.ctx.destination);
    } else if (this.ctx) {
      this.filters[2].connect(this.ctx.destination);
    }
  }

  async loadImpulseResponse(url: string) {
    if (!this.ctx) {
      console.warn('AudioContext not available');
      return;
    }

    await this.unlockAudioContext();
    this.ensureMediaSource();

    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    try {
      const buf = await this.ctx.decodeAudioData(arrayBuffer);

      let irToUse: AudioBuffer = buf;
      const ch = buf.numberOfChannels;
      if (ch === 1) {
        const stereo = this.ctx.createBuffer(2, buf.length, buf.sampleRate);
        const data = buf.getChannelData(0);
        stereo.getChannelData(0).set(data);
        stereo.getChannelData(1).set(data);
        irToUse = stereo;
      } else if (ch > 2) {
        const stereo = this.ctx.createBuffer(2, buf.length, buf.sampleRate);
        const left = stereo.getChannelData(0);
        const right = stereo.getChannelData(1);
        const evenCount = Math.ceil(ch / 2);
        const oddCount = Math.floor(ch / 2);
        for (let i = 0; i < buf.length; i++) { left[i] = 0; right[i] = 0; }
        for (let c = 0; c < ch; c++) {
          const src = buf.getChannelData(c);
          if ((c % 2) === 0) {
            for (let i = 0; i < buf.length; i++) left[i] += src[i] / evenCount;
          } else {
            for (let i = 0; i < buf.length; i++) right[i] += src[i] / oddCount;
          }
        }
        irToUse = stereo;
      }

      this.irBuffer = irToUse;
      if (this.convolver) {
        this.convolver.buffer = irToUse;
        this.connectChain(true);
      }
    } catch (err) {
      console.error("decodeAudioData failed", err);
    }
  }

  async enableConvolver(enable: boolean) {
    if (!this.ensureMediaSource()) {
      console.warn('Cannot enable convolver: media source not available');
      return;
    }
    this.connectChain(enable);
  }

  setBandGain(band: 'bass' | 'mid' | 'treble', gain: number) {
    if (band === 'bass') this.filters[0]?.gain && (this.filters[0].gain.value = gain);
    else if (band === 'mid') this.filters[1]?.gain && (this.filters[1].gain.value = gain);
    else if (band === 'treble') this.filters[2]?.gain && (this.filters[2].gain.value = gain);
  }

  getFrequencyResponse(band: 'bass' | 'mid' | 'treble', frequencies: Float32Array): Float32Array {
    const mag = new Float32Array(frequencies.length);
    const phase = new Float32Array(frequencies.length);
    const idx = band === 'bass' ? 0 : band === 'mid' ? 1 : 2;
    if (this.filters[idx]) {
      this.filters[idx].getFrequencyResponse(frequencies, mag, phase);
    }
    return mag;
  }
}