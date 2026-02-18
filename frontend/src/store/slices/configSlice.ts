import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { BiasParams, ClockConfig, GainMode, TiaConfig, StimulationConfig, PixelConfig } from "@/types/neural";

interface ConfigState {
  bias: BiasParams;
  clock: ClockConfig;
  tia: TiaConfig;
  gainMode: GainMode;
  stimulation: StimulationConfig;
  pixel: PixelConfig;
  isLoading: boolean;
  isDirty: boolean;
  lastSyncedAt: string | null;
  activePreset: string | null;
  error: string | null;
}

const defaultBias: BiasParams = {
  vRefP: 1.2, vRefN: 0.4, biasCasc: 0.8, biasInp: 0.5, biasOta: 0.6,
  biasDiffamp: 0.7, biasBuf: 0.5, biasComp: 0.6, biasThreshold: 0.5,
  biasRef: 0.8, biasSf: 0.5, biasCalp: 0.3, biasCaln: 0.3, biasStim: 0.0,
  biasReset: 0.5, biasPga: 0.6, biasAdc: 0.7, biasDac: 0.5, biasLvds: 0.6,
  biasPad: 0.4,
};

const defaultClock: ClockConfig = {
  masterClockMhz: 50, adcClockDiv: 4, pixelClockDiv: 2, stimClockDiv: 8,
  pllEnabled: true, pllMultiplier: 2, phaseOffset: 0,
};

const defaultTia: TiaConfig = {
  gain: 1000, bandwidth: 10000, inputBias: 0.5,
  feedbackResistance: 100000, filterOrder: 2, cutoffFrequency: 5000,
};

const defaultStimulation: StimulationConfig = {
  enabled: false, channels: [], waveform: "biphasic",
  amplitudeUa: 10, pulseDurationUs: 200, frequencyHz: 100,
  trainDurationMs: 1000, interPhaseDelayUs: 50,
};

const defaultPixel: PixelConfig = {
  arrayRows: 64, arrayCols: 64, activePixels: [],
  readoutOrder: "sequential", roiStartRow: 0, roiStartCol: 0,
  roiEndRow: 63, roiEndCol: 63,
};

const initialState: ConfigState = {
  bias: defaultBias,
  clock: defaultClock,
  tia: defaultTia,
  gainMode: "high",
  stimulation: defaultStimulation,
  pixel: defaultPixel,
  isLoading: false,
  isDirty: false,
  lastSyncedAt: null,
  activePreset: null,
  error: null,
};

const configSlice = createSlice({
  name: "config",
  initialState,
  reducers: {
    setBiasParams(state, action: PayloadAction<Partial<BiasParams>>) {
      Object.assign(state.bias, action.payload);
      state.isDirty = true;
    },
    setClockConfig(state, action: PayloadAction<Partial<ClockConfig>>) {
      Object.assign(state.clock, action.payload);
      state.isDirty = true;
    },
    setTiaConfig(state, action: PayloadAction<Partial<TiaConfig>>) {
      Object.assign(state.tia, action.payload);
      state.isDirty = true;
    },
    setGainMode(state, action: PayloadAction<GainMode>) {
      state.gainMode = action.payload;
      state.isDirty = true;
    },
    setStimulationConfig(state, action: PayloadAction<Partial<StimulationConfig>>) {
      Object.assign(state.stimulation, action.payload);
      state.isDirty = true;
    },
    setPixelConfig(state, action: PayloadAction<Partial<PixelConfig>>) {
      Object.assign(state.pixel, action.payload);
      state.isDirty = true;
    },
    setFullConfig(state, action: PayloadAction<{
      bias: BiasParams; clock: ClockConfig; tia: TiaConfig;
      gainMode: GainMode; stimulation: StimulationConfig; pixel: PixelConfig;
    }>) {
      state.bias = action.payload.bias;
      state.clock = action.payload.clock;
      state.tia = action.payload.tia;
      state.gainMode = action.payload.gainMode;
      state.stimulation = action.payload.stimulation;
      state.pixel = action.payload.pixel;
      state.isDirty = false;
    },
    setActivePreset(state, action: PayloadAction<string | null>) {
      state.activePreset = action.payload;
    },
    markSynced(state) {
      state.isDirty = false;
      state.lastSyncedAt = new Date().toISOString();
    },
    setConfigLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setConfigError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
    resetConfig(state) {
      state.bias = defaultBias;
      state.clock = defaultClock;
      state.tia = defaultTia;
      state.gainMode = "high";
      state.stimulation = defaultStimulation;
      state.pixel = defaultPixel;
      state.isDirty = false;
      state.activePreset = null;
    },
  },
});

export const {
  setBiasParams, setClockConfig, setTiaConfig, setGainMode,
  setStimulationConfig, setPixelConfig, setFullConfig,
  setActivePreset, markSynced, setConfigLoading, setConfigError,
  resetConfig,
} = configSlice.actions;

export default configSlice.reducer;
