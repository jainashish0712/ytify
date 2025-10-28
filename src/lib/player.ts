import { audio, favButton, favIcon, playButton, title } from "./dom";
import { convertSStoHHMMSS } from "./utils";
import { params, state, store } from "./store";
import { setMetaData } from "../modules/setMetadata";
import { getDB } from "./libraryUtils";
import getStreamData from "../modules/getStreamData";
import { Equalizer } from './equalizer';

let eq: Equalizer | undefined;

export default async function player(id: string | null = '') {

  if (!id) return;

  if (state.watchMode) {
    store.actionsMenu.id = id;
    const dialog = document.createElement('dialog');
    dialog.open = true;
    dialog.className = 'watcher';
    document.body.appendChild(dialog);
    import('../components/WatchVideo')
      .then(mod => mod.default(dialog));
    return;
  }

  playButton.classList.replace(playButton.className, 'ri-loader-3-line');

  if (state.jiosaavn) {
    if (!store.player.useSaavn)
      store.player.useSaavn = true;
    else if (store.stream.author.endsWith('Topic'))
      return import('../modules/jioSaavn').then(mod => mod.default());
  }

  title.textContent = 'Fetchng Data...';

  const data = await getStreamData(id);

  if (data && 'audioStreams' in data)
    store.player.data = data;
  else {
    playButton.classList.replace(playButton.className, 'ri-stop-circle-fill');
    title.textContent = data.message || data.error || 'Fetching Data Failed';
    return;
  }

  await setMetaData({
    id: id,
    title: data.title,
    author: data.uploader,
    duration: convertSStoHHMMSS(data.duration),
    channelUrl: data.uploaderUrl
  });

  // Ensure crossorigin set BEFORE any src assignment (required for CORS/Convolver)
  try { audio.crossOrigin = 'anonymous'; } catch (e) { /* ignore */ }

  if (store.player.legacy) {
    audio.src = data.hls;
    audio.load();
  }
  else {
    const { hls } = store.player;
    if (state.HLS) {
      const hlsUrl = hls.manifests.shift();
      if (hlsUrl) hls.src(hlsUrl);
    }
    else import('../modules/setAudioStreams')
      .then(mod => mod.default(
        data.audioStreams
          .sort((a: { bitrate: string }, b: { bitrate: string }) => (parseInt(a.bitrate) - parseInt(b.bitrate))
          ),
        data.livestream
      ));
  }


  params.set('s', id);

  if (location.pathname === '/')
    history.replaceState({}, '', location.origin + '?s=' + params.get('s'));


  if (state.enqueueRelatedStreams)
    import('../modules/enqueueRelatedStreams')
      .then(mod => mod.default(data.relatedStreams as StreamItem[]));


  // favbutton reset
  if (favButton.checked) {
    favButton.checked = false;
    favIcon.classList.remove('ri-heart-fill');
  }

  // favbutton set
  if (getDB().favorites?.hasOwnProperty(id)) {
    favButton.checked = true;
    favIcon.classList.add('ri-heart-fill');
  }



  // related streams imported into discovery after 1min 40seconds, short streams are naturally filtered out

  if (state.discover)
    import('../modules/setDiscoveries')
      .then(mod => {
        setTimeout(() => {
          mod.default(id, data.relatedStreams as StreamItem[]);
        }, 1e5);
      });

  // Prepare Equalizer initialization (defer on iOS/Safari until a user gesture)
  const isIOSorSafari = (): boolean => {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|ad|od)/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    return isIOS || isSafari;
  };

  const initEQ = async () => {
    if (eq) return;
    eq = new Equalizer(audio);

    // Example: set initial gains
    eq.setBandGain('bass', 4);    // boost bass
    eq.setBandGain('mid', 6);     // neutral mid
    eq.setBandGain('treble', -4); // neutral treble
    eq.setPitch(0.41); // pitch


    const freqs = new Float32Array([40, 1000, 3000]);
    const mag = eq.getFrequencyResponse('bass', freqs);
    console.log(mag);

    // Helper to load IR safely
    const loadIR = async () => {
      try {
        await eq!.loadImpulseResponse(encodeURI('/irs/Joe0Bloggs 3D headphones IRS--surround upmix-44100.irs'));
      } catch (e) {
        console.warn("Failed loading IR:", e);
      }
    };

    // If context is not running, ensure unlock is attempted (constructor may have registered gesture listeners)
    if (eq.requiresUserGesture() && !eq.isContextRunning()) {
      // create a small one-time prompt to guide the user (optional UX)
      const unlockEl = document.createElement('div');
      unlockEl.id = 'audioUnlock';
      unlockEl.textContent = 'Tap to enable audio features';
      unlockEl.style.position = 'fixed';
      unlockEl.style.left = '10px';
      unlockEl.style.bottom = '10px';
      unlockEl.style.padding = '10px 12px';
      unlockEl.style.background = 'rgba(0,0,0,0.85)';
      unlockEl.style.color = '#fff';
      unlockEl.style.borderRadius = '6px';
      unlockEl.style.zIndex = '9999';
      unlockEl.style.cursor = 'pointer';
      document.body.appendChild(unlockEl);

      const handler = async () => {
        try {
          await eq!.unlockAudioContext();
          await loadIR();
        } catch (e) {
          console.warn("unlockAudioContext failed:", e);
        } finally {
          unlockEl.removeEventListener('click', handler);
          unlockEl.remove();
        }
      };
      unlockEl.addEventListener('click', handler, { once: true });
    } else {
      // normal path: load IR immediately
      await loadIR();
    }
    eq!.enableConvolver(true);

    // const toggle = document.getElementById('convolverToggle') as HTMLInputElement;
    // if (toggle) toggle.addEventListener('change', () => { eq!.enableConvolver(toggle.checked); });
    // if (toggle) toggle.addEventListener('change', () => { eq!.enableConvolver(toggle.checked); });
  };

  // If on iOS/Safari, wait for user gesture to initialize EQ; otherwise init immediately.
  if (isIOSorSafari()) {
    const gestureInit = async () => {
      await initEQ();
      document.body.removeEventListener('click', gestureInit);
      document.body.removeEventListener('touchstart', gestureInit);
    };
    document.body.addEventListener('click', gestureInit, { once: true });
    document.body.addEventListener('touchstart', gestureInit, { once: true });
  } else {
    await initEQ();
  }
}


