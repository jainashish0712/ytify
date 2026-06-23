import { Jungle } from '../modules/jungle.js';
import { SoundTouch } from 'soundtouchjs';

// --- Equalizer.ts ---
// This class manages audio equalization and pitch shifting, supporting both
// real-time processing via Web Audio API and offline pre-processing for compatibility.
export class Equalizer {
    private ctx: AudioContext;
    private sourceElement: HTMLAudioElement;

    private filters: BiquadFilterNode[];
    private reverbNode: ConvolverNode;
    private reverbWetGain: GainNode;
    private reverbDryGain: GainNode;
    private reverbTime: number = 0.01;
    private reverbDecay: number = 0.01;
    private reverbMix: number = 0;
    private lpfNode: BiquadFilterNode;
    private preamp: GainNode;
    private jungle: any; // Pitch shifter node
    private soundtouch: any;
    private stNode: ScriptProcessorNode | null = null;
    private cachedAudioBuffer: AudioBuffer | null = null;
    
    // Convolver properties
    private convolverNode: ConvolverNode;
    private convolverWetGain: GainNode;
    private convolverDryGain: GainNode;
    private convolverInputNode: GainNode;
    private convolverMix: number = 0;
    private originalAudioSrc: string = ''; // New: Stores the initial audio URL
    public processedAudioUrl: string | null = null; // New: Stores the Object URL of the processed WAV

    private realtimeEnabled: boolean = false;
    private mediaSourceNode: MediaElementAudioSourceNode | null = null;
    public gainNode: GainNode | null = null; // Made public

    public vocalReductionActive: boolean = false;
    public vocalVolume: number = 1.0;
    private vocalSplitter: ChannelSplitterNode | null = null;
    private vocalMerger: ChannelMergerNode | null = null;
    private vocalInvertGain: GainNode | null = null;
    private vocalSumNode: GainNode | null = null;
    public vocalOriginalGainNode: GainNode | null = null;
    public vocalReductionGainNode: GainNode | null = null;
    public vocalInputNode: GainNode | null = null;
    public vocalOutputNode: GainNode | null = null;

    private pitchSemitones: number = 0; // Using your configured default

    constructor(audio: HTMLAudioElement) {
        // const { index, invidious } = store.api;

        //


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

        // IMPORTANT: Unlock on first user gesture to enable real-time audio playback
        this.setupAudioContextUnlock();

        // --- Filter Setup (Used for the Offline Context) ---
        this.filters = Array.from({ length: 16 }, () => this.ctx.createBiquadFilter());
        // Band definitions
        const bandDefs = [
            { type: 'lowshelf',  freq: 32 },
            { type: 'peaking',   freq: 64 },
            { type: 'peaking',   freq: 125 },
            { type: 'peaking',   freq: 250 },
            { type: 'peaking',   freq: 500 },
            { type: 'peaking',   freq: 1000 },
            { type: 'peaking',   freq: 1500 },
            { type: 'peaking',   freq: 2000 },
            { type: 'peaking',   freq: 3000 },
            { type: 'peaking',   freq: 4000 },
            { type: 'peaking',   freq: 6000 },
            { type: 'peaking',   freq: 8000 },
            { type: 'peaking',   freq: 10000 },
            { type: 'peaking',   freq: 12000 },
            { type: 'peaking',   freq: 14000 },
            { type: 'highshelf', freq: 16000 },
        ];
        for (let i = 0; i < this.filters.length; i++) {
            this.filters[i].type = bandDefs[i].type as BiquadFilterType;
            this.filters[i].frequency.value = bandDefs[i].freq;
            this.filters[i].Q.value = 1;
        }

        this.preamp = this.ctx.createGain();
        this.preamp.gain.value = 6; // Changed from 5 to 1 for debugging

        // Vocal Reduction Setup
        this.vocalInputNode = this.ctx.createGain();
        this.vocalOutputNode = this.ctx.createGain();
        this.vocalSplitter = this.ctx.createChannelSplitter(2);
        this.vocalMerger = this.ctx.createChannelMerger(2);
        
        this.vocalInvertGain = this.ctx.createGain();
        this.vocalInvertGain.gain.value = -1; // Invert phase of right channel
        
        this.vocalSumNode = this.ctx.createGain();
        
        this.vocalOriginalGainNode = this.ctx.createGain();
        this.vocalOriginalGainNode.gain.value = 1.0; // Start with original signal
        
        this.vocalReductionGainNode = this.ctx.createGain();
        this.vocalReductionGainNode.gain.value = 0.0; // Start with no reduction signal

        this.gainNode = this.ctx.createGain(); // Initialize the gainNode


        // Ensure context is resumed / unlocked on play
        audio.addEventListener('play', () => {

            this.unlockAudioContext();
        });

        this.jungle = new Jungle(this.ctx);

        this.soundtouch = new SoundTouch();
        this.stNode = this.ctx.createScriptProcessor(4096, 2, 2);
        this.stNode.onaudioprocess = (e) => {
            const inputL = e.inputBuffer.getChannelData(0);
            const inputR = e.inputBuffer.getChannelData(1);
            const outputL = e.outputBuffer.getChannelData(0);
            const outputR = e.outputBuffer.getChannelData(1);
            const frames = inputL.length;
            const interleaved = new Float32Array(frames * 2);
            for (let i = 0; i < frames; i++) {
                interleaved[i * 2] = inputL[i];
                interleaved[i * 2 + 1] = inputR[i];
            }
            this.soundtouch.inputBuffer.putSamples(interleaved, 0, frames);
            this.soundtouch.process();
            
            const outFrames = this.soundtouch.outputBuffer.frameCount;
            const framesToExtract = Math.min(frames, outFrames);
            const outInterleaved = new Float32Array(framesToExtract * 2);
            if (framesToExtract > 0) {
                this.soundtouch.outputBuffer.receiveSamples(outInterleaved, framesToExtract);
            }
            for (let i = 0; i < framesToExtract; i++) {
                outputL[i] = outInterleaved[i * 2];
                outputR[i] = outInterleaved[i * 2 + 1];
            }
            for (let i = framesToExtract; i < frames; i++) {
                outputL[i] = 0;
                outputR[i] = 0;
            }
        };

        this.reverbNode = this.ctx.createConvolver();
        this.reverbWetGain = this.ctx.createGain();
        this.reverbDryGain = this.ctx.createGain();
        this.reverbWetGain.gain.value = 0;
        this.reverbDryGain.gain.value = 1;
        this.buildReverbImpulse();

        this.convolverNode = this.ctx.createConvolver();
        this.convolverWetGain = this.ctx.createGain();
        this.convolverDryGain = this.ctx.createGain();
        this.convolverInputNode = this.ctx.createGain();
        this.convolverWetGain.gain.value = 0;
        this.convolverDryGain.gain.value = 1;

        this.lpfNode = this.ctx.createBiquadFilter();
        this.lpfNode.type = 'lowpass';
        this.lpfNode.frequency.value = 22050;
        this.lpfNode.Q.value = 1;
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

        if (enabled === this.realtimeEnabled) {

            return; // No change needed
        }

        this.realtimeEnabled = enabled;


        if (enabled) {
            // Ensure context is running before connecting the audio graph

            this.unlockAudioContext();

            // Enable real-time processing
            if (!this.mediaSourceNode) {

                // IMPORTANT: Create mediaSourceNode BEFORE muting to ensure proper capture
                this.mediaSourceNode = this.ctx.createMediaElementSource(this.sourceElement);


                // Connect the graph immediately after creating mediaSourceNode
                this.reconnectAudioGraph();
            }
        } else {
            // Disable real-time processing

            if (this.mediaSourceNode) {

                // Disconnect the graph
                this.mediaSourceNode.disconnect();
                this.stNode?.disconnect();
                this.preamp.disconnect();
                for (let i = 0; i < this.filters.length; i++) {
                    this.filters[i].disconnect();
                }
                this.reverbNode.disconnect();
                this.reverbWetGain.disconnect();
                this.reverbDryGain.disconnect();
                this.convolverInputNode.disconnect();
                this.convolverNode.disconnect();
                this.convolverWetGain.disconnect();
                this.convolverDryGain.disconnect();
                this.gainNode!.disconnect();

            }


        }
    }

    // --- VOCAL REDUCTION METHODS ---
    public setVocalReductionActive(active: boolean): void {
        this.vocalReductionActive = active;
        if (active) {
            this.setVocalVolume(this.vocalVolume);
        } else {
            if (this.vocalOriginalGainNode && this.vocalReductionGainNode) {
                this.vocalOriginalGainNode.gain.setValueAtTime(1.0, this.ctx.currentTime);
                this.vocalReductionGainNode.gain.setValueAtTime(0.0, this.ctx.currentTime);
            }
        }
    }

    public setVocalVolume(volume: number): void {
        this.vocalVolume = Math.max(0, Math.min(1, volume)); // Clamp between 0 and 1
        if (this.vocalReductionActive && this.vocalOriginalGainNode && this.vocalReductionGainNode) {
            this.vocalOriginalGainNode.gain.setValueAtTime(this.vocalVolume, this.ctx.currentTime);
            this.vocalReductionGainNode.gain.setValueAtTime(1.0 - this.vocalVolume, this.ctx.currentTime);
        }
    }
    // --- END VOCAL REDUCTION METHODS ---

    // --- PITCH METHODS ---
    private semitonesToPlaybackRate(semitones: number): number {
        return Math.pow(2, semitones / 12);
    }

    public setPitch(semitones: number): void {
        this.pitchSemitones = semitones;

        const pitchMult = Math.pow(2, semitones / 12) - 1;

        if (this.jungle) {
            this.jungle.setPitchOffset(pitchMult);
        }

        if (this.soundtouch) {
            this.soundtouch.pitch = this.semitonesToPlaybackRate(semitones);
        }

        if (!this.realtimeEnabled) {
            // WARNING: This only affects the pitch of the NEXT call to renderAndPlayProcessedAudio.
            console.warn(`[Equalizer.setPitch] Real-time disabled. Pitch will apply on next offline render.`);
        }
    }

    public getPlaybackRate(): number {
        return this.semitonesToPlaybackRate(this.pitchSemitones);
    }

    public getPitch(): number { return this.pitchSemitones; }
    public getBandGains(): number[] {
        return this.filters.map(f => f.gain.value);
    }
    public resetPitch(): void { this.setPitch(0); }
    // --- END PITCH METHODS ---

    // --- REVERB METHODS ---
    private buildReverbImpulse(): void {
        const length = this.ctx.sampleRate * this.reverbTime;
        const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        const decay = this.reverbDecay;

        for (let i = 0; i < length; i++) {
            left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }

        this.reverbNode.buffer = impulse;
    }

    public setReverbTime(time: number): void {
        this.reverbTime = time;
        this.buildReverbImpulse();
    }

    public setReverbDecay(decay: number): void {
        this.reverbDecay = decay;
        this.buildReverbImpulse();
    }

    public setReverbMix(mix: number): void {
        this.reverbMix = mix;
        this.reverbDryGain.gain.setValueAtTime(1 - mix, this.ctx.currentTime);
        this.reverbWetGain.gain.setValueAtTime(mix, this.ctx.currentTime);
    }
    // --- END REVERB METHODS ---

    // --- LPF METHODS ---
    public setLPFFrequency(freq: number): void {
        this.lpfNode.frequency.setValueAtTime(freq, this.ctx.currentTime);
    }

    public setLPFPeak(peak: number): void {
        this.lpfNode.Q.setValueAtTime(peak, this.ctx.currentTime);
    }
    // --- END LPF METHODS ---

    // --- UTILITY METHODS (Keep these as-is) ---
    private isIOSorSafari(): boolean { /* ... logic as before ... */
        const ua = navigator.userAgent;
        const isIOS = /iP(hone|ad|od)/.test(ua);
        const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
        return isIOS || isSafari;
    }
    public requiresUserGesture(): boolean { return this.isIOSorSafari(); }

    public reloadForIOSBug(): void {
        if (!this.requiresUserGesture() || !this.mediaSourceNode) return;
        
        // On iOS Safari, changing the src of an audio element often breaks the MediaElementAudioSourceNode's connection.
        // Reconnecting it forces Safari to re-evaluate the audio routing.
        try {
            this.mediaSourceNode.disconnect();
            this.reconnectAudioGraph();
            if (this.ctx.state !== 'running') {
                this.ctx.resume().catch(() => {});
            }
        } catch (e) {
            console.warn('[Equalizer] reloadForIOSBug failed', e);
        }
    }

    public isContextRunning(): boolean { return this.ctx.state === 'running'; }
    public async unlockAudioContext(): Promise<void> { /* ... logic as before ... */
        if (this.ctx.state === 'running') {

            return;
        }


        // if (this.ctx.state === 'running') return;
        try {

            await this.ctx.resume();

            await this.primeSilentBuffer();
            return;
        } catch (e) {

        }

        if (this.ctx.state === 'suspended') {

            await new Promise<void>((resolve) => {
                const onGesture = async () => {

                    try {
                        await this.ctx.resume();

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

        try {
            if (this.ctx.state !== 'running') {

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

}
    }

    /** Reconnect audio graph */
    private reconnectAudioGraph(): void {
        if (!this.mediaSourceNode) {

            return;
        }


        // Disconnect everything
        this.mediaSourceNode.disconnect();
        this.vocalInputNode!.disconnect();
        this.vocalSplitter!.disconnect();
        this.vocalInvertGain!.disconnect();
        this.vocalSumNode!.disconnect();
        this.vocalMerger!.disconnect();
        this.vocalOriginalGainNode!.disconnect();
        this.vocalReductionGainNode!.disconnect();
        this.vocalOutputNode!.disconnect();
        this.stNode?.disconnect();
        this.preamp.disconnect();
        for (let i = 0; i < this.filters.length; i++) {
            this.filters[i].disconnect();
        }
        this.reverbNode.disconnect();
        this.reverbWetGain.disconnect();
        this.reverbDryGain.disconnect();
        this.convolverInputNode.disconnect();
        this.convolverNode.disconnect();
        this.convolverWetGain.disconnect();
        this.convolverDryGain.disconnect();
        this.lpfNode.disconnect();
        this.gainNode!.disconnect();


        // Vocal reduction circuit
        this.mediaSourceNode.connect(this.vocalInputNode!);
        this.vocalInputNode!.connect(this.vocalSplitter!);
        this.vocalInputNode!.connect(this.vocalOriginalGainNode!);
        
        this.vocalSplitter!.connect(this.vocalSumNode!, 0); // L
        this.vocalSplitter!.connect(this.vocalInvertGain!, 1); // R
        this.vocalInvertGain!.connect(this.vocalSumNode!); // L - R
        
        this.vocalSumNode!.connect(this.vocalMerger!, 0, 0);
        this.vocalSumNode!.connect(this.vocalMerger!, 0, 1);
        
        this.vocalMerger!.connect(this.vocalReductionGainNode!);
        
        this.vocalOriginalGainNode!.connect(this.vocalOutputNode!);
        this.vocalReductionGainNode!.connect(this.vocalOutputNode!);

        this.vocalOutputNode!.connect(this.stNode!);
        this.stNode!.connect(this.preamp);

        this.preamp.connect(this.filters[0]);
        for (let i = 0; i < this.filters.length - 1; i++) {
            this.filters[i].connect(this.filters[i + 1]);
        }

        const lastFilter = this.filters[this.filters.length - 1];
        lastFilter.connect(this.lpfNode);

        // Reverb chain (now connected after LPF)
        this.lpfNode.connect(this.reverbDryGain);
        this.lpfNode.connect(this.reverbNode);
        this.reverbNode.connect(this.reverbWetGain);

        this.reverbDryGain.connect(this.convolverInputNode);
        this.reverbWetGain.connect(this.convolverInputNode);

        this.convolverInputNode.connect(this.convolverDryGain);
        this.convolverInputNode.connect(this.convolverNode);
        this.convolverNode.connect(this.convolverWetGain);

        this.convolverDryGain.connect(this.gainNode!);
        this.convolverWetGain.connect(this.gainNode!);

        this.gainNode!.connect(this.ctx.destination);

    }

    // --- CONVOLVER METHODS ---
    public async setConvolverImpulse(url: string): Promise<void> {
        if (!url) {
            this.convolverNode.buffer = null;
            return;
        }

        try {
            await this.unlockAudioContext();
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to load impulse response: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            this.convolverNode.buffer = audioBuffer;
        } catch (error) {
            console.error('[Equalizer] Error loading convolver impulse:', error);
        }
    }

    public setConvolverMix(mix: number): void {
        this.convolverMix = mix;
        this.convolverDryGain.gain.setValueAtTime(1 - mix, this.ctx.currentTime);
        this.convolverWetGain.gain.setValueAtTime(mix, this.ctx.currentTime);
    }
    // --- END CONVOLVER METHODS ---

    /**
     * Renders the entire audio file through the EQ and Pitch pipeline offline.
     */
    private async renderAudioOffline(): Promise<AudioBuffer> {
        await this.prepareAudioBuffer();
        if (!this.cachedAudioBuffer) {
            throw new Error("Missing audio buffer for offline render.");
        }

        const audioBuf = this.cachedAudioBuffer;

        const rate = this.ctx.sampleRate; // Use hardware sample rate
        // Do not change length for pitch shift, as tempo remains the same
        const newLength = audioBuf.length;

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
        // Do NOT change playbackRate here to preserve tempo

        // Initialize Jungle for pitch shift
        const offlineJungle = new Jungle(offlineCtx);
        const pitchMult = Math.pow(2, this.pitchSemitones / 12) - 1;
        offlineJungle.setPitchOffset(pitchMult);

        // 3. Recreate the effect chain (using current filter settings)
        const filters = this.filters.map(f => {
            const clone = offlineCtx.createBiquadFilter();
            clone.type = f.type;
            clone.frequency.value = f.frequency.value;
            clone.Q.value = f.Q.value;
            clone.gain.value = f.gain.value; // Capture the current EQ gain
            return clone;
        });

        const preamp = offlineCtx.createGain();
        preamp.gain.value = Math.pow(5, 12 / 20); // Try 1 instead of Math.pow(10, 12 / 20)

        // 4. Connect the chain
        source.connect(offlineJungle.input);
        offlineJungle.output.connect(filters[0]);
        for (let i = 0; i < filters.length - 1; i++) {
            filters[i].connect(filters[i + 1]);
        }
        filters[filters.length - 1].connect(preamp);
        preamp.connect(offlineCtx.destination);

        // 5. Start source and render
        source.start(0);
        const renderedBuffer = await offlineCtx.startRendering();

        return renderedBuffer;
    }

    /** Converts the rendered AudioBuffer into a WAV Blob and sets the audio.src. */
    private async switchToProcessedAudioMode(buffer: AudioBuffer, seekTime: number = 0): Promise<void> {
        const msn = 'mediaSession' in navigator;

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
        console.log("Equalizer: processedAudioUrl", url);
        console.log("Equalizer: sampleRate", buffer.sampleRate);
        console.log("Equalizer: audio element state", this.sourceElement.readyState, this.sourceElement.paused);

        const wasPaused = this.sourceElement.paused;
        this.sourceElement.pause();
        this.sourceElement.src = url;
        this.sourceElement.load();
        this.sourceElement.currentTime = seekTime; // <-- use passed time

        if (!wasPaused) {
            setTimeout(() => {
                this.sourceElement.play().catch(e => console.warn("Failed to auto-play processed audio:", e));
                // Force update MediaSession after play starts
                if ('mediaSession' in navigator) {
                    import('../modules/mediaSession').then(m => m.updateMediaSessionPosition());
                }
            }, 100);
        } else {
            // Even if paused, update position to enable seekbar
            if ('mediaSession' in navigator) {
                import('../modules/mediaSession').then(m => m.updateMediaSessionPosition());
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

            // If real-time is enabled, we assume the audio is already playing through the graph.
            // Dispatch a success event as no re-processing is needed.
            try {
                document.dispatchEvent(new CustomEvent('equalizer:processed-ready', { detail: { success: true } }));
            } catch (e) { /* ignore */ }
            return;
        }

        // Ensure the audio element has its *original* source set so we can fetch it.
        // NOTE: This assumes player.ts has set the initial audio.src right before calling initEQ.
        //
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


        try {
            // 1. Render the effect chain (includes pitch and EQ settings)
            const processedBuffer = await this.renderAudioOffline();

// 2. Convert to WAV Blob and update the player source
await this.switchToProcessedAudioMode(processedBuffer, (window as any).lastAudioTime || 0);
//



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
        '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, '11': 11, '12': 12, '13': 13, '14': 14, '15': 15
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
            this.filters[idx].gain.setValueAtTime(gain, this.ctx.currentTime);
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













        this.filters.forEach((filter, idx) => {
            const bandName = Object.keys(Equalizer.bandMap).find(key => Equalizer.bandMap[key] === idx) || `Band ${idx}`;

        });

    }
}