/**
 * Frequency domain (FFT magnitude) display.
 * Canvas-based rendering with frequency on X-axis and magnitude (dB) on Y-axis.
 * Supports multiple channel overlay with peak frequency annotation.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { useNeuralData } from "@/contexts/NeuralDataContext";

interface FFTDisplayProps {
  className?: string;
  selectedChannels?: number[];
  sampleRate?: number;
  fftSize?: number;
  minFrequency?: number;
  maxFrequency?: number;
}

const CHANNEL_COLORS = [
  "#00d9d9", "#4dc0ff", "#66e64d", "#ffc800",
  "#ff6666", "#b380ff", "#ff8cb3", "#80ffa6",
];

export default function FFTDisplay({
  className = "",
  selectedChannels: propChannels,
  sampleRate = 30000,
  fftSize = 2048,
  minFrequency = 0,
  maxFrequency: propMaxFreq,
}: FFTDisplayProps) {
  const viz = useSelector((state: RootState) => state.visualization);
  const channels = propChannels ?? viz.selectedChannels;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  const [isLogScale, setIsLogScale] = useState(false);
  const [maxFrequency, setMaxFrequency] = useState(propMaxFreq ?? sampleRate / 2);
  const [peakFreqs, setPeakFreqs] = useState<Map<number, number>>(new Map());

  const { getLatestData } = useNeuralData();

  const nyquist = sampleRate / 2;

  // Simple FFT (Cooley-Tukey radix-2 DIT)
  const computeFFT = useCallback(
    (samples: Float32Array): Float32Array => {
      const N = fftSize;
      // Zero-pad or truncate
      const padded = new Float32Array(N);
      padded.set(samples.subarray(0, Math.min(samples.length, N)));

      // Apply Hanning window
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

      // FFT butterfly
      for (let size = 2; size <= N; size *= 2) {
        const half = size / 2;
        const phaseStep = (-2 * Math.PI) / size;
        for (let i = 0; i < N; i += size) {
          for (let j = 0; j < half; j++) {
            const angle = phaseStep * j;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const tReal = real[i + j + half] * cos - imag[i + j + half] * sin;
            const tImag = real[i + j + half] * sin + imag[i + j + half] * cos;
            real[i + j + half] = real[i + j] - tReal;
            imag[i + j + half] = imag[i + j] - tImag;
            real[i + j] += tReal;
            imag[i + j] += tImag;
          }
        }
      }

      // Compute magnitude in dB
      const halfN = N / 2;
      const magnitudes = new Float32Array(halfN);
      for (let i = 0; i < halfN; i++) {
        const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / halfN;
        magnitudes[i] = 20 * Math.log10(Math.max(mag, 1e-10));
      }

      return magnitudes;
    },
    [fftSize]
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

      // Layout
      const margin = { top: 10, right: 15, bottom: 30, left: 50 };
      const plotW = width - margin.left - margin.right;
      const plotH = height - margin.top - margin.bottom;

      // Clear background
      ctx.fillStyle = "#0f1117";
      ctx.fillRect(0, 0, width, height);

      // Y-axis range
      const dBMin = -80;
      const dBMax = 20;

      // Frequency range (bin indices)
      const minBin = Math.floor((minFrequency / nyquist) * (fftSize / 2));
      const maxBin = Math.min(
        Math.ceil((maxFrequency / nyquist) * (fftSize / 2)),
        fftSize / 2 - 1
      );

      // Draw grid
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.lineWidth = 1;

      // Horizontal grid (dB)
      for (let dB = dBMin; dB <= dBMax; dB += 20) {
        const y = margin.top + plotH * (1 - (dB - dBMin) / (dBMax - dBMin));
        ctx.beginPath();
        ctx.moveTo(margin.left, y);
        ctx.lineTo(margin.left + plotW, y);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "10px monospace";
        ctx.textAlign = "right";
        ctx.fillText(`${dB}`, margin.left - 5, y + 3);
      }

      // Vertical grid (frequency)
      const freqStep = maxFrequency <= 1000 ? 100 : maxFrequency <= 5000 ? 500 : 2000;
      for (let f = 0; f <= maxFrequency; f += freqStep) {
        if (f < minFrequency) continue;
        const x = margin.left + ((f - minFrequency) / (maxFrequency - minFrequency)) * plotW;
        ctx.beginPath();
        ctx.moveTo(x, margin.top);
        ctx.lineTo(x, margin.top + plotH);
        ctx.stroke();

        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "10px monospace";
        ctx.textAlign = "center";
        const label = f >= 1000 ? `${(f / 1000).toFixed(1)}k` : `${f}`;
        ctx.fillText(label, x, margin.top + plotH + 15);
      }

      // Axis labels
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Frequency (Hz)", margin.left + plotW / 2, height - 3);

      ctx.save();
      ctx.translate(12, margin.top + plotH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText("Magnitude (dB)", 0, 0);
      ctx.restore();

      // Draw FFT for each channel
      const newPeaks = new Map<number, number>();

      for (let ci = 0; ci < channels.length && ci < 8; ci++) {
        const ch = channels[ci];
        const samples = getLatestData(ch, fftSize);
        const magnitudes = computeFFT(samples);

        ctx.strokeStyle = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();

        let peakMag = -Infinity;
        let peakBin = 0;

        for (let bin = minBin; bin <= maxBin; bin++) {
          const freq = (bin / (fftSize / 2)) * nyquist;
          let x: number;
          if (isLogScale && minFrequency > 0) {
            x =
              margin.left +
              (Math.log10(freq / minFrequency) /
                Math.log10(maxFrequency / minFrequency)) *
                plotW;
          } else {
            x = margin.left + ((freq - minFrequency) / (maxFrequency - minFrequency)) * plotW;
          }

          const dB = Math.max(dBMin, Math.min(dBMax, magnitudes[bin]));
          const y = margin.top + plotH * (1 - (dB - dBMin) / (dBMax - dBMin));

          if (bin === minBin) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          if (magnitudes[bin] > peakMag && bin > 1) {
            peakMag = magnitudes[bin];
            peakBin = bin;
          }
        }

        ctx.stroke();
        ctx.globalAlpha = 1;

        // Annotate peak frequency
        if (peakMag > dBMin + 10) {
          const peakFreq = (peakBin / (fftSize / 2)) * nyquist;
          newPeaks.set(ch, peakFreq);

          const px =
            margin.left +
            ((peakFreq - minFrequency) / (maxFrequency - minFrequency)) * plotW;
          const py =
            margin.top +
            plotH * (1 - (Math.min(dBMax, peakMag) - dBMin) / (dBMax - dBMin));

          ctx.fillStyle = CHANNEL_COLORS[ci % CHANNEL_COLORS.length];
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.font = "9px monospace";
          ctx.textAlign = "center";
          ctx.fillText(
            `${peakFreq >= 1000 ? (peakFreq / 1000).toFixed(1) + "k" : peakFreq.toFixed(0)}Hz`,
            px,
            py - 8
          );
        }
      }

      setPeakFreqs(newPeaks);
      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [
    channels,
    fftSize,
    sampleRate,
    minFrequency,
    maxFrequency,
    isLogScale,
    nyquist,
    getLatestData,
    computeFFT,
  ]);

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
          FFT Spectrum
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsLogScale(!isLogScale)}
            className={`px-1.5 py-0.5 text-[10px] rounded border border-neural-border ${
              isLogScale
                ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                : "text-neural-text-muted"
            }`}
          >
            LOG
          </button>
          <select
            value={maxFrequency}
            onChange={(e) => setMaxFrequency(Number(e.target.value))}
            className="bg-neural-surface-alt border border-neural-border rounded px-1 py-0.5 text-[10px] text-neural-text-primary"
          >
            <option value={500}>500 Hz</option>
            <option value={1000}>1 kHz</option>
            <option value={5000}>5 kHz</option>
            <option value={10000}>10 kHz</option>
            <option value={nyquist}>Nyquist</option>
          </select>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>

      {/* Peak frequencies footer */}
      {peakFreqs.size > 0 && (
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-neural-border overflow-x-auto">
          {Array.from(peakFreqs.entries()).map(([ch, freq], i) => (
            <span
              key={ch}
              className="text-[10px] font-mono whitespace-nowrap"
              style={{ color: CHANNEL_COLORS[i % CHANNEL_COLORS.length] }}
            >
              CH{ch.toString().padStart(2, "0")}:{" "}
              {freq >= 1000
                ? `${(freq / 1000).toFixed(1)}kHz`
                : `${freq.toFixed(0)}Hz`}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
