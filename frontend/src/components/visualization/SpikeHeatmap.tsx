/**
 * Professional 64x64 electrode spike rate heatmap.
 * Canvas-based rendering of 4096 electrode sites with configurable color maps,
 * interactive selection, real-time WebSocket updates, axis tick labels,
 * grid overlay, statistics bar, and gradient color legend.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useSharedSpikeEvents } from "@/contexts/SpikeEventsContext";
import { neuralActivity, createCSSGradient, type ColormapFn, COLORMAPS, buildLUT } from "@/utils/colorMaps";
import { siteToRowCol, rowColToSite, getSiteLabel } from "@/utils/siteConversion";

interface SpikeHeatmapProps {
  className?: string;
  onSiteSelect?: (siteIndex: number) => void;
  onRegionSelect?: (sites: number[]) => void;
  colorScale?: "linear" | "log";
  colormapName?: string;
  gridSize?: number;
}

interface TooltipInfo {
  x: number;
  y: number;
  siteIndex: number;
  row: number;
  col: number;
  spikeRate: number;
  spikeCount: number;
}

export default function SpikeHeatmap({
  className = "",
  onSiteSelect,
  onRegionSelect,
  colorScale = "linear",
  colormapName = "neuralActivity",
  gridSize = 64,
}: SpikeHeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const offscreenRef = useRef<OffscreenCanvas | null>(null);

  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
  const [selectedSites, setSelectedSites] = useState<Set<number>>(new Set());
  const [scaleType, setScaleType] = useState<"linear" | "log">(colorScale);
  const [showGrid, setShowGrid] = useState(false);

  const { spikeRate, spikeCounts, activeSites } = useSharedSpikeEvents();

  const colormap: ColormapFn = useMemo(
    () => COLORMAPS[colormapName] ?? neuralActivity,
    [colormapName]
  );

  const lut = useMemo(() => buildLUT(colormap, 256), [colormap]);

  // Compute stats for color scaling and display
  const { minRate, maxRate, meanRate, peakSite } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let peakIdx = 0;
    for (let i = 0; i < spikeRate.length; i++) {
      const v = spikeRate[i];
      sum += v;
      if (v < min) min = v;
      if (v > max) { max = v; peakIdx = i; }
    }
    if (min === Infinity) min = 0;
    if (max === -Infinity || max === min) max = min + 1;
    const mean = spikeRate.length > 0 ? sum / spikeRate.length : 0;
    return { minRate: min, maxRate: max, meanRate: mean, peakSite: peakIdx };
  }, [spikeRate]);

  // Reusable offscreen canvas
  useEffect(() => {
    offscreenRef.current = new OffscreenCanvas(gridSize, gridSize);
  }, [gridSize]);

  // Canvas rendering
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let running = true;

    const renderFrame = () => {
      if (!running) return;

      const { width: cW, height: cH } = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;

      // Margins for axis labels
      const axisLabelSpace = Math.round(Math.max(18, cW * 0.05));
      const topPad = 4;
      const size = Math.min(cW - axisLabelSpace, cH - axisLabelSpace - topPad);
      if (size <= 0) { animRef.current = requestAnimationFrame(renderFrame); return; }

      canvas.width = Math.round(cW * dpr);
      canvas.height = Math.round(cH * dpr);
      canvas.style.width = `${cW}px`;
      canvas.style.height = `${cH}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Clear
      ctx.fillStyle = "#0a0f1e";
      ctx.fillRect(0, 0, cW, cH);

      // Center heatmap horizontally when container is wider than tall
      const extraW = (cW - axisLabelSpace) - size;
      const ox = axisLabelSpace + Math.max(0, Math.floor(extraW / 2));
      const oy = topPad;         // heatmap Y offset
      const cellW = size / gridSize;
      const cellH = size / gridSize;

      // Build ImageData
      const offscreen = offscreenRef.current ?? new OffscreenCanvas(gridSize, gridSize);
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) { animRef.current = requestAnimationFrame(renderFrame); return; }

      const imageData = offCtx.createImageData(gridSize, gridSize);
      const pixels = imageData.data;

      for (let row = 0; row < gridSize; row++) {
        for (let col = 0; col < gridSize; col++) {
          const siteIndex = row * gridSize + col;
          const rate = spikeRate[siteIndex] ?? 0;

          let normalized: number;
          if (scaleType === "log") {
            normalized = Math.log1p(rate - minRate) / Math.log1p(maxRate - minRate);
          } else {
            normalized = (rate - minRate) / (maxRate - minRate);
          }
          normalized = Math.max(0, Math.min(1, normalized));

          const lutIdx = Math.round(normalized * 255);
          const pixelIdx = (row * gridSize + col) * 4;
          pixels[pixelIdx + 0] = lut[lutIdx * 4 + 0];
          pixels[pixelIdx + 1] = lut[lutIdx * 4 + 1];
          pixels[pixelIdx + 2] = lut[lutIdx * 4 + 2];
          pixels[pixelIdx + 3] = 255;
        }
      }

      // Scale up the small image to fill canvas
      ctx.imageSmoothingEnabled = false;
      offCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(offscreen, ox, oy, size, size);

      // ── Grid overlay (every 8 electrodes) ──
      if (showGrid) {
        ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
        ctx.lineWidth = 0.5;
        const step = 8;
        for (let i = step; i < gridSize; i += step) {
          // Vertical
          const x = ox + i * cellW;
          ctx.beginPath();
          ctx.moveTo(x, oy);
          ctx.lineTo(x, oy + size);
          ctx.stroke();
          // Horizontal
          const y = oy + i * cellH;
          ctx.beginPath();
          ctx.moveTo(ox, y);
          ctx.lineTo(ox + size, y);
          ctx.stroke();
        }
      }

      // ── Heatmap border ──
      ctx.strokeStyle = "rgba(56, 189, 248, 0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(ox, oy, size, size);

      // ── Axis tick labels ──
      const tickFont = `${Math.max(7, Math.round(axisLabelSpace * 0.4))}px monospace`;
      ctx.font = tickFont;
      ctx.fillStyle = "rgba(148, 163, 184, 0.55)";

      // Left axis (row ticks every 8)
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let r = 0; r < gridSize; r += 8) {
        const y = oy + r * cellH + cellH * 4; // center of the 8-row group
        ctx.fillText(String(r), ox - 3, y);
      }

      // Bottom axis (col ticks every 8)
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      for (let c = 0; c < gridSize; c += 8) {
        const x = ox + c * cellW + cellW * 4;
        ctx.fillText(String(c), x, oy + size + 3);
      }

      // ── Selection overlay ──
      if (selectedSites.size > 0) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1;
        for (const site of selectedSites) {
          const { row: r, col: c } = siteToRowCol(site);
          ctx.strokeRect(ox + c * cellW, oy + r * cellH, cellW, cellH);
        }
      }

      // ── Drag selection rectangle ──
      if (isDragging && dragStart && dragEnd) {
        const x0 = ox + Math.min(dragStart.col, dragEnd.col) * cellW;
        const y0 = oy + Math.min(dragStart.row, dragEnd.row) * cellH;
        const x1 = ox + (Math.max(dragStart.col, dragEnd.col) + 1) * cellW;
        const y1 = oy + (Math.max(dragStart.row, dragEnd.row) + 1) * cellH;
        ctx.strokeStyle = "rgba(6, 182, 212, 0.9)";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
        ctx.setLineDash([]);
        ctx.fillStyle = "rgba(6, 182, 212, 0.1)";
        ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      }

      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      running = false;
      cancelAnimationFrame(animRef.current);
    };
  }, [spikeRate, gridSize, lut, scaleType, minRate, maxRate, selectedSites, isDragging, dragStart, dragEnd, showGrid]);

  const getCellFromEvent = useCallback(
    (e: React.MouseEvent): { row: number; col: number } | null => {
      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return null;

      const cRect = container.getBoundingClientRect();
      const cW = cRect.width;
      const cH = cRect.height;
      const axisLabelSpace = Math.round(Math.max(18, cW * 0.05));
      const topPad = 4;
      const size = Math.min(cW - axisLabelSpace, cH - axisLabelSpace - topPad);

      const canvasRect = canvas.getBoundingClientRect();
      const mx = e.clientX - canvasRect.left;
      const my = e.clientY - canvasRect.top;
      const extraW = (cW - axisLabelSpace) - size;
      const ox = axisLabelSpace + Math.max(0, Math.floor(extraW / 2));
      const oy = topPad;

      const col = Math.floor(((mx - ox) / size) * gridSize);
      const row = Math.floor(((my - oy) / size) * gridSize);
      if (row < 0 || row >= gridSize || col < 0 || col >= gridSize) return null;
      return { row, col };
    },
    [gridSize]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const cell = getCellFromEvent(e);
      if (!cell) return;
      setIsDragging(true);
      setDragStart(cell);
      setDragEnd(cell);
    },
    [getCellFromEvent]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const cell = getCellFromEvent(e);
      if (!cell) {
        setTooltip(null);
        return;
      }

      if (isDragging) {
        setDragEnd(cell);
      }

      const siteIndex = rowColToSite(cell.row, cell.col);
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          siteIndex,
          row: cell.row,
          col: cell.col,
          spikeRate: spikeRate[siteIndex] ?? 0,
          spikeCount: spikeCounts[siteIndex] ?? 0,
        });
      }
    },
    [getCellFromEvent, isDragging, spikeRate, spikeCounts]
  );

  const handleMouseUp = useCallback(
    (_e: React.MouseEvent) => {
      if (isDragging && dragStart && dragEnd) {
        const r0 = Math.min(dragStart.row, dragEnd.row);
        const r1 = Math.max(dragStart.row, dragEnd.row);
        const c0 = Math.min(dragStart.col, dragEnd.col);
        const c1 = Math.max(dragStart.col, dragEnd.col);

        if (r0 === r1 && c0 === c1) {
          const site = rowColToSite(r0, c0);
          const newSelected = new Set(selectedSites);
          if (newSelected.has(site)) {
            newSelected.delete(site);
          } else {
            newSelected.add(site);
          }
          setSelectedSites(newSelected);
          onSiteSelect?.(site);
        } else {
          const sites: number[] = [];
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
              sites.push(rowColToSite(r, c));
            }
          }
          setSelectedSites(new Set(sites));
          onRegionSelect?.(sites);
        }
      }

      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    },
    [isDragging, dragStart, dragEnd, selectedSites, onSiteSelect, onRegionSelect]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      setDragEnd(null);
    }
  }, [isDragging]);

  const gradientCSS = useMemo(
    () => createCSSGradient(colormap, "to right", 32),
    [colormap]
  );

  const activePercent = spikeRate.length > 0
    ? ((activeSites / spikeRate.length) * 100).toFixed(1)
    : "0.0";

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-neural-border shrink-0">
        <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
          Spike Heatmap
          <span className="ml-1.5 text-neural-text-muted font-normal normal-case">
            {gridSize}&times;{gridSize}
          </span>
        </h3>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`px-1.5 py-0.5 text-[10px] rounded neural-transition ${
              showGrid
                ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                : "bg-neural-surface-alt text-neural-text-muted hover:text-neural-text-primary border border-neural-border"
            }`}
          >
            GRID
          </button>
          <button
            onClick={() => setScaleType(scaleType === "linear" ? "log" : "linear")}
            className="px-1.5 py-0.5 text-[10px] rounded bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border neural-transition"
          >
            {scaleType === "linear" ? "LIN" : "LOG"}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="flex items-center gap-3 px-3 py-1 border-b border-neural-border/50 text-[10px] font-mono shrink-0">
        <span className="text-neural-text-muted">
          Active: <span className="text-neural-accent-green">{activeSites}</span>
          <span className="text-neural-text-muted/50"> ({activePercent}%)</span>
        </span>
        <span className="text-neural-text-muted">
          Peak: <span className="text-neural-accent-amber">{maxRate.toFixed(1)} Hz</span>
          <span className="text-neural-text-muted/50"> @{peakSite}</span>
        </span>
        <span className="text-neural-text-muted">
          Mean: <span className="text-neural-accent-cyan">{meanRate.toFixed(1)} Hz</span>
        </span>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} className="flex-1 relative p-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-1 cursor-crosshair"
          style={{ imageRendering: "pixelated" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-neural-surface-alt/95 border border-neural-border rounded-lg shadow-lg px-2.5 py-2 text-xs z-20 whitespace-nowrap"
            style={{
              left: Math.min(tooltip.x + 16, (containerRef.current?.clientWidth ?? 200) - 150),
              top: Math.max(tooltip.y - 60, 4),
            }}
          >
            <div className="font-mono text-neural-text-primary font-semibold text-[11px]">
              {getSiteLabel(tooltip.siteIndex)}
            </div>
            <div className="text-neural-text-muted text-[10px] mb-0.5">
              Site #{tooltip.siteIndex} &middot; ({tooltip.row}, {tooltip.col})
            </div>
            <div className="flex items-center gap-3 mt-1 pt-1 border-t border-neural-border/50">
              <span className="text-neural-accent-cyan">
                {tooltip.spikeRate.toFixed(1)} <span className="text-neural-text-muted">Hz</span>
              </span>
              <span className="text-neural-text-secondary">
                {Math.round(tooltip.spikeCount)} <span className="text-neural-text-muted">spikes</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* ── Color scale legend ── */}
      <div className="px-3 pb-2 pt-1 shrink-0">
        <div className="flex items-center gap-2 text-[9px] text-neural-text-muted">
          <span className="font-mono w-8 text-right">{minRate.toFixed(1)}</span>
          <div className="flex-1 relative">
            <div
              className="h-2.5 rounded-sm border border-neural-border/30"
              style={{ background: gradientCSS }}
            />
          </div>
          <span className="font-mono w-14">{maxRate.toFixed(1)} Hz</span>
        </div>
        <div className="text-center text-[9px] text-neural-text-muted/60 mt-0.5">
          Spike Rate ({scaleType === "log" ? "log" : "linear"} scale)
        </div>
      </div>
    </div>
  );
}
