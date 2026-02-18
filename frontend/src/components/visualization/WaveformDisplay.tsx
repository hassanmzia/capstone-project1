/**
 * Multi-channel waveform display with WebGL GPU-accelerated rendering.
 * Supports up to 64 channels, stacked/overlaid modes, mouse interactions,
 * and real-time data streaming.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useSelector, useDispatch } from "react-redux";
import type { RootState } from "@/store";
import {
  setAmplitudeScale,
  setTimebase,
  resetView,
} from "@/store/slices/visualizationSlice";
import { WaveformWebGLRenderer } from "@/components/common/WebGLRenderer";
import { useNeuralData } from "@/contexts/NeuralDataContext";
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Layers,
  AlignJustify,
} from "lucide-react";

interface WaveformDisplayProps {
  className?: string;
  selectedChannels?: number[];
  sampleRate?: number;
}

const CHANNEL_COLORS: [number, number, number][] = [
  [0.0, 0.85, 0.85],  // cyan
  [0.3, 0.75, 1.0],   // light blue
  [0.4, 0.9, 0.3],    // green
  [1.0, 0.8, 0.0],    // amber
  [1.0, 0.4, 0.4],    // red
  [0.7, 0.5, 1.0],    // purple
  [1.0, 0.55, 0.7],   // pink
  [0.5, 1.0, 0.65],   // mint
];

const TIMEBASE_OPTIONS = [
  { value: 5, label: "5 ms" },
  { value: 10, label: "10 ms" },
  { value: 50, label: "50 ms" },
  { value: 100, label: "100 ms" },
  { value: 500, label: "500 ms" },
  { value: 1000, label: "1 s" },
  { value: 5000, label: "5 s" },
];

const AMPLITUDE_OPTIONS = [
  { value: 0.25, label: "x0.25" },
  { value: 0.5, label: "x0.5" },
  { value: 1.0, label: "x1" },
  { value: 2.0, label: "x2" },
  { value: 5.0, label: "x5" },
  { value: 10.0, label: "x10" },
];

export default function WaveformDisplay({
  className = "",
  selectedChannels: propChannels,
  sampleRate = 30000,
}: WaveformDisplayProps) {
  const dispatch = useDispatch();
  const viz = useSelector((state: RootState) => state.visualization);
  const channels = propChannels ?? viz.selectedChannels;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<WaveformWebGLRenderer | null>(null);
  const animFrameRef = useRef<number>(0);

  const [isStacked, setIsStacked] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [panOffsetSamples, setPanOffsetSamples] = useState(0);
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    channel: number;
    time: string;
    amplitude: string;
  } | null>(null);

  const { getLatestData, isConnected, dataRate } = useNeuralData();

  const samplesInView = useMemo(
    () => Math.round((viz.timebaseMs / 1000) * sampleRate),
    [viz.timebaseMs, sampleRate]
  );

  // Initialize WebGL renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new WaveformWebGLRenderer(canvas, 64);
    rendererRef.current = renderer;

    // Set channel colors
    for (let i = 0; i < 64; i++) {
      const color = CHANNEL_COLORS[i % CHANNEL_COLORS.length];
      renderer.setChannelColor(i, color[0], color[1], color[2]);
    }

    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!container || !canvas || !renderer) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.round(width * dpr);
        const h = Math.round(height * dpr);
        renderer.resize(w, h);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Render loop
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;

    let running = true;

    const frame = () => {
      if (!running) return;

      renderer.setStackedMode(isStacked);
      renderer.setShowGrid(viz.gridOverlay);

      if (!viz.isPaused) {
        // Update viewport
        const yRange = 500 / viz.amplitudeScale; // microvolts range
        renderer.setViewport(
          panOffsetSamples,
          panOffsetSamples + samplesInView,
          -yRange,
          yRange
        );

        // Upload fresh data for each selected channel
        for (let i = 0; i < 64; i++) {
          if (channels.includes(i)) {
            const data = getLatestData(i, samplesInView);
            renderer.setData(i, data);
          } else {
            renderer.setData(i, new Float32Array(0));
          }
        }
      }

      renderer.render();
      animFrameRef.current = requestAnimationFrame(frame);
    };

    animFrameRef.current = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [
    channels,
    viz.isPaused,
    viz.amplitudeScale,
    viz.gridOverlay,
    isStacked,
    samplesInView,
    panOffsetSamples,
    getLatestData,
  ]);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        // Amplitude zoom
        const factor = e.deltaY > 0 ? 0.8 : 1.25;
        dispatch(setAmplitudeScale(viz.amplitudeScale * factor));
      } else {
        // Time zoom
        const factor = e.deltaY > 0 ? 1.3 : 0.77;
        const newTimebase = Math.max(1, Math.min(10000, viz.timebaseMs * factor));
        dispatch(setTimebase(Math.round(newTimebase)));
      }
    },
    [dispatch, viz.amplitudeScale, viz.timebaseMs]
  );

  // Mouse drag for panning
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 0) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (isDragging) {
        const dx = e.clientX - dragStart.x;
        const samplesPerPixel = samplesInView / canvas.clientWidth;
        setPanOffsetSamples((prev) => prev - Math.round(dx * samplesPerPixel));
        setDragStart({ x: e.clientX, y: e.clientY });
      }

      // Hover info
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const timePos = (x / rect.width) * viz.timebaseMs;
      const channelIdx = isStacked
        ? Math.floor((y / rect.height) * channels.length)
        : -1;

      const timeStr =
        timePos >= 1000
          ? `${(timePos / 1000).toFixed(2)} s`
          : `${timePos.toFixed(1)} ms`;

      setHoverInfo({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        channel: channelIdx >= 0 && channelIdx < channels.length ? channels[channelIdx] : -1,
        time: timeStr,
        amplitude: "--",
      });
    },
    [isDragging, dragStart, samplesInView, viz.timebaseMs, channels, isStacked]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
    setHoverInfo(null);
  }, []);

  // Time axis labels
  const timeLabels = useMemo(() => {
    const labels: { pos: number; text: string }[] = [];
    const divisions = 10;
    for (let i = 0; i <= divisions; i++) {
      const timeMs = (i / divisions) * viz.timebaseMs;
      const text =
        timeMs >= 1000
          ? `${(timeMs / 1000).toFixed(1)}s`
          : `${timeMs.toFixed(0)}ms`;
      labels.push({ pos: (i / divisions) * 100, text });
    }
    return labels;
  }, [viz.timebaseMs]);

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <div className="flex items-center gap-2">
          <button
            onClick={() => dispatch(setAmplitudeScale(viz.amplitudeScale * 1.5))}
            className="p-1.5 rounded-md text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
            title="Zoom In (Amplitude)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => dispatch(setAmplitudeScale(viz.amplitudeScale / 1.5))}
            className="p-1.5 rounded-md text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
            title="Zoom Out (Amplitude)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={() => dispatch(resetView())}
            className="p-1.5 rounded-md text-neural-text-secondary hover:text-neural-text-primary hover:bg-neural-surface-alt neural-transition"
            title="Reset View"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-neural-border" />
          <button
            onClick={() => setIsStacked(true)}
            className={`p-1.5 rounded-md neural-transition ${
              isStacked
                ? "text-neural-accent-cyan bg-neural-accent-cyan/10"
                : "text-neural-text-secondary hover:text-neural-text-primary"
            }`}
            title="Stacked Mode"
          >
            <AlignJustify className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsStacked(false)}
            className={`p-1.5 rounded-md neural-transition ${
              !isStacked
                ? "text-neural-accent-cyan bg-neural-accent-cyan/10"
                : "text-neural-text-secondary hover:text-neural-text-primary"
            }`}
            title="Overlay Mode"
          >
            <Layers className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* Timebase selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neural-text-muted">Time:</span>
            <select
              value={viz.timebaseMs}
              onChange={(e) => dispatch(setTimebase(Number(e.target.value)))}
              className="bg-neural-surface-alt border border-neural-border rounded px-1.5 py-0.5 text-xs text-neural-text-primary"
            >
              {TIMEBASE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Amplitude selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-neural-text-muted">Amp:</span>
            <select
              value={viz.amplitudeScale}
              onChange={(e) => dispatch(setAmplitudeScale(Number(e.target.value)))}
              className="bg-neural-surface-alt border border-neural-border rounded px-1.5 py-0.5 text-xs text-neural-text-primary"
            >
              {AMPLITUDE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status indicators */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`flex items-center gap-1 ${
                isConnected ? "text-green-400" : "text-red-400"
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isConnected ? "bg-green-400" : "bg-red-400"
                }`}
              />
              {isConnected ? "Live" : "Offline"}
            </span>
            <span className="text-neural-text-muted">
              {(dataRate / 1000).toFixed(1)}kS/s
            </span>
            <span className="text-neural-text-muted">
              {channels.length}ch
            </span>
          </div>
        </div>
      </div>

      {/* Canvas area with channel labels */}
      <div className="flex flex-1 min-h-0">
        {/* Y-axis channel labels */}
        {isStacked && (
          <div className="flex flex-col w-12 py-1 border-r border-neural-border/50 shrink-0">
            {channels.slice(0, 64).map((ch, idx) => (
              <div
                key={ch}
                className="flex-1 flex items-center justify-end pr-1"
                style={{ minHeight: 0 }}
              >
                <span
                  className="text-[9px] font-mono leading-none"
                  style={{
                    color: `rgb(${Math.round(
                      CHANNEL_COLORS[idx % CHANNEL_COLORS.length][0] * 255
                    )}, ${Math.round(
                      CHANNEL_COLORS[idx % CHANNEL_COLORS.length][1] * 255
                    )}, ${Math.round(
                      CHANNEL_COLORS[idx % CHANNEL_COLORS.length][2] * 255
                    )})`,
                  }}
                >
                  {ch.toString().padStart(2, "0")}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* WebGL Canvas */}
        <div ref={containerRef} className="flex-1 relative min-h-0">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 cursor-crosshair"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
          />

          {/* Hover tooltip */}
          {hoverInfo && (
            <div
              className="absolute pointer-events-none bg-neural-surface-alt/90 border border-neural-border rounded px-2 py-1 text-xs text-neural-text-primary z-10"
              style={{
                left: Math.min(hoverInfo.x + 12, (containerRef.current?.clientWidth ?? 200) - 120),
                top: Math.max(hoverInfo.y - 30, 0),
              }}
            >
              <div className="font-mono">
                {hoverInfo.channel >= 0 && (
                  <span className="text-neural-accent-cyan">
                    CH{hoverInfo.channel.toString().padStart(2, "0")}{" "}
                  </span>
                )}
                <span className="text-neural-text-secondary">{hoverInfo.time}</span>
              </div>
            </div>
          )}

          {/* Amplitude scale bar */}
          <div className="absolute right-2 top-2 flex flex-col items-center">
            <div className="w-px h-8 bg-neural-text-muted" />
            <span className="text-[8px] text-neural-text-muted mt-0.5">
              {Math.round(500 / viz.amplitudeScale)} uV
            </span>
          </div>
        </div>
      </div>

      {/* X-axis time labels */}
      <div className="relative h-5 mx-12 border-t border-neural-border/50">
        {timeLabels.map((label, i) => (
          <span
            key={i}
            className="absolute text-[9px] text-neural-text-muted font-mono -translate-x-1/2"
            style={{ left: `${label.pos}%`, top: 2 }}
          >
            {label.text}
          </span>
        ))}
      </div>
    </div>
  );
}
