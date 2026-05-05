import { createEffect, createSignal, lazy, onCleanup, onMount, Show } from "solid-js"
import './Player.css'
import { MediaDetails } from "@components/MediaPartials";
import { config, cssVar } from "@utils";
import { closeFeature, playerStore, setNavStore, setStore, t, updateParam } from "@stores";
// import { irsStore, setIrsStore, updateSelectedIrsCategory, updateSelectedIrsFile } from "@stores/irs";
import { IRS_OPTIONS } from "../../lib/utils/irs";
import { irsStore, updateSelectedIrsCategory, updateSelectedIrsFile } from "../../lib/stores/irs";

const MediaArtwork = lazy(() => import('../../components/MediaPartials/MediaArtwork'));
const Lyrics = lazy(() => import('./Lyrics'));
const Video = lazy(() => import('./Video'));
const Controls = lazy(() => import('./Controls'));

export default function() {
  let playerSection!: HTMLDivElement;

  const [showLyrics, setShowLyrics] = createSignal(false);
  const [availableIrsFiles, setAvailableIrsFiles] = createSignal(IRS_OPTIONS[0].files);

  onMount(() => {
    setNavStore('player', 'ref', playerSection);
    playerSection.scrollIntoView();
  });

  createEffect(() => {
    if (playerStore.stream.id)
      updateParam('s', playerStore.stream.id);
  });

  onCleanup(() => {
    updateParam('s');
  });

  createEffect(() => {
    const { immersive, mediaArtwork } = playerStore;
    if (immersive)
      cssVar('--player-bg', `url(${mediaArtwork})`);
  });

  createEffect(() => {
    const selectedCategory = IRS_OPTIONS.find(opt => opt.category === irsStore.selectedCategory);
    if (selectedCategory) {
      setAvailableIrsFiles(selectedCategory.files);
    }
  });


  function getContext() {
    const { id } = playerStore.context;

    return id;
  }


  return (
    <section
      id="playerSection"
      ref={playerSection}>

      <Show when={playerStore.immersive} >
        <div class="bg-pane" />
        <div class="bg-image" />
      </Show>

      <header class="topShelf">
        <p>
          <Show when={playerStore.context.src}>
            <Show when={playerStore.context.src === 'queue'} fallback={t('player_from', getContext())}>
              {getContext()}
            </Show>
          </Show>
        </p>

        <div class="irs-selectors">
          <select
            value={irsStore.selectedCategory}
            onchange={(e) => updateSelectedIrsCategory(e.currentTarget.value)}
            aria-label="Select IRS Category"
          >
            {IRS_OPTIONS.map(option => (
              <option value={option.category}>{option.category}</option>
            ))}
          </select>

          <select
            value={irsStore.selectedFile}
            onchange={(e) => updateSelectedIrsFile(e.currentTarget.value)}
            aria-label="Select IRS File"
          >
            {availableIrsFiles().map(file => (
              <option value={file.name}>{file.name}</option>
            ))}
          </select>
        </div>

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
      <article>

        <Show when={playerStore.isWatching && !playerStore.isMusic}>
          <Video />
        </Show>

        <Show when={showLyrics()}>
          <Lyrics onClose={() => setShowLyrics(false)} />
        </Show>

        <Show when={(!playerStore.isWatching || playerStore.isMusic) && config.loadImage && !showLyrics()}>
          <MediaArtwork />
        </Show>


        <MediaDetails />

        <Show when={!playerStore.isWatching || playerStore.isMusic}>
          <Controls showLyrics={showLyrics} setShowLyrics={setShowLyrics} />
        </Show>

      </article>
    </section>
  )
}
