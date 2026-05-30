import { createRoot, createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { navStore, params, updateParam, addToQueue, queueStore, setQueueStore, setStore, store, groupQueueByAuthor } from "@stores";
import { config, cssVar, themer, addToCollection, player, shuffle } from "@utils";
import { Equalizer } from './equalizer'; // Import Equalizer
import { irsStore } from "./irs"; // Import irsStore
import { getIrsPath } from "@utils/irs"; // Import getIrsPath

export let equalizerInstance: Equalizer | null = null; // Export equalizerInstance

const blankImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUZCIjCB0C8AAAAASUVORK5CYII=';

type PlayerStore = {
  stream: TrackItem & { albumId?: string },
  audio: HTMLAudioElement,
  context: {
    src: Context,
    id: string
  }
  currentTime: number,
  fullDuration: number,
  playbackRate: number,
  loop: boolean,
  volume: number,
  status: string,
  playbackState: 'none' | 'playing' | 'paused' | 'loading',
  mediaArtwork: string,
  supportsOpus: Promise<boolean>,
  data: {},
  immersive: boolean,
  isMusic: boolean,
  audioURL: string,
  videoURL: string,
  isWatching: boolean,
  proxy: string,
  lrcSync?: (d: number) => void
};

const createInitialState = (): PlayerStore => ({
  audio: Object.assign(new Audio(), { playsinline: true, "webkit-playsinline": true }), // Modified: Adding playsinline and webkit-playsinline attributes
  playbackState: 'none',
  context: { id: '', src: '' },
  status: '',
  currentTime: 0,
  fullDuration: 0,
  playbackRate: 1.0,
  loop: false,
  volume: parseFloat(config.volume) / 100,
  stream: {
    title: '',
    author: '',
    authorId: '',
    id: '',
    duration: ''
  },
  mediaArtwork: blankImage,
  supportsOpus: navigator.mediaCapabilities.decodingInfo({
    type: 'file',
    audio: {
      contentType: 'audio/webm;codecs=opus'
    }
  }).then(res => res.supported),
  data: {},
  immersive: false,
  isMusic: true,
  audioURL: '',
  videoURL: '',
  isWatching: Boolean(config.watchMode),
  proxy: ''
});

export const [playerStore, setPlayerStore] = createStore(createInitialState());

export function playNext() {
  const { stream } = playerStore;
  const { list } = queueStore;
  const nextStream = list[0];

  if (!nextStream) return;

  if (stream.id) setQueueStore('history', h => [{ ...stream }, ...h]);

  setPlayerStore('stream', nextStream);
  setPlayerStore('context', {
    id: nextStream.context?.id || '',
    src: nextStream.context?.src || ''
  });
  setQueueStore('list', l => {
    let newList = l.slice(1);
    if (newList.length > 1) {
      if (config.persistentShuffle) newList = shuffle(newList);
      if (config.authorGrouping) newList = groupQueueByAuthor(newList);
    }
    return newList;
  });
  player(nextStream.id);
}
export function playPrev() {
  const { stream } = playerStore;
  const { history } = queueStore;

  const prevStream = history[0];
  if (!prevStream) return;

  setQueueStore('history', h => h.slice(1));
  if (stream.id) setQueueStore('list', l => [{ ...stream }, ...l]);

  setPlayerStore('stream', prevStream);
  setPlayerStore('context', {
    id: prevStream.context?.id || '',
    src: prevStream.context?.src || ''
  });
  player(prevStream.id);
}
createRoot(() => {

  let historyID: string | undefined = '';
  let historyTimeoutId = 0;

  if ('mediaSession' in navigator)
    import('@modules/mediaSession').then(m => m.initMediaSession());

  // Listen for visibility changes to manage AudioContext
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log("[player.ts] Document visible - attempting to resume AudioContext");
      equalizerInstance?.resumeContext();
    } else {
      console.log("[player.ts] Document hidden - AudioContext might be suspended by OS");
    }
  });

  // Instantiate Equalizer
  equalizerInstance = new Equalizer(playerStore.audio);

  const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) || /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

  if (isIOS) {
    console.log("[player.ts] iOS/Safari detected - using offline rendering for background play compatibility");
    equalizerInstance.enableRealtimeProcessing(false);
  } else {
    // Enable real-time processing for other platforms - this will handle context unlocking automatically
    equalizerInstance.enableRealtimeProcessing(true);
  }

  equalizerInstance.debugAudioChain();

  // Set initial volume on the equalizer's gain node
  if (equalizerInstance && equalizerInstance.gainNode) {
    equalizerInstance.gainNode.gain.value = playerStore.volume;
    console.log("[player.ts] Initial equalizerInstance.gainNode.gain.value set to:", playerStore.volume);
  }

  // Initialize equalizer band gains with preset settings
  if (equalizerInstance) {
    console.log("[player.ts] === INITIALIZING EQUALIZER BANDS ===");
    equalizerInstance.setBandGain('lowshelf', 2);    // neutral lowshelf (40Hz)
    equalizerInstance.setBandGain('lowMid', 3);      // slight boost low-mid (150Hz)
    equalizerInstance.setBandGain('midLow', 2);      // neutral mid-low (400Hz)
    equalizerInstance.setBandGain('mid', 2);         // neutral mid (1000Hz)
    equalizerInstance.setBandGain('midHigh', 2);     // neutral mid-high (2000Hz)
    equalizerInstance.setBandGain('highMid', 2);     // neutral high-mid (4000Hz)
    equalizerInstance.setBandGain('high', -1);       // slight cut high (8000Hz)
    equalizerInstance.setBandGain('highshelf', -3);  // cut highshelf (16000Hz)
    // equalizerInstance.setPitch(0.41);
    console.log("[player.ts] playerStore.audio.playbackRate after setPitch:", playerStore.audio.playbackRate);
    console.log("[player.ts] === EQUALIZER BANDS INITIALIZED ===");
  }

  // Effect to react to IRS selection changes
  createEffect(() => {
    const selectedCategory = irsStore.selectedCategory;
    const selectedFile = irsStore.selectedFile;
    const newIrsPath = getIrsPath(selectedCategory, selectedFile);

    if (equalizerInstance && newIrsPath) {
      console.log("[player.ts] === DYNAMIC LOADING IMPULSE RESPONSE ===");
      console.log("[player.ts] New IR URL:", newIrsPath);
      equalizerInstance.loadImpulseResponse(encodeURI(newIrsPath))
        .then(() => {
          console.log("[player.ts] === DYNAMIC IMPULSE RESPONSE LOADED SUCCESSFULLY ===");
          console.log("[player.ts] IR is now active in the audio chain");
          equalizerInstance.debugAudioChain();
          if (isIOS && playerStore.playbackState === 'playing') {
             equalizerInstance?.renderAndPlayProcessedAudio();
          }
        })
        .catch(e => {
          console.error("[player.ts] === DYNAMIC IMPULSE RESPONSE LOAD FAILED ===", e);
          console.error("[player.ts] IR will NOT be applied to audio");
          equalizerInstance.debugAudioChain();
        });
    } else if (equalizerInstance && !newIrsPath) {
      console.warn("[player.ts] No valid IRS path for selected options. IR will not be applied.");
    }
  });

  // Expose debug function globally for testing
  (window as any).debugAudioChain = () => {
    if (equalizerInstance) {
      equalizerInstance.debugAudioChain();
    } else {
      console.error("equalizerInstance not initialized");
    }
  };

  console.log("[player.ts] Available debug commands:");
  console.log("[player.ts]   window.debugAudioChain() - Check audio chain status");


  playerStore.audio.onended = () => {
    if (queueStore.list.length)
      playNext();
    else {
      updateParam('s');
      setPlayerStore('playbackState', 'none');
      if ('mediaSession' in navigator)
        import('@modules/mediaSession').then(m => m.updateMediaSessionPlaybackState('none'));
    }
  }

  playerStore.audio.onplaying = () => {
    setPlayerStore('playbackState', 'playing');
    if (!isIOS) {
        equalizerInstance?.resumeContext();
    }
    if ('mediaSession' in navigator)
      import('@modules/mediaSession').then(m => {
        m.updateMediaSessionPlaybackState('playing');
        m.updateMediaSessionPosition();
      });

    const { stream } = playerStore;
    const { id } = stream;

    if (config.history)
      historyTimeoutId = window.setTimeout(() => {
        if (historyID === id) {
          if (
            config.similarContent
            && playerStore.isMusic
          )
            getRecommendations();
          addToCollection('history', [playerStore.stream]);
        }
      }, 1e4);
  }

  playerStore.audio.onpause = () => {
    setPlayerStore('playbackState', 'paused');
    if (!isIOS) {
        equalizerInstance?.suspendContext();
    }
    if ('mediaSession' in navigator)
      import('@modules/mediaSession').then(m => {
        m.updateMediaSessionPlaybackState('paused');
        m.updateMediaSessionPosition();
      });
    clearTimeout(historyTimeoutId);
  };
  playerStore.audio.addEventListener('loadeddata', themer);


  let isPlayable = false;
  const playableCheckerID = setInterval(() => {
    if (queueStore.history.length || params.has('url') || params.has('text') || !params.has('s')) {
      isPlayable = true;
      clearInterval(playableCheckerID);
    }
  }, 500);

  playerStore.audio.onloadstart = () => {
    const isBlob = playerStore.audio.src.startsWith('blob:');

    setPlayerStore('playbackState', isBlob ? playerStore.playbackState : 'paused');
    setPlayerStore('status', '');

    // Reset equalizer state for the new track (clears cached buffers)
    // Pass the new src to avoid resetting if it's our own processed blob
    equalizerInstance?.reset(playerStore.audio.src);

    if (isPlayable) {
      if (isIOS && !isBlob) {
        // On iOS, don't play the raw source. Wait for onloadedmetadata -> renderAndPlayProcessedAudio.
        console.log("[player.ts] onloadstart (iOS) - suppressing raw playback, waiting for render.");
        setPlayerStore('playbackState', 'loading');
      } else {
        playerStore.audio.play();
      }
    }

    historyID = playerStore.stream.id;
    clearTimeout(historyTimeoutId);
    playerStore.audio.playbackRate = playerStore.playbackRate;
  }

  playerStore.audio.onwaiting = () => {
    setPlayerStore('playbackState', 'loading')
  };

  let lastMediaSessionUpdate = 0;

  playerStore.audio.ontimeupdate = () => {
    if (document.activeElement?.matches('input[type="range"]'))
      return;

    const { audio, lrcSync, fullDuration, isMusic } = playerStore;

    // Lyrics
    if (lrcSync)
      lrcSync(audio.currentTime);

    const seconds = Math.floor(audio.currentTime);


    setPlayerStore('currentTime', seconds);

    // Update MediaSession position (throttled to every 2 seconds)
    const now = Date.now();
    if (now - lastMediaSessionUpdate > 2000) {
        lastMediaSessionUpdate = now;
        if ('mediaSession' in navigator) {
            import('@modules/mediaSession').then(m => m.updateMediaSessionPosition());
        }
    }


    // Immersive Mode
    const { ref } = navStore.player;
    if (ref) {
      const { offsetHeight, offsetWidth } = ref;
      const diff = isMusic ? (offsetHeight - offsetWidth) : offsetWidth;
      const scale = seconds / fullDuration;
      const shift = Math.floor(scale * diff);
      // cssVar('--player-bp', `-${shift}px 0`);
    }

    const t = params.get('t');

    if (t) {
      if (isMusic) updateParam('t');
      else {
        if (seconds % 5 === 0) {
          const str = seconds.toString();
          if (t !== str)
            updateParam('t', str);
        }
      }
    }


  }

  playerStore.audio.onloadedmetadata = () => {
    setPlayerStore({
      currentTime: 0,
      fullDuration: Math.floor(playerStore.audio.duration)
    });

    if ('mediaSession' in navigator)
      import('@modules/mediaSession').then(m => m.updateMediaSessionPosition());

    if (isIOS) {
      console.log("[player.ts] onloadedmetadata (iOS) - triggering offline render for background play");
      equalizerInstance?.renderAndPlayProcessedAudio();
    }
  }

  playerStore.audio.oncanplaythrough = async function() {
    const nextItem = config.queuePrefetch && queueStore.list[0]?.id;

    if (!nextItem) return;

    const data = await import('@modules/getStreamData').then(mod => mod.default(nextItem, true));
    const prefetchRef = new Audio();
    prefetchRef.onerror = () =>
      import('@modules/audioErrorHandler').then(mod => mod.default(prefetchRef, nextItem));
    if (data && 'adaptiveFormats' in data)
      import('../modules/setAudioStreams')
        .then(mod => mod.default(
          data.adaptiveFormats
            .filter(f => f.type.startsWith('audio'))
            .sort((a, b) => (parseInt(a.bitrate) - parseInt(b.bitrate))),
          prefetchRef
        ));
  }

  playerStore.audio.onerror = () => import('@modules/audioErrorHandler').then(mod => mod.default(playerStore.audio));

});

async function getRecommendations() {

  const currentTitle = playerStore.stream.title;
  const title = encodeURIComponent(currentTitle);
  const artist = encodeURIComponent(playerStore.stream.author?.slice(0, -8) ?? '');
  fetch(`${store.api}/similar?title=${title}&artist=${artist}&limit=10`)
    .then(res => res.json())
    .then(data => addToQueue(data.map((item: TrackItem) => ({
      ...item,
      context: { src: 'queue', id: `Similar to ${currentTitle}` }
    }))))
    .catch(e => setStore('snackbar', `Could not get recommendations for the track: ${e.message}`));


}
