
export async function separateAudio(audioUrl: string): Promise<{ vocals: string, instrumental: string }> {
    const response = await fetch(audioUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioCtx = new AudioContext();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);
    const length = audioBuffer.length;
    const sampleRate = audioBuffer.sampleRate;

    // Center Channel Extraction / Removal logic
    // Instrumental: L - R (removes center vocals)
    // Vocals: (L + R) / 2 - (L - R) / 2 (approximately extracts center)
    
    const instrumentalLeft = new Float32Array(length);
    const instrumentalRight = new Float32Array(length);
    const vocalsLeft = new Float32Array(length);
    const vocalsRight = new Float32Array(length);

    for (let i = 0; i < length; i++) {
        const l = left[i];
        const r = right[i];
        
        // Instrumental (OOPS - Out of Phase Stereo)
        // This removes everything panned dead center
        const side = l - r;
        instrumentalLeft[i] = side;
        instrumentalRight[i] = -side; // Keep it out of phase for better "width" or just use side

        // Vocals (Center Channel Extraction)
        // Mid = (L + R)
        // We subtract the "Side" from the "Mid" to get the "Center"
        const mid = (l + r) / 2;
        const center = mid - Math.abs(side) / 2; // Simple approximation
        
        vocalsLeft[i] = center;
        vocalsRight[i] = center;
    }

    // Apply a simple bandpass filter to the vocals (roughly 300Hz - 3400Hz)
    // This is a very basic RC filter implementation for demonstration
    // In a real app, you'd use a BiquadFilterNode or a better DSP algorithm
    
    const lp_alpha = 0.5; // Low pass
    const hp_alpha = 0.5; // High pass
    let lp_prev = 0;
    let hp_prev = 0;
    let hp_out = 0;

    for (let i = 0; i < length; i++) {
        // High pass
        hp_out = hp_alpha * (hp_out + vocalsLeft[i] - hp_prev);
        hp_prev = vocalsLeft[i];
        
        // Low pass
        lp_prev = lp_prev + lp_alpha * (hp_out - lp_prev);
        
        vocalsLeft[i] = lp_prev;
        vocalsRight[i] = lp_prev;
    }
    
    const vocalsBlob = bufferToWav(vocalsLeft, vocalsRight, sampleRate);
    const instrumentalBlob = bufferToWav(instrumentalLeft, instrumentalRight, sampleRate);

    return {
        vocals: URL.createObjectURL(vocalsBlob),
        instrumental: URL.createObjectURL(instrumentalBlob)
    };
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
