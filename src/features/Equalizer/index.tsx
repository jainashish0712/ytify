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

  const handleReverbChange = (key: 'time' | 'decay' | 'mix', e: Event) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    setEqualizerStore('reverb', key, value);
    if (equalizerInstance) {
      if (key === 'time') equalizerInstance.setReverbTime(value);
      else if (key === 'decay') equalizerInstance.setReverbDecay(value);
      else if (key === 'mix') equalizerInstance.setReverbMix(value);
    }
  };

  const handleLPFChange = (key: 'frequency' | 'peak', e: Event) => {
    const value = parseFloat((e.target as HTMLInputElement).value);
    setEqualizerStore('lpf', key, value);
    if (equalizerInstance) {
      if (key === 'frequency') equalizerInstance.setLPFFrequency(value);
      else if (key === 'peak') equalizerInstance.setLPFPeak(value);
    }
  };

  const resetEQ = () => {
    setEqualizerStore('bandGains', Array(16).fill(0));
    setEqualizerStore('pitch', 0);
    setEqualizerStore('reverb', { time: 0.01, decay: 0.01, mix: 0 });
    setEqualizerStore('lpf', { frequency: 22050, peak: 1 });
    if (equalizerInstance) {
      for (let i = 0; i < 16; i++) {
        equalizerInstance.setBandGain(i, 0);
      }
      equalizerInstance.setPitch(0);
      equalizerInstance.setReverbTime(0.01);
      equalizerInstance.setReverbDecay(0.01);
      equalizerInstance.setReverbMix(0);
      equalizerInstance.setLPFFrequency(22050);
      equalizerInstance.setLPFPeak(1);
    }
  };

  return (
    <section ref={equalizerRef} id="view-content" class="eq-basic-view">
      <header>
        <p>Equalizer</p>
      </header>

      <div class="eq-scroll-container">
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
            min="-5"
            max="5"
            step="0.1"
            value={equalizerStore.pitch}
            onInput={handlePitchChange}
          />
        </div>

        <div class="eq-reverb-wrapper">
          <div class="eq-reverb-header">
            <span>Reverb</span>
          </div>

          <div class="eq-reverb-row">
            <span>Time: {equalizerStore.reverb.time.toFixed(2)}s</span>
            <input
              type="range"
              min="0.01"
              max="3"
              step="0.01"
              value={equalizerStore.reverb.time}
              onInput={(e) => handleReverbChange('time', e)}
            />
          </div>

          <div class="eq-reverb-row">
            <span>Decay: {equalizerStore.reverb.decay.toFixed(2)}s</span>
            <input
              type="range"
              min="1"
              max="5"
              step="0.1"
              value={equalizerStore.reverb.decay}
              onInput={(e) => handleReverbChange('decay', e)}
            />
          </div>

          <div class="eq-reverb-row">
            <span>Mix: {equalizerStore.reverb.mix.toFixed(2)}</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.02"
              value={equalizerStore.reverb.mix}
              onInput={(e) => handleReverbChange('mix', e)}
            />
          </div>
        </div>

        <div class="eq-lpf-wrapper">
          <div class="eq-lpf-header">
            <span>Low-Pass Filter</span>
          </div>

          <div class="eq-lpf-row">
            <span>Frequency: {equalizerStore.lpf.frequency.toFixed(0)}Hz</span>
            <input
              type="range"
              min="10"
              max="22050"
              step="20"
              value={equalizerStore.lpf.frequency}
              onInput={(e) => handleLPFChange('frequency', e)}
            />
          </div>

          <div class="eq-lpf-row">
            <span>Peak: {equalizerStore.lpf.peak.toFixed(2)}</span>
            <input
              type="range"
              min="1"
              max="20"
              step="0.1"
              value={equalizerStore.lpf.peak}
              onInput={(e) => handleLPFChange('peak', e)}
            />
          </div>
        </div>

        <button class="eq-btn-reset" onClick={resetEQ}>Reset Defaults</button>
      </div>
    </section>
  );
}
