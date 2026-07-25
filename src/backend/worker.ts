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
import { getClient } from './utils.js';

const ALLOWED_ORIGINS = [
  'https://ytify.pp.ua',
  'https://ytify.netlify.app',
  'https://ytify.zeabur.app',
  'https://ytify-zeta.vercel.app',
  'https://ytify-legacy.vercel.app',
  'https://ytify-2nx7.onrender.com',
  'http://localhost:3000',
  'http://localhost:5173'
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
    const allowedOrigin = (origin && ALLOWED_ORIGINS.includes(origin)) ? origin : 'https://ytify.pp.ua';

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

    const isStreamfile = path === 'streamfile' || path.startsWith('streamfile/');
    if (isStreamfile) {
      const videoId = path.startsWith('streamfile/') ? path.split('/')[1] : searchParams.get('id');
      console.log("[streamfile] Request received for videoId:", videoId);
      if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
        console.log("[streamfile] Invalid video ID format:", videoId);
        return new Response(JSON.stringify({ error: 'Invalid video ID. Must be an 11-character YouTube video ID.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      try {
        console.log("[streamfile] Initializing Innertube client...");
        const yt = await getClient();
        console.log("[streamfile] Client initialized. Fetching video info...");
        const info = await yt.getInfo(videoId);
        console.log("[streamfile] Video Info fetched. Playability status:", JSON.stringify(info.playability_status));
        console.log("[streamfile] Streaming data exists:", !!info.streaming_data);
        
        if (info.streaming_data) {
          console.log("[streamfile] formats count:", info.streaming_data.formats?.length || 0);
          console.log("[streamfile] adaptive_formats count:", info.streaming_data.adaptive_formats?.length || 0);
          if (info.streaming_data.adaptive_formats && info.streaming_data.adaptive_formats.length > 0) {
            const firstFormat = info.streaming_data.adaptive_formats[0];
            console.log("[streamfile] First format keys:", Object.keys(firstFormat));
            console.log("[streamfile] First format sample details:", JSON.stringify({
              itag: firstFormat.itag,
              mime_type: firstFormat.mime_type,
              url: (firstFormat as any).url ? "has url" : "no url",
              signature_cipher: (firstFormat as any).signature_cipher ? "has signature_cipher" : "no signature_cipher",
              cipher: (firstFormat as any).cipher ? "has cipher" : "no cipher"
            }));
          }
        }

        console.log("[streamfile] Choosing format...");
        const format = info.chooseFormat({
          type: 'audio',
          quality: 'best'
        });
        console.log("[streamfile] Chosen format details:", JSON.stringify({
          itag: format.itag,
          mime_type: format.mime_type,
          url: (format as any).url ? "has url" : "no url",
          signature_cipher: (format as any).signature_cipher ? "has signature_cipher" : "no signature_cipher",
          cipher: (format as any).cipher ? "has cipher" : "no cipher"
        }));

        console.log("[streamfile] Deciphering URL...");
        const format_url = await format.decipher(yt.session.player);
        console.log("[streamfile] Deciphered URL:", format_url ? format_url.substring(0, 100) + "..." : "empty");

        if (!format_url) {
          throw new Error("Deciphered URL is empty");
        }

        const rangeHeader = request.headers.get('Range');
        console.log("[streamfile] Range header from request:", rangeHeader);
        const fetchHeaders: Record<string, string> = {
          'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0'
        };
        if (rangeHeader) {
          fetchHeaders['Range'] = rangeHeader;
        }

        console.log("[streamfile] Fetching audio data from YouTube...");
        const response = await fetch(format_url, { headers: fetchHeaders });
        console.log("[streamfile] Fetch response status:", response.status);

        const responseHeaders = new Headers(response.headers);
        responseHeaders.set('Access-Control-Allow-Origin', allowedOrigin);
        responseHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
        responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
        responseHeaders.set('Access-Control-Max-Age', '86400');
        responseHeaders.set('Vary', 'Origin');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders
        });
      } catch (err) {
        console.error("[streamfile] Error during execution:", err);
        const message = err instanceof Error ? err.message : 'Unknown error';
        return new Response(JSON.stringify({ error: `Audio extraction failed: ${message}` }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

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
