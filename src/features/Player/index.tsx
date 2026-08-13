import { createEffect, createSignal, lazy, onCleanup, onMount, Show } from "solid-js"
import './Player.css'
import { MediaDetails } from "@components/MediaPartials";
import { config, cssVar } from "@utils";
import { closeFeature, playerStore, setNavStore, setStore, t, updateParam } from "@stores";
import { KawarpVisualizer } from '../../kawarp';
import MediaArtwork from '../../components/MediaPartials/MediaArtwork';

const Lyrics = lazy(() => import('./Lyrics'));
const Video = lazy(() => import('./Video'));
const Controls = lazy(() => import('./Controls'));

export default function() {
  let playerSection!: HTMLDivElement;
  let canvasRef!: HTMLCanvasElement;
  let bgImageRef!: HTMLDivElement;
  let visualizer: KawarpVisualizer | null = null;
  let currentBpX = 0;

  const [showLyrics, setShowLyrics] = createSignal(false);

  let touchStartY = 0;

  const handleResize = () => {
    visualizer?.resize();
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('i') ||
      target.closest('a') ||
      target.closest('.lyrics') ||
      target.closest('.watcher') ||
      target.closest('.slider')
    ) {
      return;
    }

    const container = e.currentTarget as HTMLElement;
    container.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const initialBpX = currentBpX;

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;

      const rect = playerSection.getBoundingClientRect();
      const offsetHeight = rect.height;
      const offsetWidth = rect.width;
      const diff = Math.max(0, offsetHeight - offsetWidth);

      const targetX = Math.max(-diff, Math.min(0, initialBpX + deltaX));
      currentBpX = targetX;

      cssVar('--player-bp', `${targetX}px 0`);
    };

    const onPointerUp = (upEvent: PointerEvent) => {
      container.releasePointerCapture(upEvent.pointerId);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerUp);
    };

    container.addEventListener('pointermove', onPointerMove);
    container.addEventListener('pointerup', onPointerUp);
    container.addEventListener('pointercancel', onPointerUp);
  };

  onMount(() => {
    setNavStore('player', 'ref', playerSection as unknown as null);
    playerSection.scrollIntoView();

    playerSection.addEventListener('touchstart', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('input') || target.closest('.slider') || target.closest('[class*="slider"]')) {
        return;
      }
      touchStartY = e.touches[0].clientY;
    }, { passive: true });

    playerSection.addEventListener('touchmove', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('input') || target.closest('.slider') || target.closest('[class*="slider"]')) {
        return;
      }
      const touchY = e.touches[0].clientY;
      const deltaY = touchY - touchStartY;

      if (deltaY > 50 && playerSection.scrollTop <= 0) {
        closeFeature('player');
      }
    }, { passive: true });

    // Initialize Kawarp visualizer
    visualizer = new KawarpVisualizer();
    visualizer.init(canvasRef);

    window.addEventListener('resize', handleResize);
  });

  createEffect(() => {
    if (playerStore.stream.id)
      updateParam('s', playerStore.stream.id);
  });

  createEffect(() => {
    if (playerStore.playerBackground === 'static_artwork') {
      setShowLyrics(false);
    }
  });

  createEffect(() => {
    const isPlaying = playerStore.playbackState === 'playing';
    const isKawarpActive = playerStore.isMusic && playerStore.playerBackground !== 'static_artwork';
    if (visualizer) {
      if (isPlaying && isKawarpActive) {
        visualizer.start();
      } else {
        visualizer.stop();
      }
    }
  });

  createEffect(() => {
    const artwork = playerStore.mediaArtwork;
    currentBpX = 0;
    cssVar('--player-bp', '0px 0');
    if (visualizer && artwork && artwork !== 'data:image/png;base64,iVBORw0KGgoAAAANSUhAIjCB0C8AAAAASUVORK5CYII=') {
      let visualizerCover = artwork;
      const imgId = playerStore.stream.img;
      if (imgId && imgId.startsWith('/')) {
        visualizerCover = `https://wsrv.nl?url=https://yt3.googleusercontent.com${imgId}=w180-h180&output=webp&w=180&h=180&fit=cover`;
      }
      console.log("[Kawarp Visualizer Loading Cover URL]:", visualizerCover);
      visualizer.loadCover(visualizerCover);
    }
  });

  onCleanup(() => {
    updateParam('s');
    window.removeEventListener('resize', handleResize);
    visualizer?.destroy();
    visualizer = null;
  });

  createEffect(() => {
    const { mediaArtwork } = playerStore;
    console.log("[Player Background Image URL]:", mediaArtwork);
    cssVar('--player-bg', `url(${mediaArtwork})`);
  });


  function getContext() {
    const { id } = playerStore.context;

    return id;
  }
console.log(144,bgImageRef)

  return (
    <section
      id="playerSection"
      ref={playerSection}
      onPointerDown={handlePointerDown}>

      {/* <Show when={true} > */}
        <div class="bg-pane" />
        <canvas
          class="bg-canvas"
          ref={canvasRef}
          style={{ display: (playerStore.isMusic && playerStore.playerBackground !== 'static_artwork') ? 'block' : 'none' }}
        />
        <div
          class="bg-image"
          ref={bgImageRef}
          style={{ display: (playerStore.isMusic && playerStore.playerBackground !== 'static_artwork') ? 'none' : 'block' }}
        />

      <Show when={!showLyrics()}>
        <header class="topShelf">
          <p>
            <Show when={playerStore.context.src}>
              <Show when={playerStore.context.src === 'queue'} fallback={t('player_from', getContext())}>
                {getContext()}
              </Show>
            </Show>
          </p>

          <div class="right-group">

            <i
              aria-label={t('close')}
              onclick={() => { closeFeature('player') }}
              class="ri-close-large-line"></i>

          </div>
          <i
            aria-label={t('player_more')}
            class="ri-more-2-fill"
            id="moreBtn"
            onclick={() => setStore('actionsMenu', playerStore.stream)}
          ></i>
        </header>
      </Show>
      <article style={showLyrics() ? { height: '90%', width: '100%' } : {}}>

        <Show when={playerStore.isWatching && !playerStore.isMusic}>
          <Video />
        </Show>

        <Show when={showLyrics()}>
          <Lyrics onClose={() => setShowLyrics(false)} />
        </Show>

        <div style={{ display: ((!playerStore.isWatching || playerStore.isMusic) && config.loadImage && !showLyrics() && playerStore.playerBackground === 'kawarp_with_artwork') ? 'contents' : 'none' }}>
          <MediaArtwork />
        </div>

        <Show when={!showLyrics()}>
          <div class="details-container">
            <MediaDetails />

            <Show when={!playerStore.isWatching || playerStore.isMusic}>
              <Controls showLyrics={showLyrics} setShowLyrics={setShowLyrics} />
            </Show>
          </div>
        </Show>

      </article>
    </section>
  )
}
