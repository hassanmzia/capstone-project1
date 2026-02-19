/**
 * DPI-aware canvas scaling utilities.
 * Provides responsive font sizes, margins, and tick calculations
 * that adapt to container dimensions and device pixel ratio.
 */

export interface CanvasMetrics {
  /** Device pixel ratio */
  dpr: number;
  /** Container width in CSS pixels */
  width: number;
  /** Container height in CSS pixels */
  height: number;
  /** Responsive font sizes */
  fonts: {
    axisLabel: string;   // Axis titles ("Frequency (Hz)")
    tickLabel: string;   // Tick values ("100", "200")
    annotation: string;  // Peak labels, annotations
    title: string;       // Chart title
  };
  /** Responsive margins in CSS pixels */
  margin: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  /** Plot area dimensions */
  plotW: number;
  plotH: number;
}

/**
 * Compute responsive canvas metrics based on container dimensions.
 * Font sizes and margins scale with the smaller dimension to remain
 * readable at any resolution while not wasting space.
 */
export function computeCanvasMetrics(
  width: number,
  height: number,
  options: {
    extraRight?: number;  // Extra right margin (e.g. for color bar)
  } = {}
): CanvasMetrics {
  const dpr = window.devicePixelRatio || 1;

  // Scale factor based on container size — baseline is 400px
  const scale = Math.max(0.7, Math.min(1.4, Math.min(width, height) / 400));

  // Font sizes: scale with container, ensure readability
  const baseTick = Math.round(Math.max(9, 10 * scale));
  const baseLabel = Math.round(Math.max(9, 11 * scale));
  const baseAnnot = Math.round(Math.max(8, 9 * scale));
  const baseTitle = Math.round(Math.max(10, 12 * scale));

  const fonts = {
    tickLabel: `${baseTick}px monospace`,
    axisLabel: `${baseLabel}px sans-serif`,
    annotation: `${baseAnnot}px monospace`,
    title: `bold ${baseTitle}px sans-serif`,
  };

  // Margins: scale with container, ensure axes have enough room
  const marginLeft = Math.round(Math.max(40, 55 * scale));
  const marginBottom = Math.round(Math.max(28, 36 * scale));
  const marginTop = Math.round(Math.max(8, 12 * scale));
  const marginRight = Math.round(Math.max(12, 16 * scale)) + (options.extraRight ?? 0);

  const margin = { top: marginTop, right: marginRight, bottom: marginBottom, left: marginLeft };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  return { dpr, width, height, fonts, margin, plotW, plotH };
}

/**
 * Set up a canvas for HiDPI rendering.
 * Returns the 2D context with DPR-scaled transform already applied.
 */
export function setupCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  dpr: number
): CanvasRenderingContext2D | null {
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  return ctx;
}
