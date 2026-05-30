import getAlbum from './getAlbum.js';
import getArtist from './getArtist.js';
import getChannel from './getChannel.js';
import getGallery from './getGallery.js';
import getPlaylist from './getPlaylist.js';
import getSearch from './getSearch.js';
import getSearchSuggestions from './getSearchSuggestions.js';
import getSimilar from './getSimilar.js';
import getSubFeed from './getSubFeed.js';
import type { Request, ExecutionContext } from '@cloudflare/workers-types';

const ALLOWED_ORIGINS = [
  'https://ytify.pp.ua',
  'https://ytify.netlify.app',
  'https://ytify.zeabur.app',
  'https://ytify-zeta.vercel.app',
  'https://ytify-legacy.vercel.app',
  'https://ytify-2nx7.onrender.com',
  'https://try-this.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://192.168.88.13:5173',
  'https://meq3d.netlify.app'
];

export interface Env {
  // Add any environment variables here if needed
}

export default {
  async fetch(
    request: Request,
    _env: Env,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : 'https://meq3d.netlify.app';

    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigin,
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const path = url.pathname.replace(/^\/api\//, '').replace(/^\//, '');
    const searchParams = url.searchParams;

    try {
      let data: unknown;

      switch (path) {
        case 'album': {
          const id = searchParams.get('id');
          if (!id) throw new Error('Missing id parameter');
          data = await getAlbum(id);
          break;
        }
        case 'artist': {
          const id = searchParams.get('id');
          if (!id) throw new Error('Missing id parameter');
          data = await getArtist(id);
          break;
        }
        case 'channel': {
          const id = searchParams.get('id');
          if (!id) throw new Error('Missing id parameter');
          data = await getChannel(id);
          break;
        }
        case 'gallery': {
          const id = searchParams.get('id');
          if (!id) throw new Error('Missing id parameter');
          data = await getGallery(id.split(','));
          break;
        }
        case 'playlist': {
          const id = searchParams.get('id');
          const all = searchParams.get('all') === 'true';
          if (!id) throw new Error('Missing id parameter');
          data = await getPlaylist(id, all);
          break;
        }
        case 'search': {
          const q = searchParams.get('q');
          const f = searchParams.get('f');
          if (!q) throw new Error('Missing q parameter');
          data = await getSearch({ q, f: f || undefined });
          break;
        }
        case 'search-suggestions': {
          const q = searchParams.get('q');
          const music = searchParams.get('music') === 'true';
          if (!q) throw new Error('Missing q parameter');
          data = await getSearchSuggestions({ q, music });
          break;
        }
        case 'similar': {
          const title = searchParams.get('title');
          const artist = searchParams.get('artist');
          const limit = searchParams.get('limit');
          if (!title || !artist) throw new Error('Missing title or artist parameter');
          data = await getSimilar({ title, artist, limit: limit || undefined });
          break;
        }
        case 'subfeed': {
          const id = searchParams.get('id');
          if (!id) throw new Error('Missing id parameter');
          data = await getSubFeed(id.split(','));
          break;
        }
        case 'proxy': {
          const streamUrl = searchParams.get('url');
          if (!streamUrl) throw new Error('Missing url parameter');

          if (typeof process !== 'undefined' && process.versions?.node) {
            const { spawn } = await import('node:child_process');
            const { join } = await import('node:path');
            const { existsSync } = await import('node:fs');

            const irsPath = join(process.cwd(), 'public/irs/testeqapo3 - Copy.wav');
            
            if (!existsSync(irsPath)) {
              console.error(`[Proxy] IRS file NOT found at: ${irsPath}`);
            }

            const ffmpeg = spawn('ffmpeg', [
              '-hide_banner',
              '-loglevel', 'error',
              '-user_agent', request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              '-i', streamUrl,
              '-i', irsPath,
              '-filter_complex',
              '[0:a]equalizer=f=40:t=o:w=1:g=4,equalizer=f=150:t=o:w=1:g=5,equalizer=f=400:t=o:w=1:g=4,equalizer=f=1000:t=o:w=1:g=4,equalizer=f=2000:t=o:w=1:g=4,equalizer=f=4000:t=o:w=1:g=4,equalizer=f=8000:t=o:w=1:g=1,equalizer=f=16000:t=o:w=1:g=-1,asetrate=44100*1.2676,aresample=44100[eq];[eq][1:a]afir',
              '-c:a', 'libmp3lame',
              '-q:a', '2',
              '-f', 'mp3',
              'pipe:1'
            ]);

            const stream = new ReadableStream({
              start(controller) {
                console.log(`[Proxy] Starting FFmpeg stream for: ${streamUrl}`);
                ffmpeg.stdout.on('data', (chunk) => {
                  controller.enqueue(new Uint8Array(chunk));
                });
                ffmpeg.stdout.on('end', () => {
                  console.log('[Proxy] FFmpeg stream ended.');
                  controller.close();
                });
                ffmpeg.stderr.on('data', (data) => {
                  const msg = data.toString();
                  if (msg.includes('Error') || msg.includes('failed')) {
                    console.error(`[FFmpeg Error] ${msg}`);
                  } else {
                    console.log(`[FFmpeg] ${msg.trim()}`);
                  }
                });
                ffmpeg.on('error', (err) => {
                  console.error(`[Proxy] FFmpeg Spawn Error: ${err}`);
                  controller.error(err);
                });
                ffmpeg.on('close', (code) => {
                  if (code !== 0 && code !== null) {
                    console.error(`[Proxy] FFmpeg process exited with code ${code}`);
                  }
                });
              },
              cancel() {
                console.log('[Proxy] Client cancelled stream, killing FFmpeg.');
                ffmpeg.kill();
              }
            });

            return new Response(stream, {
              status: 200,
              headers: {
                ...corsHeaders,
                'Content-Type': 'audio/mpeg',
                'Accept-Ranges': 'none'
              }
            });
          } else {
            const res = await fetch(streamUrl);
            return new Response(res.body, {
              status: res.status,
              headers: { ...corsHeaders, 'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg' }
            });
          }
        }
        default:
          return new Response(JSON.stringify({ error: 'Not Found' }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
      }

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600'
        }
      });
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : 'Unknown error';
      return new Response(JSON.stringify({ error: message }), {
        status: message.startsWith('Missing') ? 400 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};
