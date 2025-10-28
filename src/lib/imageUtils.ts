import { img } from "./dom";




export const blankImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

// Generates both channel and stream thumbnails


export const generateImageUrl = (
  id: string,
  res: string,
  music: string = ''
) => {
  // channel images (start with '/')
  if (id.startsWith('/')) {
    const base = `yt3.googleusercontent.com${id}=s720-c-k-c0x00ffffff-no-rj&output=webp`;
    if (res === '2000') {
      return `https://wsrv.nl?url=https://${base}&w=2000&h=2000&fit=cover&output=webp`;
    }
    return `https://wsrv.nl?url=https://${base}&w=${res === 'mq' ? '180' : '360'}`;
  }

  // stream thumbnails
  if (res === '2000') {
    // request the actual maxres source and let wsrv resize it to 2000x2000
    const base = `i.ytimg.com/vi_webp/${id}/maxresdefault.webp${music}`;
    return `https://wsrv.nl?url=https://${base}&w=2000&h=2000&fit=cover&output=webp`;
  }

  // normal behaviour for other sizes
  const base = `i.ytimg.com/vi_webp/${id}/${res}default.webp${music}`;
  return `https://wsrv.nl?url=https://${base}`;
}



export function getThumbIdFromLink(url: string) {

  if (url.startsWith('/vi_webp'))
    url = url.slice(9, 20);

  // for featured playlists
  if (url.startsWith('/') || url.length === 11) return url;
  // simplify url
  if (url.includes('wsrv.nl'))
    url = url.replace('https://wsrv.nl?url=', '');

  const l = new URL(url);
  const p = l.pathname;

  return l.search.includes('ytimg') ?
    p.split('/')[2] :
    p.split('=')[0];
}



img.onload = () => img.naturalWidth === 120 ? img.src = img.src.replace('maxres', 'mq')
  .replace('.webp', '.jpg').replace('vi_webp', 'vi') : '';

img.onerror = () => img.src.includes('max') ? img.src = img.src.replace('maxres', 'mq')
  .replace('.webp', '.jpg').replace('vi_webp', 'vi') : '';

img.src = blankImage;

