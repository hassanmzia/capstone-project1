/**
 * Color map utilities for neural data visualization.
 * All functions accept a normalized value [0, 1] and return [r, g, b] in [0, 255].
 */

type RGB = [number, number, number];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRGB(a: RGB, b: RGB, t: number): RGB {
  return [
    Math.round(lerp(a[0], b[0], t)),
    Math.round(lerp(a[1], b[1], t)),
    Math.round(lerp(a[2], b[2], t)),
  ];
}

function samplePiecewise(stops: { pos: number; color: RGB }[], t: number): RGB {
  t = clamp(t, 0, 1);
  if (t <= stops[0].pos) return stops[0].color;
  if (t >= stops[stops.length - 1].pos) return stops[stops.length - 1].color;

  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i].pos && t <= stops[i + 1].pos) {
      const local = (t - stops[i].pos) / (stops[i + 1].pos - stops[i].pos);
      return lerpRGB(stops[i].color, stops[i + 1].color, local);
    }
  }
  return stops[stops.length - 1].color;
}

/* ─── Viridis approximation ─── */
const viridisStops: { pos: number; color: RGB }[] = [
  { pos: 0.0, color: [68, 1, 84] },
  { pos: 0.13, color: [72, 35, 116] },
  { pos: 0.25, color: [64, 67, 135] },
  { pos: 0.38, color: [52, 94, 141] },
  { pos: 0.5, color: [33, 144, 140] },
  { pos: 0.63, color: [53, 183, 121] },
  { pos: 0.75, color: [109, 205, 89] },
  { pos: 0.88, color: [180, 222, 44] },
  { pos: 1.0, color: [253, 231, 37] },
];

export function viridis(value: number): RGB {
  return samplePiecewise(viridisStops, value);
}

/* ─── Plasma approximation ─── */
const plasmaStops: { pos: number; color: RGB }[] = [
  { pos: 0.0, color: [13, 8, 135] },
  { pos: 0.13, color: [75, 3, 161] },
  { pos: 0.25, color: [125, 3, 168] },
  { pos: 0.38, color: [168, 34, 150] },
  { pos: 0.5, color: [203, 70, 121] },
  { pos: 0.63, color: [229, 107, 93] },
  { pos: 0.75, color: [248, 148, 65] },
  { pos: 0.88, color: [253, 195, 40] },
  { pos: 1.0, color: [240, 249, 33] },
];

export function plasma(value: number): RGB {
  return samplePiecewise(plasmaStops, value);
}

/* ─── Coolwarm (diverging) ─── */
const coolwarmStops: { pos: number; color: RGB }[] = [
  { pos: 0.0, color: [59, 76, 192] },
  { pos: 0.25, color: [124, 159, 230] },
  { pos: 0.5, color: [221, 221, 221] },
  { pos: 0.75, color: [224, 131, 104] },
  { pos: 1.0, color: [180, 4, 38] },
];

export function coolwarm(value: number): RGB {
  return samplePiecewise(coolwarmStops, value);
}

/* ─── Neural Activity: blue → green → yellow → red ─── */
const neuralActivityStops: { pos: number; color: RGB }[] = [
  { pos: 0.0, color: [10, 20, 80] },
  { pos: 0.15, color: [30, 60, 180] },
  { pos: 0.35, color: [20, 160, 140] },
  { pos: 0.55, color: [40, 200, 60] },
  { pos: 0.7, color: [200, 220, 40] },
  { pos: 0.85, color: [240, 160, 20] },
  { pos: 1.0, color: [220, 30, 20] },
];

export function neuralActivity(value: number): RGB {
  return samplePiecewise(neuralActivityStops, value);
}

/* ─── Inferno: black → purple → red → orange → yellow → white ─── */
const infernoStops: { pos: number; color: RGB }[] = [
  { pos: 0.0, color: [0, 0, 4] },
  { pos: 0.13, color: [40, 11, 84] },
  { pos: 0.25, color: [101, 21, 110] },
  { pos: 0.38, color: [159, 42, 99] },
  { pos: 0.5, color: [212, 72, 66] },
  { pos: 0.63, color: [245, 125, 21] },
  { pos: 0.75, color: [250, 193, 39] },
  { pos: 0.88, color: [252, 230, 92] },
  { pos: 1.0, color: [252, 255, 164] },
];

export function inferno(value: number): RGB {
  return samplePiecewise(infernoStops, value);
}

/* ─── Turbo: blue → cyan → green → yellow → red ─── */
const turboStops: { pos: number; color: RGB }[] = [
  { pos: 0.0, color: [48, 18, 59] },
  { pos: 0.13, color: [68, 81, 191] },
  { pos: 0.25, color: [33, 145, 235] },
  { pos: 0.38, color: [29, 200, 171] },
  { pos: 0.5, color: [122, 230, 91] },
  { pos: 0.63, color: [210, 226, 49] },
  { pos: 0.75, color: [253, 174, 39] },
  { pos: 0.88, color: [234, 96, 26] },
  { pos: 1.0, color: [122, 4, 3] },
];

export function turbo(value: number): RGB {
  return samplePiecewise(turboStops, value);
}

/* ─── Utility: generate a CSS gradient string from any colormap ─── */
export type ColormapFn = (value: number) => RGB;

export function createCSSGradient(
  colormap: ColormapFn,
  direction: string = "to right",
  steps: number = 16
): string {
  const colors: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const [r, g, b] = colormap(t);
    const pct = (t * 100).toFixed(1);
    colors.push(`rgb(${r}, ${g}, ${b}) ${pct}%`);
  }
  return `linear-gradient(${direction}, ${colors.join(", ")})`;
}

/* ─── Lookup table for fast canvas rendering ─── */
export function buildLUT(colormap: ColormapFn, size: number = 256): Uint8Array {
  const lut = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    const [r, g, b] = colormap(t);
    lut[i * 4 + 0] = r;
    lut[i * 4 + 1] = g;
    lut[i * 4 + 2] = b;
    lut[i * 4 + 3] = 255;
  }
  return lut;
}

export const COLORMAPS: Record<string, ColormapFn> = {
  viridis,
  plasma,
  inferno,
  turbo,
  coolwarm,
  neuralActivity,
};
