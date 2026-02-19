/**
 * 8-channel PCB ADC data display.
 * Shows voltage and current measurements from PCB telemetry channels
 * with auto-scaling Y axis and descriptive channel labels.
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useDataStream } from "@/hooks/useDataStream";

interface PCBChannel {
  index: number;
  label: string;
  unit: string;
  color: string;
  minRange: number;
  maxRange: number;
}

interface PCBDataDisplayProps {
  className?: string;
  sampleRate?: number;
  timeWindowMs?: number;
}

const PCB_CHANNELS: PCBChannel[] = [
  { index: 0, label: "Temperature", unit: "C", color: "#ff6666", minRange: 20, maxRange: 50 },
  { index: 1, label: "VDD Core", unit: "V", color: "#ffc800", minRange: 0, maxRange: 3.3 },
  { index: 2, label: "VDD IO", unit: "V", color: "#66e64d", minRange: 0, maxRange: 3.3 },
  { index: 3, label: "VREF+", unit: "V", color: "#00d9d9", minRange: 0, maxRange: 2.5 },
  { index: 4, label: "VREF-", unit: "V", color: "#4dc0ff", minRange: -0.5, maxRange: 0.5 },
  { index: 5, label: "I Supply", unit: "mA", color: "#b380ff", minRange: 0, maxRange: 200 },
  { index: 6, label: "I Stim", unit: "uA", color: "#ff8cb3", minRange: 0, maxRange: 500 },
  { index: 7, label: "Aux Input", unit: "V", color: "#80ffa6", minRange: -1, maxRange: 1 },
];

export default function PCBDataDisplay({
  className = "",
  sampleRate = 1000,
  timeWindowMs = 5000,
}: PCBDataDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  const [enabledChannels, setEnabledChannels] = useState<Set<number>>(
    new Set([0, 1, 2, 5])
  );

  const { getLatestData, isConnected } = useDataStream({
    channelCount: 8,
    samplesPerChannel: sampleRate * 60,
    wsUrl: "/ws/pcb-data",
    targetFps: 30,
  });

  const samplesInView = useMemo(
    () => Math.round((timeWindowMs / 1000) * sampleRate),
    [timeWindowMs, sampleRate]
  );

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

      // Clear
      ctx.fillStyle = "#0f1117";
      ctx.fillRect(0, 0, width, height);

      const enabled = Array.from(enabledChannels);
      const channelCount = enabled.length;
      if (channelCount === 0) {
        animRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const channelHeight = height / channelCount;
      const margin = { left: 80, right: 10 };
      const plotW = width - margin.left - margin.right;

      for (let ci = 0; ci < channelCount; ci++) {
        const chIdx = enabled[ci];
        const chConfig = PCB_CHANNELS[chIdx];
        const samples = getLatestData(chIdx, samplesInView);
        const yTop = ci * channelHeight;
        const yPad = 6;

        // Find auto-scale range
        let dataMin = chConfig.minRange;
        let dataMax = chConfig.maxRange;
        if (samples.length > 0) {
          let sMin = Infinity;
          let sMax = -Infinity;
          for (let i = 0; i < samples.length; i++) {
            if (samples[i] < sMin) sMin = samples[i];
            if (samples[i] > sMax) sMax = samples[i];
          }
          if (sMax > sMin) {
            const pad = (sMax - sMin) * 0.1;
            dataMin = sMin - pad;
            dataMax = sMax + pad;
          }
        }

        // Separator line
        if (ci > 0) {
          ctx.strokeStyle = "rgba(255,255,255,0.1)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, yTop);
          ctx.lineTo(width, yTop);
          ctx.stroke();
        }

        // Channel label
        ctx.fillStyle = chConfig.color;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(chConfig.label, 4, yTop + 14);

        // Current value
        const lastVal = samples.length > 0 ? samples[samples.length - 1] : 0;
        ctx.font = "10px monospace";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText(
          `${lastVal.toFixed(2)} ${chConfig.unit}`,
          4,
          yTop + 28
        );

        // Y-axis ticks
        ctx.fillStyle = "rgba(255,255,255,0.3)";
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        const ySteps = 3;
        for (let yi = 0; yi <= ySteps; yi++) {
          const val = dataMin + (yi / ySteps) * (dataMax - dataMin);
          const y = yTop + channelHeight - yPad - (yi / ySteps) * (channelHeight - yPad * 2);
          ctx.fillText(val.toFixed(1), margin.left - 4, y + 3);

          ctx.strokeStyle = "rgba(255,255,255,0.04)";
          ctx.beginPath();
          ctx.moveTo(margin.left, y);
          ctx.lineTo(margin.left + plotW, y);
          ctx.stroke();
        }

        // Draw trace
        ctx.strokeStyle = chConfig.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();

        for (let i = 0; i < samples.length; i++) {
          const x = margin.left + (i / (samplesInView - 1)) * plotW;
          const normY = (samples[i] - dataMin) / (dataMax - dataMin);
          const y = yTop + channelHeight - yPad - normY * (channelHeight - yPad * 2);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Time axis at bottom
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      const timeDivs = 5;
      for (let i = 0; i <= timeDivs; i++) {
        const t = (i / timeDivs) * timeWindowMs;
        const x = margin.left + (i / timeDivs) * plotW;
        const label =
          t >= 1000 ? `${(t / 1000).toFixed(1)}s` : `${t.toFixed(0)}ms`;
        ctx.fillText(label, x, height - 2);
      }

      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [enabledChannels, samplesInView, getLatestData, timeWindowMs]);

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
          PCB ADC Channels
        </h3>
        <span
          className={`text-[10px] flex items-center gap-1 ${
            isConnected ? "text-green-400" : "text-red-400"
          }`}
        >
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected ? "bg-green-400" : "bg-red-400"
            }`}
          />
          {isConnected ? "Connected" : "Disconnected"}
        </span>
      </div>

      {/* Channel toggles */}
      <div className="flex flex-wrap gap-1 px-2 sm:px-3 py-1.5 border-b border-neural-border min-w-0 overflow-hidden">
        {PCB_CHANNELS.map((ch) => (
          <button
            key={ch.index}
            onClick={() => {
              const newEnabled = new Set(enabledChannels);
              if (newEnabled.has(ch.index)) {
                newEnabled.delete(ch.index);
              } else {
                newEnabled.add(ch.index);
              }
              setEnabledChannels(newEnabled);
            }}
            className={`px-1.5 py-0.5 text-[10px] rounded border neural-transition ${
              enabledChannels.has(ch.index)
                ? "border-current"
                : "border-neural-border text-neural-text-muted"
            }`}
            style={{
              color: enabledChannels.has(ch.index) ? ch.color : undefined,
            }}
          >
            {ch.label}
          </button>
        ))}
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 min-h-0 relative">
        <canvas ref={canvasRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
