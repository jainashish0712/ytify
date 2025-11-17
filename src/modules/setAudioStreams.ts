import { audio, playButton, qualityView, title } from "../lib/dom";
import { store } from "../lib/store";
import { handleXtags, preferredStream, proxyHandler } from "../lib/utils";
import { i18n } from "../scripts/i18n";
import { Equalizer } from '../lib/equalizer';

const LOG_PREFIX = '🎵 SETAUDIOSTREAMS';

console.log("7",store);

/**
 * Detects if URL is progressive audio by attempting a small fetch
 */
async function isProgressiveAudio(url: string): Promise<boolean> {
  try {
    console.log(`${LOG_PREFIX} Probing URL: ${url.substring(0, 80)}...`);

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Range': 'bytes=0-4095' }
    });

    if (!response.ok) {
      console.warn(`${LOG_PREFIX} ⚠️ Probe failed (HTTP ${response.status})`);
      return false;
    }

    const contentType = response.headers.get('content-type') || '';
    const isProgressive = /audio\/(mpeg|mp4|ogg|wav|webm)/.test(contentType);

    console.log(`${LOG_PREFIX} Content-Type: ${contentType}`);
    console.log(`${LOG_PREFIX} ${isProgressive ? '✅ Progressive' : '❌ HLS/DASH'}`);

    return isProgressive;
  } catch (e) {
    console.warn(`${LOG_PREFIX} ⚠️ Probe failed:`, (e as Error).message);
    return false;
  }
}

/**
 * Fetches and decodes audio buffer from URL
 */
async function fetchAudioBuffer(url: string, ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    console.log(`${LOG_PREFIX} Fetching audio...`);
    const response = await fetch(url, { mode: 'cors' });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    console.log(`${LOG_PREFIX} ✅ Fetched (${(arrayBuffer.byteLength / 1024 / 1024).toFixed(2)} MB)`);

    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    console.log(`${LOG_PREFIX} ✅ Decoded (${audioBuffer.duration.toFixed(2)}s)`);

    return audioBuffer;
  } catch (e) {
    console.error(`${LOG_PREFIX} ❌ Fetch/decode failed:`, e);
    return null;
  }
}

/**
 * Processes audio through EQ using OfflineAudioContext
 */
async function processAudioOffline(audioBuffer: AudioBuffer, ctx: AudioContext): Promise<AudioBuffer | null> {
  try {
    console.log(`${LOG_PREFIX} Processing audio offline...`);

    const offlineCtx = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;

    const filters = [
      offlineCtx.createBiquadFilter(),
      offlineCtx.createBiquadFilter(),
      offlineCtx.createBiquadFilter(),
    ];

    filters[0].type = 'lowshelf';
    filters[0].frequency.value = 40;
    filters[0].gain.value = 4;

    filters[1].type = 'peaking';
    filters[1].frequency.value = 1000;
    filters[1].Q.value = 1;
    filters[1].gain.value = 6;

    filters[2].type = 'highshelf';
    filters[2].frequency.value = 9000;
    filters[2].gain.value = -4;

    source.connect(filters[0]);
    filters[0].connect(filters[1]);
    filters[1].connect(filters[2]);
    filters[2].connect(offlineCtx.destination);

    source.start(0);
    const processedBuffer = await offlineCtx.startRendering();

    console.log(`${LOG_PREFIX} ✅ Processing complete`);
    return processedBuffer;
  } catch (e) {
    console.error(`${LOG_PREFIX} ❌ Processing failed:`, e);
    return null;
  }
}

/**
 * Convert AudioBuffer to WAV Blob
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  const channels = [];
  const sampleRate = buffer.sampleRate;
  let offset = 0;

  const writeString = (s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeString('RIFF');
  offset += 4;
  view.setUint32(offset, 36 + length - 44, true);
  offset += 4;
  writeString('WAVE');
  offset += 4;

  writeString('fmt ');
  offset += 4;
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, numOfChan, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * numOfChan * 2, true);
  offset += 4;
  view.setUint16(offset, numOfChan * 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;

  writeString('data');
  offset += 4;
  view.setUint32(offset, length - offset, true);
  offset += 4;

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  const multiplier = 32767;
  let index = 0;
  while (index < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = channels[i][index] * multiplier;
      sample = Math.max(-multiplier, Math.min(multiplier, sample));
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    index++;
  }

  return new Blob([view], { type: 'audio/wav' });
}

export default async function(audioStreams: AudioStream[],
  isLive = false,
  receiver: HTMLAudioElement = audio
) {
  console.log("188",audio);

  const receiverToSendForProcess = receiver

  const prefetch = !receiver.parentNode;
  if (!prefetch)
    title.textContent = i18n('player_audiostreams_setup');

  const noOfBitrates = audioStreams.length;

  if (!noOfBitrates) {
    title.textContent = i18n(
      isLive ? 'player_livestreams_hls' : 'player_audiostreams_null'
    );
    playButton.classList.replace(playButton.className, 'ri-stop-circle-fill');
    return;
  }

  const stream = await preferredStream(handleXtags(audioStreams));
  qualityView.textContent = stream.quality + ' ' + stream.codec;
  receiver.crossOrigin = "anonymous";
  receiverToSendForProcess.crossOrigin = "anonymous";

  // 🔴 Apply proxyHandler to get the actual proxied URL
  const rawUrl = proxyHandler(stream.url, prefetch);

  // 🔴 STORE the original proxied URL for error handling
  receiver.dataset.originalStreamUrl = rawUrl;
  receiverToSendForProcess.dataset.originalStreamUrl = rawUrl;

  console.log(`${LOG_PREFIX} Proxied URL: ${rawUrl.substring(0, 100)}...`);
  console.log(`${LOG_PREFIX} Stored in dataset.originalStreamUrl for error recovery`);

  // Only process if not prefetch and not live
  if (!prefetch && !isLive) {
    try {
      console.log(`${LOG_PREFIX} Attempting client-side processing...`);

      // 1. Check if progressive audio
      // const isProgressive = await isProgressiveAudio(rawUrl);
      // if (!isProgressive) {
      //   receiver.src = rawUrl;
      //   return;
      // }
      // --- Use Equalizer for processing ---
      receiverToSendForProcess.src = rawUrl;
      const eq = new Equalizer(receiverToSendForProcess);
      eq.setBandGain('bass', 4);
      eq.setBandGain('mid', 6);
      eq.setBandGain('treble', -4);
      eq.setPitch(0.41);
      await eq.loadImpulseResponse(encodeURI('/irs/Joe0Bloggs 3D headphones IRS--surround upmix-44100.irs'));
      await eq.renderAndPlayProcessedAudio();
      // Set receiver.src to processedAudioUrl
      if (eq.processedAudioUrl) {
        receiver.src = eq.processedAudioUrl;
        console.log(`${LOG_PREFIX} ✅ Processed audio assigned (Equalizer)`, eq.processedAudioUrl);

        // Dispatch event for toast
        document.dispatchEvent(new CustomEvent('audio:processed-success'));
      } else {
        receiver.src = rawUrl;
        console.log(`${LOG_PREFIX} ⚠️ Equalizer failed, fallback to raw stream.`);
      }
      return;
    } catch (e) {
      receiver.src = rawUrl;
      console.log(`${LOG_PREFIX} Fallback: Using proxied stream`);
    }
  } else {
    console.log(`${LOG_PREFIX} ${isLive ? 'Live' : 'Prefetch'} mode. Using raw stream.`);
    receiver.src = rawUrl;
  }
}
