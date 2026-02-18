import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { RecordingStatus } from "@/types/neural";

interface RecordingState {
  isRecording: boolean;
  currentRecordingId: string | null;
  status: RecordingStatus;
  duration: number;
  spikeCount: number;
  sampleRate: number;
  activeChannels: number;
  fileSize: number;
  bufferUsage: number;
  dataRate: number;
  error: string | null;
  recentRecordings: {
    id: string;
    name: string;
    duration: number;
    date: string;
    spikeCount: number;
  }[];
}

const initialState: RecordingState = {
  isRecording: false,
  currentRecordingId: null,
  status: "idle",
  duration: 0,
  spikeCount: 0,
  sampleRate: 30000,
  activeChannels: 0,
  fileSize: 0,
  bufferUsage: 0,
  dataRate: 0,
  error: null,
  recentRecordings: [],
};

const recordingSlice = createSlice({
  name: "recording",
  initialState,
  reducers: {
    startRecording(state, action: PayloadAction<{ id: string; sampleRate: number; channels: number }>) {
      state.isRecording = true;
      state.currentRecordingId = action.payload.id;
      state.status = "recording";
      state.sampleRate = action.payload.sampleRate;
      state.activeChannels = action.payload.channels;
      state.duration = 0;
      state.spikeCount = 0;
      state.fileSize = 0;
      state.error = null;
    },
    stopRecording(state) {
      state.isRecording = false;
      state.status = "stopped";
    },
    pauseRecording(state) {
      state.status = "paused";
    },
    resumeRecording(state) {
      state.status = "recording";
    },
    updateDuration(state, action: PayloadAction<number>) {
      state.duration = action.payload;
    },
    updateSpikeCount(state, action: PayloadAction<number>) {
      state.spikeCount = action.payload;
    },
    updateFileSize(state, action: PayloadAction<number>) {
      state.fileSize = action.payload;
    },
    updateBufferUsage(state, action: PayloadAction<number>) {
      state.bufferUsage = action.payload;
    },
    updateDataRate(state, action: PayloadAction<number>) {
      state.dataRate = action.payload;
    },
    setRecordingError(state, action: PayloadAction<string>) {
      state.status = "error";
      state.error = action.payload;
    },
    setRecentRecordings(state, action: PayloadAction<RecordingState["recentRecordings"]>) {
      state.recentRecordings = action.payload;
    },
    resetRecording(state) {
      Object.assign(state, initialState);
    },
  },
});

export const {
  startRecording,
  stopRecording,
  pauseRecording,
  resumeRecording,
  updateDuration,
  updateSpikeCount,
  updateFileSize,
  updateBufferUsage,
  updateDataRate,
  setRecordingError,
  setRecentRecordings,
  resetRecording,
} = recordingSlice.actions;

export default recordingSlice.reducer;
