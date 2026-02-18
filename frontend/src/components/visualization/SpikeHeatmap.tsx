/**
 * 64x64 electrode spike rate heatmap.
 * Canvas-based rendering of 4096 electrode sites with configurable color maps,
 * interactive selection, and real-time WebSocket updates.
 */

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { useSpikeEvents } from "@/hooks/useSpikeEvents";
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

  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
  const [selectedSites, setSelectedSites] = useState<Set<number>>(new Set());
  const [scaleType, setScaleType] = useState<"linear" | "log">(colorScale);

  const { spikeRate, spikeCounts, activeSites } = useSpikeEvents({
    totalSites: gridSize * gridSize,
  });

  const colormap: ColormapFn = useMemo(
    () => COLORMAPS[colormapName] ?? neuralActivity,
    [colormapName]
  );

  const lut = useMemo(() => buildLUT(colormap, 256), [colormap]);

  // Compute min/max for color scaling
  const { minRate, maxRate } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < spikeRate.length; i++) {
      const v = spikeRate[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (min === Infinity) min = 0;
    if (max === -Infinity || max === min) max = min + 1;
    return { minRate: min, maxRate: max };
  }, [spikeRate]);

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

      const { width, height } = container.getBoundingClientRect();
      const size = Math.min(width, height);
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.scale(dpr, dpr);

      const cellW = size / gridSize;
      const cellH = size / gridSize;

      // Create ImageData for efficient pixel-level rendering
      const imageData = ctx.createImageData(gridSize, gridSize);
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;

      // Draw to offscreen canvas first, then scale up
      const offscreen = new OffscreenCanvas(gridSize, gridSize);
      const offCtx = offscreen.getContext("2d");
      if (offCtx) {
        offCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(offscreen, 0, 0, size, size);
      }

      // Draw selection overlay
      if (selectedSites.size > 0) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1;
        for (const site of selectedSites) {
          const { row: r, col: c } = siteToRowCol(site);
          ctx.strokeRect(c * cellW, r * cellH, cellW, cellH);
        }
      }

      // Draw drag selection rectangle
      if (isDragging && dragStart && dragEnd) {
        const x0 = Math.min(dragStart.col, dragEnd.col) * cellW;
        const y0 = Math.min(dragStart.row, dragEnd.row) * cellH;
        const x1 = (Math.max(dragStart.col, dragEnd.col) + 1) * cellW;
        const y1 = (Math.max(dragStart.row, dragEnd.row) + 1) * cellH;
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
  }, [spikeRate, gridSize, lut, scaleType, minRate, maxRate, selectedSites, isDragging, dragStart, dragEnd]);

  const getCellFromEvent = useCallback(
    (e: React.MouseEvent): { row: number; col: number } | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const col = Math.floor((x / rect.width) * gridSize);
      const row = Math.floor((y / rect.height) * gridSize);
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
          // Single click
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
          // Rectangle selection
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

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
          Spike Heatmap ({gridSize}x{gridSize})
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-neural-text-muted">
            {activeSites} active
          </span>
          <button
            onClick={() => setScaleType(scaleType === "linear" ? "log" : "linear")}
            className="px-1.5 py-0.5 text-[10px] rounded bg-neural-surface-alt text-neural-text-secondary hover:text-neural-text-primary border border-neural-border"
          >
            {scaleType === "linear" ? "LIN" : "LOG"}
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 relative p-2 min-h-0 aspect-square">
        <canvas
          ref={canvasRef}
          className="absolute inset-2 cursor-crosshair"
          style={{ imageRendering: "pixelated" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute pointer-events-none bg-neural-surface-alt/95 border border-neural-border rounded px-2 py-1.5 text-xs z-20 whitespace-nowrap"
            style={{
              left: Math.min(tooltip.x + 16, (containerRef.current?.clientWidth ?? 200) - 140),
              top: Math.max(tooltip.y - 50, 4),
            }}
          >
            <div className="font-mono text-neural-text-primary font-semibold">
              {getSiteLabel(tooltip.siteIndex)}
            </div>
            <div className="text-neural-text-muted">
              Site #{tooltip.siteIndex} ({tooltip.row}, {tooltip.col})
            </div>
            <div className="text-neural-accent-cyan">
              Rate: {tooltip.spikeRate.toFixed(1)} Hz
            </div>
            <div className="text-neural-text-secondary">
              Count: {Math.round(tooltip.spikeCount)}
            </div>
          </div>
        )}
      </div>

      {/* Color scale legend */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-neural-text-muted font-mono">
            {minRate.toFixed(1)}
          </span>
          <div
            className="flex-1 h-2 rounded-sm"
            style={{ background: gradientCSS }}
          />
          <span className="text-[9px] text-neural-text-muted font-mono">
            {maxRate.toFixed(1)} Hz
          </span>
        </div>
      </div>
    </div>
  );
}
