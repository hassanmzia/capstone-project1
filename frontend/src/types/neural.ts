/* ─── Electrode & Channel ─── */
export interface ElectrodeSite {
  id: number;
  row: number;
  col: number;
  enabled: boolean;
  impedance: number;
  spikeRate: number;
  noiseLevel: number;
}

export interface ChannelConfig {
  channelId: number;
  electrode: ElectrodeSite;
  gainMode: GainMode;
  filterEnabled: boolean;
  thresholdUv: number;
}

/* ─── Waveform & Spike Data ─── */
export interface NeuralSample {
  timestamp: number;
  channelId: number;
  value: number;
}

export interface WaveformData {
  channelId: number;
  samples: number[];
  sampleRate: number;
  startTime: number;
  duration: number;
}

export interface SpikeEvent {
  id: string;
  timestamp: number;
  channelId: number;
  electrodeId: number;
  amplitude: number;
  waveform: number[];
  clusterId?: number;
  sortCode?: number;
}

export interface SpikeCluster {
  id: number;
  channelId: number;
  color: string;
  meanWaveform: number[];
  spikeCount: number;
  firingRate: number;
}

/* ─── Heatmap ─── */
export interface HeatmapFrame {
  timestamp: number;
  rows: number;
  cols: number;
  data: number[];
}

/* ─── Recording ─── */
export interface RecordingSession {
  id: string;
  experimentId: string;
  name: string;
  status: RecordingStatus;
  startTime: string;
  endTime?: string;
  duration: number;
  spikeCount: number;
  fileSize: number;
  channels: number;
  sampleRate: number;
  notes: string;
}

export type RecordingStatus = "idle" | "recording" | "paused" | "stopped" | "error";

export interface RecordingConfig {
  name: string;
  experimentId: string;
  channels: number[];
  sampleRate: number;
  fileFormat: "raw" | "hdf5" | "nwb";
  triggerMode: "manual" | "threshold" | "external";
  triggerThreshold?: number;
  maxDuration?: number;
  notes: string;
}

/* ─── Hardware Configuration ─── */
export type GainMode = "low" | "medium" | "high" | "ultra";

export interface BiasParams {
  vRefP: number;
  vRefN: number;
  biasCasc: number;
  biasInp: number;
  biasOta: number;
  biasDiffamp: number;
  biasBuf: number;
  biasComp: number;
  biasThreshold: number;
  biasRef: number;
  biasSf: number;
  biasCalp: number;
  biasCaln: number;
  biasStim: number;
  biasReset: number;
  biasPga: number;
  biasAdc: number;
  biasDac: number;
  biasLvds: number;
  biasPad: number;
}

export interface ClockConfig {
  masterClockMhz: number;
  adcClockDiv: number;
  pixelClockDiv: number;
  stimClockDiv: number;
  pllEnabled: boolean;
  pllMultiplier: number;
  phaseOffset: number;
}

export interface TiaConfig {
  gain: number;
  bandwidth: number;
  inputBias: number;
  feedbackResistance: number;
  filterOrder: number;
  cutoffFrequency: number;
}

export interface StimulationConfig {
  enabled: boolean;
  channels: number[];
  waveform: "biphasic" | "monophasic" | "sine" | "custom";
  amplitudeUa: number;
  pulseDurationUs: number;
  frequencyHz: number;
  trainDurationMs: number;
  interPhaseDelayUs: number;
}

export interface PixelConfig {
  arrayRows: number;
  arrayCols: number;
  activePixels: number[];
  readoutOrder: "sequential" | "random" | "roi";
  roiStartRow: number;
  roiStartCol: number;
  roiEndRow: number;
  roiEndCol: number;
}

export interface HardwareConfig {
  bias: BiasParams;
  clock: ClockConfig;
  tia: TiaConfig;
  gainMode: GainMode;
  stimulation: StimulationConfig;
  pixel: PixelConfig;
}

/* ─── Experiment ─── */
export interface Experiment {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "active" | "completed" | "archived";
  owner: string;
  tags: string[];
  recordingCount: number;
  hardwarePreset: string;
  protocol: string;
}

/* ─── Agent / System ─── */
export interface AgentHealth {
  name: string;
  status: "online" | "degraded" | "offline" | "error";
  lastHeartbeat: string;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  version: string;
  taskQueue: number;
}

export interface SystemStatus {
  hardwareConnected: boolean;
  fpgaStatus: "ready" | "configuring" | "error" | "offline";
  dataRate: number;
  bufferUsage: number;
  temperature: number;
  agents: AgentHealth[];
}

/* ─── Chat / LLM ─── */
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: string;
  status: "pending" | "running" | "completed" | "error";
}

/* ─── Presets ─── */
export interface HardwarePreset {
  id: string;
  name: string;
  description: string;
  config: HardwareConfig;
  createdAt: string;
  createdBy: string;
  isDefault: boolean;
}

/* ─── Visualization ─── */
export type DisplayMode = "waveform" | "heatmap" | "raster" | "spectrum" | "isi";

export interface VisualizationConfig {
  displayMode: DisplayMode;
  selectedChannels: number[];
  timebaseMs: number;
  amplitudeScale: number;
  refreshRate: number;
  colormap: string;
  showSpikes: boolean;
  showThreshold: boolean;
  gridOverlay: boolean;
}
