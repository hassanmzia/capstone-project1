/**
 * Time-frequency spectrogram display.
 * Canvas-based rendering with time on X-axis, frequency on Y-axis,
 * and magnitude encoded as color using a configurable colormap.
 * Features: real-time scrolling, frequency band annotations,
 * crosshair cursor with value readout, clear axis labels and ticks.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { useNeuralData } from "@/contexts/NeuralDataContext";
import { inferno, buildLUT, type ColormapFn, COLORMAPS } from "@/utils/colorMaps";

/* ─── Neural frequency band definitions ─── */
const NEURAL_BANDS = [
  { name: "δ Delta",    min: 0.5, max: 4,   color: "rgba(139,92,246,0.25)",  borderColor: "rgba(139,92,246,0.6)"  },
  { name: "θ Theta",    min: 4,   max: 8,   color: "rgba(59,130,246,0.20)",  borderColor: "rgba(59,130,246,0.5)"  },
  { name: "α Alpha",    min: 8,   max: 13,  color: "rgba(16,185,129,0.20)",  borderColor: "rgba(16,185,129,0.5)"  },
  { name: "β Beta",     min: 13,  max: 30,  color: "rgba(245,158,11,0.18)",  borderColor: "rgba(245,158,11,0.45)" },
  { name: "γ Gamma",    min: 30,  max: 100, color: "rgba(239,68,68,0.15)",   borderColor: "rgba(239,68,68,0.4)"   },
  { name: "Hγ High-γ",  min: 100, max: 500, color: "rgba(236,72,153,0.10)",  borderColor: "rgba(236,72,153,0.3)"  },
];

interface SpectrogramDisplayProps {
  className?: string;
  channelIndex?: number;
  sampleRate?: number;
  windowSize?: number;
  hopSize?: number;
  maxFrequency?: number;
  colormapName?: string;
}

export default function SpectrogramDisplay({
  className = "",
  channelIndex: propChannel,
  sampleRate = 30000,
  windowSize: propWindowSize,
  hopSize: propHopSize,
  maxFrequency: propMaxFreq,
  colormapName: propColormap,
}: SpectrogramDisplayProps) {
  const viz = useSelector((state: RootState) => state.visualization);
  const channel = propChannel ?? (viz.selectedChannels[0] ?? 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const spectrogramBufferRef = useRef<Float32Array[]>([]);
  const maxColumnsRef = useRef(256);
  const columnsEmittedRef = useRef(0);
  const startTimeRef = useRef(Date.now());

  const [windowSize, setWindowSize] = useState(propWindowSize ?? 1024);
  const [hopSize] = useState(propHopSize ?? 256);
  const [maxFrequency, setMaxFrequency] = useState(propMaxFreq ?? 500);
  const [dynamicRange, setDynamicRange] = useState(50);
  const [colormapName, setColormapName] = useState(propColormap ?? "inferno");
  const [contrastGamma] = useState(0.65);
  const [showBands, setShowBands] = useState(true);

  // Crosshair / hover state
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  const { getLatestData } = useNeuralData();

  const colormap: ColormapFn = useMemo(
    () => COLORMAPS[colormapName] ?? inferno,
    [colormapName]
  );
  const lut = useMemo(() => buildLUT(colormap, 256), [colormap]);
  const nyquist = sampleRate / 2;
  const freqBins = windowSize / 2;
  const maxBin = Math.min(
    Math.ceil((maxFrequency / nyquist) * freqBins),
    freqBins
  );

  // Margins for axis labeling
  const margin = useMemo(() => ({ top: 12, right: 64, bottom: 38, left: 60 }), []);

  // Compute FFT column from samples
  const computeFFTColumn = useCallback(
    (samples: Float32Array): Float32Array => {
      const N = windowSize;
      const padded = new Float32Array(N);
      padded.set(samples.subarray(0, Math.min(samples.length, N)));

      // Hanning window
      for (let i = 0; i < N; i++) {
        padded[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      }

      // Bit-reversal permutation
      const real = new Float32Array(N);
      const imag = new Float32Array(N);
      const bits = Math.log2(N);
      for (let i = 0; i < N; i++) {
        let rev = 0;
        for (let b = 0; b < bits; b++) {
          rev = (rev << 1) | ((i >> b) & 1);
        }
        real[rev] = padded[i];
      }

      // Cooley-Tukey butterfly
      for (let size = 2; size <= N; size *= 2) {
        const half = size / 2;
        const step = (-2 * Math.PI) / size;
        for (let i = 0; i < N; i += size) {
          for (let j = 0; j < half; j++) {
            const angle = step * j;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const tR = real[i + j + half] * cos - imag[i + j + half] * sin;
            const tI = real[i + j + half] * sin + imag[i + j + half] * cos;
            real[i + j + half] = real[i + j] - tR;
            imag[i + j + half] = imag[i + j] - tI;
            real[i + j] += tR;
            imag[i + j] += tI;
          }
        }
      }

      // Magnitude in dB
      const magnitudes = new Float32Array(freqBins);
      for (let i = 0; i < freqBins; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / freqBins;
        magnitudes[i] = 20 * Math.log10(Math.max(mag, 1e-10));
      }

      return magnitudes;
    },
    [windowSize, freqBins]
  );

  // Mouse event handlers for crosshair
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      setMousePos({ x, y });
    },
    []
  );

  const handleMouseLeave = useCallback(() => {
    setMousePos(null);
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const renderFrame = () => {
      if (!running) return;

      const { width, height } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;

      if (plotW <= 0 || plotH <= 0) {
        animRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      // Clear background
      ctx.fillStyle = "#0a0e1a";
      ctx.fillRect(0, 0, width, height);

      maxColumnsRef.current = Math.round(plotW);

      // Compute new FFT columns based on elapsed time
      const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
      const expectedColumns = Math.floor((elapsedSec * sampleRate) / hopSize);
      const newColumnsNeeded = Math.min(expectedColumns - columnsEmittedRef.current, 10);

      if (newColumnsNeeded > 0) {
        const totalSamples = windowSize + newColumnsNeeded * hopSize;
        const samples = getLatestData(channel, totalSamples);

        if (samples.length >= windowSize) {
          for (let i = 0; i < newColumnsNeeded; i++) {
            const offset = samples.length - windowSize - (newColumnsNeeded - 1 - i) * hopSize;
            if (offset >= 0) {
              const segment = samples.subarray(offset, offset + windowSize);
              const column = computeFFTColumn(segment);
              spectrogramBufferRef.current.push(column);
            }
          }
          columnsEmittedRef.current = expectedColumns;
        }

        // Trim to max columns
        while (spectrogramBufferRef.current.length > maxColumnsRef.current) {
          spectrogramBufferRef.current.shift();
        }
      }

      const columns = spectrogramBufferRef.current;

      // Adaptive dB range
      let peakdB = -Infinity;
      for (const col of columns) {
        for (let i = 0; i < maxBin; i++) {
          if (col[i] > peakdB) peakdB = col[i];
        }
      }
      const dBMax = isFinite(peakdB) ? Math.ceil(peakdB / 5) * 5 : 0;
      const dBMin = dBMax - dynamicRange;

      // ── Draw plot border ──
      ctx.strokeStyle = "rgba(148,163,184,0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(margin.left, margin.top, plotW, plotH);

      // ── Render spectrogram image ──
      if (columns.length > 0) {
        const imgW = columns.length;
        const imgH = maxBin;
        if (imgW > 0 && imgH > 0) {
          const imageData = ctx.createImageData(imgW, imgH);
          const pixels = imageData.data;

          for (let col = 0; col < imgW; col++) {
            const spectrum = columns[col];
            for (let row = 0; row < imgH; row++) {
              const bin = row;
              const dB = spectrum[bin] ?? dBMin;
              const linear = Math.max(0, Math.min(1, (dB - dBMin) / (dBMax - dBMin)));
              const normalized = Math.pow(linear, contrastGamma);
              const lutIdx = Math.round(normalized * 255);

              const pixelIdx = ((imgH - 1 - row) * imgW + col) * 4;
              pixels[pixelIdx + 0] = lut[lutIdx * 4 + 0];
              pixels[pixelIdx + 1] = lut[lutIdx * 4 + 1];
              pixels[pixelIdx + 2] = lut[lutIdx * 4 + 2];
              pixels[pixelIdx + 3] = 255;
            }
          }

          const offscreen = new OffscreenCanvas(imgW, imgH);
          const offCtx = offscreen.getContext("2d");
          if (offCtx) {
            offCtx.putImageData(imageData, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(offscreen, margin.left, margin.top, plotW, plotH);
          }
        }
      } else {
        // No data yet placeholder
        ctx.fillStyle = "rgba(148,163,184,0.3)";
        ctx.font = "13px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Awaiting signal data...", margin.left + plotW / 2, margin.top + plotH / 2);
      }

      // ── Frequency band overlays ──
      if (showBands) {
        const visibleBands = NEURAL_BANDS.filter((b) => b.min < maxFrequency);
        for (const band of visibleBands) {
          const yBottom = margin.top + plotH * (1 - band.min / maxFrequency);
          const yTop = margin.top + plotH * (1 - Math.min(band.max, maxFrequency) / maxFrequency);
          const bandH = yBottom - yTop;

          if (bandH > 2) {
            // Top border line for the band
            ctx.strokeStyle = band.borderColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(margin.left, yTop);
            ctx.lineTo(margin.left + plotW, yTop);
            ctx.stroke();
            ctx.setLineDash([]);

            // Band label on right edge
            if (bandH > 10) {
              const labelY = yTop + bandH / 2;
              ctx.fillStyle = band.borderColor;
              ctx.font = "bold 9px sans-serif";
              ctx.textAlign = "left";
              ctx.textBaseline = "middle";
              ctx.fillText(band.name, margin.left + 4, labelY);
            }
          }
        }
      }

      // ── Y-axis: Frequency labels and grid ──
      ctx.textBaseline = "middle";
      const freqTickValues = generateNiceFreqTicks(0, maxFrequency, 6);
      for (const freq of freqTickValues) {
        const y = margin.top + plotH * (1 - freq / maxFrequency);
        if (y < margin.top || y > margin.top + plotH) continue;

        // Grid line
        ctx.strokeStyle = "rgba(148,163,184,0.12)";
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();

        // Tick mark
        ctx.strokeStyle = "rgba(148,163,184,0.5)";
        ctx.beginPath();
        ctx.moveTo(margin.left - 4, y);
        ctx.lineTo(margin.left, y);
        ctx.stroke();

        // Label
        const label = freq >= 1000 ? `${(freq / 1000).toFixed(1)}k` : `${freq.toFixed(0)}`;
        ctx.fillStyle = "rgba(241,245,249,0.7)";
        ctx.font = "11px monospace";
        ctx.textAlign = "right";
        ctx.fillText(label, margin.left - 7, y);
      }

      // Y-axis title
      ctx.save();
      ctx.translate(14, margin.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "rgba(241,245,249,0.7)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Frequency (Hz)", 0, 0);
      ctx.restore();

      // ── X-axis: Time labels and ticks ──
      const totalTimeSec = columns.length > 0
        ? (columns.length * hopSize) / sampleRate
        : 10;
      const timeTickValues = generateNiceTimeTicks(0, totalTimeSec, Math.max(4, Math.floor(plotW / 80)));

      ctx.textBaseline = "top";
      for (const t of timeTickValues) {
        const x = margin.left + (t / totalTimeSec) * plotW;
        if (x < margin.left || x > margin.left + plotW) continue;

        // Grid line
        ctx.strokeStyle = "rgba(148,163,184,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();

        // Tick mark
        ctx.strokeStyle = "rgba(148,163,184,0.5)";
        ctx.beginPath();
        ctx.moveTo(x, margin.top + plotH);
        ctx.lineTo(x, margin.top + plotH + 4);
        ctx.stroke();

        // Label
        const tLabel = t < 60 ? `${t.toFixed(1)}s` : `${Math.floor(t / 60)}m${(t % 60).toFixed(0)}s`;
        ctx.fillStyle = "rgba(241,245,249,0.7)";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        ctx.fillText(tLabel, x, margin.top + plotH + 6);
      }

      // X-axis title
      ctx.fillStyle = "rgba(241,245,249,0.65)";
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText("Time (scrolling)", margin.left + plotW / 2, height - 14);

      // ── Color bar (right side) ──
      const barW = 14;
      const barX = width - margin.right + 14;
      const barH = plotH;

      // Draw color gradient bar
      for (let i = 0; i < barH; i++) {
        const t = 1 - i / barH;
        const lutIdx = Math.round(t * 255);
        ctx.fillStyle = `rgb(${lut[lutIdx * 4]}, ${lut[lutIdx * 4 + 1]}, ${lut[lutIdx * 4 + 2]})`;
        ctx.fillRect(barX, margin.top + i, barW, 1);
      }

      // Color bar border
      ctx.strokeStyle = "rgba(148,163,184,0.3)";
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, margin.top, barW, barH);

      // Color bar tick labels
      const dBTicks = 5;
      ctx.textBaseline = "middle";
      for (let i = 0; i <= dBTicks; i++) {
        const t = i / dBTicks;
        const y = margin.top + barH * t;
        const dBVal = dBMax - t * dynamicRange;

        // Tick mark
        ctx.strokeStyle = "rgba(241,245,249,0.5)";
        ctx.beginPath();
        ctx.moveTo(barX + barW, y);
        ctx.lineTo(barX + barW + 3, y);
        ctx.stroke();

        // Label
        ctx.fillStyle = "rgba(241,245,249,0.7)";
        ctx.font = "9px monospace";
        ctx.textAlign = "left";
        ctx.fillText(`${dBVal.toFixed(0)}`, barX + barW + 5, y);
      }

      // Color bar title
      ctx.save();
      ctx.translate(width - 6, margin.top + barH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = "rgba(241,245,249,0.6)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Power (dB)", 0, 0);
      ctx.restore();

      // ── Crosshair cursor ──
      if (mousePos) {
        const mx = mousePos.x;
        const my = mousePos.y;

        // Check if within plot area
        if (
          mx >= margin.left &&
          mx <= margin.left + plotW &&
          my >= margin.top &&
          my <= margin.top + plotH
        ) {
          // Draw crosshair lines
          ctx.strokeStyle = "rgba(241,245,249,0.4)";
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);

          // Vertical line
          ctx.beginPath();
          ctx.moveTo(mx, margin.top);
          ctx.lineTo(mx, margin.top + plotH);
          ctx.stroke();

          // Horizontal line
          ctx.beginPath();
          ctx.moveTo(margin.left, my);
          ctx.lineTo(margin.left + plotW, my);
          ctx.stroke();
          ctx.setLineDash([]);

          // Calculate cursor values
          const relX = (mx - margin.left) / plotW;
          const relY = 1 - (my - margin.top) / plotH;
          const cursorFreq = relY * maxFrequency;
          const cursorTime = relX * totalTimeSec;

          // Find power at cursor position
          let cursorPower = NaN;
          if (columns.length > 0) {
            const colIdx = Math.min(Math.floor(relX * columns.length), columns.length - 1);
            const binIdx = Math.min(Math.floor(relY * maxBin), maxBin - 1);
            if (colIdx >= 0 && binIdx >= 0 && columns[colIdx]) {
              cursorPower = columns[colIdx][binIdx] ?? NaN;
            }
          }

          // Draw readout tooltip
          const tooltipLines = [
            `Freq: ${cursorFreq.toFixed(1)} Hz`,
            `Time: ${cursorTime.toFixed(2)}s`,
            ...(isFinite(cursorPower) ? [`Power: ${cursorPower.toFixed(1)} dB`] : []),
          ];

          const tooltipW = 130;
          const tooltipH = tooltipLines.length * 16 + 8;
          let tx = mx + 12;
          let ty = my - tooltipH - 4;
          // Keep tooltip on screen
          if (tx + tooltipW > width - margin.right) tx = mx - tooltipW - 12;
          if (ty < margin.top) ty = my + 12;

          ctx.fillStyle = "rgba(10,14,26,0.88)";
          ctx.strokeStyle = "rgba(148,163,184,0.4)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(tx, ty, tooltipW, tooltipH, 4);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = "rgba(241,245,249,0.9)";
          ctx.font = "10px monospace";
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          tooltipLines.forEach((line, i) => {
            ctx.fillText(line, tx + 8, ty + 6 + i * 16);
          });
        }
      }

      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [
    channel, windowSize, hopSize, sampleRate, maxFrequency, maxBin,
    dynamicRange, contrastGamma, lut, getLatestData, computeFFTColumn,
    margin, showBands, mousePos,
  ]);

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
            Spectrogram
          </h3>
          <span className="text-[10px] text-neural-text-muted bg-neural-surface-alt px-1.5 py-0.5 rounded">
            CH{channel.toString().padStart(2, "0")}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Band overlay toggle */}
          <label className="flex items-center gap-1 cursor-pointer">
            <input
              type="checkbox"
              checked={showBands}
              onChange={(e) => setShowBands(e.target.checked)}
              className="w-3 h-3 rounded border-neural-border accent-neural-accent-cyan"
            />
            <span className="text-[10px] text-neural-text-muted">Bands</span>
          </label>
          {/* Window Size */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">Window:</span>
            <select
              value={windowSize}
              onChange={(e) => {
                setWindowSize(Number(e.target.value));
                spectrogramBufferRef.current = [];
                columnsEmittedRef.current = 0;
                startTimeRef.current = Date.now();
              }}
              className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
            >
              <option value={256}>256</option>
              <option value={512}>512</option>
              <option value={1024}>1024</option>
              <option value={2048}>2048</option>
            </select>
          </div>
          {/* Max Frequency */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">Max Freq:</span>
            <select
              value={maxFrequency}
              onChange={(e) => setMaxFrequency(Number(e.target.value))}
              className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
            >
              <option value={300}>300 Hz</option>
              <option value={500}>500 Hz</option>
              <option value={1000}>1 kHz</option>
              <option value={2000}>2 kHz</option>
              <option value={5000}>5 kHz</option>
              <option value={nyquist}>Nyquist</option>
            </select>
          </div>
          {/* Dynamic Range */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">Range:</span>
            <select
              value={dynamicRange}
              onChange={(e) => setDynamicRange(Number(e.target.value))}
              className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
            >
              <option value={30}>30 dB</option>
              <option value={40}>40 dB</option>
              <option value={50}>50 dB</option>
              <option value={60}>60 dB</option>
              <option value={80}>80 dB</option>
            </select>
          </div>
          {/* Colormap */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">Color:</span>
            <select
              value={colormapName}
              onChange={(e) => setColormapName(e.target.value)}
              className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
            >
              <option value="inferno">Inferno</option>
              <option value="plasma">Plasma</option>
              <option value="viridis">Viridis</option>
              <option value="turbo">Turbo</option>
            </select>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <canvas
          ref={canvasRef}
          className="absolute inset-0"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>
    </div>
  );
}

/* ─── Helpers for nice tick generation ─── */

function generateNiceFreqTicks(min: number, max: number, targetCount: number): number[] {
  const range = max - min;
  if (range <= 0) return [0];

  // Nice step sizes for frequency
  const niceSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const rawStep = range / targetCount;
  let step = niceSteps[0];
  for (const s of niceSteps) {
    if (s >= rawStep * 0.7) {
      step = s;
      break;
    }
  }

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max; v += step) {
    ticks.push(v);
  }
  // Always include 0 Hz
  if (ticks[0] !== 0) ticks.unshift(0);
  return ticks;
}

function generateNiceTimeTicks(min: number, max: number, targetCount: number): number[] {
  const range = max - min;
  if (range <= 0) return [0];

  const niceSteps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60];
  const rawStep = range / targetCount;
  let step = niceSteps[0];
  for (const s of niceSteps) {
    if (s >= rawStep * 0.7) {
      step = s;
      break;
    }
  }

  const ticks: number[] = [];
  const start = Math.ceil(min / step) * step;
  for (let v = start; v <= max + step * 0.01; v += step) {
    ticks.push(Math.round(v * 100) / 100);
  }
  return ticks;
}
