// --- Equalizer.ts ---
export class Equalizer {
    private ctx: AudioContext;
    private sourceElement: HTMLAudioElement;
    // NOTE: mediaSourceNode, bufferSourceNode, usingBufferSource, boundPlayHandler, etc. are REMOVED
    // as we are no longer using real-time Web Audio, but pre-processing.

    private filters: BiquadFilterNode[];
    private convolver: ConvolverNode;
    private preamp: GainNode;
    private irBuffer: AudioBuffer | null = null;
    private cachedAudioBuffer: AudioBuffer | null = null;
    private originalAudioSrc: string = ''; // New: Stores the initial audio URL
    private processedAudioUrl: string | null = null; // New: Stores the Object URL of the processed WAV

    private pitchSemitones: number = 0.41; // Using your configured default

    constructor(audio: HTMLAudioElement) {
        this.sourceElement = audio;
        this.originalAudioSrc = audio.src; // Capture the initial source URL

        try {
            this.sourceElement.crossOrigin = 'anonymous';
        } catch (e) {
            // ignore
        }

        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        this.unlockAudioContext();

        // --- Filter Setup (Used for the Offline Context) ---
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

        // Ensure context is resumed / unlocked on play
        audio.addEventListener('play', () => {
            this.unlockAudioContext();
        });
    }

    // --- PITCH METHODS ---
    private semitonesToPlaybackRate(semitones: number): number {
        return Math.pow(2, semitones / 12);
    }

    public setPitch(semitones: number): void {
        this.pitchSemitones = semitones;
        // WARNING: This only affects the pitch of the NEXT call to renderAndPlayProcessedAudio.
        console.warn(`Pitch set to ${semitones} semitones. Re-processing is required for change to take effect.`);
    }

    public getPitch(): number { return this.pitchSemitones; }
    public resetPitch(): void { this.setPitch(0); }
    // --- END PITCH METHODS ---

    // --- UTILITY METHODS (Keep these as-is) ---
    private isIOSorSafari(): boolean { /* ... logic as before ... */
        const ua = navigator.userAgent;
        const isIOS = /iP(hone|ad|od)/.test(ua);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        return isIOS || isSafari;
    }
    public requiresUserGesture(): boolean { return this.isIOSorSafari(); }
    public isContextRunning(): boolean { return this.ctx.state === 'running'; }
    public async unlockAudioContext(): Promise<void> { /* ... logic as before ... */
        // if (this.ctx.state) return;
        if (this.ctx.state === 'running') return;
        try {
            await this.ctx.resume();
            await this.primeSilentBuffer();
            return;
        } catch (e) { /* ignore */ }

        if (this.ctx.state === 'suspended') {
            await new Promise<void>((resolve) => {
                const onGesture = async () => {
                    try {
                        await this.ctx.resume();
                        await this.primeSilentBuffer();
                    } catch (err) { console.warn('AudioContext resume after gesture failed:', err); } finally {
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
    private async primeSilentBuffer(): Promise<void> { /* ... logic as before ... */
        try {
            if (this.ctx.state !== 'running') { await this.ctx.resume(); }
        } catch (e) { /* ignore */ }
        try {
            const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.connect(this.ctx.destination);
            src.start(0);
            src.stop(0.01);
        } catch (e) { console.warn('priming silent buffer failed:', e); }
    }

    /** Helper: Fetches audio from the HTML element's current src and decodes it. */
    private async prepareAudioBuffer() {
        if (this.cachedAudioBuffer) return;
        await this.unlockAudioContext();

        const resp = await fetch(this.sourceElement.src);
        if (!resp.ok) {
            throw new Error(`Fetch failed with status: ${resp.status} for URL: ${this.sourceElement.src}`);
        }

        const arrayBuf = await resp.arrayBuffer();
        const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
        this.cachedAudioBuffer = audioBuf;
    }

    /** Load IR file, decode, store buffer */
    public async loadImpulseResponse(url: string) {
        await this.unlockAudioContext();
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`IR Fetch failed with status: ${resp.status} for URL: ${url}`);
        }
        const arrayBuffer = await resp.arrayBuffer();
        try {
            const buf = await this.ctx.decodeAudioData(arrayBuffer);
            // Downmix logic (mono -> stereo, N -> stereo) as before...
            let irToUse: AudioBuffer = buf;
            const ch = buf.numberOfChannels;
            if (ch === 1) { /* ... mono to stereo logic ... */
                const stereo = this.ctx.createBuffer(2, buf.length, buf.sampleRate);
                const data = buf.getChannelData(0);
                stereo.getChannelData(0).set(data);
                stereo.getChannelData(1).set(data);
                irToUse = stereo;
            } else if (ch > 2) { /* ... N to stereo logic ... */
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
            this.convolver.buffer = irToUse;
        } catch (err) {
            console.error("decodeAudioData failed for IR:", err);
            throw err;
        }
    }

    // NOTE: enableConvolver is REMOVED/Obsolete.

    /**
     * Renders the entire audio file through the EQ, Pitch, and Convolver pipeline offline.
     */
    private async renderAudioOffline(): Promise<AudioBuffer> {
        await this.prepareAudioBuffer();
        if (!this.cachedAudioBuffer || !this.irBuffer) {
            throw new Error("Missing audio buffer or impulse response for offline render.");
        }

        const audioBuf = this.cachedAudioBuffer;
        const rate = audioBuf.sampleRate;

        const playbackRate = this.semitonesToPlaybackRate(this.pitchSemitones);
        const newLength = Math.ceil(audioBuf.length / playbackRate);

        // 1. Create the OfflineContext with the calculated new length
        const offlineCtx = new OfflineAudioContext(
            audioBuf.numberOfChannels,
            newLength,
            rate
        );

        // 2. Create the source node
        const source = offlineCtx.createBufferSource();
        source.buffer = audioBuf;
        source.loop = this.sourceElement.loop;
        source.playbackRate.value = playbackRate; // Apply the static pitch change

        // 3. Recreate the effect chain (using current filter settings)
        const filters = this.filters.map(f => {
            const clone = offlineCtx.createBiquadFilter();
            clone.type = f.type;
            clone.frequency.value = f.frequency.value;
            clone.Q.value = f.Q.value;
            clone.gain.value = f.gain.value; // Capture the current EQ gain
            return clone;
        });

        const convolver = offlineCtx.createConvolver();
        convolver.buffer = this.irBuffer; // Use the loaded IR

        const preamp = offlineCtx.createGain();
        preamp.gain.value = Math.pow(10, 12 / 20); // Convolver gain compensation

        // 4. Connect the chain
        source.connect(filters[0]);
        filters[0].connect(filters[1]);
        filters[1].connect(filters[2]);
        filters[2].connect(preamp);
        preamp.connect(convolver);
        convolver.connect(offlineCtx.destination);

        // 5. Start source and render
        source.start(0);
        const renderedBuffer = await offlineCtx.startRendering();

        return renderedBuffer;
    }

    /** Converts the rendered AudioBuffer into a WAV Blob and sets the audio.src. */
    private async switchToProcessedAudioMode(buffer: AudioBuffer): Promise<void> {
        // --- WAV Encoding Logic (As provided in previous answer) ---
        const bufferToWav = (b: AudioBuffer) => {
            const numOfChan = b.numberOfChannels, length = b.length * numOfChan * 2 + 44, buffer = new ArrayBuffer(length), view = new DataView(buffer), channels = [], sampleRate = b.sampleRate;
            let offset = 0, i = 0, l = 0;
            const writeString = (s: string) => { for (i = 0; i < s.length; i++) { view.setUint8(offset + i, s.charCodeAt(i)); } };
            // RIFF header
            writeString('RIFF'); offset += 4; view.setUint32(offset, 36 + length - 44, true); offset += 4; writeString('WAVE'); offset += 4;
            // FMT sub-chunk
            writeString('fmt '); offset += 4; view.setUint32(offset, 16, true); offset += 4; view.setUint16(offset, 1, true); offset += 2; view.setUint16(offset, numOfChan, true); offset += 2; view.setUint32(offset, sampleRate, true); offset += 4; view.setUint32(offset, sampleRate * numOfChan * 2, true); offset += 4; view.setUint16(offset, numOfChan * 2, true); offset += 2; view.setUint16(offset, 16, true); offset += 2;
            // Data sub-chunk
            writeString('data'); offset += 4; view.setUint32(offset, length - offset, true); offset += 4;
            // Write PCM data
            for (i = 0; i < numOfChan; i++) { channels.push(b.getChannelData(i)); }
            const multiplier = 32767;
            while (l < b.length) {
                for (i = 0; i < numOfChan; i++) {
                    let sample = channels[i][l] * multiplier;
                    sample = Math.max(-multiplier, Math.min(multiplier, sample));
                    view.setInt16(offset, sample, true);
                    offset += 2;
                }
                l++;
            }
            return new Blob([view], { type: 'audio/wav' });
        };
        // --- End WAV Encoding Logic ---

        const wavBlob = bufferToWav(buffer);

        if (this.processedAudioUrl) {
            URL.revokeObjectURL(this.processedAudioUrl);
        }

        const url = URL.createObjectURL(wavBlob);
        this.processedAudioUrl = url;

        // Reset position before changing src
        this.sourceElement.currentTime = 0;

        // IMPORTANT: Change the source to the processed WAV file (allows background play)
        this.sourceElement.src = url;
        this.sourceElement.load();

        // Resume playback if it was paused before the process began
        if (!this.sourceElement.paused) {
            this.sourceElement.play().catch(e => console.warn("Failed to auto-play processed audio:", e));
        }

        try {
            document.dispatchEvent(new CustomEvent('equalizer:processed-ready', { detail: { success: true } }));
        } catch (e) {}
    }

    /**
     * Public entry point: Attempts to render the audio offline, falling back to original source on failure.
     */
    public async renderAndPlayProcessedAudio(): Promise<void> {
        console.log("298",this.sourceElement.src,this.originalAudioSrc,this.processedAudioUrl);
        // Ensure the audio element has its *original* source set so we can fetch it.
        // NOTE: This assumes player.ts has set the initial audio.src right before calling initEQ.
        if (!this.sourceElement.src) {
             console.warn("Audio element has no source URL.");
             return;
        }

        // Check if the source is already the processed URL to prevent re-rendering
        if (this.processedAudioUrl && this.sourceElement.src === this.processedAudioUrl) {
            return;
        }

        // Store the source now, in case HLS/other modules change it later
        if (this.sourceElement.src !== this.originalAudioSrc) {
             this.originalAudioSrc = this.sourceElement.src;
        }

        // NOTE: The UI module should probably show a loading spinner here!
        console.log("Starting offline audio processing...");

        try {
            // 1. Render the effect chain (includes pitch and EQ settings)
            const processedBuffer = await this.renderAudioOffline();

            // 2. Convert to WAV Blob and update the player source
            await this.switchToProcessedAudioMode(processedBuffer);

            console.log("Offline processing successful. Playing processed WAV.");

        } catch (error) {
            console.error("[EQ FATAL] Offline processing failed. Falling back to original audio source.", error);

            // 3. Fallback to original behavior (must restore original src)
            this.sourceElement.src = this.originalAudioSrc;
            this.sourceElement.load();
            this.processedAudioUrl = null;

            try {
                document.dispatchEvent(new CustomEvent('equalizer:processed-ready', { detail: { success: false, error: String(error) } }));
            } catch (e) {}
        }
    }

    // Set band gain
    setBandGain(band: 'bass' | 'mid' | 'treble', gain: number) {
        if (band === 'bass') this.filters[0].gain.value = gain;
        else if (band === 'mid') this.filters[1].gain.value = gain;
        else if (band === 'treble') this.filters[2].gain.value = gain;
        // NOTE: Changes will ONLY take effect on the NEXT renderAndPlayProcessedAudio call!
    }

    // Get frequency response
    getFrequencyResponse(band: 'bass' | 'mid' | 'treble', frequencies: Float32Array): Float32Array {
        const mag = new Float32Array(frequencies.length);
        const phase = new Float32Array(frequencies.length);
        const idx = band === 'bass' ? 0 : band === 'mid' ? 1 : 2;
        this.filters[idx].getFrequencyResponse(frequencies, mag, phase);
        return mag;
    }
}