import { Demucs, Models, CompleteEvent } from '../demucs/demucs';

let demucs: Demucs | null = null;

export async function initDemucs() {
    if (demucs) return;
    // Assuming models and worker are in /demucs/
    demucs = new Demucs(Models.FourStems, '/demucs/worker.js', '/demucs/models/');
    return new Promise<void>((resolve) => {
        demucs?.addEventListener('ready', () => {
            console.log('Demucs is ready');
            resolve();
        });
    });
}

export async function separateAudio(audioUrl: string): Promise<{ vocals: string, instrumental: string }> {
    await initDemucs();

    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const leftChannel = audioBuffer.getChannelData(0);
    const rightChannel = audioBuffer.getChannelData(1);

    return new Promise((resolve) => {
        const onComplete = (e: any) => {
            const event = e as CompleteEvent;
            const stems = event.audio; // [drums, bass, other, vocals]

            const drums = stems[0];
            const bass = stems[1];
            const other = stems[2];
            const vocals = stems[3];

            // Mix instrumental (drums + bass + other)
            const instrumentalLeft = new Float32Array(drums.left.length);
            const instrumentalRight = new Float32Array(drums.right.length);

            for (let i = 0; i < drums.left.length; i++) {
                instrumentalLeft[i] = drums.left[i] + bass.left[i] + other.left[i];
                instrumentalRight[i] = drums.right[i] + bass.right[i] + other.right[i];
            }

            const vocalsBlob = bufferToWav(vocals.left, vocals.right, 44100);
            const instrumentalBlob = bufferToWav(instrumentalLeft, instrumentalRight, 44100);

            demucs?.removeEventListener(completeListener);
            
            resolve({
                vocals: URL.createObjectURL(vocalsBlob),
                instrumental: URL.createObjectURL(instrumentalBlob)
            });
        };

        const completeListener = demucs?.addEventListener('complete', onComplete);
        demucs?.process([leftChannel, rightChannel]);
    });
}

function bufferToWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
    const numOfChan = 2, length = left.length * numOfChan * 2 + 44, buffer = new ArrayBuffer(length), view = new DataView(buffer);
    let offset = 0, i = 0;
    const writeString = (s: string) => { for (i = 0; i < s.length; i++) { view.setUint8(offset + i, s.charCodeAt(i)); } };
    
    writeString('RIFF'); offset += 4;
    view.setUint32(offset, 36 + length - 44, true); offset += 4;
    writeString('WAVE'); offset += 4;
    writeString('fmt '); offset += 4;
    view.setUint32(offset, 16, true); offset += 4;
    view.setUint16(offset, 1, true); offset += 2;
    view.setUint16(offset, numOfChan, true); offset += 2;
    view.setUint32(offset, sampleRate, true); offset += 4;
    view.setUint32(offset, sampleRate * numOfChan * 2, true); offset += 4;
    view.setUint16(offset, numOfChan * 2, true); offset += 2;
    view.setUint16(offset, 16, true); offset += 2;
    writeString('data'); offset += 4;
    view.setUint32(offset, length - offset, true); offset += 4;

    for (i = 0; i < left.length; i++) {
        let sLeft = Math.max(-1, Math.min(1, left[i]));
        view.setInt16(offset, sLeft < 0 ? sLeft * 0x8000 : sLeft * 0x7FFF, true);
        offset += 2;
        let sRight = Math.max(-1, Math.min(1, right[i]));
        view.setInt16(offset, sRight < 0 ? sRight * 0x8000 : sRight * 0x7FFF, true);
        offset += 2;
    }
    return new Blob([view], { type: 'audio/wav' });
}
