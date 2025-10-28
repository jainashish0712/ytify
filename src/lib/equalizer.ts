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
  private cachedAudioBuffer: AudioBuffer | null = null;
  private boundPlayHandler: (() => void) | null = null;
  private boundPauseHandler: (() => void) | null = null;
  private boundSeekingHandler: (() => void) | null = null;



    private pitchSemitones: number = 0.4; // +0.4 semitones
  constructor(audio: HTMLAudioElement) {
    this.sourceElement = audio;

    // Ensure media element allows cross-origin decoding (important for convolver/IR)
    // set before creating MediaElementSource
    try {
      this.sourceElement.crossOrigin = 'anonymous';
    } catch (e) {
      // ignore if not allowed
    }

    // Create AudioContext (do NOT force sampleRate on iOS/Safari)
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Register unlock/resume behaviour (will attempt resume now or wait for gesture)
    this.unlockAudioContext();

    // Create filters
    this.filters = [
      this.ctx.createBiquadFilter(),
      this.ctx.createBiquadFilter(),
      this.ctx.createBiquadFilter(),
    ];
    this.filters[0].type = 'lowshelf';
    this.filters[0].frequency.value = 40;
    this.filters[1].type = 'peaking';
    this.filters[1].frequency.value = 1000;
    this.filters[1].Q.value = 1;
    this.filters[2].type = 'highshelf';
    this.filters[2].frequency.value = 9000;

    this.convolver = this.ctx.createConvolver();
    this.preamp = this.ctx.createGain();
    this.preamp.gain.value = 1;

    // Force buffer-source mode: do NOT create a MediaElementSource (keeps UI controls but audio routed via buffer)
    this.mediaSourceNode = null;

    // Default initial chain: no convolver
    this.connectChain(false);

    // Ensure context is resumed / unlocked on play
    audio.addEventListener('play', () => {
      // try to resume/prime on play as well
      this.unlockAudioContext();
    });

    // always use buffer-source mode; start background decode and wire controls
    // (constructor cannot be async, so start and ignore errors here)
    this.switchToBufferSourceMode().catch(err => {
      console.warn("Initial switchToBufferSourceMode failed:", err);
    });
  }

  // Add method to calculate playback rate from semitones
  private semitonesToPlaybackRate(semitones: number): number {
    return Math.pow(2, semitones / 12);
  }

  // Add method to set pitch
  public setPitch(semitones: number): void {
    this.pitchSemitones = semitones;

    // If we have an active buffer source node, update its playback rate
    if (this.bufferSourceNode && this.cachedAudioBuffer) {
      const currentTime = this.sourceElement.currentTime;
      const wasPlaying = !this.sourceElement.paused;

      // Restart with new pitch if currently playing
      if (wasPlaying) {
        this.bufferSourceNode.stop();
        this.bufferSourceNode = null;
        this._createAndStartBufferSource(currentTime);
      }
    }
  }

  // Get current pitch setting
  public getPitch(): number {
    return this.pitchSemitones;
  }

  // Reset pitch to normal
  public resetPitch(): void {
    this.setPitch(0);
  }

  private isIOSorSafari(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
  }

  /** Public: whether this platform likely needs a user gesture to unlock WebAudio */
  public requiresUserGesture(): boolean {
    return this.isIOSorSafari();
  }

  /** Public: whether AudioContext is currently running */
  public isContextRunning(): boolean {
    return this.ctx.state === 'running';
  }

  /**
   * Robust unlock: try to resume immediately; if not possible, wait for a user gesture (click/touchstart).
   * Returns once context is running and a small silent buffer has been played to prime the engine.
   */
  public async unlockAudioContext(): Promise<void> {
    if (this.ctx.state === 'running') return;

    // Try immediate resume
    try {
      await this.ctx.resume();
      await this.primeSilentBuffer();
      return;
    } catch (e) {
      // resume may reject on some platforms when not triggered by gesture
    }

    // If still suspended, create a promise that resolves on the first user gesture
    if (this.ctx.state === 'suspended') {
      await new Promise<void>((resolve) => {
        const onGesture = async () => {
          try {
            await this.ctx.resume();
            await this.primeSilentBuffer();
          } catch (err) {
            // ignore, but still resolve so caller can continue
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

  /** Helper: resume (if needed) and play a tiny silent buffer to prime the engine */
  private async primeSilentBuffer(): Promise<void> {
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
      // start and stop quickly
      src.start(0);
      src.stop(0.01);
    } catch (e) {
      console.warn('priming silent buffer failed:', e);
    }
  }

  /** Connect the audio graph, optionally with convolver */
  private connectChain(useConvolver: boolean) {
    // Disconnect all existing nodes
    if (this.mediaSourceNode) try { this.mediaSourceNode.disconnect(); } catch {}
    if (this.bufferSourceNode) try { this.bufferSourceNode.disconnect(); } catch {}
    this.filters.forEach(f => { try { f.disconnect(); } catch {} });
    try { this.preamp.disconnect(); } catch {}
    try { this.convolver.disconnect(); } catch {}

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
    // Ensure context unlocked/resumed before decode on restricted platforms
    await this.unlockAudioContext();

    const resp = await fetch(url);
    const arrayBuffer = await resp.arrayBuffer();
    try {
      const buf = await this.ctx.decodeAudioData(arrayBuffer);

      // If IR has more than 2 channels, downmix to stereo (Safari-friendly)
      let irToUse: AudioBuffer = buf;
      const ch = buf.numberOfChannels;
      if (ch === 1) {
        // duplicate mono -> stereo
        const stereo = this.ctx.createBuffer(2, buf.length, buf.sampleRate);
        const data = buf.getChannelData(0);
        stereo.getChannelData(0).set(data);
        stereo.getChannelData(1).set(data);
        irToUse = stereo;
      } else if (ch > 2) {
        // downmix N channels into stereo: average even -> left, odd -> right
        const stereo = this.ctx.createBuffer(2, buf.length, buf.sampleRate);
        const left = stereo.getChannelData(0);
        const right = stereo.getChannelData(1);
        const evenCount = Math.ceil(ch / 2);
        const oddCount = Math.floor(ch / 2);
        // zero-fill
        for (let i = 0; i < buf.length; i++) { left[i] = 0; right[i] = 0; }
        for (let c = 0; c < ch; c++) {
          const src = buf.getChannelData(c);
          if ((c % 2) === 0) { // even -> left
            for (let i = 0; i < buf.length; i++) left[i] += src[i] / evenCount;
          } else { // odd -> right
            for (let i = 0; i < buf.length; i++) right[i] += src[i] / oddCount;
          }
        }
        irToUse = stereo;
      }

      this.irBuffer = irToUse;
      this.convolver.buffer = irToUse;
      // Reconnect chain (attempt to enable)
      this.connectChain(true);
    } catch (err) {
      console.error("decodeAudioData failed", err);
    }
  }

  /** Enable or disable convolver (if possible) */
  async enableConvolver(enable: boolean) {
    if (enable === this.isConvolverEnabled) return;

    // On iOS/Safari prefer buffer-source path for convolver (media element path can be unreliable)
    if (enable && true && !this.usingBufferSource) {
    // if (enable && this.isIOSorSafari() && !this.usingBufferSource) {
      try {
        await this.switchToBufferSourceMode();
      } catch (err) {
        console.warn("Buffer-source fallback failed:", err);
      }
    }

    // Reconnect chain with the requested convolver state (connectChain checks irBuffer)
    this.connectChain(enable);
  }

  /** Switch to buffer-source mode: load the audio via fetch / decode and play via buffer source */
  async switchToBufferSourceMode() {
    try {
      // ensure context unlocked/resumed before decode on restricted platforms
      await this.unlockAudioContext();

      const resp = await fetch(this.sourceElement.src);
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
      // cache decoded buffer for (re)creating BufferSource nodes on play/seek
      this.cachedAudioBuffer = audioBuf;

      // mute the HTML audio element so only bufferSource is heard
      try { this.sourceElement.muted = true; } catch {}

      // ensure usingBufferSource flag
      this.usingBufferSource = true;

      // attach handlers to sync UI controls -> buffer source
      if (!this.boundPlayHandler) {
        this.boundPlayHandler = () => {
          // create and start buffer source at current element time
          if (!this.cachedAudioBuffer) return;
          this._createAndStartBufferSource(this.sourceElement.currentTime);
        };
        this.sourceElement.addEventListener('play', this.boundPlayHandler);
      }
      if (!this.boundPauseHandler) {
        this.boundPauseHandler = () => {
          if (this.bufferSourceNode) {
            try { this.bufferSourceNode.stop(); } catch {}
            try { this.bufferSourceNode.disconnect(); } catch {}
            this.bufferSourceNode = null;
          }
        };
        this.sourceElement.addEventListener('pause', this.boundPauseHandler);
      }
      if (!this.boundSeekingHandler) {
        this.boundSeekingHandler = () => {
          // if playing, restart bufferSource at new position
          if (!this.cachedAudioBuffer) return;
          if (!this.sourceElement.paused) {
            if (this.bufferSourceNode) {
              try { this.bufferSourceNode.stop(); } catch {}
              try { this.bufferSourceNode.disconnect(); } catch {}
              this.bufferSourceNode = null;
            }
            this._createAndStartBufferSource(this.sourceElement.currentTime);
          }
        };
        this.sourceElement.addEventListener('seeking', this.boundSeekingHandler);
      }

      // if element is already playing, start immediately
      if (!this.sourceElement.paused) {
        this._createAndStartBufferSource(this.sourceElement.currentTime);
      }

      // Reconnect chain (connectChain will pick bufferSourceNode when present)
      this.connectChain(true);
    } catch (err) {
      console.error("switchToBufferSourceMode failed:", err);
    }
  }

  /** internal: create a fresh BufferSource and start it at given offset (seconds) */
  private _createAndStartBufferSource(offsetSeconds: number) {
    if (!this.cachedAudioBuffer) return;
    // stop and cleanup previous
    if (this.bufferSourceNode) {
      try { this.bufferSourceNode.stop(); } catch {}
      try { this.bufferSourceNode.disconnect(); } catch {}
      this.bufferSourceNode = null;
    }
    try {
      const bs = this.ctx.createBufferSource();
      bs.buffer = this.cachedAudioBuffer;
      bs.loop = this.sourceElement.loop;
            bs.playbackRate.value = this.semitonesToPlaybackRate(this.pitchSemitones)
      this.bufferSourceNode = bs;
      // Reconnect chain to include the new bufferSourceNode
      this.connectChain(true);
      // start at currentTime, with offset matching element's current time
      bs.start(this.ctx.currentTime, offsetSeconds);
    } catch (err) {
      console.error("createAndStartBufferSource failed:", err);
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
