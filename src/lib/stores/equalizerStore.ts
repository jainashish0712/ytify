import { createStore } from "solid-js/store";

export type EqualizerStore = {
  bandGains: number[];
  pitch: number;
  reverb: {
    time: number;
    decay: number;
    mix: number;
  };
  lpf: {
    frequency: number;
    peak: number;
  };
};

const createInitialState = (): EqualizerStore => ({
  bandGains: Array(16).fill(0),
  pitch: 0,
  reverb: {
    time: 0.01,
    decay: 0.01,
    mix: 0,
  },
  lpf: {
    frequency: 22050,
    peak: 1,
  },
});

export const [equalizerStore, setEqualizerStore] = createStore(createInitialState());
