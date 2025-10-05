// Simple 3-band equalizer using Web Audio API

export class Equalizer {
  private ctx: AudioContext;
  private source: MediaElementAudioSourceNode;
  private filters: BiquadFilterNode[];

  constructor(audio: HTMLAudioElement) {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    this.source = this.ctx.createMediaElementSource(audio);

    // Bass, Mid, Treble
    this.filters = [
      this.ctx.createBiquadFilter(),
      this.ctx.createBiquadFilter(),
      this.ctx.createBiquadFilter()
    ];

    // Bass
    this.filters[0].type = 'lowshelf';
    this.filters[0].frequency.value = 60;
    this.filters[1].Q.value = 0.7;

    // Mid
    this.filters[1].type = 'peaking';
    this.filters[1].frequency.value = 1000;
    this.filters[1].Q.value = 1;

    // Treble
    this.filters[2].type = 'highshelf';
    this.filters[2].frequency.value = 3000;

    // Connect filters in series
    this.source.connect(this.filters[0]);
    this.filters[0].connect(this.filters[1]);
    this.filters[1].connect(this.filters[2]);
    this.filters[2].connect(this.ctx.destination);

    // Resume context on play (required by browsers)
    audio.addEventListener('play', () => {
      if (this.ctx.state !== 'running') {
        this.ctx.resume();
      }
    });
  }

  setBandGain(band: 'bass' | 'mid' | 'treble', gain: number) {
    if (band === 'bass') this.filters[0].gain.value = gain;
    if (band === 'mid') this.filters[1].gain.value = gain;
    if (band === 'treble') this.filters[2].gain.value = gain;
  }
}