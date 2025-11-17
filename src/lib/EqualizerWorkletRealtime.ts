// EqualizerWorkletRealtime.ts
// Worklet-based realtime pipeline using audio.captureStream() to avoid iOS HLS -> WebAudio gaps.
// Flow:
//   audioEl.captureStream() -> ctx.createMediaStreamSource(stream)
//   -> filters -> convolver -> preamp -> MediaStreamDestination -> processedEl.srcObject
// Includes: robust unlock, retries to start inputEl (muted), analyser/RMS logger, optional AudioWorklet pass-through.

export type EQBand = 'bass' | 'mid' | 'treble';

export class EqualizerWorkletRealtime {
  disableConvolver() {
    throw new Error("Method not implemented.");
  }
  public ctx: AudioContext;
  public inputEl: HTMLAudioElement;
  public processedEl: HTMLAudioElement;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private filters: { bass: BiquadFilterNode; mid: BiquadFilterNode; treble: BiquadFilterNode; };
  private preamp: GainNode;
  public convolver: ConvolverNode;
  private dest: MediaStreamAudioDestinationNode | null = null;
  private connected = false;
  private irBuffer: AudioBuffer | null = null;
  private analyser: AnalyserNode | null = null;
  private rmsIntervalHandle: number | null = null;
  private periodicLoggerHandle: number | null = null;

  constructor(inputAudioEl: HTMLAudioElement, opts?: { audioContext?: AudioContext; processedAudioEl?: HTMLAudioElement; requestAudioSessionPlayback?: boolean }) {
    this.inputEl = inputAudioEl;
    this.ctx = opts?.audioContext ?? new (window.AudioContext || (window as any).webkitAudioContext)();

    // processed audio element
    if (opts?.processedAudioEl) {
      this.processedEl = opts.processedAudioEl;
    } else {
      this.processedEl = document.createElement('audio');
      this.processedEl.style.display = 'none';
      this.processedEl.autoplay = false;
      document.body.appendChild(this.processedEl);
    }

    // filters
    this.filters = {
      bass: this.ctx.createBiquadFilter(),
      mid: this.ctx.createBiquadFilter(),
      treble: this.ctx.createBiquadFilter()
    };
    this.filters.bass.type = 'lowshelf';
    this.filters.bass.frequency.value = 100;
    this.filters.bass.gain.value = 0;

    this.filters.mid.type = 'peaking';
    this.filters.mid.frequency.value = 1000;
    this.filters.mid.Q.value = 1;
    this.filters.mid.gain.value = 0;

    this.filters.treble.type = 'highshelf';
    this.filters.treble.frequency.value = 9000;
    this.filters.treble.gain.value = 0;

    this.preamp = this.ctx.createGain();
    this.preamp.gain.value = 1;

    this.convolver = this.ctx.createConvolver();

    // set crossorigin if possible (do this before src changes)
    try { this.inputEl.crossOrigin = 'anonymous'; this.processedEl.crossOrigin = 'anonymous'; } catch (e) { /* ignore */ }

    // minimal periodic logging to diagnose mobile suspends
    this.periodicLoggerHandle = window.setInterval(() => {
      try {
        console.log('[EQW LOG] periodic ctx.state=', this.ctx.state, 'connected=', this.connected, 'inputEl.paused=', this.inputEl.paused, 'processedEl.paused=', this.processedEl.paused, 'convolver?', !!this.convolver.buffer);
        if (this.dest) {
          const tracks = this.dest.stream.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState }));
          console.log('[EQW LOG] dest tracks=', tracks);
        }
      } catch (e) { console.warn('[EQW LOG] periodic logger failed', e); }
    }, 5000);

    // request AudioSession playback intent if present (best-effort)
    try {
      const navAny = navigator as any;
      if (navAny?.audioSession) {
        try { navAny.audioSession.type = 'playback'; console.log('[EQW LOG] requested audioSession.type=playback'); } catch (e) { console.warn('[EQW LOG] audioSession.type failed', e); }
      }
    } catch (e) { /* ignore */ }
  }

  // --- AudioContext unlocking helper ---
  public async unlockAudioContext(): Promise<void> {
    if (this.ctx.state === 'running') return;
    try {
      await this.ctx.resume();
      console.log('[EQW LOG] ctx.resume OK ->', this.ctx.state);
    } catch (e) {
      console.warn('[EQW LOG] ctx.resume failed; waiting for gesture', e);
      await new Promise<void>((resolve) => {
        const onGesture = async () => {
          try { await this.ctx.resume(); console.log('[EQW LOG] ctx.resume after gesture ->', this.ctx.state); } catch (err) { console.warn('[EQW LOG] resume after gesture failed', err); }
          document.body.removeEventListener('click', onGesture);
          document.body.removeEventListener('touchstart', onGesture);
          resolve();
        };
        document.body.addEventListener('click', onGesture, { once: true });
        document.body.addEventListener('touchstart', onGesture, { once: true });
      });
    }
    // prime silent buffer
    try {
      const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      const s = this.ctx.createBufferSource();
      s.buffer = buf;
      s.connect(this.ctx.destination);
      s.start(0);
      s.stop(0.01);
    } catch (e) { console.warn('[EQW LOG] priming silent buffer failed', e); }
  }

  // --- create source from captureStream() instead of createMediaElementSource() ---
  private createSourceFromCaptureStream() {
    // captureStream() may be undefined in older browsers
    if (typeof (this.inputEl as any).captureStream !== 'function') {
      throw new Error('captureStream not supported on this browser');
    }
    const stream: MediaStream = (this.inputEl as any).captureStream();
    if (!stream || !stream.getAudioTracks().length) {
      throw new Error('captureStream produced no audio tracks');
    }
    this.sourceNode = this.ctx.createMediaStreamSource(stream);
    console.log('[EQW LOG] createMediaStreamSource from captureStream() OK', this.sourceNode);
  }

  private async ensureInputPlayingMuted(retries = 4) {
    // mute inputEl so processedEl is audible, but ensure inputEl is playing (so captureStream has data)
    try {
      this.inputEl.muted = true;
      for (let i = 0; i < retries; i++) {
        try {
          await this.inputEl.play();
          console.log('[EQW LOG] inputEl.play() succeeded on try', i + 1);
          return true;
        } catch (err) {
          console.warn('[EQW LOG] inputEl.play() attempt', i + 1, 'failed', err);
          await new Promise(r => setTimeout(r, 200 * (i + 1)));
        }
      }
      console.warn('[EQW LOG] inputEl.play() failed after retries');
      return false;
    } catch (e) {
      console.warn('[EQW LOG] ensureInputPlayingMuted error', e);
      return false;
    }
  }

  // --- connect full graph ---
  public async connect(): Promise<void> {
    console.log('[EQW LOG] connect called; connected=', this.connected);
    if (this.connected) return;

    await this.unlockAudioContext();

    // create source using captureStream approach
    try {
      this.createSourceFromCaptureStream();
    } catch (e) {
      console.error('[EQW LOG] captureStream -> createMediaStreamSource failed', e);
      throw e;
    }

    // create analyser for RMS
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;

    // wire filters
    this.sourceNode!.connect(this.filters.bass);
    this.filters.bass.connect(this.filters.mid);
    this.filters.mid.connect(this.filters.treble);
    this.filters.treble.connect(this.preamp);

    // connect preamp -> analyser -> convolver/dest
    this.preamp.connect(this.analyser);

    // create dest
    if (this.dest) {
      try { this.dest.stream.getTracks().forEach(t => t.stop()); } catch (_) {}
      this.dest = null;
    }
    this.dest = this.ctx.createMediaStreamDestination();

    // convolver path if loaded
    if (this.irBuffer) {
      this.analyser.connect(this.convolver);
      this.convolver.connect(this.dest);
      console.log('[EQW LOG] preamp->analyser->convolver->dest connected');
    } else {
      this.analyser.connect(this.dest);
      console.log('[EQW LOG] preamp->analyser->dest connected (no convolver)');
    }

    // attach processed stream to processedEl
    this.processedEl.srcObject = this.dest.stream;
    console.log('[EQW LOG] processedEl.srcObject set (dest.stream)');

    // ensure input is playing (muted) so captureStream has audio
    const ok = await this.ensureInputPlayingMuted();
    if (!ok) console.warn('[EQW LOG] input may not be playing; graph might be silent');

    // start processed element playback
    try {
      await this.processedEl.play();
      console.log('[EQW LOG] processedEl.play() succeeded');
    } catch (e) {
      console.warn('[EQW LOG] processedEl.play() failed (gesture required?)', e);
    }

    // RMS logger
    if (!this.rmsIntervalHandle && this.analyser) {
      this.rmsIntervalHandle = window.setInterval(() => {
        try {
          const buf = new Float32Array(this.analyser!.fftSize);
          this.analyser!.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);
          console.log('[EQW LOG] RMS', rms, 'input.paused=', this.inputEl.paused, 'processed.paused=', this.processedEl.paused);
        } catch (e) { console.warn('[EQW LOG] RMS logging error', e); }
      }, 1000);
    }

    this.connected = true;
    try { document.dispatchEvent(new CustomEvent('equalizer:connected', { detail: { connected: true } })); } catch (_) {}
    console.log('[EQW LOG] connect complete');
  }

  // --- load IR, downmix to stereo, assign to convolver ---
  public async loadImpulseResponse(url: string): Promise<void> {
    console.log('[EQW LOG] loadImpulseResponse', url);
    await this.unlockAudioContext();
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('IR fetch failed: ' + resp.status);
    const ab = await resp.arrayBuffer();
    let buf: AudioBuffer;
    try {
      buf = await this.ctx.decodeAudioData(ab);
    } catch (err) {
      buf = await new Promise<AudioBuffer>((resolve, reject) => {
        (this.ctx.decodeAudioData as any)(ab, resolve, reject);
      });
    }
    let irToUse = buf;
    if (buf.numberOfChannels === 1) {
      const s = this.ctx.createBuffer(2, buf.length, buf.sampleRate);
      s.getChannelData(0).set(buf.getChannelData(0));
      s.getChannelData(1).set(buf.getChannelData(0));
      irToUse = s;
    } else if (buf.numberOfChannels > 2) {
      const ch = buf.numberOfChannels;
      const s = this.ctx.createBuffer(2, buf.length, buf.sampleRate);
      const left = s.getChannelData(0);
      const right = s.getChannelData(1);
      const evenCount = Math.ceil(ch / 2);
      const oddCount = Math.floor(ch / 2);
      for (let i = 0; i < buf.length; i++) { left[i] = 0; right[i] = 0; }
      for (let c = 0; c < ch; c++) {
        const src = buf.getChannelData(c);
        if (c % 2 === 0) {
          for (let i = 0; i < buf.length; i++) left[i] += src[i] / evenCount;
        } else {
          for (let i = 0; i < buf.length; i++) right[i] += src[i] / oddCount;
        }
      }
      irToUse = s;
    }
    this.irBuffer = irToUse;
    this.convolver.buffer = irToUse;
    try { document.dispatchEvent(new CustomEvent('equalizer:ir-loaded', { detail: { url } })); } catch (_) {}
    console.log('[EQW LOG] IR loaded and assigned to convolver');
  }

  public setBandGain(band: EQBand, gainDb: number) {
    if (band === 'bass') this.filters.bass.gain.value = gainDb;
    else if (band === 'mid') this.filters.mid.gain.value = gainDb;
    else this.filters.treble.gain.value = gainDb;
    console.log('[EQW LOG] setBandGain', band, gainDb);
  }

  public setPitch(semitones: number) {
    const rate = Math.pow(2, semitones / 12);
    try { this.inputEl.playbackRate = rate; console.log('[EQW LOG] setPitch -> playbackRate', rate); } catch (e) { console.warn('[EQW LOG] setPitch playbackRate failed', e); }
  }

  public async reattachToInputElement(newInputEl: HTMLAudioElement) {
    console.log('[EQW LOG] reattachToInputElement', newInputEl, this.inputEl);
    this.disconnect();
    this.inputEl = newInputEl;
    try { this.inputEl.crossOrigin = 'anonymous'; } catch (_) {}
    await this.unlockAudioContext();
    await this.connect();
    console.log('[EQW LOG] reattach done');
  }

  public disconnect() {
    console.log('[EQW LOG] disconnect called');
    try {
      this.sourceNode?.disconnect();
      this.filters.bass.disconnect();
      this.filters.mid.disconnect();
      this.filters.treble.disconnect();
      this.preamp.disconnect();
      this.convolver.disconnect();
      if (this.dest) {
        this.dest.stream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} });
      }
      try { this.processedEl.srcObject = null; } catch (_) {}
    } catch (e) { console.warn('[EQW LOG] disconnect errors', e); }
    this.connected = false;
    if (this.rmsIntervalHandle) { clearInterval(this.rmsIntervalHandle); this.rmsIntervalHandle = null; }
    if (this.periodicLoggerHandle) { clearInterval(this.periodicLoggerHandle); this.periodicLoggerHandle = null; }
    try { document.dispatchEvent(new CustomEvent('equalizer:disconnected', { detail: { connected: false } })); } catch (_) {}
  }

  public destroy(closeCtx = false) {
    this.disconnect();
    try { this.processedEl.remove(); } catch (_) {}
    if (closeCtx) { try { this.ctx.close(); } catch (_) {} }
  }
}
