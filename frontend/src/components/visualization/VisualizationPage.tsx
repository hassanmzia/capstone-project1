import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import {
  setDisplayMode,
  setTimebase,
  setAmplitudeScale,
  toggleSpikes,
  toggleThreshold,
  toggleGridOverlay,
  togglePause,
  toggleChannel,
  resetView,
} from "@/store/slices/visualizationSlice";
import type { DisplayMode } from "@/types/neural";
import {
  Activity,
  Grid3X3,
  BarChart3,
  Waves,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Pause,
  Play,
  Eye,
  EyeOff,
  Crosshair,
} from "lucide-react";

const displayModes: { mode: DisplayMode; label: string; icon: typeof Activity }[] = [
  { mode: "waveform", label: "Waveform", icon: Activity },
  { mode: "heatmap", label: "Heatmap", icon: Grid3X3 },
  { mode: "raster", label: "Raster", icon: BarChart3 },
  { mode: "spectrum", label: "Spectrum", icon: Waves },
];

export default function VisualizationPage() {
  const dispatch = useDispatch();
  const viz = useSelector((state: RootState) => state.visualization);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-neural-surface rounded-xl border border-neural-border p-3">
        {/* Display mode tabs */}
        <div className="flex items-center gap-1 bg-neural-surface-alt rounded-lg p-1">
          {displayModes.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              onClick={() => dispatch(setDisplayMode(mode))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium neural-transition ${
                viz.displayMode === mode
                  ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                  : "text-neural-text-secondary hover:text-neural-text-primary"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden md:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => dispatch(togglePause())}
            className={`p-2 rounded-lg neural-transition ${
              viz.isPaused
                ? "bg-neural-accent-amber/20 text-neural-accent-amber"
                : "text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt"
            }`}
            title={viz.isPaused ? "Resume" : "Pause"}
          >
            {viz.isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>

          <div className="w-px h-6 bg-neural-border" />

          <button
            onClick={() => dispatch(setAmplitudeScale(viz.amplitudeScale * 1.5))}
            className="p-2 rounded-lg text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => dispatch(setAmplitudeScale(viz.amplitudeScale / 1.5))}
            className="p-2 rounded-lg text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => dispatch(resetView())}
            className="p-2 rounded-lg text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-neural-border" />

          <button
            onClick={() => dispatch(toggleSpikes())}
            className={`p-2 rounded-lg neural-transition ${
              viz.showSpikes
                ? "text-neural-accent-cyan"
                : "text-neural-text-muted"
            }`}
            title="Toggle Spikes"
          >
            <Crosshair className="w-4 h-4" />
          </button>
          <button
            onClick={() => dispatch(toggleThreshold())}
            className={`p-2 rounded-lg neural-transition ${
              viz.showThreshold
                ? "text-neural-accent-amber"
                : "text-neural-text-muted"
            }`}
            title="Toggle Threshold"
          >
            {viz.showThreshold ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={() => dispatch(toggleGridOverlay())}
            className={`p-2 rounded-lg neural-transition ${
              viz.gridOverlay
                ? "text-neural-accent-blue"
                : "text-neural-text-muted"
            }`}
            title="Toggle Grid"
          >
            <Grid3X3 className="w-4 h-4" />
          </button>
        </div>

        {/* Timebase selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-neural-text-muted">Timebase:</span>
          <select
            value={viz.timebaseMs}
            onChange={(e) => dispatch(setTimebase(Number(e.target.value)))}
            className="bg-neural-surface-alt border border-neural-border rounded-lg px-2 py-1 text-sm text-neural-text-primary"
          >
            <option value={10}>10 ms</option>
            <option value={50}>50 ms</option>
            <option value={100}>100 ms</option>
            <option value={500}>500 ms</option>
            <option value={1000}>1 s</option>
            <option value={5000}>5 s</option>
          </select>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Waveform display area */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Primary display */}
          <div className="flex-1 bg-neural-surface rounded-xl border border-neural-border p-4 neural-grid-bg relative">
            <div className="absolute inset-4 flex items-center justify-center">
              {viz.displayMode === "waveform" && (
                <div className="w-full h-full flex flex-col gap-1">
                  {viz.selectedChannels.slice(0, 8).map((ch) => (
                    <div key={ch} className="flex-1 flex items-center border-b border-neural-border/30 last:border-0">
                      <span className="text-xs font-mono text-neural-text-muted w-10 shrink-0">
                        CH{ch.toString().padStart(2, "0")}
                      </span>
                      <div className="flex-1 h-full flex items-center overflow-hidden">
                        <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 50">
                          <path
                            d={`M 0 25 ${Array.from({ length: 400 }, (_, x) => {
                              const noise = Math.sin(x * 0.1 + ch) * 8 + Math.random() * 6 - 3;
                              const spike = Math.random() > 0.98 ? Math.random() * 20 * (Math.random() > 0.5 ? 1 : -1) : 0;
                              return `L ${x} ${25 + noise + spike}`;
                            }).join(" ")}`}
                            fill="none"
                            stroke="var(--color-neural-waveform)"
                            strokeWidth="1"
                            opacity="0.8"
                          />
                        </svg>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {viz.displayMode === "heatmap" && (
                <div className="grid grid-cols-16 gap-px w-full h-full max-w-md mx-auto aspect-square">
                  {Array.from({ length: 256 }, (_, i) => (
                    <div
                      key={i}
                      className="rounded-[1px]"
                      style={{
                        backgroundColor: `rgba(6, 182, 212, ${Math.random() * 0.8 + 0.1})`,
                      }}
                    />
                  ))}
                </div>
              )}

              {viz.displayMode === "raster" && (
                <div className="w-full h-full flex flex-col gap-0.5 justify-center">
                  {Array.from({ length: 16 }, (_, ch) => (
                    <div key={ch} className="flex items-center h-4">
                      <span className="text-xs font-mono text-neural-text-muted w-8 shrink-0">{ch}</span>
                      <div className="flex-1 flex gap-px items-center">
                        {Array.from({ length: 200 }, (_, t) => (
                          Math.random() > 0.95 ? (
                            <div
                              key={t}
                              className="w-px h-3 bg-neural-accent-cyan"
                              style={{ marginLeft: `${Math.random() * 2}px` }}
                            />
                          ) : null
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {viz.displayMode === "spectrum" && (
                <div className="w-full h-full flex items-end gap-px px-4">
                  {Array.from({ length: 64 }, (_, i) => {
                    const height = Math.max(5, Math.random() * 100 * Math.exp(-i * 0.03));
                    return (
                      <div
                        key={i}
                        className="flex-1 rounded-t-sm bg-gradient-to-t from-neural-accent-blue to-neural-accent-cyan"
                        style={{ height: `${height}%`, opacity: 0.5 + height / 200 }}
                      />
                    );
                  })}
                </div>
              )}
            </div>

            {viz.isPaused && (
              <div className="absolute top-4 right-4 flex items-center gap-1.5 bg-neural-accent-amber/20 text-neural-accent-amber px-2 py-1 rounded-md text-xs font-medium">
                <Pause className="w-3 h-3" />
                PAUSED
              </div>
            )}
          </div>

          {/* Spike heatmap (64x64 grid) */}
          <div className="h-48 bg-neural-surface rounded-xl border border-neural-border p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
                Electrode Array (64x64)
              </h3>
              <span className="text-xs text-neural-text-muted">Live spike rate</span>
            </div>
            <div className="h-[calc(100%-24px)] flex items-center justify-center">
              <div className="grid gap-0 aspect-square h-full" style={{ gridTemplateColumns: "repeat(32, 1fr)" }}>
                {Array.from({ length: 1024 }, (_, i) => (
                  <div
                    key={i}
                    className="rounded-[0.5px]"
                    style={{
                      backgroundColor: `rgba(6, 182, 212, ${Math.random() * 0.6 + 0.02})`,
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Channel selection panel */}
        <div className="w-56 bg-neural-surface rounded-xl border border-neural-border p-3 overflow-y-auto">
          <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider mb-3">
            Channels
          </h3>

          <div className="space-y-0.5">
            {Array.from({ length: 32 }, (_, i) => {
              const isSelected = viz.selectedChannels.includes(i);
              return (
                <button
                  key={i}
                  onClick={() => dispatch(toggleChannel(i))}
                  className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs font-mono neural-transition ${
                    isSelected
                      ? "bg-neural-accent-cyan/10 text-neural-accent-cyan"
                      : "text-neural-text-muted hover:text-neural-text-secondary hover:bg-neural-surface-alt"
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isSelected ? "bg-neural-accent-cyan" : "bg-neural-border-bright"
                    }`}
                  />
                  CH{i.toString().padStart(2, "0")}
                  {isSelected && (
                    <span className="ml-auto text-neural-text-muted">
                      {(Math.random() * 50 + 10).toFixed(0)} Hz
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
