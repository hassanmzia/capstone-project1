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

import { useState, useCallback, useMemo } from "react";
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

  // Panel states
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>("heatmap");
  const [bottomPanelTab, setBottomPanelTab] = useState<BottomPanelTab>("fft");
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showBottomPanel, setShowBottomPanel] = useState(true);
  const [showTelemetry, setShowTelemetry] = useState(false);

  // Channel selection from electrode array
  const handleElectrodeSelect = useCallback(
    (channels: number[]) => {
      dispatch(setSelectedChannels(channels));
    },
    [dispatch]
  );

  // Quick channel select helpers
  const selectAllChannels = useCallback(() => {
    dispatch(setSelectedChannels(Array.from({ length: 64 }, (_, i) => i)));
  }, [dispatch]);

  const clearAllChannels = useCallback(() => {
    dispatch(setSelectedChannels([]));
  }, [dispatch]);

  // Grid template
  const gridTemplate = useMemo(() => {
    const cols: string[] = [];
    if (showLeftPanel) cols.push("220px");
    cols.push("1fr");
    if (showRightPanel) cols.push("280px");

    const rows: string[] = ["auto"];
    rows.push("1fr");
    if (showBottomPanel) rows.push("280px");

    return {
      gridTemplateColumns: cols.join(" "),
      gridTemplateRows: rows.join(" "),
    };
  }, [showLeftPanel, showRightPanel, showBottomPanel]);

  return (
    <div className="flex flex-col h-full gap-0 overflow-hidden">
      {/* ─── Top Toolbar ─── */}
      <div className="flex items-center justify-between bg-neural-surface border-b border-neural-border px-3 py-2 shrink-0">
        {/* Display mode tabs */}
        <div className="flex items-center gap-1 bg-neural-surface-alt rounded-lg p-0.5">
          {displayModes.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => dispatch(setDisplayMode(mode))}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium neural-transition ${
                viz.displayMode === mode
                  ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                  : "text-neural-text-secondary hover:text-neural-text-primary"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Playback + visualization controls */}
        <div className="flex items-center gap-1.5">
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
            <span className="ml-2 flex items-center gap-1 bg-neural-accent-amber/20 text-neural-accent-amber px-2 py-0.5 rounded text-xs font-medium">
              <Pause className="w-3 h-3" />
              PAUSED
            </span>
          )}
        </div>
      </div>

      {/* ─── Main Grid Layout ─── */}
      <div
        className="flex-1 min-h-0 grid gap-1 p-1"
        style={gridTemplate}
      >
        {/* ─── Left Panel: Channel List ─── */}
        {showLeftPanel && (
          <div
            className="bg-neural-surface rounded-lg border border-neural-border overflow-hidden flex flex-col"
            style={{ gridRow: "2 / -1" }}
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
                {Array.from({ length: 64 }, (_, i) => {
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
              {viz.selectedChannels.length} / 64 selected
            </div>
          </div>
        )}

        {/* ─── Main Display Area ─── */}
        <div className="min-h-0 min-w-0" style={{ gridRow: "2 / 3" }}>
          {viz.displayMode === "waveform" && <WaveformDisplay className="h-full" />}
          {viz.displayMode === "heatmap" && <SpikeHeatmap className="h-full" />}
          {viz.displayMode === "raster" && <RasterDisplay className="h-full" />}
          {viz.displayMode === "spectrum" && <SpectrogramDisplay className="h-full" />}
        </div>

        {/* ─── Right Panel: Heatmap / Electrode Array / Telemetry ─── */}
        {showRightPanel && (
          <div
            className="flex flex-col gap-1 min-h-0"
            style={{ gridRow: "2 / -1" }}
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
                  displaySize={64}
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
            className="min-h-0 min-w-0 flex flex-col"
            style={{
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
    </div>
  );
}
