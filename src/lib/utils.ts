import { audio, settingsContainer, title } from "./dom";
import { getThumbIdFromLink } from "./imageUtils";
import player from "./player";
import { state, store } from "./store";
import fetchList from "../modules/fetchList";
import { fetchCollection, removeFromCollection } from "./libraryUtils";
import { i18n } from "../scripts/i18n.ts";


export const goTo = (route: Routes | 'history' | 'discover') => (<HTMLAnchorElement>document.getElementById(route)).click();

export const idFromURL = (link: string | null) => link?.match(/(https?:\/\/)?((www\.)?(youtube(-nocookie)?|youtube.googleapis)\.com.*(v\/|v=|vi=|vi\/|e\/|embed\/|user\/.*\/u\/\d+\/)|youtu\.be\/)([_0-9a-z-]+)/i)?.[7];

export const getApi = (
  type: 'piped' | 'invidious',
  index: number = store.api.index
) =>
  type === 'piped' ?
    store.api.piped.concat(store.player.hls.api)[index] :
    store.api.invidious[index];

const pathModifier = (url: string) => url.includes('=') ?
  'playlists=' + url.split('=')[1] :
  url.slice(1).split('/').join('=');

export const hostResolver = (url: string) =>
  store.linkHost + (store.linkHost.includes(location.origin) ? (url.
    startsWith('/watch') ?
    ('?s' + url.slice(8)) :
    ('/list?' + pathModifier(url))) : url);


export function proxyHandler(url: string, prefetch: boolean = false) {
  const isVideo = Boolean(document.querySelector('video'));
  const useProxy = true
  // const useProxy = state.enforceProxy || store.stream.author.endsWith('- Topic') && !isVideo && store.api.status === 'P';

  store.api.index = 0;
  if (!prefetch)
    title.textContent = i18n('player_audiostreams_insert');
  const link = new URL(url);
  const origin = link.origin.slice(8);
  const host = link.searchParams.get('host');
console.log("43",(url + (host ? '' : `&host=${origin}`)) ,
    url.replace(origin, "yt.omada.cafe"));
  return "https://yt.omada.cafe/videoplayback?expire=1763426410&ei=Cmwbade2LeCl-coPm6DsyAw&ip=76.8.147.117&id=o-ABJAowfMH7uVSXfL3DxY889gI9xCHS2Jd8ZCAA-GXVp2&itag=250&source=youtube&requiressl=yes&xpc=EgVo2aDSNQ%3D%3D&cps=96&met=1763404810%2C&mh=PH&mm=31%2C29&mn=sn-j85aaxt-jv0l%2Csn-q4fl6nz7&ms=au%2Crdu&mv=m&mvi=3&pl=24&rms=au%2Cau&gcr=us&initcwndbps=4372500&bui=AdEuB5RY8HHFA4jDsqXKMvBa7UCmpbaULhlBst16AlrsWiyPkbx4KMqiRgAPpWh9Qwm3aoKzSMLfo4Ym&spc=6b0G_KtsIGSkgpPLgF10n-xpqRZJ7zir-SRiL66l0QB4Tn4tUv9RL6DtgHvD9fcWz1M&vprv=1&svpuc=1&mime=audio%2Fwebm&ns=JPS3SGeyg-lJr0Q0kbbKFvUQ&rqh=1&gir=yes&clen=2152179&dur=222.281&lmt=1726262529795639&mt=1763404633&fvip=5&keepalive=yes&fexp=51552689%2C51565115%2C51565682%2C51580968&c=TVHTML5_SIMPLY&sefc=1&txp=4532434&n=YlZy_wCX7ZuKQw&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cgcr%2Cbui%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Cns%2Crqh%2Cgir%2Cclen%2Cdur%2Clmt&lsparams=cps%2Cmet%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpl%2Crms%2Cinitcwndbps&lsig=APaTxxMwRgIhAOzJLriTxJwFQiUVWJGEbpqXVNBFOopqIRhegM_uh-OYAiEA9VEIpYwdSHTl0f_23W6yi0j48jRfp6lEFJy-H2KETmE%3D&sig=AJfQdSswRgIhAKN0vhR4ryYBJ813nyFyq3ipEpVsJw_amFWQk_d9-oH2AiEA1WO0FanAivPTJHOmG7Uwq22ojrFq8_bIqumB9zcsf40%3D&pot=MnzwsmSiaeVxZfDyHkyWau5Hi7tDo-_SgbfYDTaRSylvWoF45Kf4CGJCTwJgumXaN5ZnQP0JqEVe-gYmvsIpXTGXGEWcI2VXi6TlQtEufPROqBwmj4ED6yML4UccREExbMRq3EBBGtiQKU_pRSE5nijZCYvbBgXTNlGVJYhW&cver=1.0&alr=no"
  // return useProxy ?
  //   (url + (host ? '' : `&host=${origin}`)) :
  //   (host && !state.customInstance) ? url.replace(origin, host) : url;
}

export async function quickSwitch() {
  if (!store.stream.id) return;
  if (store.player.playbackState === 'playing')
    audio.pause();
  const timeOfSwitch = audio.currentTime;
  await player(store.stream.id);
  audio.currentTime = timeOfSwitch;
  audio.play();
}


export async function preferredStream(audioStreams: AudioStream[]) {
  const preferedCodec: 'opus' | 'aac' = state.codec === 'any' ? ((await store.player.supportsOpus) ? 'opus' : 'aac') : state.codec;
  const itags = ({
    low: {
      opus: [600, 249, 251],
      aac: [599, 139, 140]
    },
    medium: {
      opus: [250, 249, 251],
      aac: [139, 140]
    },
    high: {
      opus: [251],
      aac: [140]
    }
  })[state.quality || 'medium'][preferedCodec];
  let stream!: AudioStream;
  for (const itag of itags) {
    if (stream?.url) continue;
    const v = audioStreams.find(v => v.url.includes(`itag=${itag}`));
    if (v) stream = v;
  }

  return stream;
}


export function notify(text: string) {
  const el = document.createElement('p');
  const clear = () => el.isConnected && el.remove();
  el.className = 'snackbar';
  el.textContent = text;
  el.onclick = clear;
  setTimeout(clear, 8e3);
  if (settingsContainer.open) {
    const settingsHeader = settingsContainer.firstElementChild as HTMLHeadingElement;
    settingsHeader.appendChild(el);
  } else
    document.body.appendChild(el);
}


export function convertSStoHHMMSS(seconds: number): string {
  if (seconds < 0) return '';
  if (seconds === Infinity) return 'Emergency Mode';
  const hh = Math.floor(seconds / 3600);
  seconds %= 3600;
  const mm = Math.floor(seconds / 60);
  const ss = Math.floor(seconds % 60);
  let mmStr = String(mm);
  let ssStr = String(ss);
  if (mm < 10) mmStr = '0' + mmStr;
  if (ss < 10) ssStr = '0' + ssStr;
  return (hh > 0 ?
    hh + ':' : '') + `${mmStr}:${ssStr}`;
}

export function handleXtags(audioStreams: AudioStream[]) {
  const isDRC = (url: string) => url.includes('drc%3D1');
  const useDRC = state.stableVolume && Boolean(audioStreams.find(a => isDRC(a.url)));
  const isOriginal = (a: { url: string }) => !a.url.includes('acont%3Ddubbed');

  return audioStreams
    .filter(a => useDRC ? isDRC(a.url) : !isDRC(a.url))
    .filter(isOriginal);
}

export async function getDownloadLink(id: string): Promise<string | null> {
  const streamUrl = 'https://youtu.be/' + id;
  let dl = '';
  dl = await fetch('https://cobalt-api.kwiatekmiki.com', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: streamUrl,
      downloadMode: 'audio',
      audioFormat: store.downloadFormat,
      filenameStyle: 'basic'
    })
  })
    .then(_ => _.json())
    .then(_ => {
      if ('url' in _)
        return _.url;
      else throw new Error(_.error.code);
    });

  if (!dl)
    dl = await fetch(`${store.player.fallback}/download/${id}?f=${store.downloadFormat}`)
      .then(_ => _.json())
      .then(_ => {
        if ('url' in _)
          return _.url;
        else throw new Error(_.error.code);
      })
      .catch(notify);

  return dl || '';
}

export async function errorHandler(
  message: string = '',
  redoAction: () => void,
) {

  if (message === 'nextpage error') return;

  if (
    message !== 'No Data Found' &&
    store.api.index < store.api.piped.length - 1
  ) {
    store.api.index++;
    return redoAction();
  }
  notify(message);
  store.api.index = 0;
}


// TLDR : Stream Item Click Action
export async function superClick(e: Event) {
  const elem = e.target as HTMLAnchorElement & { dataset: CollectionItem };
  if (elem.target === '_blank') return;
  e.preventDefault();

  const eld = elem.dataset;
  const elc = elem.classList.contains.bind(elem.classList);


  if (elc('streamItem'))
    if (elc('delete'))
      removeFromCollection(store.list.id, eld.id as string)
    else {
      if (state.jiosaavn) {
        const sta = store.stream;
        sta.id = eld.id as string;
        sta.title = eld.title as string;
        sta.author = eld.author as string;
        sta.channelUrl = eld.channel_url as string;
        sta.duration = eld.duration as string;
      }
      player(eld.id);
    }

  else if (elc('clxn_item'))
    fetchCollection(elem.href.split('=')[1]);


  else if (elc('ri-more-2-fill')) {
    const elp = elem.parentElement!.dataset;
    const sta = store.actionsMenu;
    sta.id = elp.id as string;
    sta.title = elp.title as string;
    sta.author = elp.author as string;
    sta.channelUrl = elp.channel_url as string;
    sta.duration = elp.duration as string;
    sta.lastUpdated = elp.last_updated as string || new Date().toISOString();
    const dialog = document.createElement('dialog');
    document.body.appendChild(dialog);
    import('../components/ActionsMenu.ts')
      .then(mod => mod.default(dialog));


  }


  else if (elc('listItem')) {

    // to prevent conflicts
    store.actionsMenu.author = '';

    let url = eld.url as string;

    if (!url.startsWith('/channel'))
      url = url.replace('?list=', 's/');

    store.list.name = (
      (location.search.endsWith('music_artists') ||
        (location.pathname === '/library' && state.defaultSuperCollection === 'artists')
      )
        ? 'Artist - ' : ''
    ) + eld.title;
    store.list.uploader = eld.uploader!;

    store.list.thumbnail = eld.thumbnail ? getThumbIdFromLink(eld.thumbnail) : '';

    fetchList(url);
  }
}
