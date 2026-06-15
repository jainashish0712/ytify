import { onMount, onCleanup } from 'solid-js';
import noUiSlider from 'nouislider';
import 'nouislider/dist/nouislider.css';
import { playerStore } from '@stores';
import './AppleSeekSlider.css';

export function AppleSeekSlider() {
  let containerRef!: HTMLDivElement;
  let sliderRef!: HTMLDivElement;
  let tooltipRef!: HTMLDivElement;

  let dragging = false;
  let pointerStartY = 0;
  let currentCandidate = 0;

  function formatTime(s: number) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60), sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  function showTooltip(x: number, text: string) {
    if (!tooltipRef) return;
    tooltipRef.textContent = text;
    tooltipRef.style.left = `${x}px`;
    tooltipRef.style.bottom = '56px';
    tooltipRef.style.opacity = '1';
  }

  function hideTooltip() {
    if (tooltipRef) tooltipRef.style.opacity = '0';
  }

  onMount(() => {
    const audio = playerStore.audio;
    if (!audio) return;

    // init noUiSlider
    noUiSlider.create(sliderRef, {
      start: 0,
      range: { min: 0, max: 100 },
      connect: [true, false],
      behaviour: 'tap-drag',
      tooltips: false,
    });

    const updateBufferedVisual = () => {
      const buffer = audio.buffered;
      let duration = audio.duration || playerStore.fullDuration || 0;
      if (!buffer || buffer.length === 0) return;
      const end = buffer.end(buffer.length - 1);
      const pct = Math.min(100, (end / Math.max(duration, 1)) * 100);
      const base = sliderRef.querySelector('.noUi-base') as HTMLElement;
      // if (base) {
      //   base.style.background = `linear-gradient(90deg, hsl(from white h s l / 0.2) ${pct}%, var(--surface-2, #444) ${pct}%)`;
      // }
    };

    const updateSliderRange = () => {
      let duration = audio.duration || playerStore.fullDuration || 0;
      if (sliderRef && (sliderRef as any).noUiSlider && isFinite(duration) && duration > 0) {
         (sliderRef as any).noUiSlider.updateOptions({
            range: { min: 0, max: duration }
         });
      }
    };

    const onLoadedMetadata = () => {
      updateSliderRange();
    };

    const onTimeUpdate = () => {
      if (!dragging && (sliderRef as any).noUiSlider) {
        (sliderRef as any).noUiSlider.set(audio.currentTime);
      }
      updateBufferedVisual();
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);

    updateSliderRange();

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      dragging = true;
      pointerStartY = e.clientY;
      if (containerRef) {
        containerRef.setPointerCapture(e.pointerId);
      }
      if (sliderRef) {
        sliderRef.style.transform = 'scaleY(1.5)';
      }

      const rect = sliderRef.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      showTooltip(x, formatTime(audio.currentTime));

      // Instantly seek to position on tap
      let duration = audio.duration || playerStore.fullDuration || 0;
      const pct = x / rect.width;
      currentCandidate = pct * duration;
      if ((sliderRef as any).noUiSlider) {
        (sliderRef as any).noUiSlider.set(currentCandidate, true);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      const rect = sliderRef.getBoundingClientRect();
      let duration = audio.duration || playerStore.fullDuration || 0;
      const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const pct = x / rect.width;
      const offsetY = pointerStartY - e.clientY;
      const scrubSpeed = Math.max(0.2, Math.min(4, 1 + (offsetY / 120)));
      const targetFromPos = pct * duration;
      const delta = targetFromPos - audio.currentTime;
      currentCandidate = audio.currentTime + delta * scrubSpeed;
      currentCandidate = Math.max(0, Math.min(duration, currentCandidate));

      if ((sliderRef as any).noUiSlider) {
        (sliderRef as any).noUiSlider.set(currentCandidate, true);
      }
      showTooltip(x, formatTime(currentCandidate));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      if (containerRef) {
        containerRef.releasePointerCapture(e.pointerId);
      }
      if (sliderRef) {
        sliderRef.style.transform = 'scaleY(1)';
      }
      hideTooltip();
      if (isFinite(currentCandidate)) {
        audio.currentTime = currentCandidate;
      }
      if (navigator.vibrate) navigator.vibrate(8);
    };

    if (containerRef) {
      containerRef.addEventListener('pointerdown', onPointerDown);
      containerRef.addEventListener('pointermove', onPointerMove);
      containerRef.addEventListener('pointerup', onPointerUp);
    }

    (sliderRef as any).noUiSlider.on('set', (values: any, handleIdx: number, unencoded: number[], tap: boolean) => {
      if (!dragging && tap) {
        const t = parseFloat(values[0]);
        audio.currentTime = t;
      }
    });

    const onDblClick = () => {
      if (audio.paused) audio.play(); else audio.pause();
    };
    sliderRef.addEventListener('dblclick', onDblClick);

    onCleanup(() => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      if (containerRef) {
        containerRef.removeEventListener('pointerdown', onPointerDown);
        containerRef.removeEventListener('pointermove', onPointerMove);
        containerRef.removeEventListener('pointerup', onPointerUp);
      }
      sliderRef.removeEventListener('dblclick', onDblClick);
      if ((sliderRef as any).noUiSlider) {
        (sliderRef as any).noUiSlider.destroy();
      }
    });
  });

  return (
    <div ref={containerRef} class="apple-player">
      <div ref={sliderRef} class="apple-slider"></div>
      <div ref={tooltipRef} class="apple-tooltip">0:00</div>
    </div>
  );
}
