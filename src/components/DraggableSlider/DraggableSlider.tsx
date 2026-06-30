import { convertSStoHHMMSS } from "@utils";
import { createSignal, onMount } from "solid-js";

export const DraggableSlider = (props: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (val: number) => void;
  onInput?: (val: number) => void;
  formatValue?: (val: number) => string;
  hideLabels?: boolean;
}) => {
  let inputRef!: HTMLInputElement;
  const [isDragging, setIsDragging] = createSignal(false);
  const [dragValue, setDragValue] = createSignal(0);

  const displayValue = () => isDragging() ? dragValue() : props.value;

  const updateFromEvent = (e: PointerEvent) => {
    if (!inputRef) return;
    const rect = inputRef.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let p = x / rect.width;
    p = Math.max(0, Math.min(1, p));

    let rawV = props.min + p * (props.max - props.min);

    if (props.step) {
      const steps = Math.round((rawV - props.min) / props.step);
      rawV = props.min + steps * props.step;
    }

    const dragV = Math.max(props.min, Math.min(props.max, rawV));
    setDragValue(dragV);

    if (props.onInput && isDragging()) {
      props.onInput(dragV);
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    updateFromEvent(e);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (isDragging()) {
      updateFromEvent(e);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    if (isDragging()) {
      setIsDragging(false);
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      props.onChange(dragValue());
    }
  };

  onMount(() => {
    ['touchstart', 'touchmove', 'touchend'].forEach(type => {
      if (inputRef) {
        inputRef.addEventListener(type, (e) => e.stopPropagation());
      }
    });
  });

  const percent = () => {
    const range = props.max - props.min;
    if (range === 0) return 0;
    return ((displayValue() - props.min) / range) * 100;
  };

  const format = (v: number) => {
    if (props.formatValue) return props.formatValue(v);
    return convertSStoHHMMSS(Math.floor(v));
  };

  return (
    <span class="slider" style={{ "position": "relative" }}>
      <div style={{
        "position": "absolute",
        "left": `calc(${percent()}%)`,
        "bottom": "145px",
        "transform": `translateX(-50%) scale(${isDragging() ? 1 : 0})`,
        "transition": "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        "background": "var(--theme)",
        "color": "var(--theme-text, white)",
        "padding": "4px 8px",
        "border-radius": "6px",
        "font-size": "12px",
        "font-weight": "bold",
        "pointer-events": "none",
        "white-space": "nowrap",
        "box-shadow": "0 2px 8px rgba(0,0,0,0.3)",
        "z-index": "20",
        "transform-origin": "bottom center"
      }}>
        {format(displayValue())}
        <div style={{
          "position": "absolute",
          "bottom": "-3px",
          "left": "50%",
          "transform": "translateX(-50%) rotate(45deg)",
          "width": "8px",
          "height": "8px",
          "background": "var(--theme)",
          "z-index": "-1"
        }}></div>
      </div>
      <input
        ref={inputRef}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        onInput={(e) => {
          const val = parseFloat((e.target as HTMLInputElement).value);
          if (props.onInput) props.onInput(val);
        }}
        value={displayValue()}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          "touch-action": "none",
          "cursor": isDragging() ? "grabbing" : "grab"
        }}
      />
      {!props.hideLabels && (
        <div>
          <p id="currentDuration">{format(displayValue())}</p>
          <p id="fullDuration">{format(props.max)}</p>
        </div>
      )}
    </span>
  );
}