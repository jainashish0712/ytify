import { playerStore, setPlayerStore, setStore, store } from "@stores";
import { config, convertSStoHHMMSS } from "@utils";

let playerAbortController: AbortController;
export async function player(id?: string) {

  if (playerAbortController)
    playerAbortController.abort();

  playerAbortController = new AbortController();

  if (!id) return;

  const enforceVideo = !playerStore.isMusic && playerStore.isWatching;

  if (!enforceVideo)
    setPlayerStore({
      playbackState: 'loading',
      status: 'Loading Audio...'
    });


  if (!store.useSaavn)
    setStore('useSaavn', true);
  else if (playerStore.stream.author?.endsWith('Topic'))
    return import('../modules/jioSaavn').then(mod => mod.default());

  const getStreamData = await import('@modules/getStreamData').then(mod => mod.default);
  const data = await getStreamData(id, false, playerAbortController.signal);

  if (data && 'adaptiveFormats' in data)
    setPlayerStore({
      data,
      fullDuration: data.lengthSeconds
    });
  else {
    const errorData = data as Record<'error' | 'message', string>;
    setPlayerStore({
      playbackState: 'none',
      status: errorData.message || errorData.error || 'Loading Audio Failed'
    });
    setStore('snackbar', playerStore.status);
    return;
  }

  const invidiousData = data as Invidious;

  let imgPath = '';
  const authorThumb = (invidiousData as any).authorThumbnails?.[0]?.url || '';
  if (authorThumb.includes('yt3.googleusercontent.com')) {
    const parts = authorThumb.split('yt3.googleusercontent.com');
    if (parts.length > 1) {
      imgPath = parts[1].split('=')[0]; // e.g. "/FQsPsZdaGUkT3_Q-9iilsYnS6xc0CAerb6pIhUou-skal6-jMQQ-xUigopbvfqVP_e-msHiabmCN2wCl"
    }
  }

  await import('../modules/setMetadata')
    .then(mod => mod.default({
      id,
      title: invidiousData.title,
      author: invidiousData.author,
      duration: convertSStoHHMMSS(invidiousData.lengthSeconds),
      authorId: invidiousData.authorId,
      img: imgPath || undefined
    }));

  import('../modules/setAudioStreams')
    .then(mod => mod.default(
      invidiousData.adaptiveFormats
        .filter(f => f.type.startsWith('audio'))
        .sort((a, b) => (parseInt(a.bitrate) - parseInt(b.bitrate)))
    ));


  if (config.similarContent && !enforceVideo)
    import('../modules/enqueueRelatedStreams')
      .then(mod => mod.default(invidiousData.recommendedVideos));



  // related streams imported into discovery after 1min 40seconds, short streams are naturally filtered out

  if (config.discover)
    import('../modules/setDiscoveries')
      .then(mod => {
        setTimeout(() => {
          mod.default(id, invidiousData.recommendedVideos);
        }, 1e5);
      });

}


