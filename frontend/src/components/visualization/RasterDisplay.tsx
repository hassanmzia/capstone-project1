/**
 * Professional spike raster plot display.
 * Canvas-based rendering with channels on Y-axis and time on X-axis.
 * Features: density-colored spikes, alternating row shading,
 * labeled axes, per-channel firing rate bars, and clear grid.
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "@/store";
import { useSharedSpikeEvents } from "@/contexts/SpikeEventsContext";
import { computeCanvasMetrics } from "@/utils/canvasScale";

interface RasterDisplayProps {
  className?: string;
  maxChannels?: number;
}

interface RasterSpike {
  channel: number;
  time: number;
}

/** Per-channel rate stats for the visible window */
interface ChannelStats {
  count: number;
  rate: number; // Hz (spikes / window)
}

/** Color ramp for spike density: blue → cyan → green → yellow → red */
function spikeColor(density: number): string {
  const t = Math.max(0, Math.min(1, density));
  if (t < 0.25) {
    const s = t / 0.25;
    return `rgba(${Math.round(30 + 0 * s)}, ${Math.round(120 + 70 * s)}, ${Math.round(220 + 28 * s)}, 0.90)`;
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    return `rgba(${Math.round(30 + 20 * s)}, ${Math.round(190 + 55 * s)}, ${Math.round(248 - 120 * s)}, 0.90)`;
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    return `rgba(${Math.round(50 + 195 * s)}, ${Math.round(245 - 55 * s)}, ${Math.round(128 - 100 * s)}, 0.90)`;
  } else {
    const s = (t - 0.75) / 0.25;
    return `rgba(${Math.round(245 + 10 * s)}, ${Math.round(190 - 130 * s)}, ${Math.round(28 + 10 * s)}, 0.90)`;
  }
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
  const { latestSpikes, isConnected } = useSharedSpikeEvents();
  const lastProcessedTimeRef = useRef(0);

  const [windowSec, setWindowSec] = useState(10);

  // Accumulate new spikes
  useEffect(() => {
    const now = Date.now();
    let maxTs = lastProcessedTimeRef.current;

    for (const spike of latestSpikes) {
      if (spike.timestamp > lastProcessedTimeRef.current) {
        const ch = spike.channelId ?? spike.siteIndex % maxChannels;
        spikesRef.current.push({
          channel: ch,
          time: (now - startTimeRef.current) / 1000,
        });
        if (spike.timestamp > maxTs) maxTs = spike.timestamp;
      }
    }

    lastProcessedTimeRef.current = maxTs;
  }, [latestSpikes, maxChannels]);

  // Rendering loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const metrics = computeCanvasMetrics(rect.width, rect.height);
    const dpr = metrics.dpr;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const { margin: mg, fonts } = metrics;

    // Extra right margin for firing-rate bars
    const rateBarWidth = Math.round(Math.max(30, W * 0.06));
    const marginRight = mg.right + rateBarWidth + 8;
    const plotW = W - mg.left - marginRight;
    const plotH = H - mg.top - mg.bottom;

    // Background
    ctx.fillStyle = "#0a0f1e";
    ctx.fillRect(0, 0, W, H);

    const nowSec = (Date.now() - startTimeRef.current) / 1000;
    const tMin = Math.max(0, nowSec - windowSec);
    const tMax = nowSec;

    // Prune old spikes
    spikesRef.current = spikesRef.current.filter((s) => s.time >= tMin - 1);

    // Determine visible channels
    const channels =
      viz.selectedChannels.length > 0
        ? viz.selectedChannels.slice(0, maxChannels)
        : Array.from({ length: Math.min(maxChannels, 32) }, (_, i) => i);
    const numCh = channels.length;
    if (numCh === 0) return;
    const chHeight = plotH / numCh;

    // Build per-channel stats for visible window
    const channelIndexMap = new Map(channels.map((ch, idx) => [ch, idx]));
    const stats: ChannelStats[] = channels.map(() => ({ count: 0, rate: 0 }));
    let globalMaxRate = 1;

    for (const spike of spikesRef.current) {
      const idx = channelIndexMap.get(spike.channel);
      if (idx === undefined) continue;
      if (spike.time >= tMin && spike.time <= tMax) {
        stats[idx].count++;
      }
    }
    for (const s of stats) {
      s.rate = windowSec > 0 ? s.count / windowSec : 0;
      if (s.rate > globalMaxRate) globalMaxRate = s.rate;
    }

    // ── Alternating channel strip backgrounds ──
    for (let i = 0; i < numCh; i++) {
      const y = mg.top + i * chHeight;
      ctx.fillStyle = i % 2 === 0 ? "rgba(15, 23, 42, 0.6)" : "rgba(20, 30, 55, 0.4)";
      ctx.fillRect(mg.left, y, plotW, chHeight);
    }

    // ── Grid lines ──
    ctx.strokeStyle = "rgba(56, 189, 248, 0.07)";
    ctx.lineWidth = 0.5;
    // Horizontal channel separators
    for (let i = 0; i <= numCh; i++) {
      const y = mg.top + i * chHeight;
      ctx.beginPath();
      ctx.moveTo(mg.left, y);
      ctx.lineTo(mg.left + plotW, y);
      ctx.stroke();
    }

    // ── Time grid with labels ──
    const secStep = windowSec <= 5 ? 1 : windowSec <= 20 ? 2 : 5;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let t = Math.ceil(tMin / secStep) * secStep; t <= tMax; t += secStep) {
      const x = mg.left + ((t - tMin) / (tMax - tMin)) * plotW;
      // Grid line
      ctx.strokeStyle = "rgba(56, 189, 248, 0.08)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, mg.top);
      ctx.lineTo(x, mg.top + plotH);
      ctx.stroke();
      // Tick mark
      ctx.strokeStyle = "rgba(148, 163, 184, 0.4)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, mg.top + plotH);
      ctx.lineTo(x, mg.top + plotH + 4);
      ctx.stroke();
      // Label
      ctx.fillStyle = "rgba(148, 163, 184, 0.7)";
      ctx.font = fonts.tickLabel;
      ctx.fillText(`${t.toFixed(0)}s`, x, mg.top + plotH + 6);
    }

    // ── X-axis label ──
    ctx.fillStyle = "rgba(148, 163, 184, 0.55)";
    ctx.font = fonts.axisLabel;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Time (s)", mg.left + plotW / 2, H - 2);

    // ── Y-axis channel labels ──
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.font = fonts.annotation;
    for (let i = 0; i < numCh; i++) {
      const y = mg.top + i * chHeight + chHeight / 2;
      const isActive = stats[i].count > 0;
      ctx.fillStyle = isActive ? "rgba(56, 189, 248, 0.8)" : "rgba(148, 163, 184, 0.45)";
      ctx.fillText(`CH${channels[i].toString().padStart(2, "0")}`, mg.left - 6, y);
    }

    // ── Y-axis label ──
    ctx.save();
    ctx.translate(10, mg.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = "rgba(148, 163, 184, 0.55)";
    ctx.font = fonts.axisLabel;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Channel", 0, 0);
    ctx.restore();

    // ── Draw spikes with density coloring ──
    for (const spike of spikesRef.current) {
      const idx = channelIndexMap.get(spike.channel);
      if (idx === undefined) continue;
      if (spike.time < tMin || spike.time > tMax) continue;

      const x = mg.left + ((spike.time - tMin) / (tMax - tMin)) * plotW;
      const y = mg.top + idx * chHeight;
      const tickH = Math.max(2, chHeight * 0.65);
      const density = stats[idx].rate / globalMaxRate;

      ctx.strokeStyle = spikeColor(density);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y + (chHeight - tickH) / 2);
      ctx.lineTo(x, y + (chHeight + tickH) / 2);
      ctx.stroke();
    }

    // ── Plot border ──
    ctx.strokeStyle = "rgba(56, 189, 248, 0.2)";
    ctx.lineWidth = 1;
    ctx.strokeRect(mg.left, mg.top, plotW, plotH);

    // ── Per-channel firing rate bars ──
    const barX0 = mg.left + plotW + 8;
    const barW = rateBarWidth;
    // Header
    ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
    ctx.font = fonts.annotation;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("Hz", barX0 + barW / 2, mg.top - 2);

    for (let i = 0; i < numCh; i++) {
      const y = mg.top + i * chHeight;
      const fillW = (stats[i].rate / globalMaxRate) * barW;
      // Background
      ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
      ctx.fillRect(barX0, y + 1, barW, chHeight - 2);
      // Fill bar
      if (fillW > 0) {
        const grad = ctx.createLinearGradient(barX0, 0, barX0 + barW, 0);
        grad.addColorStop(0, "rgba(6, 182, 212, 0.6)");
        grad.addColorStop(1, "rgba(59, 130, 246, 0.8)");
        ctx.fillStyle = grad;
        ctx.fillRect(barX0, y + 1, fillW, chHeight - 2);
      }
      // Rate text (only if enough height)
      if (chHeight > 10 && stats[i].rate > 0) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = `${Math.max(7, Math.round(chHeight * 0.55))}px monospace`;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(
          stats[i].rate >= 10 ? stats[i].rate.toFixed(0) : stats[i].rate.toFixed(1),
          barX0 + barW - 2,
          y + chHeight / 2
        );
      }
    }

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
      className={`relative flex flex-col bg-neural-surface rounded-xl border border-neural-border overflow-hidden ${className}`}
    >
      {/* ── Header bar ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neural-border shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
            Spike Raster
          </h3>
          <span className="text-[10px] font-mono text-neural-text-muted">
            {spikesRef.current.length} spikes
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Window size control */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-neural-text-muted">Window:</span>
            {[5, 10, 30].map((s) => (
              <button
                key={s}
                onClick={() => setWindowSec(s)}
                className={`px-1.5 py-0.5 text-[10px] rounded font-mono neural-transition ${
                  windowSec === s
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-primary bg-neural-surface-alt border border-neural-border"
                }`}
              >
                {s}s
              </button>
            ))}
          </div>

          {/* Connection indicator */}
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isConnected
                ? "bg-neural-accent-green"
                : "bg-neural-accent-amber animate-pulse"
            }`}
          />
        </div>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} className="flex-1 relative min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </div>
    </div>
  );
}
