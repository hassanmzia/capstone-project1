/**
 * Time-frequency spectrogram display.
 * Canvas-based rendering with time on X-axis, frequency on Y-axis,
 * and magnitude encoded as color using a viridis-like colormap.
 * Supports real-time scrolling mode.
 */

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { useNeuralData } from "@/contexts/NeuralDataContext";
import { viridis, buildLUT, type ColormapFn, COLORMAPS } from "@/utils/colorMaps";

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
  colormapName = "viridis",
}: SpectrogramDisplayProps) {
  const viz = useSelector((state: RootState) => state.visualization);
  const channel = propChannel ?? (viz.selectedChannels[0] ?? 0);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const spectrogramBufferRef = useRef<Float32Array[]>([]);
  const maxColumnsRef = useRef(256);

  const [windowSize, setWindowSize] = useState(propWindowSize ?? 512);
  const [hopSize] = useState(propHopSize ?? 256);
  const [maxFrequency, setMaxFrequency] = useState(propMaxFreq ?? 5000);
  const [dynamicRange, setDynamicRange] = useState(80); // dB

  const { getLatestData } = useNeuralData();

  const colormap: ColormapFn = useMemo(
    () => COLORMAPS[colormapName] ?? viridis,
    [colormapName]
  );
  const lut = useMemo(() => buildLUT(colormap, 256), [colormap]);
  const nyquist = sampleRate / 2;
  const freqBins = windowSize / 2;
  const maxBin = Math.min(
    Math.ceil((maxFrequency / nyquist) * freqBins),
    freqBins
  );

  // Simple FFT for spectrogram columns
  const computeFFTColumn = useCallback(
    (samples: Float32Array): Float32Array => {
      const N = windowSize;
      const padded = new Float32Array(N);
      padded.set(samples.subarray(0, Math.min(samples.length, N)));

      // Hanning window
      for (let i = 0; i < N; i++) {
        padded[i] *= 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));
      }

      // Bit-reversal
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

      // Butterfly
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

      const margin = { top: 10, right: 50, bottom: 25, left: 50 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;

      // Clear
      ctx.fillStyle = "#0f1117";
      ctx.fillRect(0, 0, width, height);

      maxColumnsRef.current = Math.round(plotW);

      // Get new data and compute FFT columns
      const totalSamples = windowSize * 4; // Process last few windows
      const samples = getLatestData(channel, totalSamples);

      if (samples.length >= windowSize) {
        // Compute new FFT columns
        for (let offset = 0; offset + windowSize <= samples.length; offset += hopSize) {
          const segment = samples.subarray(offset, offset + windowSize);
          const column = computeFFTColumn(segment);
          spectrogramBufferRef.current.push(column);
        }

        // Trim to max columns
        while (spectrogramBufferRef.current.length > maxColumnsRef.current) {
          spectrogramBufferRef.current.shift();
        }
      }

      const columns = spectrogramBufferRef.current;
      if (columns.length === 0) {
        animRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      // Find global dB range for color mapping
      const dBMax = 0;
      const dBMin = -dynamicRange;

      // Render spectrogram image
      const imgW = columns.length;
      const imgH = maxBin;
      if (imgW > 0 && imgH > 0) {
        const imageData = ctx.createImageData(imgW, imgH);
        const pixels = imageData.data;

        for (let col = 0; col < imgW; col++) {
          const spectrum = columns[col];
          for (let row = 0; row < imgH; row++) {
            // Flip Y: low freq at bottom
            const bin = row;
            const dB = spectrum[bin] ?? dBMin;
            const normalized = Math.max(0, Math.min(1, (dB - dBMin) / (dBMax - dBMin)));
            const lutIdx = Math.round(normalized * 255);

            const pixelIdx = ((imgH - 1 - row) * imgW + col) * 4;
            pixels[pixelIdx + 0] = lut[lutIdx * 4 + 0];
            pixels[pixelIdx + 1] = lut[lutIdx * 4 + 1];
            pixels[pixelIdx + 2] = lut[lutIdx * 4 + 2];
            pixels[pixelIdx + 3] = 255;
          }
        }

        // Draw scaled to plot area
        const offscreen = new OffscreenCanvas(imgW, imgH);
        const offCtx = offscreen.getContext("2d");
        if (offCtx) {
          offCtx.putImageData(imageData, 0, 0);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(offscreen, margin.left, margin.top, plotW, plotH);
        }
      }

      // Y-axis labels (frequency)
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "9px monospace";
      ctx.textAlign = "right";
      const freqSteps = 5;
      for (let i = 0; i <= freqSteps; i++) {
        const freq = (i / freqSteps) * maxFrequency;
        const y = margin.top + plotH * (1 - i / freqSteps);
        const label = freq >= 1000 ? `${(freq / 1000).toFixed(1)}k` : `${freq.toFixed(0)}`;
        ctx.fillText(label, margin.left - 4, y + 3);

        ctx.strokeStyle = "rgba(255,255,255,0.08)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();
      }

      // Axis labels
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Time", margin.left + plotW / 2, height - 2);

      ctx.save();
      ctx.translate(12, margin.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("Frequency (Hz)", 0, 0);
      ctx.restore();

      // Color bar on right
      const barW = 12;
      const barX = width - margin.right + 10;
      for (let i = 0; i < plotH; i++) {
        const t = 1 - i / plotH;
        const lutIdx = Math.round(t * 255);
        ctx.fillStyle = `rgb(${lut[lutIdx * 4]}, ${lut[lutIdx * 4 + 1]}, ${lut[lutIdx * 4 + 2]})`;
        ctx.fillRect(barX, margin.top + i, barW, 1);
      }
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "8px monospace";
      ctx.textAlign = "left";
      ctx.fillText(`${dBMax}dB`, barX + barW + 2, margin.top + 8);
      ctx.fillText(`${dBMin}dB`, barX + barW + 2, margin.top + plotH);

      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [channel, windowSize, hopSize, maxFrequency, maxBin, dynamicRange, lut, getLatestData, computeFFTColumn]);

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
          Spectrogram - CH{channel.toString().padStart(2, "0")}
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">Win:</span>
            <select
              value={windowSize}
              onChange={(e) => {
                setWindowSize(Number(e.target.value));
                spectrogramBufferRef.current = [];
              }}
              className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
            >
              <option value={256}>256</option>
              <option value={512}>512</option>
              <option value={1024}>1024</option>
              <option value={2048}>2048</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">Max:</span>
            <select
              value={maxFrequency}
              onChange={(e) => setMaxFrequency(Number(e.target.value))}
              className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
            >
              <option value={1000}>1 kHz</option>
              <option value={2000}>2 kHz</option>
              <option value={5000}>5 kHz</option>
              <option value={10000}>10 kHz</option>
              <option value={nyquist}>Nyquist</option>
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">DR:</span>
            <select
              value={dynamicRange}
              onChange={(e) => setDynamicRange(Number(e.target.value))}
              className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
            >
              <option value={40}>40 dB</option>
              <option value={60}>60 dB</option>
              <option value={80}>80 dB</option>
              <option value={100}>100 dB</option>
            </select>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
