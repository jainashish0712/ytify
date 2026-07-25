import { playerStore, t, setPlayerStore } from "@stores";
import { setConfig } from "@utils";

export default function() {
  const icons = {
    playing: 'ri-pause-circle-fill',
    none: 'ri-stop-circle-fill',
    paused: 'ri-play-circle-fill',
    loading: 'ri-loader-3-line loading-spinner'
  };

  let timerId: number | null = null;
  let isLongPress = false;

  const toggleBackgroundMode = () => {
    const modes: ('kawarp_no_artwork' | 'kawarp_with_artwork' | 'static_artwork')[] = [
      'kawarp_no_artwork',
      'kawarp_with_artwork',
      'static_artwork'
    ];
    const currentIndex = modes.indexOf(playerStore.playerBackground);
    const nextIndex = (currentIndex + 1) % modes.length;
    const nextMode = modes[nextIndex];

    setConfig('playerBackground', nextMode);
    setPlayerStore('playerBackground', nextMode);
  };

  const startPress = (e: PointerEvent) => {
    if (e.button !== 0) return; // Only respond to primary (left/tap) button
    isLongPress = false;
    timerId = window.setTimeout(() => {
      isLongPress = true;
      toggleBackgroundMode();
    }, 200); // 600ms threshold for press-and-hold
  };

  const cancelPress = () => {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  };

  const endPress = (e: PointerEvent) => {
    cancelPress();
    if (isLongPress) {
      e.preventDefault();
      e.stopPropagation();
      isLongPress = false;
    } else {
      const { stream, playbackState, audio } = playerStore;
      if (stream.id && playbackState === 'playing') {
        audio.pause();
      } else {
        audio.play();
      }
    }
  };

  return (
    <button
      class={icons[playerStore.playbackState]}
      id="playButton"
      onPointerDown={startPress}
      onPointerUp={endPress}
      onPointerLeave={cancelPress}
      onContextMenu={(e) => {
        if (isLongPress) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      aria-label={t('player_play_button')}
    ></button>
  );
}
