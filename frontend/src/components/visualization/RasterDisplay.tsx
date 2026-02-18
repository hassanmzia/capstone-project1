/**
 * Spike raster plot display.
 * Canvas-based rendering with channels on Y-axis and time on X-axis.
 * Each spike is drawn as a small tick mark, scrolling in real-time.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { useSpikeEvents } from "@/hooks/useSpikeEvents";

interface RasterDisplayProps {
  className?: string;
  maxChannels?: number;
}

interface RasterSpike {
  channel: number;
  time: number;
}

export default function RasterDisplay({
  className = "",
  maxChannels = 64,
}: RasterDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const spikesRef = useRef<RasterSpike[]>([]);
  const startTimeRef = useRef<number>(Date.now());
  const animFrameRef = useRef<number>(0);

  const viz = useSelector((state: RootState) => state.visualization);
  const { latestSpikes, isConnected } = useSpikeEvents();
  const prevSpikeLenRef = useRef(0);

  const [windowSec] = useState(10);

  // Accumulate new spikes
  useEffect(() => {
    if (latestSpikes.length > prevSpikeLenRef.current) {
      const newSpikes = latestSpikes.slice(prevSpikeLenRef.current);
      const now = Date.now();
      for (const spike of newSpikes) {
        const ch = spike.channelId ?? spike.siteIndex % maxChannels;
        spikesRef.current.push({
          channel: ch,
          time: (now - startTimeRef.current) / 1000,
        });
      }
    }
    prevSpikeLenRef.current = latestSpikes.length;
  }, [latestSpikes, maxChannels]);

  // Rendering loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const marginLeft = 50;
    const marginBottom = 28;
    const marginTop = 8;
    const plotW = W - marginLeft;
    const plotH = H - marginBottom - marginTop;

    // Background
    ctx.fillStyle = "#0f1729";
    ctx.fillRect(0, 0, W, H);

    const nowSec = (Date.now() - startTimeRef.current) / 1000;
    const tMin = Math.max(0, nowSec - windowSec);
    const tMax = nowSec;

    // Prune old spikes
    spikesRef.current = spikesRef.current.filter((s) => s.time >= tMin - 1);

    // Determine visible channels
    const channels = viz.selectedChannels.length > 0
      ? viz.selectedChannels.slice(0, maxChannels)
      : Array.from({ length: Math.min(maxChannels, 32) }, (_, i) => i);
    const numCh = channels.length;
    const chHeight = plotH / numCh;

    // Grid lines
    ctx.strokeStyle = "rgba(56, 189, 248, 0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= numCh; i++) {
      const y = marginTop + i * chHeight;
      ctx.beginPath();
      ctx.moveTo(marginLeft, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // Time grid
    const secStep = windowSec <= 5 ? 1 : windowSec <= 20 ? 2 : 5;
    ctx.fillStyle = "rgba(148, 163, 184, 0.4)";
    ctx.font = "10px monospace";
    ctx.textAlign = "center";
    for (let t = Math.ceil(tMin / secStep) * secStep; t <= tMax; t += secStep) {
      const x = marginLeft + ((t - tMin) / (tMax - tMin)) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, marginTop);
      ctx.lineTo(x, marginTop + plotH);
      ctx.stroke();
      ctx.fillText(`${t.toFixed(0)}s`, x, H - 8);
    }

    // Channel labels
    ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
    ctx.font = "9px monospace";
    ctx.textAlign = "right";
    for (let i = 0; i < numCh; i++) {
      const y = marginTop + i * chHeight + chHeight / 2 + 3;
      ctx.fillText(`CH${channels[i].toString().padStart(2, "0")}`, marginLeft - 6, y);
    }

    // Draw spikes
    const channelIndexMap = new Map(channels.map((ch, idx) => [ch, idx]));

    for (const spike of spikesRef.current) {
      const idx = channelIndexMap.get(spike.channel);
      if (idx === undefined) continue;
      if (spike.time < tMin || spike.time > tMax) continue;

      const x = marginLeft + ((spike.time - tMin) / (tMax - tMin)) * plotW;
      const y = marginTop + idx * chHeight;
      const tickH = Math.max(2, chHeight * 0.7);

      ctx.strokeStyle = "rgba(56, 189, 248, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + (chHeight - tickH) / 2);
      ctx.lineTo(x, y + (chHeight + tickH) / 2);
      ctx.stroke();
    }

    // Border
    ctx.strokeStyle = "rgba(56, 189, 248, 0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(marginLeft, marginTop, plotW, plotH);

    if (!viz.isPaused) {
      animFrameRef.current = requestAnimationFrame(draw);
    }
  }, [viz.isPaused, viz.selectedChannels, windowSec, maxChannels]);

  useEffect(() => {
    animFrameRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className={`relative bg-neural-surface rounded-lg border border-neural-border overflow-hidden ${className}`}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* Status badge */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <span className="text-[10px] font-mono text-neural-text-muted bg-neural-surface/80 px-1.5 py-0.5 rounded">
          {spikesRef.current.length} spikes
        </span>
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            isConnected ? "bg-neural-accent-green" : "bg-neural-accent-amber animate-pulse"
          }`}
        />
      </div>
    </div>
  );
}
