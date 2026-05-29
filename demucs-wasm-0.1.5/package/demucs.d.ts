import { EventEmitter } from './eventemitter.js';
export declare class ProgressEvent extends Event {
    progress: number;
    constructor(progress: number, init?: EventInit);
}
export declare class LogEvent extends Event {
    message: number;
    constructor(message: number, init?: EventInit);
}
export declare class CompleteEvent extends Event {
    audio: {
        left: Float32Array;
        right: Float32Array;
    }[];
    constructor(audio: {
        left: Float32Array;
        right: Float32Array;
    }[], init?: EventInit);
}
export declare const Models: {
    FourStems: string;
    SixStems: string;
    Karaoke: string;
    Bass: string;
    Drums: string;
    Vocals: string;
};
export declare class Demucs extends EventEmitter {
    protected static SAMPLE_RATE: number;
    protected static OVERLAP_S: number;
    protected static OVERLAP_SAMPLES: number;
    protected static NUM_CHANNELS: number;
    protected worker: Worker;
    protected modelPath: string;
    constructor(selectedModel: string, workerURI: string, modelPath: string);
    process(file: File | Float32Array[]): Promise<void>;
    protected init(selectedModel: string): Promise<void>;
    protected fetchAndCacheFiles(model: string): Promise<ArrayBuffer[]>;
    protected processAudioSegments(left: Float32Array, right: Float32Array): void;
    protected segmentWaveform(left: Float32Array, right: Float32Array, channelCount: number): Float32Array[][];
}
//# sourceMappingURL=demucs.d.ts.map