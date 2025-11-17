// --- Equalizer.ts ---
export class Equalizer {
    private ctx: AudioContext;
    private sourceElement: HTMLAudioElement;
    private mediaSourceNode: MediaElementAudioSourceNode | null = null;

    private filters: BiquadFilterNode[];
    private convolver: ConvolverNode;
    private preamp: GainNode;
    private irBuffer: AudioBuffer | null = null;

    private pitchSemitones: number = 0.41;
    private LOG_PREFIX = '🎵 YTIFY_EQ';

    constructor(audio: HTMLAudioElement) {
        this.sourceElement = audio;

        try {
            this.sourceElement.crossOrigin = 'anonymous';
        } catch (e) {
            // ignore
        }

        this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();

        // --- Real-time Filter Setup ---
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

        audio.addEventListener('play', () => {
            this.unlockAudioContext();
        });
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
        return this.ctx.state === 'running';
    }

    public async unlockAudioContext(): Promise<void> {
        console.log(`${this.LOG_PREFIX} unlockAudioContext() called, ctx.state: ${this.ctx.state}`);

        if (this.ctx.state === 'running') {
            console.log(`${this.LOG_PREFIX} Context already running`);
            return;
        }

        try {
            await this.ctx.resume();
            console.log(`${this.LOG_PREFIX} ✅ Context resumed, state: ${this.ctx.state}`);
            await this.primeSilentBuffer();
            return;
        } catch (e) {
            console.warn(`${this.LOG_PREFIX} Resume failed:`, e);
        }

        if (this.ctx.state === 'suspended') {
            await new Promise<void>((resolve) => {
                const onGesture = async () => {
                    try {
                        await this.ctx.resume();
                        await this.primeSilentBuffer();
                    } catch (err) {
                        console.warn(`${this.LOG_PREFIX} Context resume after gesture failed:`, err);
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
        try {
            if (this.ctx.state !== 'running') {
                await this.ctx.resume();
            }
            const buf = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.connect(this.ctx.destination);
            src.start(0);
            src.stop(0.01);
        } catch (e) {
            console.warn(`${this.LOG_PREFIX} Priming silent buffer failed:`, e);
        }
    }

    public async ensureMediaSource(): Promise<boolean> {
        console.log(`${this.LOG_PREFIX} ensureMediaSource() called`);

        if (this.mediaSourceNode) {
            console.log(`${this.LOG_PREFIX} MediaElementAudioSourceNode already exists`);
            return true;
        }

        if (!this.ctx) {
            console.error(`${this.LOG_PREFIX} No AudioContext`);
            return false;
        }

        try {
            console.log(`${this.LOG_PREFIX} Creating MediaElementAudioSourceNode...`);
            this.mediaSourceNode = this.ctx.createMediaElementSource(this.sourceElement);
            console.log(`${this.LOG_PREFIX} ✅ MediaElementAudioSourceNode created`);
            return true;
        } catch (e) {
            console.error(`${this.LOG_PREFIX} ❌ Failed to create MediaElementAudioSourceNode:`, e);
            return false;
        }
    }

    public async loadImpulseResponse(url: string) {
        console.log(`${this.LOG_PREFIX} loadImpulseResponse("${url}") called`);

        if (!this.ctx) {
            console.warn(`${this.LOG_PREFIX} AudioContext not available`);
            return;
        }

        try {
            const resp = await fetch(url);
            if (!resp.ok) {
                throw new Error(`IR Fetch failed: HTTP ${resp.status}`);
            }

            const arrayBuffer = await resp.arrayBuffer();
            console.log(`${this.LOG_PREFIX} ✅ IR file fetched`);

            try {
                const buf = await this.ctx.decodeAudioData(arrayBuffer);
                console.log(`${this.LOG_PREFIX} ✅ IR decoded: ${buf.numberOfChannels}ch, ${buf.length} samples`);

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
                this.convolver.buffer = irToUse;
                console.log(`${this.LOG_PREFIX} ✅ IR assigned to convolver`);
            } catch (err) {
                console.error(`${this.LOG_PREFIX} ❌ decodeAudioData failed:`, err);
            }
        } catch (err) {
            console.error(`${this.LOG_PREFIX} ❌ loadImpulseResponse failed:`, err);
        }
    }

    // 🔴 NEW: Connect real-time Web Audio chain
    public async connectChain(useConvolver: boolean = true): Promise<void> {
        console.log(`${this.LOG_PREFIX} connectChain(useConvolver=${useConvolver}) called`);

        if (!this.ctx || !this.mediaSourceNode) {
            console.error(`${this.LOG_PREFIX} ❌ Cannot connect chain: ctx=${!!this.ctx}, mediaSourceNode=${!!this.mediaSourceNode}`);
            return;
        }

        try {
            console.log(`${this.LOG_PREFIX} Disconnecting existing connections...`);
            try { this.mediaSourceNode.disconnect(); } catch {}
            this.filters.forEach((f, i) => {
                try { f?.disconnect(); } catch {}
            });
            try { this.preamp.disconnect(); } catch {}
            try { this.convolver.disconnect(); } catch {}

            console.log(`${this.LOG_PREFIX} Connecting new chain...`);
            this.mediaSourceNode.connect(this.filters[0]);
            console.log(`${this.LOG_PREFIX} ✅ mediaSourceNode → filter[0]`);

            this.filters[0].connect(this.filters[1]);
            console.log(`${this.LOG_PREFIX} ✅ filter[0] → filter[1]`);

            this.filters[1].connect(this.filters[2]);
            console.log(`${this.LOG_PREFIX} ✅ filter[1] → filter[2]`);

            if (useConvolver && this.irBuffer && this.convolver && this.preamp) {
                this.preamp.gain.value = Math.pow(10, 12 / 20);
                this.filters[2].connect(this.preamp);
                console.log(`${this.LOG_PREFIX} ✅ filter[2] → preamp`);

                this.preamp.connect(this.convolver);
                console.log(`${this.LOG_PREFIX} ✅ preamp → convolver`);

                this.convolver.connect(this.ctx.destination);
                console.log(`${this.LOG_PREFIX} ✅ convolver → destination`);
            } else {
                this.filters[2].connect(this.ctx.destination);
                console.log(`${this.LOG_PREFIX} ✅ filter[2] → destination`);
            }

            console.log(`${this.LOG_PREFIX} ✅ Chain connected successfully`);
        } catch (e) {
            console.error(`${this.LOG_PREFIX} ❌ Failed to connect chain:`, e);
        }
    }

    public setBandGain(band: 'bass' | 'mid' | 'treble', gain: number) {
        if (band === 'bass') this.filters[0].gain.value = gain;
        else if (band === 'mid') this.filters[1].gain.value = gain;
        else if (band === 'treble') this.filters[2].gain.value = gain;
        console.log(`${this.LOG_PREFIX} ${band} gain set to ${gain}`);
    }

    public getFrequencyResponse(band: 'bass' | 'mid' | 'treble', frequencies: Float32Array): Float32Array {
        const mag = new Float32Array(frequencies.length);
        const phase = new Float32Array(frequencies.length);
        const idx = band === 'bass' ? 0 : band === 'mid' ? 1 : 2;
        this.filters[idx].getFrequencyResponse(frequencies, mag, phase);
        return mag;
    }

    public getPitch(): number {
        return this.pitchSemitones;
    }

    public setPitch(semitones: number): void {
        this.pitchSemitones = semitones;
        this.sourceElement.playbackRate = Math.pow(2, semitones / 12);
        console.log(`${this.LOG_PREFIX} Pitch set to ${semitones} semitones (playbackRate: ${this.sourceElement.playbackRate})`);
    }

    public resetPitch(): void {
        this.setPitch(0);
    }
}