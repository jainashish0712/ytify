import { setPlayerStore, playerStore } from "@stores";

export default function() {

  let imgRef!: HTMLImageElement;

  function handler() {
    const currentSrc = imgRef.src;
    if (currentSrc.includes('maxres') || currentSrc.includes('.webp') || currentSrc.includes('vi_webp')) {
      const newSrc = currentSrc
        .replace('maxres', 'mq')
        .replace('.webp', '.jpg')
        .replace('vi_webp', 'vi');
      if (newSrc !== playerStore.mediaArtwork) {
        setPlayerStore('mediaArtwork', newSrc);
      }
    }
  }

  return (
    <img
      ref={imgRef}
      src={playerStore.mediaArtwork}
      alt={"Media Artwork for " + playerStore.stream.title}
      onclick={() => {
        if (playerStore.isMusic)
          setPlayerStore('immersive', !playerStore.immersive);
        else
          setPlayerStore('isWatching', !playerStore.isWatching);
      }}
      onload={() => {
        if (imgRef.naturalWidth === 120)
          handler();
      }}
      onerror={() => {
        if (imgRef.src.includes('max'))
          handler();
      }}
    />
  )
}
