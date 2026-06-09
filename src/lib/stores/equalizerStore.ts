import { createStore } from "solid-js/store";

export type EqualizerStore = {
  bandGains: number[];
  pitch: number;
};

const createInitialState = (): EqualizerStore => ({
  bandGains: Array(16).fill(0),
  pitch: 0,
});

export const [equalizerStore, setEqualizerStore] = createStore(createInitialState());
