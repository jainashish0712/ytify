import { onCleanup } from "solid-js";
import { playerStore } from "@stores";
import "@uimaxbai/am-lyrics/am-lyrics.js";

export default function(props: { onClose: () => void }) {
  const title = () => playerStore.stream.title || '';

  const artist = () => {
    const author = playerStore.stream.author || '';
    // Clean up typical YouTube Topic suffixes to improve Apple Music / LyricsPlus metadata resolution
    return author.endsWith(' - Topic') ? author.slice(0, -8) : author;
  };

  const onLineClick = (e: CustomEvent<{ timestamp: number }>) => {
    const timeMs = e.detail.timestamp;
    if (typeof timeMs === 'number') {
      playerStore.audio.currentTime = timeMs / 1000;
    }
  };

  onCleanup(() => {
    // Component clean up if needed
  });

  return (
    <>
    <div class="lyrics lyrics-container-full">

      <am-lyrics
        prop:songTitle={title()}
        prop:songArtist={artist()}
        prop:currentTime={playerStore.currentTime * 1000}
        prop:duration={playerStore.fullDuration * 1000}
        autoscroll
        hide-source-footer
        on:line-click={onLineClick}
        />
    </div>
      <button
        onclick={props.onClose}
        class="lyrics-close-btn"
        aria-label="Close Lyrics"
        >
        <i class="ri-close-large-line"></i>
      </button>
        </>
  );
}
