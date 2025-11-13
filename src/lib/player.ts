import { audio, favButton, favIcon, playButton, title } from "./dom";
import { convertSStoHHMMSS } from "./utils";
import { params, state, store } from "./store";
import { setMetaData } from "../modules/setMetadata";
import { getDB } from "./libraryUtils";
import getStreamData from "../modules/getStreamData";
import { Equalizer } from './equalizer'; // Assuming Equalizer.ts is in the same directory

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

    // --- Audio Source Assignment ---
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
    // --- End Audio Source Assignment ---


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
        if (eq) {
            console.log("125", eq);
            return
        };

        // small helper: show a simple transient toast and brief underline/highlight
        const showToast = (text = 'Info') => {
            const id = 'ytify-mini-toast';
            if (document.getElementById(id)) return;
            const el = document.createElement('div');
            el.id = id;
            el.textContent = '✔ ' + text;
            Object.assign(el.style, {
                position: 'fixed',
                right: '12px',
                bottom: '12px',
                background: '#2e7d32',
                color: '#fff',
                padding: '8px 10px',
                borderRadius: '6px',
                zIndex: '99999',
                fontSize: '13px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                opacity: '1',
                transition: 'opacity 300ms ease'
            });
            document.body.appendChild(el);
            setTimeout(() => {
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 350);
            }, 2600);
        };

        // Listen for the Equalizer signalling that processing is ready (optional UI feedback)
        const onProcessedReady = (ev: Event) => {
            const ce = ev as CustomEvent;
            const detail = ce?.detail || {};
            if (detail.success) {
                showToast('Audio features baked-in (background play enabled)');
            } else {
                showToast('Audio processing failed, using original stream.');
            }
        };
        // This event signals completion of the offline render, whether successful or failed (fallback)
        document.addEventListener('equalizer:processed-ready', onProcessedReady, { once: true });


        eq = new Equalizer(audio);

        // --- EQ Configuration (Static settings for the offline render) ---
        eq.setBandGain('bass', 0);    // boost bass
        eq.setBandGain('mid', 0);     // neutral mid
        eq.setBandGain('treble', 0); // neutral treble
        eq.setPitch(0.41);            // pitch will be baked into the final audio speed
        // --- End Configuration ---


        const freqs = new Float32Array([40, 1000, 3000]);
        const mag = eq.getFrequencyResponse('bass', freqs);
        console.log(mag);

        // Helper to load IR safely
        const loadIR = async () => {
            try {
                // The IR must be successfully loaded for the offline render to proceed.
                await eq!.loadImpulseResponse(encodeURI('/irs/Joe0Bloggs 3D headphones IRS--surround upmix-44100.irs'));
            } catch (e) {
                console.warn("Failed loading IR:", e);
                throw e; // Re-throw to trigger the fallback logic
            }
        };

        // --- Core EQ Initialisation Logic: Load IR then Render Offline ---
        const executeProcessing = async () => {
            await loadIR();
            // This initiates the entire offline render process (Fetch, Decode, Process, Encode, Set Source)
            await eq!.renderAndPlayProcessedAudio();
        };
        // -----------------------------------------------------------------


        // If context is not running, ensure unlock is attempted (constructor may have registered gesture listeners)
        if (eq.requiresUserGesture() && !eq.isContextRunning()) {
            // create a small one-time prompt to guide the user (optional UX)
            const unlockEl = document.createElement('div');
            unlockEl.id = 'audioUnlock';
            unlockEl.textContent = 'Tap to enable audio features (Loading)';
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
                    unlockEl.textContent = 'Processing Audio...';
                    await executeProcessing();
                } catch (e) {
                    // Failures here are logged by the EQ class and trigger a fallback
                    console.warn("Processing failed after unlock:", e);
                } finally {
                    unlockEl.removeEventListener('click', handler);
                    unlockEl.remove();
                }
            };
            unlockEl.addEventListener('click', handler, { once: true });
        } else {
            // normal path: load IR and process immediately
            try {
                await executeProcessing();
            } catch (e) {
                console.error("Initial audio processing failed:", e);
                // Fallback is handled internally by renderAndPlayProcessedAudio
            }
        }
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
        // await initEQ();
    }

    // Listen for stream data ready event
    const onStreamReady = async () => {
        await initEQ();
        document.removeEventListener('stream:data-ready', onStreamReady);
    };
    document.addEventListener('stream:data-ready', onStreamReady);
}