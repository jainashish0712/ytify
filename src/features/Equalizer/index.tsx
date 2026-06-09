import { For, onMount } from 'solid-js';
import './Equalizer.css';
import '../Player/slider.css';
import { equalizerInstance } from '../../lib/stores/player';
import { equalizerStore, setEqualizerStore, setNavStore } from '../../lib/stores';

const bands = [
  { freq: 40, label: '40' },
  { freq: 64, label: '64' },
  { freq: 90, label: '90' },
  { freq: 125, label: '125' },
  { freq: 250, label: '250' },
  { freq: 500, label: '500' },
  { freq: 1000, label: '1k' },
  { freq: 1500, label: '1.5k' },
  { freq: 2000, label: '2k' },
  { freq: 3000, label: '3k' },
  { freq: 4000, label: '4k' },
  { freq: 6000, label: '6k' },
  { freq: 8000, label: '8k' },
  { freq: 10000, label: '10k' },
  { freq: 12000, label: '12k' },
  { freq: 14000, label: '14k' },
  { freq: 16000, label: '16k' },
];

export default function Equalizer() {
  let equalizerRef: HTMLElement | undefined;

  onMount(() => {
    setNavStore('equalizer', 'ref', equalizerRef);
  });

  const handlePitchChange = (e: Event) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    setEqualizerStore('pitch', value);
    if (equalizerInstance) {
      equalizerInstance.setPitch(value);
    }
  };

  const handleGainChange = (index: number, e: Event) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    setEqualizerStore('bandGains', index, value);
    if (equalizerInstance) {
      equalizerInstance.setBandGain(index, value);
    }
  };

  const resetEQ = () => {
    setEqualizerStore('bandGains', Array(16).fill(0));
    setEqualizerStore('pitch', 0);
    if (equalizerInstance) {
      for (let i = 0; i < 16; i++) {
        equalizerInstance.setBandGain(i, 0);
      }
      equalizerInstance.setPitch(0);
    }
  };

  return (
    <section ref={equalizerRef} id="view-content" class="eq-basic-view">
      <header>
        <p>Equalizer</p>
      </header>

      <div class="eq-bands-wrapper">
        <For each={bands}>
          {(band, i) => (
            <div class="eq-band-col">
              <div class="eq-slider-holder">
                <input
                  type="range"
                  min="-12"
                  max="12"
                  step="0.1"
                  value={equalizerStore.bandGains[i()]}
                  onInput={(e) => handleGainChange(i(), e)}
                />
              </div>
              <span class="eq-band-lbl">{band.label}</span>
            </div>
          )}
        </For>
      </div>

      <div class="eq-pitch-wrapper">
        <div class="eq-pitch-header">
          <span>Pitch Shift</span>
          <span>{equalizerStore.pitch.toFixed(2)} st</span>
        </div>
        <input
          type="range"
          min="-12"
          max="12"
          step="0.01"
          value={equalizerStore.pitch}
          onInput={handlePitchChange}
        />
      </div>

      <button class="eq-btn-reset" onClick={resetEQ}>Reset Defaults</button>
    </section>
  );
}
