import { playerStore, setPlayerStore, t } from "@stores";
import { handleXtags, preferredStream, proxyHandler } from "@utils";

export default async function(
  audioStreams: AudioStream[],
  prefetchNode?: HTMLAudioElement
) {

  if (!prefetchNode)
    setPlayerStore('status', t('player_audiostreams_setup'));

  const noOfBitrates = audioStreams.length;

  if (!noOfBitrates) {
    setPlayerStore('status', t('player_audiostreams_null'));
    setPlayerStore('playbackState', 'none');
    return;
  }


  const stream = await preferredStream(handleXtags(audioStreams));
  //qualityView.textContent = stream.quality + ' ' + stream.codec;
  const target = prefetchNode;
  if (target) {
    delete target.dataset.retried;
    target.src = proxyHandler(stream.url, true);
  } else {
    setPlayerStore('status', 'Separating Vocals & Instrumental...');
    import('./audioSeparator').then(async ({ separateAudio }) => {
        try {
            const { vocals, instrumental } = await separateAudio(proxyHandler(stream.url, false));
            
            playerStore.instances[0].src = vocals;
            playerStore.instances[1].src = instrumental;

            playerStore.instances.forEach(inst => delete inst.dataset.retried);
            
            setPlayerStore('status', '');
            // The onloadstart in player.ts will handle playing the active instance
        } catch (e) {
            console.error('Demucs separation failed:', e);
            setPlayerStore('status', 'Separation failed, falling back...');
            playerStore.instances.forEach(instance => {
                delete instance.dataset.retried;
                instance.src = proxyHandler(stream.url, false);
            });
        }
    });
  }

}
