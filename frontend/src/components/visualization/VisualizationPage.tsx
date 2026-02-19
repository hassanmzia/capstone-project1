/**
 * Main visualization page integrating all neural data display components.
 *
 * Layout:
 * - Main area: WaveformDisplay (~60%)
 * - Right panel: SpikeHeatmap / ElectrodeArrayMap (togglable)
 * - Bottom panel: FFTDisplay / SpectrogramDisplay / PCBDataDisplay (togglable)
 * - Left panel: Channel list with checkboxes
 * - Top toolbar: display mode, timebase, amplitude, recording controls
 * - Resizable panels using CSS grid
 * - Tab system to switch between visualization modes
 */

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import {
  setDisplayMode,
  setTimebase,
  toggleSpikes,
  toggleThreshold,
  toggleGridOverlay,
  togglePause,
  toggleChannel,
  setSelectedChannels,
} from "@/store/slices/visualizationSlice";
import type { DisplayMode } from "@/types/neural";

// Visualization components
import WaveformDisplay from "./WaveformDisplay";
import SpikeHeatmap from "./SpikeHeatmap";
import ElectrodeArrayMap from "./ElectrodeArrayMap";
import FFTDisplay from "./FFTDisplay";
import SpectrogramDisplay from "./SpectrogramDisplay";
import PCBDataDisplay from "./PCBDataDisplay";
import TelemetryPanel from "./TelemetryPanel";
import RasterDisplay from "./RasterDisplay";

// Shared data contexts
import { NeuralDataProvider } from "@/contexts/NeuralDataContext";
import { SpikeEventsProvider } from "@/contexts/SpikeEventsContext";
import { useRecordingSession } from "@/contexts/RecordingSessionContext";

// Icons
import {
  Activity,
  Grid3X3,
  BarChart3,
  Waves,
  Pause,
  Play,
  Eye,
  EyeOff,
  Crosshair,
  Monitor,
  Cpu,
  Radio,
  Thermometer,
  LayoutGrid,
  Circle,
  XCircle,
  Disc,
  SkipBack,
  SkipForward,
  Zap,
  Clock,
  HardDrive,
} from "lucide-react";

type RightPanelTab = "heatmap" | "electrode";
type BottomPanelTab = "fft" | "spectrogram" | "pcb" | "none";

const displayModes: { mode: DisplayMode; label: string; icon: typeof Activity }[] = [
  { mode: "waveform", label: "Waveform", icon: Activity },
  { mode: "heatmap", label: "Heatmap", icon: Grid3X3 },
  { mode: "raster", label: "Raster", icon: BarChart3 },
  { mode: "spectrum", label: "Spectrum", icon: Waves },
];

export default function VisualizationPage() {
  const dispatch = useDispatch();
  const viz = useSelector((state: RootState) => state.visualization);
  const { mode, activeSession, playbackSession, endPlayback } = useRecordingSession();

  // Determine channel count from data source
  const sourceChannelCount =
    mode === "live" && activeSession ? activeSession.channels :
    mode === "playback" && playbackSession ? playbackSession.channels :
    64;

  // Playback state
  const [playbackElapsed, setPlaybackElapsed] = useState(0);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const playbackTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parse total duration from playback session (format: "MM:SS")
  const playbackTotalSec = useMemo(() => {
    if (!playbackSession) return 0;
    const parts = playbackSession.duration.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
  }, [playbackSession]);

  // Reset playback position when session changes
  useEffect(() => {
    setPlaybackElapsed(0);
    setPlaybackPaused(false);
    setPlaybackSpeed(1);
  }, [playbackSession?.recordingId]);

  // Playback timer
  useEffect(() => {
    if (mode !== "playback" || !playbackSession || playbackPaused) {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      return;
    }

    playbackTimerRef.current = setInterval(() => {
      setPlaybackElapsed((prev) => {
        const next = prev + playbackSpeed;
        if (next >= playbackTotalSec) {
          setPlaybackPaused(true);
          return playbackTotalSec;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
    };
  }, [mode, playbackSession, playbackPaused, playbackSpeed, playbackTotalSec]);

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // Detect mobile for layout decisions
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Panel states — auto-collapse on mobile
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("heatmap");
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>("fft");
  const [showLeftPanel, setShowLeftPanel] = useState(!isMobile);
  const [showRightPanel, setShowRightPanel] = useState(!isMobile);
  const [showBottomPanel, setShowBottomPanel] = useState(!isMobile);
  const [showTelemetry, setShowTelemetry] = useState(!isMobile);

  // Channel selection from electrode array
  const handleElectrodeSelect = useCallback(
    (channels: number[]) => {
      dispatch(setSelectedChannels(channels));
    },
    [dispatch]
  );

  // Quick channel select helpers
  const selectAllChannels = useCallback(() => {
    dispatch(setSelectedChannels(Array.from({ length: sourceChannelCount }, (_, i) => i)));
  }, [dispatch, sourceChannelCount]);

  const clearAllChannels = useCallback(() => {
    dispatch(setSelectedChannels([]));
  }, [dispatch]);

  // Grid template — simpler on mobile
  const gridTemplate = useMemo(() => {
    const isSm = typeof window !== "undefined" && window.innerWidth < 768;
    const cols: string[] = [];
    if (showLeftPanel && !isSm) cols.push("220px");
    cols.push("1fr");
    if (showRightPanel && !isSm) cols.push("280px");

    const rows: string[] = ["auto"];
    rows.push("1fr");
    if (showBottomPanel && !isSm) rows.push("240px");
    else if (showBottomPanel && isSm) rows.push("180px");

    return {
      gridTemplateColumns: cols.join(" "),
      gridTemplateRows: rows.join(" "),
    };
  }, [showLeftPanel, showRightPanel, showBottomPanel]);

  return (
    <div className="flex flex-col h-full gap-0 overflow-hidden">
      {/* ─── Top Toolbar ─── */}
      <div className="flex items-center flex-wrap bg-neural-surface border-b border-neural-border px-2 md:px-3 py-1.5 md:py-2 shrink-0 gap-1 md:gap-2">
        {/* Display mode tabs */}
        <div className="flex items-center gap-0.5 md:gap-1 bg-neural-surface-alt rounded-lg p-0.5 shrink-0">
          {displayModes.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => dispatch(setDisplayMode(mode))}
              className={`flex items-center gap-1 md:gap-1.5 px-1.5 md:px-2.5 py-1 rounded-md text-xs font-medium neural-transition ${
                viz.displayMode === mode
                  ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                  : "text-neural-text-secondary hover:text-neural-text-primary"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Data source indicator */}
        <div className="flex items-center gap-2 shrink-0">
          {mode === "live" && activeSession && (
            <div className="flex items-center gap-1.5 bg-neural-accent-red/15 border border-neural-accent-red/30 rounded-lg px-2.5 py-1">
              <Circle className="w-2.5 h-2.5 text-neural-accent-red animate-pulse fill-current" />
              <span className="text-xs font-semibold text-neural-accent-red tracking-wide">LIVE</span>
              <span className="hidden sm:inline text-[10px] text-neural-accent-red/70 font-mono">{activeSession.name}</span>
              {activeSession.isPaused && (
                <span className="text-[10px] text-neural-accent-amber ml-1">(PAUSED)</span>
              )}
            </div>
          )}
          {mode === "playback" && playbackSession && (
            <div className="flex items-center gap-1.5 bg-neural-accent-purple/15 border border-neural-accent-purple/30 rounded-lg px-2.5 py-1">
              <Disc className="w-3 h-3 text-neural-accent-purple" />
              <span className="text-xs font-semibold text-neural-accent-purple tracking-wide">PLAYBACK</span>
              <span className="hidden sm:inline text-[10px] text-neural-accent-purple/70 font-mono">{playbackSession.name}</span>
              <span className="hidden sm:inline text-[10px] text-neural-text-muted">({playbackSession.duration})</span>
              <button
                onClick={() => endPlayback()}
                className="ml-1 p-0.5 rounded hover:bg-neural-accent-purple/20 text-neural-accent-purple/60 hover:text-neural-accent-purple neural-transition"
                title="Exit playback"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {mode === "simulation" && (
            <div className="flex items-center gap-1.5 bg-neural-accent-cyan/10 border border-neural-accent-cyan/20 rounded-lg px-2.5 py-1">
              <Activity className="w-3 h-3 text-neural-accent-cyan" />
              <span className="text-xs font-medium text-neural-accent-cyan">SIMULATION</span>
            </div>
          )}
        </div>

        {/* Playback + visualization controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => dispatch(togglePause())}
            className={`p-1.5 rounded-lg neural-transition ${
              viz.isPaused
                ? "bg-neural-accent-amber/20 text-neural-accent-amber"
                : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
            }`}
            title={viz.isPaused ? "Resume" : "Pause"}
          >
            {viz.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <div className="w-px h-5 bg-neural-border" />

          <button
            onClick={() => dispatch(toggleSpikes())}
            className={`p-1.5 rounded-lg neural-transition ${
              viz.showSpikes ? "text-neural-accent-cyan" : "text-neural-text-muted"
            }`}
            title="Toggle Spikes"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => dispatch(toggleThreshold())}
            className={`p-1.5 rounded-lg neural-transition ${
              viz.showThreshold ? "text-neural-accent-amber" : "text-neural-text-muted"
            }`}
            title="Toggle Threshold"
          >
            {viz.showThreshold ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => dispatch(toggleGridOverlay())}
            className={`p-1.5 rounded-lg neural-transition ${
              viz.gridOverlay ? "text-neural-accent-blue" : "text-neural-text-muted"
            }`}
            title="Toggle Grid"
          >
            <Grid3X3 className="w-3.5 h-3.5" />
          </button>

          <div className="w-px h-5 bg-neural-border" />

          {/* Timebase */}
          <select
            value={viz.timebaseMs}
            onChange={(e) => dispatch(setTimebase(Number(e.target.value)))}
            className="bg-neural-surface-alt border border-neural-border rounded px-1.5 py-1 text-xs text-neural-text-primary"
          >
            <option value={5}>5 ms</option>
            <option value={10}>10 ms</option>
            <option value={50}>50 ms</option>
            <option value={100}>100 ms</option>
            <option value={500}>500 ms</option>
            <option value={1000}>1 s</option>
            <option value={5000}>5 s</option>
          </select>
        </div>

        {/* Panel toggles */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowLeftPanel(!showLeftPanel)}
            className={`p-1.5 rounded-lg neural-transition ${
              showLeftPanel ? "text-neural-accent-cyan" : "text-neural-text-muted"
            }`}
            title="Toggle Channel List"
          >
            <LayoutGrid className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={`p-1.5 rounded-lg neural-transition ${
              showRightPanel ? "text-neural-accent-cyan" : "text-neural-text-muted"
            }`}
            title="Toggle Right Panel"
          >
            <Monitor className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowBottomPanel(!showBottomPanel)}
            className={`p-1.5 rounded-lg neural-transition ${
              showBottomPanel ? "text-neural-accent-cyan" : "text-neural-text-muted"
            }`}
            title="Toggle Bottom Panel"
          >
            <Cpu className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setShowTelemetry(!showTelemetry)}
            className={`p-1.5 rounded-lg neural-transition ${
              showTelemetry ? "text-neural-accent-cyan" : "text-neural-text-muted"
            }`}
            title="Toggle Telemetry"
          >
            <Thermometer className="w-3.5 h-3.5" />
          </button>

          {viz.isPaused && (
            <span className="ml-1 md:ml-2 flex items-center gap-1 bg-neural-accent-amber/20 text-neural-accent-amber px-1.5 md:px-2 py-0.5 rounded text-xs font-medium shrink-0">
              <Pause className="w-3 h-3" />
              <span className="hidden sm:inline">PAUSED</span>
            </span>
          )}
        </div>
      </div>

      {/* ─── Main Grid Layout ─── */}
      <NeuralDataProvider
        channelCount={sourceChannelCount}
        targetFps={60}
        mode={mode}
        playbackPaused={playbackPaused}
        playbackSampleRate={playbackSession?.sampleRate}
      >
      <SpikeEventsProvider totalSites={4096} mode={mode} playbackPaused={playbackPaused}>
      <div
        className={`flex-1 min-h-0 gap-1 p-1 overflow-hidden ${isMobile ? "flex flex-col" : "grid"}`}
        style={isMobile ? undefined : gridTemplate}
      >
        {/* ─── Left Panel: Channel List ─── */}
        {showLeftPanel && (
          <div
            className={`bg-neural-surface rounded-lg border border-neural-border overflow-hidden flex flex-col ${isMobile ? "max-h-48 shrink-0" : ""}`}
            style={isMobile ? undefined : { gridRow: "2 / -1" }}
          >
            <div className="flex items-center justify-between px-2.5 py-2 border-b border-neural-border shrink-0">
              <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
                Channels
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={selectAllChannels}
                  className="px-1.5 py-0.5 text-[9px] rounded bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary border border-neural-border"
                >
                  All
                </button>
                <button
                  onClick={clearAllChannels}
                  className="px-1.5 py-0.5 text-[9px] rounded bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary border border-neural-border"
                >
                  None
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-1 py-1">
              <div className="space-y-px">
                {Array.from({ length: sourceChannelCount }, (_, i) => {
                  const isSelected = viz.selectedChannels.includes(i);
                  return (
                    <button
                      key={i}
                      onClick={() => dispatch(toggleChannel(i))}
                      className={`flex items-center gap-1.5 w-full px-2 py-1 rounded text-xs font-mono neural-transition ${
                        isSelected
                          ? "bg-neural-accent-cyan/10 text-neural-accent-cyan"
                          : "text-neural-text-muted hover:text-neural-text-secondary hover:bg-neural-surface-alt"
                      }`}
                    >
                      <div
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isSelected ? "bg-neural-accent-cyan" : "bg-neural-border-bright"
                        }`}
                      />
                      <span className="truncate">CH{i.toString().padStart(2, "0")}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="px-2.5 py-1.5 border-t border-neural-border text-[10px] text-neural-text-muted shrink-0">
              {viz.selectedChannels.length} / {sourceChannelCount} selected
            </div>
          </div>
        )}

        {/* ─── Main Display Area ─── */}
        <div className={`min-h-0 min-w-0 ${isMobile ? "flex-1" : ""}`} style={isMobile ? undefined : { gridRow: "2 / 3" }}>
          {viz.displayMode === "waveform" && <WaveformDisplay className="h-full" />}
          {viz.displayMode === "heatmap" && <SpikeHeatmap className="h-full" />}
          {viz.displayMode === "raster" && <RasterDisplay className="h-full" />}
          {viz.displayMode === "spectrum" && <SpectrogramDisplay className="h-full" />}
        </div>

        {/* ─── Right Panel: Heatmap / Electrode Array / Telemetry ─── */}
        {showRightPanel && (
          <div
            className={`flex flex-col gap-1 min-h-0 ${isMobile ? "h-52 shrink-0" : ""}`}
            style={isMobile ? undefined : { gridRow: "2 / -1" }}
          >
            {/* Tab headers */}
            <div className="flex items-center bg-neural-surface rounded-t-lg border border-neural-border px-2 py-1 shrink-0">
              <button
                onClick={() => setRightPanelTab("heatmap")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs neural-transition ${
                  rightPanelTab === "heatmap"
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-secondary"
                }`}
              >
                <Radio className="w-3 h-3" />
                Heatmap
              </button>
              <button
                onClick={() => setRightPanelTab("electrode")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs neural-transition ${
                  rightPanelTab === "electrode"
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-secondary"
                }`}
              >
                <Grid3X3 className="w-3 h-3" />
                Array
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 min-h-0">
              {rightPanelTab === "heatmap" && (
                <SpikeHeatmap className="h-full" />
              )}
              {rightPanelTab === "electrode" && (
                <ElectrodeArrayMap
                  className="h-full"
                  selectedChannels={viz.selectedChannels}
                  onChannelSelect={handleElectrodeSelect}
                  displaySize={sourceChannelCount}
                />
              )}
            </div>

            {/* Telemetry panel (shown below if toggled) */}
            {showTelemetry && (
              <TelemetryPanel className="h-48 shrink-0" />
            )}
          </div>
        )}

        {/* ─── Bottom Panel: FFT / Spectrogram / PCB ─── */}
        {showBottomPanel && (
          <div
            className={`min-h-0 min-w-0 flex flex-col ${isMobile ? "h-[180px] shrink-0" : ""}`}
            style={isMobile ? undefined : {
              gridColumn: showLeftPanel ? "2 / 3" : "1 / 2",
              gridRow: "3 / 4",
            }}
          >
            {/* Tab bar */}
            <div className="flex items-center bg-neural-surface rounded-t-lg border border-neural-border px-2 py-1 shrink-0">
              <button
                onClick={() => setBottomPanelTab("fft")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs neural-transition ${
                  bottomPanelTab === "fft"
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-secondary"
                }`}
              >
                <Waves className="w-3 h-3" />
                FFT
              </button>
              <button
                onClick={() => setBottomPanelTab("spectrogram")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs neural-transition ${
                  bottomPanelTab === "spectrogram"
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-secondary"
                }`}
              >
                <BarChart3 className="w-3 h-3" />
                Spectrogram
              </button>
              <button
                onClick={() => setBottomPanelTab("pcb")}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs neural-transition ${
                  bottomPanelTab === "pcb"
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-secondary"
                }`}
              >
                <Cpu className="w-3 h-3" />
                PCB
              </button>
            </div>

            {/* Panel content */}
            <div className="flex-1 min-h-0">
              {bottomPanelTab === "fft" && <FFTDisplay className="h-full" />}
              {bottomPanelTab === "spectrogram" && <SpectrogramDisplay className="h-full" />}
              {bottomPanelTab === "pcb" && <PCBDataDisplay className="h-full" />}
            </div>
          </div>
        )}
      </div>
      </SpikeEventsProvider>
      </NeuralDataProvider>

      {/* ─── Playback Progress Bar ─── */}
      {mode === "playback" && playbackSession && (
        <div className="bg-neural-surface border-t border-neural-border px-2 md:px-4 py-2 shrink-0">
          {/* Recording info row */}
          <div className="flex items-center justify-between flex-wrap gap-1 mb-1.5">
            <div className="flex items-center gap-2 md:gap-3 text-[11px] text-neural-text-muted flex-wrap">
              <span className="flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                <span className="font-mono text-neural-text-secondary">{playbackSession.name}</span>
              </span>
              <span className="hidden sm:inline">{playbackSession.experimentName}</span>
              <span className="flex items-center gap-1">
                <Cpu className="w-3 h-3" />
                {playbackSession.channels}ch
              </span>
              <span className="hidden sm:flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {playbackSession.spikeCount.toLocaleString()} spikes
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-neural-text-muted">Speed:</span>
              {[1, 2, 4, 8].map((s) => (
                <button
                  key={s}
                  onClick={() => setPlaybackSpeed(s)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono neural-transition ${
                    playbackSpeed === s
                      ? "bg-neural-accent-purple/20 text-neural-accent-purple"
                      : "text-neural-text-muted hover:text-neural-text-primary"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Progress bar + controls */}
          <div className="flex items-center gap-2 md:gap-3">
            {/* Transport controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPlaybackElapsed(0)}
                className="p-1 rounded hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition"
                title="Restart"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  if (playbackElapsed >= playbackTotalSec) {
                    setPlaybackElapsed(0);
                    setPlaybackPaused(false);
                  } else {
                    setPlaybackPaused(!playbackPaused);
                  }
                }}
                className={`p-1.5 rounded-lg neural-transition ${
                  playbackPaused
                    ? "bg-neural-accent-purple/20 text-neural-accent-purple"
                    : "bg-neural-accent-green/20 text-neural-accent-green"
                }`}
                title={playbackPaused ? (playbackElapsed >= playbackTotalSec ? "Replay" : "Resume") : "Pause"}
              >
                {playbackPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setPlaybackElapsed(Math.min(playbackElapsed + 30, playbackTotalSec))}
                className="p-1 rounded hover:bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary neural-transition"
                title="Skip +30s"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Current time */}
            <span className="text-xs font-mono text-neural-accent-purple w-12 text-right">
              {formatTime(playbackElapsed)}
            </span>

            {/* Progress bar */}
            <div className="flex-1 relative group">
              <div
                className="w-full h-2 bg-neural-border rounded-full overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  setPlaybackElapsed(Math.round(pct * playbackTotalSec));
                }}
              >
                <div
                  className="h-full bg-gradient-to-r from-neural-accent-purple to-neural-accent-cyan rounded-full neural-transition relative"
                  style={{ width: `${playbackTotalSec > 0 ? (playbackElapsed / playbackTotalSec) * 100 : 0}%` }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 neural-transition" />
                </div>
              </div>
            </div>

            {/* Total time */}
            <span className="text-xs font-mono text-neural-text-muted w-12">
              {formatTime(playbackTotalSec)}
            </span>

            {/* Elapsed indicator */}
            <div className="hidden sm:flex items-center gap-1 text-[10px] text-neural-text-muted">
              <Clock className="w-3 h-3" />
              {playbackElapsed >= playbackTotalSec ? (
                <span className="text-neural-accent-green">Complete</span>
              ) : (
                <span>{Math.round((playbackElapsed / Math.max(playbackTotalSec, 1)) * 100)}%</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
