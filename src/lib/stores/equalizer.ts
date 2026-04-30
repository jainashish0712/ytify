// --- Equalizer.ts ---
// This class manages audio equalization and pitch shifting, supporting both
// real-time processing via Web Audio API and offline pre-processing for compatibility.
export class Equalizer {
    private ctx: AudioContext;
    private sourceElement: HTMLAudioElement;

    private filters: BiquadFilterNode[];
    private convolver: ConvolverNode;
    private preamp: GainNode;
    private irBuffer: AudioBuffer | null = null;
    private cachedAudioBuffer: AudioBuffer | null = null;
    private originalAudioSrc: string = ''; // New: Stores the initial audio URL
    public processedAudioUrl: string | null = null; // New: Stores the Object URL of the processed WAV

    private realtimeEnabled: boolean = false;
    private mediaSourceNode: MediaElementAudioSourceNode | null = null;
    public gainNode: GainNode | null = null; // Made public

    private pitchSemitones: number = 2.41; // Using your configured default

    constructor(audio: HTMLAudioElement) {
        // const { index, invidious } = store.api;

        // console.log("23",audio);

        console.log("[Equalizer Constructor] === INITIALIZING EQUALIZER ===");
        this.sourceElement = audio;
        this.originalAudioSrc = audio.src; // Capture the initial source URL

    // this.sourceElement.src = ""; // Set initial src to empty string
    // this.originalAudioSrc = "";

        try {
            this.sourceElement.crossOrigin = 'anonymous';
        } catch (e) {
            // ignore
        }

        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        console.log("[Equalizer Constructor] AudioContext created - State:", this.ctx.state);
        // IMPORTANT: Unlock on first user gesture to enable real-time audio playback
        this.setupAudioContextUnlock();

        // --- Filter Setup (Used for the Offline Context) ---
        this.filters = [
            this.ctx.createBiquadFilter(),
            this.ctx.createBiquadFilter(),
            this.ctx.createBiquadFilter(),
            this.ctx.createBiquadFilter(),
            this.ctx.createBiquadFilter(),
            this.ctx.createBiquadFilter(),
            this.ctx.createBiquadFilter(),
            this.ctx.createBiquadFilter(),
        ];
        // Band definitions
        const bandDefs = [
            { type: 'lowshelf',  freq: 40,    Q: 1 },
            { type: 'peaking',   freq: 150,   Q: 1 },
            { type: 'peaking',   freq: 400,   Q: 1 },
            { type: 'peaking',   freq: 1000,  Q: 1 },
            { type: 'peaking',   freq: 2000,  Q: 1 },
            { type: 'peaking',   freq: 4000,  Q: 1 },
            { type: 'peaking',   freq: 8000,  Q: 1 },
            { type: 'highshelf', freq: 16000, Q: 1 },
        ];
        for (let i = 0; i < this.filters.length; i++) {
            this.filters[i].type = bandDefs[i].type as BiquadFilterType;
            this.filters[i].frequency.value = bandDefs[i].freq;
            this.filters[i].Q.value = bandDefs[i].Q;
        }

        this.convolver = this.ctx.createConvolver();
        this.preamp = this.ctx.createGain();
        this.preamp.gain.value = 1; // Changed from 5 to 1 for debugging
        console.log("[Equalizer Constructor] preamp.gain.value:", this.preamp.gain.value);

        this.gainNode = this.ctx.createGain(); // Initialize the gainNode
        console.log("[Equalizer Constructor] gainNode.gain.value (initial):", this.gainNode.gain.value);

        // Ensure context is resumed / unlocked on play
        audio.addEventListener('play', () => {
            console.log("[Equalizer] Audio play event detected - unlocking context...");
            this.unlockAudioContext();
        });

        console.log("[Equalizer Constructor] === EQUALIZER INITIALIZATION COMPLETE ===");
    }

    /** Setup automatic AudioContext unlock on first user gesture or audio play */
    private setupAudioContextUnlock(): void {
        // Attempt unlock on first gesture
        const unlockGesture = async () => {
            await this.unlockAudioContext();
            document.body.removeEventListener('click', unlockGesture);
            document.body.removeEventListener('touchstart', unlockGesture);
        };

        if (this.ctx.state === 'suspended') {
            document.body.addEventListener('click', unlockGesture, { once: true });
            document.body.addEventListener('touchstart', unlockGesture, { once: true });
        }
    }

    public enableRealtimeProcessing(enabled: boolean): void {
        console.log("[Equalizer.enableRealtimeProcessing] Called with enabled:", enabled, "Current state:", this.realtimeEnabled);
        if (enabled === this.realtimeEnabled) {
            console.log("[Equalizer.enableRealtimeProcessing] Already in desired state, returning");
            return; // No change needed
        }

        this.realtimeEnabled = enabled;
        console.log("[Equalizer.enableRealtimeProcessing] State changed to:", enabled);

        if (enabled) {
            // Ensure context is running before connecting the audio graph
            console.log("[Equalizer.enableRealtimeProcessing] Unlocking audio context...");
            this.unlockAudioContext();

            // Enable real-time processing
            if (!this.mediaSourceNode) {
                console.log("[Equalizer.enableRealtimeProcessing] Creating mediaSourceNode...");
                // IMPORTANT: Create mediaSourceNode BEFORE muting to ensure proper capture
                this.mediaSourceNode = this.ctx.createMediaElementSource(this.sourceElement);
                console.log("[Equalizer.enableRealtimeProcessing] mediaSourceNode created");

                // Connect the graph immediately after creating mediaSourceNode
                console.log("[Equalizer.enableRealtimeProcessing] Connecting audio graph...");
                this.mediaSourceNode.connect(this.preamp);
                console.log("[Equalizer.enableRealtimeProcessing] mediaSourceNode -> preamp");
                this.preamp.connect(this.filters[0]);
                console.log("[Equalizer.enableRealtimeProcessing] preamp -> filters[0]");
                for (let i = 0; i < this.filters.length - 1; i++) {
                    this.filters[i].connect(this.filters[i + 1]);
                    console.log(`[Equalizer.enableRealtimeProcessing] filters[${i}] -> filters[${i + 1}]`);
                }

                console.log("[Equalizer.enableRealtimeProcessing] irBuffer loaded:", this.irBuffer !== null, "convolver.buffer:", this.convolver.buffer !== null);
                if (this.irBuffer && this.convolver.buffer) {
                    // If impulse response is loaded, include convolver
                    console.log("[Equalizer.enableRealtimeProcessing] Connecting convolver to chain");
                    this.filters[this.filters.length - 1].connect(this.convolver);
                    console.log("[Equalizer.enableRealtimeProcessing] filters[last] -> convolver");
                    this.convolver.connect(this.gainNode!);
                    console.log("[Equalizer.enableRealtimeProcessing] convolver -> gainNode");
                } else {
                    // Otherwise, bypass convolver
                    console.log("[Equalizer.enableRealtimeProcessing] BYPASSING convolver (not loaded yet)");
                    this.filters[this.filters.length - 1].connect(this.gainNode!);
                    console.log("[Equalizer.enableRealtimeProcessing] filters[last] -> gainNode (bypassing convolver)");
                }
                this.gainNode!.connect(this.ctx.destination);
                console.log("[Equalizer.enableRealtimeProcessing] gainNode -> destination");

                console.log("[Equalizer.enableRealtimeProcessing] AUDIO GRAPH CONNECTED SUCCESSFULLY");
            } else {
                console.log("[Equalizer.enableRealtimeProcessing] mediaSourceNode already exists, skipping creation");
            }

            console.log("[Equalizer.enableRealtimeProcessing] === FINAL STATUS ===");
            console.log("  sourceElement.src:", this.sourceElement.src);
            console.log("  sourceElement.paused:", this.sourceElement.paused);
            console.log("  sourceElement.readyState:", this.sourceElement.readyState);
            console.log("  context.state:", this.ctx.state);
            console.log("  gainNode.gain.value:", this.gainNode!.gain.value);
            console.log("  mediaSourceNode connected:", this.mediaSourceNode !== null);
            console.log("  convolver in chain:", this.irBuffer && this.convolver.buffer);
            console.log("[Equalizer.enableRealtimeProcessing] === REAL-TIME PROCESSING ENABLED ===");

        } else {
            // Disable real-time processing
            console.log("[Equalizer.enableRealtimeProcessing] Disabling real-time processing...");
            if (this.mediaSourceNode) {
                console.log("[Equalizer.enableRealtimeProcessing] Disconnecting audio graph...");
                // Disconnect the graph
                this.mediaSourceNode.disconnect(this.preamp);
                this.preamp.disconnect(this.filters[0]);
                for (let i = 0; i < this.filters.length - 1; i++) {
                    this.filters[i].disconnect(this.filters[i + 1]);
                }

                if (this.irBuffer && this.convolver.buffer) {
                    this.filters[this.filters.length - 1].disconnect(this.convolver);
                    this.convolver.disconnect(this.gainNode!);
                } else {
                    this.filters[this.filters.length - 1].disconnect(this.gainNode!);
                }
                this.gainNode!.disconnect(this.ctx.destination);
                console.log("[Equalizer.enableRealtimeProcessing] Audio graph disconnected");
            }

            console.log("[Equalizer.enableRealtimeProcessing] Real-time equalizer processing DISABLED.");
        }
    }

    // --- PITCH METHODS ---
    private semitonesToPlaybackRate(semitones: number): number {
        return Math.pow(2, semitones / 12);
    }

    public setPitch(semitones: number): void {
        this.pitchSemitones = semitones;
        console.log(`[Equalizer.setPitch] Setting pitch to ${semitones} semitones`);
        console.log(`[Equalizer.setPitch] realtimeEnabled: ${this.realtimeEnabled}`);
        if (true) {
        // if (this.realtimeEnabled) {
            const playbackRate = this.semitonesToPlaybackRate(semitones);
            this.sourceElement.playbackRate = playbackRate;
            console.log(`[Equalizer.setPitch] Real-time pitch applied. Playback rate set to: ${playbackRate}. Current sourceElement.playbackRate: ${this.sourceElement.playbackRate}`);
        } else {
            // WARNING: This only affects the pitch of the NEXT call to renderAndPlayProcessedAudio.
            console.warn(`[Equalizer.setPitch] Real-time disabled. Pitch will apply on next offline render.`);
        }
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
        if (this.ctx.state === 'running') {
            console.log("[Equalizer.unlockAudioContext] Context already running");
            return;
        }
        console.log("[Equalizer.unlockAudioContext] Context state:", this.ctx.state, "- Attempting to resume...");

        // if (this.ctx.state === 'running') return;
        try {
            console.log("[Equalizer.unlockAudioContext] Calling ctx.resume()...");
            await this.ctx.resume();
            console.log("[Equalizer.unlockAudioContext] ctx.resume() succeeded. State:", this.ctx.state);
            await this.primeSilentBuffer();
            return;
        } catch (e) {
            console.log("[Equalizer.unlockAudioContext] ctx.resume() failed:", e);
        }

        if (this.ctx.state === 'suspended') {
            console.log("[Equalizer.unlockAudioContext] Context still suspended, waiting for gesture...");
            await new Promise<void>((resolve) => {
                const onGesture = async () => {
                    console.log("[Equalizer.unlockAudioContext] Gesture detected, resuming context...");
                    try {
                        await this.ctx.resume();
                        console.log("[Equalizer.unlockAudioContext] Gesture resume succeeded. State:", this.ctx.state);
                        await this.primeSilentBuffer();
                    } catch (err) { console.warn('[Equalizer.unlockAudioContext] AudioContext resume after gesture failed:', err); } finally {
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
        console.log("[Equalizer.primeSilentBuffer] Priming silent buffer...");
        try {
            if (this.ctx.state !== 'running') {
                console.log("[Equalizer.primeSilentBuffer] Context not running, resuming...");
                await this.ctx.resume();
            }
        } catch (e) { /* ignore */ }
        try {
            const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.connect(this.ctx.destination);
            src.start(0);
            src.stop(0.01);
            console.log("[Equalizer.primeSilentBuffer] Silent buffer primed successfully");
        } catch (e) { console.warn('[Equalizer.primeSilentBuffer] priming silent buffer failed:', e); }
    }

    /** Helper: Fetches audio from the HTML element's current src and decodes it. */
    private async prepareAudioBuffer() {
try {
            if (this.cachedAudioBuffer) return;
            await this.unlockAudioContext();

            const resp = await fetch(this.sourceElement.src);
            if (!resp.ok) {
                throw new Error(`Fetch failed with status: ${resp.status} for URL: ${this.sourceElement.src}`);
            }

            const arrayBuf = await resp.arrayBuffer();
            const audioBuf = await this.ctx.decodeAudioData(arrayBuf);
            this.cachedAudioBuffer = audioBuf;
} catch (error) {
    console.log("147",error);
}
    }

    /** Load IR file, decode, store buffer */
    public async loadImpulseResponse(url: string) {
        console.log("[Equalizer.loadImpulseResponse] Starting to load IR from:", url);
        console.log("[Equalizer.loadImpulseResponse] realtimeEnabled:", this.realtimeEnabled);
        await this.unlockAudioContext();
        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                throw new Error(`IR Fetch failed with status: ${resp.status} for URL: ${url}`);
            }
            console.log("[Equalizer.loadImpulseResponse] IR file fetched successfully");
            const arrayBuffer = await resp.arrayBuffer();
            console.log("[Equalizer.loadImpulseResponse] IR arrayBuffer size:", arrayBuffer.byteLength);
            const buf = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("[Equalizer.loadImpulseResponse] IR decoded - Channels:", buf.numberOfChannels, "Duration:", buf.duration, "SampleRate:", buf.sampleRate);
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
            console.log("[Equalizer.loadImpulseResponse] SUCCESS - IR buffer loaded and assigned to convolver");
            console.log("[Equalizer.loadImpulseResponse] Convolver buffer is now:", this.convolver.buffer !== null ? 'SET' : 'NULL');
            // If real-time processing is enabled, reconnect the graph to include convolver
            if (this.realtimeEnabled && this.mediaSourceNode) {
                console.log("[Equalizer.loadImpulseResponse] Real-time enabled - need to reconnect graph to include convolver");
                this.reconnectAudioGraph();
            }
        } catch (err) {
            console.error("[Equalizer.loadImpulseResponse] decodeAudioData failed for IR:", err);
            throw err;
        }
    }

    /** Reconnect audio graph to include/exclude convolver after IR load */
    private reconnectAudioGraph(): void {
        if (!this.mediaSourceNode) {
            console.log("[Equalizer.reconnectAudioGraph] No mediaSourceNode, skipping reconnect");
            return;
        }

        console.log("[Equalizer.reconnectAudioGraph] Disconnecting old graph...");
        // Disconnect everything
        this.mediaSourceNode.disconnect();
        this.preamp.disconnect();
        for (let i = 0; i < this.filters.length; i++) {
            this.filters[i].disconnect();
        }
        this.convolver.disconnect();
        this.gainNode!.disconnect();

        console.log("[Equalizer.reconnectAudioGraph] Reconnecting with convolver...");
        // Reconnect with convolver in the chain
        this.mediaSourceNode.connect(this.preamp);
        this.preamp.connect(this.filters[0]);
        for (let i = 0; i < this.filters.length - 1; i++) {
            this.filters[i].connect(this.filters[i + 1]);
        }
        // Always include convolver now that IR is loaded
        this.filters[this.filters.length - 1].connect(this.convolver);
        this.convolver.connect(this.gainNode!);
        this.gainNode!.connect(this.ctx.destination);
        console.log("[Equalizer.reconnectAudioGraph] Graph reconnected with convolver included");
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
        console.log(":222",audioBuf);
        const rate = this.ctx.sampleRate; // Use hardware sample rate
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
preamp.gain.value =Math.pow(5, 12 / 20) // Try 1 instead of Math.pow(10, 12 / 20)

        // 4. Connect the chain
        source.connect(filters[0]);
        for (let i = 0; i < filters.length - 1; i++) {
            filters[i].connect(filters[i + 1]);
        }
        filters[filters.length - 1].connect(preamp);
        preamp.connect(convolver);
        convolver.connect(offlineCtx.destination);

        // 5. Start source and render
        source.start(0);
        const renderedBuffer = await offlineCtx.startRendering();

        return renderedBuffer;
    }

    /** Converts the rendered AudioBuffer into a WAV Blob and sets the audio.src. */
    private async switchToProcessedAudioMode(buffer: AudioBuffer, seekTime: number = 0): Promise<void> {
        const msn = 'mediaSession' in navigator;
        console.log("271",buffer, msn);
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
        console.log("iOS Debug: processedAudioUrl", url);
console.log("iOS Debug: sampleRate", buffer.sampleRate);
console.log("iOS Debug: audio element state", this.sourceElement.readyState, this.sourceElement.paused);

if (this.isIOSorSafari()) {
    this.sourceElement.pause();
    this.sourceElement.src = '';
    this.sourceElement.load();
    this.sourceElement.src = url;
    this.sourceElement.load();
    this.sourceElement.currentTime = seekTime; // <-- use passed time
    setTimeout(() => {
        this.sourceElement.play().catch(e => console.warn("Failed to auto-play processed audio:", e));
    }, 100);
} else {
    this.sourceElement.src = url;
    this.sourceElement.load();
    this.sourceElement.currentTime = seekTime; // <-- use passed time
    if (!this.sourceElement.paused) {
        this.sourceElement.play().catch(e => console.warn("Failed to auto-play processed audio:", e));
    }
}

        try {
            document.dispatchEvent(new CustomEvent('equalizer:processed-ready', { detail: { success: true } }));
        } catch (e) { }
    }
    // /** Converts the rendered AudioBuffer into a WAV Blob and sets the audio.src. */
    // private async switchToProcessedAudioMode(buffer: AudioBuffer): Promise<void> {
    //     // --- WAV Encoding Logic (As provided in previous answer) ---
    //     const bufferToWav = (b: AudioBuffer) => {
    //         const numOfChan = b.numberOfChannels, length = b.length * numOfChan * 2 + 44, buffer = new ArrayBuffer(length), view = new DataView(buffer), channels = [], sampleRate = b.sampleRate;
    //         let offset = 0, i = 0, l = 0;
    //         const writeString = (s: string) => { for (i = 0; i < s.length; i++) { view.setUint8(offset + i, s.charCodeAt(i)); } };
    //         // RIFF header
    //         writeString('RIFF'); offset += 4; view.setUint32(offset, 36 + length - 44, true); offset += 4; writeString('WAVE'); offset += 4;
    //         // FMT sub-chunk
    //         writeString('fmt '); offset += 4; view.setUint32(offset, 16, true); offset += 4; view.setUint16(offset, 1, true); offset += 2; view.setUint16(offset, numOfChan, true); offset += 2; view.setUint32(offset, sampleRate, true); offset += 4; view.setUint32(offset, sampleRate * numOfChan * 2, true); offset += 4; view.setUint16(offset, numOfChan * 2, true); offset += 2; view.setUint16(offset, 16, true); offset += 2;
    //         // Data sub-chunk
    //         writeString('data'); offset += 4; view.setUint32(offset, length - offset, true); offset += 4;
    //         // Write PCM data
    //         for (i = 0; i < numOfChan; i++) { channels.push(b.getChannelData(i)); }
    //         const multiplier = 32767;
    //         while (l < b.length) {
    //             for (i = 0; i < numOfChan; i++) {
    //                 let sample = channels[i][l] * multiplier;
    //                 sample = Math.max(-multiplier, Math.min(multiplier, sample));
    //                 view.setInt16(offset, sample, true);
    //                 offset += 2;
    //             }
    //             l++;
    //         }
    //         return new Blob([view], { type: 'audio/wav' });
    //     };
    //     // --- End WAV Encoding Logic ---

    //     const wavBlob = bufferToWav(buffer);

    //     if (this.processedAudioUrl) {
    //         URL.revokeObjectURL(this.processedAudioUrl);
    //     }

    //     const url = URL.createObjectURL(wavBlob);
    //     this.processedAudioUrl = url;

    //     // Reset position before changing src
    //     this.sourceElement.currentTime = 0;

    //     // IMPORTANT: Change the source to the processed WAV file (allows background play)
    //     this.sourceElement.src = url;
    //     this.sourceElement.load();

    //     // Resume playback if it was paused before the process began
    //     if (!this.sourceElement.paused) {
    //         this.sourceElement.play().catch(e => console.warn("Failed to auto-play processed audio:", e));
    //     }

    //     try {
    //         document.dispatchEvent(new CustomEvent('equalizer:processed-ready', { detail: { success: true } }));
    //     } catch (e) { }
    // }

    /**
     * Public entry point: Attempts to render the audio offline, falling back to original source on failure.
     */
    public async renderAndPlayProcessedAudio(): Promise<void> {
        if (this.realtimeEnabled) {
            console.log("Real-time processing is enabled, skipping offline render.");
            // If real-time is enabled, we assume the audio is already playing through the graph.
            // Dispatch a success event as no re-processing is needed.
            try {
                document.dispatchEvent(new CustomEvent('equalizer:processed-ready', { detail: { success: true } }));
            } catch (e) { /* ignore */ }
            return;
        }

        // Ensure the audio element has its *original* source set so we can fetch it.
        // NOTE: This assumes player.ts has set the initial audio.src right before calling initEQ.
        // console.log("311",this.sourceElement,this);
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
console.log(":424:",processedBuffer);
// 2. Convert to WAV Blob and update the player source
await this.switchToProcessedAudioMode(processedBuffer, (window as any).lastAudioTime || 0);
// console.log(":424:",);

            console.log("Offline processing successful. Playing processed WAV.");

        } catch (error) {
            console.error("[EQ FATAL] Offline processing failed. Falling back to original audio source.", error);

            // 3. Fallback to original behavior (must restore original src)
            this.sourceElement.src = this.originalAudioSrc;
            this.sourceElement.load();
            this.processedAudioUrl = null;

            try {
                document.dispatchEvent(new CustomEvent('equalizer:processed-ready', { detail: { success: false, error: String(error) } }));
            } catch (e) { }
        }
    }

    // Use only 8-band names (no legacy/overlapping names)
    private static bandMap: { [key: string]: number } = {
        lowshelf: 0,
        lowMid: 1,
        midLow: 2,
        mid: 3,
        midHigh: 4,
        highMid: 5,
        high: 6,
        highshelf: 7
    };

    // Set band gain for any band by name or index
    setBandGain(band: string | number, gain: number) {
        let idx: number;
        if (typeof band === 'number') {
            idx = band;
        } else {
            idx = Equalizer.bandMap[band];
            if (idx === undefined) throw new Error(`Unknown band: ${band}`);
        }
        if (this.filters[idx]) {
            const oldGain = this.filters[idx].gain.value;
            this.filters[idx].gain.value = gain;
            console.log(`[Equalizer.setBandGain] Band '${band}' (index: ${idx}) - Old gain: ${oldGain}, New gain: ${gain}, Realtime: ${this.realtimeEnabled}`);
            console.log(`[Equalizer.setBandGain] Filter type: ${this.filters[idx].type}, Freq: ${this.filters[idx].frequency.value}Hz, Q: ${this.filters[idx].Q.value}`);
        } else {
            console.warn(`[Equalizer.setBandGain] Filter at index ${idx} not found`);
        }
        // If realtime processing is enabled, changes take effect immediately.
        // Otherwise, changes will take effect on the next renderAndPlayProcessedAudio call.
    }

    // Get frequency response for any band by name or index
    getFrequencyResponse(band: string | number, frequencies: Float32Array): Float32Array {
        let idx: number;
        if (typeof band === 'number') {
            idx = band;
        } else {
            idx = Equalizer.bandMap[band];
            if (idx === undefined) throw new Error(`Unknown band: ${band}`);
        }
        const mag = new Float32Array(frequencies.length);
        const phase = new Float32Array(frequencies.length);

        // Create a new Float32Array from the existing data to ensure it's backed by ArrayBuffer
        const frequenciesArrayBuffer = new Float32Array(frequencies);

        this.filters[idx].getFrequencyResponse(frequenciesArrayBuffer, mag, phase);
        return mag;
    }

    /** DEBUG: Log the current state of the audio chain */
    public debugAudioChain(): void {
        console.log("\n=== AUDIO CHAIN DEBUG INFO ===");
        console.log("Realtime Enabled:", this.realtimeEnabled);
        console.log("AudioContext State:", this.ctx.state);
        console.log("MediaSourceNode Connected:", this.mediaSourceNode !== null);
        console.log("Gain Node Value:", this.gainNode?.gain.value);
        console.log("Preamp Gain:", this.preamp.gain.value);
        console.log("IR Buffer Loaded:", this.irBuffer !== null);
        console.log("Convolver Buffer Set:", this.convolver.buffer !== null);
        console.log("Source Element Playing:", !this.sourceElement.paused);
        console.log("Source Element Volume:", this.sourceElement.volume);
        console.log("Source Element Playback Rate:", this.sourceElement.playbackRate);
        console.log("Source Element Src:", this.sourceElement.src);
        console.log("\nFilter Gains:");
        this.filters.forEach((filter, idx) => {
            const bandName = Object.keys(Equalizer.bandMap).find(key => Equalizer.bandMap[key] === idx) || `Band ${idx}`;
            console.log(`  ${bandName}: ${filter.gain.value}dB (Type: ${filter.type}, Freq: ${filter.frequency.value}Hz)`);
        });
        console.log("==============================\n");
    }
}