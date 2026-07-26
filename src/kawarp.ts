import { Kawarp } from '@kawarp/core';
import { playerStore, equalizerInstance } from '@stores';
import { cssVar } from '@utils';

const KAWARP_DEFAULTS = {
    warpIntensity: 1,
    blurPasses: 3,
    animationSpeed: 1,
    transitionDuration: 4000,
    saturation: 1.2,
    dithering: 0.001,
    scale: 1.2,
    brightness: 6
    // scale: 1.25,
};


const BEAT_THRESHOLD = 0.85;
const SPEED_MULTIPLIER = 16;
const SCALE_BOOST_PCT = 8;
const BOOSTED_SCALE = KAWARP_DEFAULTS.scale + SCALE_BOOST_PCT / 70;
const SCALE_LERP_UP = 0.5;
const SCALE_LERP_DOWN = 0.12;
const SCALE_THRESHOLD = 0.001;
const ANALYSIS_INTERVAL = 100;
const CACHE_BUST_PARAM = 'not-from-cache-please';

export class KawarpVisualizer {
  public kawarp: Kawarp | null = null;
  public canvas: HTMLCanvasElement | null = null;
  public isInitialized = false;
  private _lastCoverUrl: string | null = null;
  private _currentScale = KAWARP_DEFAULTS.scale;
  private _targetScale = KAWARP_DEFAULTS.scale;
  private _currentArtworkScale = 1.0;
  private _targetArtworkScale = 1.0;
  private _lastAnalysisTime = 0;
  private _animationFrameId: number | null = null;
  private _isLooping = false;
  private _isPlaying = false;

  constructor() {}

  async init(canvas: HTMLCanvasElement) {
    if (this.isInitialized) {
      if (canvas !== this.canvas) {
        this.destroy();
      } else {
        this.start();
        return;
      }
    }

    try {
      this.canvas = canvas;
      this.kawarp = new Kawarp(canvas, { ...KAWARP_DEFAULTS });

      const coverUrl = playerStore.mediaArtwork;
      if (coverUrl && coverUrl !== 'data:image/png;base64,iVBORw0KGgoAAAANSUhAIjCB0C8AAAAASUVORK5CYII=') {
        this.loadCover(coverUrl);
      }

      this.kawarp.start();
      this._isPlaying = true;
      this.isInitialized = true;
      this.startLoop();
    } catch (error) {
      console.error('[Kawarp] Init failed:', error);
    }
  }

  loadCover(url: string) {
    if (!this.kawarp) return;
    if (url === this._lastCoverUrl) return;
    this._lastCoverUrl = url;
    const isLocal = url.startsWith('blob:') || url.startsWith('data:');
    const loadUrl = isLocal ? url : `${url}${url.includes('?') ? '&' : '?'}${CACHE_BUST_PARAM}`;
    this.kawarp
      .loadImage(loadUrl)
      .catch((err) => {
        console.warn('[Kawarp] Failed to load cover:', err);
        this._lastCoverUrl = null;
      });
  }

  resize() {
    if (this.kawarp) this.kawarp.resize();
  }

  start() {
    if (this.kawarp && !this._isPlaying) {
      this.kawarp.start();
      this._isPlaying = true;
    }
    if (!this._isLooping) {
      this._isLooping = true;
      this.startLoop();
    }
  }

  stop() {
    if (this.kawarp && this._isPlaying) {
      this.kawarp.stop();
      this._isPlaying = false;
    }
    if (this._isLooping) {
      this._isLooping = false;
      if (this._animationFrameId) {
        cancelAnimationFrame(this._animationFrameId);
        this._animationFrameId = null;
      }
    }
  }

  private startLoop() {
    const tick = () => {
      if (!this._isLooping) return;
      this.update();
      this._animationFrameId = requestAnimationFrame(tick);
    };
    this._animationFrameId = requestAnimationFrame(tick);
  }

  update() {
    if (!this.kawarp || !this.isInitialized) return;

    // Beat detection, throttled to every 100ms
    const now = performance.now();
    const analyser = equalizerInstance?.analyserNode;
    if (analyser && now - this._lastAnalysisTime >= ANALYSIS_INTERVAL) {
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buf);

      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const a = Math.abs(buf[i] - 128) / 128;
        if (a > peak) {
          peak = a;
          if (peak > BEAT_THRESHOLD) break;
        }
      }

      const isBeat = peak > BEAT_THRESHOLD;

      this.kawarp.animationSpeed = isBeat
        ? KAWARP_DEFAULTS.animationSpeed * SPEED_MULTIPLIER
        : KAWARP_DEFAULTS.animationSpeed;

      this._targetScale = isBeat ? BOOSTED_SCALE : KAWARP_DEFAULTS.scale;
      this._targetArtworkScale = isBeat ? 1.03 : 1.0;

      this._lastAnalysisTime = now;
    }

    // Scale lerp
    const diff = this._targetScale - this._currentScale;
    if (Math.abs(diff) > SCALE_THRESHOLD) {
      const lerp = diff > 0 ? SCALE_LERP_UP : SCALE_LERP_DOWN;
      this._currentScale += diff * lerp;
      this.kawarp.scale = this._currentScale;
    }

    // Artwork scale lerp
    const artDiff = this._targetArtworkScale - this._currentArtworkScale;
    if (Math.abs(artDiff) > 0.001) {
      const lerp = artDiff > 0 ? 0.3 : 0.08;
      this._currentArtworkScale += artDiff * lerp;
      cssVar('--artwork-scale', String(this._currentArtworkScale));
    } else if (this._currentArtworkScale !== this._targetArtworkScale) {
      this._currentArtworkScale = this._targetArtworkScale;
      cssVar('--artwork-scale', String(this._currentArtworkScale));
    }
  }

  destroy() {
    this._isLooping = false;
    this._isPlaying = false;
    if (this._animationFrameId) {
      cancelAnimationFrame(this._animationFrameId);
      this._animationFrameId = null;
    }
    if (this.kawarp) {
      this.kawarp.stop();
      this.kawarp.dispose();
      this.kawarp = null;
    }
    this.canvas = null;
    this.isInitialized = false;
    this._lastCoverUrl = null;
    this._currentScale = KAWARP_DEFAULTS.scale;
    this._targetScale = KAWARP_DEFAULTS.scale;
    cssVar('--artwork-scale', '1');
    this._currentArtworkScale = 1.0;
    this._targetArtworkScale = 1.0;
  }
}
