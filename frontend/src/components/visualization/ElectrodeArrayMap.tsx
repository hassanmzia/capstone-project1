/**
 * Interactive SVG-based electrode array map (64x64 grid).
 * Supports color overlays for spike rate, impedance, noise level, etc.
 * Click/shift-click/drag selection with right-click context menu.
 */

import React, { useCallback, useState, useMemo, useRef, useEffect } from "react";
import { useSpikeEvents } from "@/hooks/useSpikeEvents";
import { rowColToSite, getSiteLabel, ARRAY_ROWS, ARRAY_COLS } from "@/utils/siteConversion";
import { neuralActivity, viridis, coolwarm, type ColormapFn } from "@/utils/colorMaps";

type OverlayMode = "spikeRate" | "dcLevel" | "impedance" | "noiseLevel" | "selection";
type SiteStatus = "active" | "noisy" | "dead" | "normal";

interface ElectrodeArrayMapProps {
  className?: string;
  onChannelSelect?: (channels: number[]) => void;
  selectedChannels?: number[];
  siteStatuses?: Map<number, SiteStatus>;
  impedanceData?: Float32Array;
  noiseData?: Float32Array;
  dcLevelData?: Float32Array;
  overlayMode?: OverlayMode;
  /** Render a subset of rows/cols for performance (default: 64) */
  displaySize?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  siteIndex: number;
  visible: boolean;
}

export default function ElectrodeArrayMap({
  className = "",
  onChannelSelect,
  selectedChannels = [],
  siteStatuses = new Map(),
  impedanceData,
  noiseData,
  dcLevelData,
  overlayMode = "spikeRate",
  displaySize = 64,
}: ElectrodeArrayMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const [internalSelected, setInternalSelected] = useState<Set<number>>(
    new Set(selectedChannels)
  );
  const [hoveredSite, setHoveredSite] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ row: number; col: number } | null>(null);
  const [dragEnd, setDragEnd] = useState<{ row: number; col: number } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    x: 0,
    y: 0,
    siteIndex: 0,
    visible: false,
  });
  const [currentOverlay, setCurrentOverlay] = useState<OverlayMode>(overlayMode);

  const { spikeRate } = useSpikeEvents({ totalSites: ARRAY_ROWS * ARRAY_COLS });

  // Sync external selection
  useEffect(() => {
    setInternalSelected(new Set(selectedChannels));
  }, [selectedChannels]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu((prev) => ({ ...prev, visible: false }));
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  const colormap: ColormapFn = useMemo(() => {
    switch (currentOverlay) {
      case "spikeRate":
        return neuralActivity;
      case "impedance":
        return coolwarm;
      case "noiseLevel":
        return viridis;
      case "dcLevel":
        return coolwarm;
      default:
        return neuralActivity;
    }
  }, [currentOverlay]);

  // Get overlay data and compute normalization
  const { overlayData, overlayMin, overlayMax } = useMemo(() => {
    let data: Float32Array;
    switch (currentOverlay) {
      case "spikeRate":
        data = spikeRate;
        break;
      case "impedance":
        data = impedanceData ?? new Float32Array(ARRAY_ROWS * ARRAY_COLS);
        break;
      case "noiseLevel":
        data = noiseData ?? new Float32Array(ARRAY_ROWS * ARRAY_COLS);
        break;
      case "dcLevel":
        data = dcLevelData ?? new Float32Array(ARRAY_ROWS * ARRAY_COLS);
        break;
      default:
        data = new Float32Array(ARRAY_ROWS * ARRAY_COLS);
    }

    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    if (min === Infinity) min = 0;
    if (max <= min) max = min + 1;

    return { overlayData: data, overlayMin: min, overlayMax: max };
  }, [currentOverlay, spikeRate, impedanceData, noiseData, dcLevelData]);

  const getSiteColor = useCallback(
    (siteIndex: number): string => {
      if (currentOverlay === "selection") {
        return internalSelected.has(siteIndex)
          ? "rgb(6, 182, 212)"
          : "rgb(40, 44, 52)";
      }

      const status = siteStatuses.get(siteIndex);
      if (status === "dead") return "rgb(60, 20, 20)";

      const value = overlayData[siteIndex] ?? 0;
      const normalized = Math.max(0, Math.min(1, (value - overlayMin) / (overlayMax - overlayMin)));
      const [r, g, b] = colormap(normalized);
      return `rgb(${r}, ${g}, ${b})`;
    },
    [currentOverlay, overlayData, overlayMin, overlayMax, colormap, internalSelected, siteStatuses]
  );

  const getStatusBorder = useCallback(
    (siteIndex: number): string => {
      const status = siteStatuses.get(siteIndex);
      switch (status) {
        case "active":
          return "#22c55e";
        case "noisy":
          return "#f59e0b";
        case "dead":
          return "#ef4444";
        default:
          return "transparent";
      }
    },
    [siteStatuses]
  );

  const handleSiteClick = useCallback(
    (siteIndex: number, e: React.MouseEvent) => {
      e.stopPropagation();
      const newSelected = new Set(internalSelected);

      if (e.shiftKey) {
        // Multi-select toggle
        if (newSelected.has(siteIndex)) {
          newSelected.delete(siteIndex);
        } else {
          newSelected.add(siteIndex);
        }
      } else {
        // Single select
        newSelected.clear();
        newSelected.add(siteIndex);
      }

      setInternalSelected(newSelected);
      onChannelSelect?.(Array.from(newSelected));
    },
    [internalSelected, onChannelSelect]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, siteIndex: number) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        setContextMenu({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          siteIndex,
          visible: true,
        });
      }
    },
    []
  );

  const handleDragStart = useCallback(
    (row: number, col: number) => {
      setIsDragging(true);
      setDragStart({ row, col });
      setDragEnd({ row, col });
    },
    []
  );

  const handleDragMove = useCallback(
    (row: number, col: number) => {
      if (isDragging) {
        setDragEnd({ row, col });
      }
    },
    [isDragging]
  );

  const handleDragEnd = useCallback(() => {
    if (isDragging && dragStart && dragEnd) {
      const r0 = Math.min(dragStart.row, dragEnd.row);
      const r1 = Math.max(dragStart.row, dragEnd.row);
      const c0 = Math.min(dragStart.col, dragEnd.col);
      const c1 = Math.max(dragStart.col, dragEnd.col);

      const newSelected = new Set<number>();
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          newSelected.add(rowColToSite(r, c));
        }
      }
      setInternalSelected(newSelected);
      onChannelSelect?.(Array.from(newSelected));
    }
    setIsDragging(false);
    setDragStart(null);
    setDragEnd(null);
  }, [isDragging, dragStart, dragEnd, onChannelSelect]);

  // For large grids, render a subset or use a virtualized approach
  const step = Math.max(1, Math.floor(ARRAY_ROWS / displaySize));
  const cellSize = 100 / displaySize;
  const cellPadding = cellSize * 0.1;

  // Build the electrode grid elements
  const electrodes = useMemo(() => {
    const elements: React.ReactElement[] = [];
    for (let ri = 0; ri < displaySize; ri++) {
      for (let ci = 0; ci < displaySize; ci++) {
        const row = ri * step;
        const col = ci * step;
        const siteIndex = rowColToSite(row, col);
        if (siteIndex < 0) continue;

        const x = ci * cellSize + cellPadding;
        const y = ri * cellSize + cellPadding;
        const size = cellSize - cellPadding * 2;
        const isSelected = internalSelected.has(siteIndex);

        elements.push(
          <rect
            key={siteIndex}
            x={`${x}%`}
            y={`${y}%`}
            width={`${size}%`}
            height={`${size}%`}
            rx="0.15%"
            ry="0.15%"
            fill={getSiteColor(siteIndex)}
            stroke={
              isSelected
                ? "#06b6d4"
                : hoveredSite === siteIndex
                ? "#ffffff"
                : getStatusBorder(siteIndex)
            }
            strokeWidth={isSelected ? "0.4%" : hoveredSite === siteIndex ? "0.3%" : "0.1%"}
            className="cursor-pointer"
            style={{ transition: "fill 0.15s ease" }}
            onClick={(e) => handleSiteClick(siteIndex, e)}
            onContextMenu={(e) => handleContextMenu(e, siteIndex)}
            onMouseEnter={() => setHoveredSite(siteIndex)}
            onMouseLeave={() => setHoveredSite(null)}
            onMouseDown={() => handleDragStart(row, col)}
            onMouseMove={() => handleDragMove(row, col)}
            onMouseUp={handleDragEnd}
          />
        );
      }
    }
    return elements;
  }, [
    displaySize,
    step,
    cellSize,
    cellPadding,
    internalSelected,
    hoveredSite,
    getSiteColor,
    getStatusBorder,
    handleSiteClick,
    handleContextMenu,
    handleDragStart,
    handleDragMove,
    handleDragEnd,
  ]);

  return (
    <div className={`flex flex-col bg-neural-surface rounded-xl border border-neural-border ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neural-border">
        <h3 className="text-xs font-semibold text-neural-text-secondary uppercase tracking-wider">
          Electrode Array
        </h3>
        <div className="flex items-center gap-1.5">
          {(["spikeRate", "impedance", "noiseLevel", "selection"] as OverlayMode[]).map(
            (mode) => (
              <button
                key={mode}
                onClick={() => setCurrentOverlay(mode)}
                className={`px-1.5 py-0.5 text-[10px] rounded neural-transition ${
                  currentOverlay === mode
                    ? "bg-neural-accent-cyan/20 text-neural-accent-cyan"
                    : "text-neural-text-muted hover:text-neural-text-secondary"
                }`}
              >
                {mode === "spikeRate"
                  ? "Rate"
                  : mode === "noiseLevel"
                  ? "Noise"
                  : mode === "impedance"
                  ? "Imp"
                  : "Sel"}
              </button>
            )
          )}
        </div>
      </div>

      {/* SVG Grid */}
      <div className="flex-1 relative p-2 min-h-0">
        <svg
          ref={svgRef}
          viewBox="0 0 100 100"
          className="w-full h-full"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background */}
          <rect width="100" height="100" fill="#0f1117" rx="0.5" />
          {electrodes}

          {/* Drag selection overlay */}
          {isDragging && dragStart && dragEnd && (
            <rect
              x={`${Math.min(dragStart.col, dragEnd.col) / step * cellSize}%`}
              y={`${Math.min(dragStart.row, dragEnd.row) / step * cellSize}%`}
              width={`${(Math.abs(dragEnd.col - dragStart.col) / step + 1) * cellSize}%`}
              height={`${(Math.abs(dragEnd.row - dragStart.row) / step + 1) * cellSize}%`}
              fill="rgba(6, 182, 212, 0.15)"
              stroke="rgba(6, 182, 212, 0.8)"
              strokeWidth="0.3%"
              strokeDasharray="1 1"
              pointerEvents="none"
            />
          )}
        </svg>

        {/* Context menu */}
        {contextMenu.visible && (
          <div
            className="absolute bg-neural-surface-alt border border-neural-border rounded-lg shadow-xl z-30 py-1 min-w-[160px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-neural-text-secondary border-b border-neural-border">
              {getSiteLabel(contextMenu.siteIndex)} (#{contextMenu.siteIndex})
            </div>
            <button
              className="w-full px-3 py-1.5 text-xs text-left text-neural-text-primary hover:bg-neural-accent-cyan/10 hover:text-neural-accent-cyan"
              onClick={() => {
                const newSel = new Set(internalSelected);
                newSel.add(contextMenu.siteIndex);
                setInternalSelected(newSel);
                onChannelSelect?.(Array.from(newSel));
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
            >
              Add to display
            </button>
            <button
              className="w-full px-3 py-1.5 text-xs text-left text-neural-text-primary hover:bg-yellow-500/10 hover:text-yellow-400"
              onClick={() => {
                siteStatuses.set(contextMenu.siteIndex, "noisy");
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
            >
              Mark as noisy
            </button>
            <button
              className="w-full px-3 py-1.5 text-xs text-left text-neural-text-primary hover:bg-neural-surface"
              onClick={() => {
                setContextMenu((prev) => ({ ...prev, visible: false }));
              }}
            >
              View details
            </button>
          </div>
        )}

        {/* Hovered site tooltip */}
        {hoveredSite !== null && (
          <div className="absolute bottom-3 left-3 bg-neural-surface-alt/95 border border-neural-border rounded px-2 py-1 text-xs z-10">
            <span className="text-neural-accent-cyan font-mono font-semibold">
              {getSiteLabel(hoveredSite)}
            </span>
            <span className="text-neural-text-muted ml-2">
              Rate: {(spikeRate[hoveredSite] ?? 0).toFixed(1)} Hz
            </span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-3 py-1.5 border-t border-neural-border">
        <span className="text-[10px] text-neural-text-muted">
          {internalSelected.size} selected
        </span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px] text-neural-text-muted">
            <span className="w-2 h-2 rounded-full bg-green-500" /> Active
          </span>
          <span className="flex items-center gap-1 text-[10px] text-neural-text-muted">
            <span className="w-2 h-2 rounded-full bg-yellow-500" /> Noisy
          </span>
          <span className="flex items-center gap-1 text-[10px] text-neural-text-muted">
            <span className="w-2 h-2 rounded-full bg-red-500" /> Dead
          </span>
        </div>
      </div>
    </div>
  );
}
