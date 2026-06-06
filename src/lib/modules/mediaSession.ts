import { playerStore, playNext, playPrev, queueStore } from "@stores";

export function initMediaSession() {
  if (!('mediaSession' in navigator)) return;

  const msn = navigator.mediaSession;
  console.log("[mediaSession] Initializing MediaSession action handlers.");

  msn.setActionHandler('play', () => {
    console.log("[mediaSession] Action: play");
    playerStore.audio.play();
  });

  msn.setActionHandler('pause', () => {
    console.log("[mediaSession] Action: pause");
    playerStore.audio.pause();
  });

  msn.setActionHandler('seekbackward', (details) => {
    const skipTime = details.seekOffset || 15;
    console.log(`[mediaSession] Action: seekbackward by ${skipTime}s`);
    playerStore.audio.currentTime = Math.max(playerStore.audio.currentTime - skipTime, 0);
    updateMediaSessionPosition();
  });

  msn.setActionHandler('seekforward', (details) => {
    const skipTime = details.seekOffset || 15;
    console.log(`[mediaSession] Action: seekforward by ${skipTime}s`);
    playerStore.audio.currentTime = Math.min(playerStore.audio.currentTime + skipTime, playerStore.audio.duration);
    updateMediaSessionPosition();
  });

  msn.setActionHandler('previoustrack', () => {
    console.log("[mediaSession] Action: previoustrack");
    if (queueStore.history.length) {
      playPrev();
    }
  });

  msn.setActionHandler('nexttrack', () => {
    console.log("[mediaSession] Action: nexttrack");
    if (queueStore.list.length) {
      playNext();
    }
  });

  msn.setActionHandler('stop', () => {
    console.log("[mediaSession] Action: stop");
    playerStore.audio.pause();
    playerStore.audio.currentTime = 0;
  });

  msn.setActionHandler('seekto', (details) => {
    console.log(`[mediaSession] Action: seekto to ${details.seekTime}s (fastSeek: ${details.fastSeek})`);
    if (details.seekTime !== undefined) {
      playerStore.audio.currentTime = details.seekTime;
      updateMediaSessionPosition();
    }
  });
}

export function updateMediaSessionPosition() {
  if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;

  const { audio } = playerStore;
  if (!isNaN(audio.duration) && audio.duration > 0) {
    try {
        const positionState = {
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime, audio.duration),
        };
        navigator.mediaSession.setPositionState(positionState);
        console.log("[mediaSession] Updated position state:", positionState);
    } catch (e) {
        console.error("Error updating media session position state:", e);
    }
  }
}

export function updateMediaSessionPlaybackState(state: 'playing' | 'paused' | 'none') {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = state === 'none' ? 'none' : (state === 'playing' ? 'playing' : 'paused');
    console.log("[mediaSession] Updated playback state:", navigator.mediaSession.playbackState);
}

export function setMediaSessionMetadata() {
  if (!('mediaSession' in navigator)) return;

  const { stream, mediaArtwork } = playerStore;
  
  navigator.mediaSession.metadata = new MediaMetadata({
    title: stream.title,
    artist: stream.author?.replace(' - Topic', ''),
    artwork: [
      { src: mediaArtwork, sizes: '512x512', type: 'image/png' }
    ]
  });
  console.log("[mediaSession] Updated metadata for:", stream.title);
}
