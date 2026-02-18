import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { DisplayMode } from "@/types/neural";

interface VisualizationState {
  selectedChannels: number[];
  displayMode: DisplayMode;
  refreshRate: number;
  timebaseMs: number;
  amplitudeScale: number;
  colormap: string;
  showSpikes: boolean;
  showThreshold: boolean;
  gridOverlay: boolean;
  isPaused: boolean;
  zoomLevel: number;
  panOffset: { x: number; y: number };
  heatmapRange: { min: number; max: number };
}

const initialState: VisualizationState = {
  selectedChannels: Array.from({ length: 16 }, (_, i) => i),
  displayMode: "waveform",
  refreshRate: 30,
  timebaseMs: 100,
  amplitudeScale: 1.0,
  colormap: "viridis",
  showSpikes: true,
  showThreshold: true,
  gridOverlay: false,
  isPaused: false,
  zoomLevel: 1.0,
  panOffset: { x: 0, y: 0 },
  heatmapRange: { min: 0, max: 100 },
};

const visualizationSlice = createSlice({
  name: "visualization",
  initialState,
  reducers: {
    setSelectedChannels(state, action: PayloadAction<number[]>) {
      state.selectedChannels = action.payload;
    },
    toggleChannel(state, action: PayloadAction<number>) {
      const idx = state.selectedChannels.indexOf(action.payload);
      if (idx >= 0) {
        state.selectedChannels.splice(idx, 1);
      } else {
        state.selectedChannels.push(action.payload);
      }
    },
    setDisplayMode(state, action: PayloadAction<DisplayMode>) {
      state.displayMode = action.payload;
    },
    setRefreshRate(state, action: PayloadAction<number>) {
      state.refreshRate = action.payload;
    },
    setTimebase(state, action: PayloadAction<number>) {
      state.timebaseMs = action.payload;
    },
    setAmplitudeScale(state, action: PayloadAction<number>) {
      state.amplitudeScale = action.payload;
    },
    setColormap(state, action: PayloadAction<string>) {
      state.colormap = action.payload;
    },
    toggleSpikes(state) {
      state.showSpikes = !state.showSpikes;
    },
    toggleThreshold(state) {
      state.showThreshold = !state.showThreshold;
    },
    toggleGridOverlay(state) {
      state.gridOverlay = !state.gridOverlay;
    },
    togglePause(state) {
      state.isPaused = !state.isPaused;
    },
    setZoomLevel(state, action: PayloadAction<number>) {
      state.zoomLevel = action.payload;
    },
    setPanOffset(state, action: PayloadAction<{ x: number; y: number }>) {
      state.panOffset = action.payload;
    },
    setHeatmapRange(state, action: PayloadAction<{ min: number; max: number }>) {
      state.heatmapRange = action.payload;
    },
    resetView(state) {
      state.zoomLevel = 1.0;
      state.panOffset = { x: 0, y: 0 };
      state.amplitudeScale = 1.0;
    },
  },
});

export const {
  setSelectedChannels, toggleChannel, setDisplayMode, setRefreshRate,
  setTimebase, setAmplitudeScale, setColormap, toggleSpikes, toggleThreshold,
  toggleGridOverlay, togglePause, setZoomLevel, setPanOffset, setHeatmapRange,
  resetView,
} = visualizationSlice.actions;

export default visualizationSlice.reducer;
