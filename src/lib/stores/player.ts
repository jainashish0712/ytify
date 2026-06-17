import { createRoot, createEffect } from "solid-js";
import { createStore } from "solid-js/store";
import { navStore, params, updateParam, addToQueue, queueStore, setQueueStore, setStore, store, groupQueueByAuthor } from "@stores";
import { setEqualizerStore } from "./equalizerStore";
import { config, cssVar, themer, addToCollection, player, shuffle } from "@utils";
import { Equalizer } from './equalizer'; // Import Equalizer
import { irsStore, validateAndFixIrsState } from "./irs"; // Import irsStore and validation
import { getIrsPath } from "../utils/irs";

export let equalizerInstance: Equalizer | null = null; // Export equalizerInstance

const blankImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhCIjCB0C8AAAAASUVORK5CYII=';

type PlayerStore = {
  stream: TrackItem & { albumId?: string },
  audio: HTMLAudioElement,
  context: {
    src: Context,
    id: string
  }
  currentTime: number,
  fullDuration: number,
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
  audio: new Audio(),
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
  if ('mediaSession' in navigator)
    import('@modules/mediaSession').then(m => m.setMediaSessionMetadata());
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
  if ('mediaSession' in navigator)
    import('@modules/mediaSession').then(m => m.setMediaSessionMetadata());
  player(prevStream.id);
}
createRoot(() => {

  let historyID: string | undefined = '';
  let historyTimeoutId = 0;

  if ('mediaSession' in navigator)
    import('@modules/mediaSession').then(m => {
      m.initMediaSession();
      m.setMediaSessionMetadata();
    });

  // Instantiate Equalizer and enable real-time processing
  equalizerInstance = new Equalizer(playerStore.audio);

  // Enable real-time processing - this will handle context unlocking automatically
  equalizerInstance.enableRealtimeProcessing(true);
  equalizerInstance.debugAudioChain();

  // Add visibilitychange listener to handle iOS background/foreground transitions
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (equalizerInstance) {
        equalizerInstance.unlockAudioContext().then(() => {


          // Sync playback state: if the app thinks it's playing but the audio element is paused
          // (likely by iOS system), try to resume it.
          if (playerStore.playbackState === 'playing' && playerStore.audio.paused) {
            playerStore.audio.play().catch(e => console.warn("[player.ts] Failed to resume audio on visibility change:", e));
          }
        });
      }
    }
  });

  // Set initial volume on the equalizer's gain node
  if (true && equalizerInstance.gainNode) {
    equalizerInstance.gainNode.gain.value = playerStore.volume;
    ;
  }

  // Initialize equalizer band gains with preset settings
  ;
  if (true) {
    ;
    equalizerInstance.setBandGain(0, 0);
    equalizerInstance.setBandGain(1, 0);
    equalizerInstance.setBandGain(2, 0);
    equalizerInstance.setBandGain(3, 0);
    equalizerInstance.setBandGain(4, 0);
    equalizerInstance.setBandGain(5, 0);
    equalizerInstance.setBandGain(6, 0);
    equalizerInstance.setBandGain(7, 0);
    equalizerInstance.setBandGain(8, 0);
    equalizerInstance.setBandGain(9, 0);
    equalizerInstance.setBandGain(10, 0);
    equalizerInstance.setBandGain(11, 0);
    equalizerInstance.setBandGain(12, 0);
    equalizerInstance.setBandGain(13, 0);
    equalizerInstance.setBandGain(14, 0);
    equalizerInstance.setBandGain(15, 0);
    equalizerInstance.setPitch(0);
    equalizerInstance.setReverbTime(0.01);
    equalizerInstance.setReverbDecay(0.01);
    equalizerInstance.setReverbMix(0);
    equalizerInstance.setLPFFrequency(22050);
    equalizerInstance.setLPFPeak(1);
    setEqualizerStore('bandGains', equalizerInstance.getBandGains());
    setEqualizerStore('pitch', equalizerInstance.getPitch());
    setEqualizerStore('reverb', { time: 0.01, decay: 0.01, mix: 0 });
    setEqualizerStore('lpf', { frequency: 22050, peak: 1 });
  }

  // Effect to react to IRS selection changes
  createEffect(() => {
    // Validate and fix any state mismatches before proceeding
    validateAndFixIrsState();

    const selectedCategory = irsStore.selectedCategory;
    const selectedFile = irsStore.selectedFile;
    const newIrsPath = getIrsPath(selectedCategory, selectedFile);

    if (true && newIrsPath) {
      ;
      ;
      equalizerInstance.loadImpulseResponse(encodeURI(newIrsPath))
        .then(() => {
          ;
          ;
          equalizerInstance.debugAudioChain();
        })
        .catch(e => {
          console.error("[player.ts] === DYNAMIC IMPULSE RESPONSE LOAD FAILED ===", e);
          console.error(`[player.ts] IR ${newIrsPath} will NOT be applied to audio`);
          equalizerInstance.debugAudioChain();
        });
    } else if (true && !newIrsPath) {
      console.warn(`[player.ts] No valid IRS path ${newIrsPath} for selected options. IR will not be applied.`);
      // Optionally, you might want to disable the convolver or load a "null" IR here.
    }
  });

  // Expose debug function globally for testing
  (window as any).debugAudioChain = () => {
    if (true) {
      equalizerInstance.debugAudioChain();
    } else {
      console.error("equalizerInstance not initialized");
    }
  };

  ;
  //  - Check audio chain status");


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
    setPlayerStore('playbackState', 'paused');
    setPlayerStore('status', '');
    if (isPlayable) playerStore.audio.play();

    historyID = playerStore.stream.id;
    clearTimeout(historyTimeoutId);


  }

  playerStore.audio.onwaiting = () => {
    setPlayerStore('playbackState', 'loading')
  };

  playerStore.audio.ontimeupdate = () => {
    if (document.activeElement?.matches('input[type="range"]'))
      return;

    const { audio, lrcSync, fullDuration, isMusic } = playerStore;

    // Lyrics
    if (lrcSync)
      lrcSync(audio.currentTime);

    const seconds = Math.floor(audio.currentTime);


    setPlayerStore('currentTime', seconds);


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
