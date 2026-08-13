import { LikeButton, PlayButton, PlayNextButton } from "@components/MediaPartials";
import { params, playerStore, playPrev, queueStore, setPlayerStore, updateParam, t } from "@stores";
import { equalizerInstance } from '../../lib/stores/player'; // Direct relative import
import { setConfig } from "@utils";
import { Accessor, createSignal, Setter, Show } from "solid-js";
import { DraggableSlider } from "@components/DraggableSlider/DraggableSlider";

// function DraggableSlider(props: {
//   value: number;
//   max: number;
//   onChange: (val: number) => void;
// }) {
//   let inputRef!: HTMLInputElement;
//   const [isDragging, setIsDragging] = createSignal(false);
//   const [dragValue, setDragValue] = createSignal(0);

//   const displayValue = () => isDragging() ? dragValue() : props.value;

//   const updateFromEvent = (e: PointerEvent) => {
//     if (!inputRef) return;
//     const rect = inputRef.getBoundingClientRect();
//     console.log("21",rect);
//     const x = e.clientX - rect.left;
//     console.log("23",x);
//     let p = x / rect.width;
//     p = Math.max(0, Math.min(1, p));
//     console.log("26",p);
//     let dragV = p * (props.max || 1)
//     setDragValue(dragV);
//     console.log("28",dragV);
//     console.log("29",rect,x,p,dragV);
//   };

//   const onPointerDown = (e: PointerEvent) => {
//     setIsDragging(true);
//     (e.target as HTMLElement).setPointerCapture(e.pointerId);
//     updateFromEvent(e);
//   };

//   const onPointerMove = (e: PointerEvent) => {
//     if (isDragging()) {
//       updateFromEvent(e);
//     }
//   };

//   const onPointerUp = (e: PointerEvent) => {
//     if (isDragging()) {
//       setIsDragging(false);
//       (e.target as HTMLElement).releasePointerCapture(e.pointerId);
//       props.onChange(dragValue());
//     }
//   };

//   onMount(() => {
//     ['touchstart', 'touchmove', 'touchend'].forEach(type => {
//       if (inputRef) {
//         inputRef.addEventListener(type, (e) => e.stopPropagation());
//       }
//     });
//   });

//   const percent = () => {
//     const m = props.max || 1;
//     return (displayValue() / m) * 100;
//   };

//   return (
//     <span class="slider" style={{ "position": "relative" }}>
//       <div style={{
//         "position": "absolute",
//         "left": `calc(${percent()}%)`,
//         "bottom": "45px",
//         "transform": `translateX(-50%) scale(${isDragging() ? 1 : 0})`,
//         "transition": "transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
//         "background": "var(--theme)",
//         "color": "var(--theme-text, white)",
//         "padding": "4px 8px",
//         "border-radius": "6px",
//         "font-size": "12px",
//         "font-weight": "bold",
//         "pointer-events": "none",
//         "white-space": "nowrap",
//         "box-shadow": "0 2px 8px rgba(0,0,0,0.3)",
//         "z-index": "20",
//         "transform-origin": "bottom center"
//       }}>
//         {convertSStoHHMMSS(Math.floor(displayValue()))}
//         <div style={{
//           "position": "absolute",
//           "bottom": "-3px",
//           "left": "50%",
//           "transform": "translateX(-50%) rotate(45deg)",
//           "width": "8px",
//           "height": "8px",
//           "background": "var(--theme)",
//           "z-index": "-1"
//         }}></div>
//       </div>
//       <input
//         ref={inputRef}
//         type="range"
//         min="0"
//         max={props.max}
//         value={displayValue()}
//         onPointerDown={onPointerDown}
//         onPointerMove={onPointerMove}
//         onPointerUp={onPointerUp}
//         onPointerCancel={onPointerUp}
//         style={{
//           "touch-action": "none",
//           "cursor": isDragging() ? "grabbing" : "grab"
//         }}
//       />
//       <div>
//         <p id="currentDuration">{convertSStoHHMMSS(Math.floor(displayValue()))}</p>
//         <p id="fullDuration">{convertSStoHHMMSS(props.max)}</p>
//       </div>
//     </span>
//   );
// }

export default function (_: {
  showLyrics: Accessor<boolean>,
  setShowLyrics: Setter<boolean>
}) {

  const [isPointed, setPointed] = createSignal(params.has('t'));
  const [isVocalProcessing, setVocalProcessing] = createSignal(false);
  const [vocalVolume, setVocalVolumeSignal] = createSignal(1.0);

  function updatePositionState() {
    if ('mediaSession' in navigator)
      import('@modules/mediaSession').then(m => m.updateMediaSessionPosition());
  }

  function toggleVocalProcessing() {
    const newState = !isVocalProcessing();
    setVocalProcessing(newState);
    if (equalizerInstance) {
      if (newState) {
        equalizerInstance.enableRealtimeProcessing(true);
      }
      equalizerInstance.setVocalReductionActive(newState);
    }
  }

  return (
    <>
      <DraggableSlider
        value={playerStore.currentTime}
        max={playerStore.fullDuration}
        min={0}
        onChange={(val) => {
          playerStore.audio.currentTime = val;
        }}
      />

      <Show when={isVocalProcessing()}>
        <span class="slider vocal-slider"
        // style={{ "margin": "10px" }}
        >
          <label style={{ "font-size": "12px", "color": "var(--text)", "margin-bottom": "4px", "display": "block", "opacity": "0.8" }}>Vocal Volume</label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={vocalVolume()}
            oninput={(e) => {
              const vol = parseFloat(e.target.value);
              setVocalVolumeSignal(vol);
              if (equalizerInstance) {
                equalizerInstance.setVocalVolume(vol);
              }
            }}
          />
        </span>
      </Show>

      <div class="mainShelf">

        <Show when={queueStore.history.length}>
          <button
            aria-label={t('player_play_previous')}
            class="ri-skip-back-fill"
            id="playPrevButton"
            onclick={playPrev}
          ></button>
        </Show>

        <button
          aria-label={t('player_seek_backward')}
          class="ri-replay-15-line"
          id="seekBwdButton"
          onclick={() => {
            playerStore.audio.currentTime -= 5;
          }}
        ></button>

        <PlayButton />

        <button
          aria-label={t('player_seek_forward')}
          class="ri-forward-15-line"
          id="seekFwdButton"
          onclick={() => {
            playerStore.audio.currentTime += 5;
          }}
        ></button>
        <Show when={queueStore.list.length}>
          <PlayNextButton />
        </Show>

      </div>

      <div class="bottomShelf">

        <select
          id="playSpeed"
          value={playerStore.playbackRate.toFixed(2)}
          onchange={e => {
            const ref = e.target;
            const speed = parseFloat(ref.value);
            setPlayerStore('playbackRate', speed);

            // Apply speed (tempo only)
            playerStore.audio.playbackRate = speed;

            updatePositionState();
            ref.blur();
          }}
        >
          <option value="0.25">0.25x</option>
          <option value="0.33">0.33x</option>
          <option value="0.50">0.50x</option>
          <option value="0.75">0.75x</option>
          <option value="0.87">0.87x</option>
          <option value="0.97">0.97x</option>
          <option value="1.00">1.00x</option>
          <option value="1.05">1.05x</option>
          <option value="1.25">1.25x</option>
          <option value="1.50">1.50x</option>
          <option value="1.75">1.75x</option>
          <option value="2.00">2.00x</option>
          <option value="2.50">2.50x</option>
          <option value="3.00">3.00x</option>
          <option value="3.50">3.50x</option>
          <option value="4.00">4.00x</option>
        </select>

        <Show when={playerStore.isMusic}>
          <i
            aria-label={t('player_lyrics')}
            class="ri-music-2-line"
            classList={{
              on: _.showLyrics()
            }}
            onclick={() => _.setShowLyrics(!_.showLyrics())}
          ></i>
        </Show>


        <LikeButton />

        <i
          aria-label={t("player_loop")}
          class="ri-repeat-fill"
          classList={{ on: playerStore.loop }}
          onclick={() => {
            const newLoopState = !playerStore.loop;
            playerStore.audio.loop = newLoopState;
            setPlayerStore('loop', newLoopState);
          }}
        ></i>
        <Show when={!playerStore.isMusic}>
          <i
            aria-label={t('player_save_progress')}
            class={`ri-signpost-${isPointed() ? 'fill' : 'line'}`}
            onclick={() => {
              if (isPointed()) {
                updateParam('t');
                setPointed(false);
              }
              else {
                updateParam('t', playerStore.currentTime.toString());
                setPointed(true);
              }
            }}
          ></i>
        </Show>

        <select
          id="volumeChanger"
          value={playerStore.volume}
          onchange={e => {
            const ref = e.target;
            const vol = parseFloat(ref.value);
            console.log("[Controls.tsx] Volume slider onChange event fired. New value:", vol); // ADD THIS LINE
            if (equalizerInstance) {
              equalizerInstance.gainNode!.gain.value = vol;
              console.log("[Controls.tsx] Volume slider changed to:", vol, "Equalizer gain set to:", equalizerInstance.gainNode!.gain.value);
            }
            setConfig('volume', (vol * 100).toString());
            setPlayerStore('volume', vol);
            ref.blur();
          }}
        >
          <option value="0">0%</option>
          <option value="0.002">0.2%</option>
          <option value="0.005">0.5%</option>
          <option value="0.01">1%</option>
          <option value="0.02">2%</option>
          <option value="0.03">3%</option>
          <option value="0.05">5%</option>
          <option value="0.1">10%</option>
          <option value="0.15">15%</option>
          <option value="0.25">25%</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
        </select>

      </div>

      <div style={{ "display": "flex", "justify-content": "center",
        //  "margin-top": "-15%",
        //  "margin-bottom": "15px"
         }}>
        <button
          onclick={toggleVocalProcessing}
          style={{
            "background": isVocalProcessing() ? "var(--theme)" : "var(--surface)",
            "color": isVocalProcessing() ? "var(--theme-text)" : "var(--text)",
            // "padding": "8px 16px",
            "border-radius": "20px",
            "font-size": "14px",
            "cursor": "pointer",
            // "border": "1px solid var(--border)",
            // "display": "flex",
            // "align-items": "center",
            // "gap": "6px",
            "transition": "all 0.2s ease",
            // "margin": "10% 0 0 0"
          }}
        >
          <i class="ri-mic-line"></i>
          {isVocalProcessing() ? "Vocal Reduction On" : "Vocal Reduction Off"}
        </button>
      </div>

    </>
  );
}
