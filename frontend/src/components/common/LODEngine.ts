/**
 * Level-of-Detail decimation engine for efficient waveform rendering.
 * Provides min/max decimation for vertical span rendering and
 * average decimation for smoothed views.
 */

/**
 * Decimate data using min/max method.
 * For each output pixel column, computes the min and max of the corresponding
 * sample range. Returns interleaved [min0, max0, min1, max1, ...] so that
 * vertical line segments can be drawn for each pixel column.
 *
 * @param data - Source sample data
 * @param targetPoints - Number of pixel columns to produce
 * @returns Float32Array of length targetPoints * 2 (interleaved min, max)
 */
export function decimateMinMax(data: Float32Array, targetPoints: number): Float32Array {
  const len = data.length;
  if (len === 0) return new Float32Array(targetPoints * 2);
  if (len <= targetPoints) {
    // No decimation needed - expand to interleaved format
    const result = new Float32Array(len * 2);
    for (let i = 0; i < len; i++) {
      result[i * 2] = data[i];
      result[i * 2 + 1] = data[i];
    }
    return result;
  }

  const result = new Float32Array(targetPoints * 2);
  const samplesPerBin = len / targetPoints;

  for (let bin = 0; bin < targetPoints; bin++) {
    const start = Math.floor(bin * samplesPerBin);
    const end = Math.min(Math.floor((bin + 1) * samplesPerBin), len);

    let min = data[start];
    let max = data[start];

    for (let i = start + 1; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }

    result[bin * 2] = min;
    result[bin * 2 + 1] = max;
  }

  return result;
}

/**
 * Decimate by averaging.
 * Groups consecutive samples and returns their mean.
 *
 * @param data - Source sample data
 * @param factor - Decimation factor (e.g., 4 means every 4 samples become 1)
 * @returns Float32Array of averaged samples
 */
export function decimateAverage(data: Float32Array, factor: number): Float32Array {
  if (factor <= 1 || data.length === 0) {
    return new Float32Array(data);
  }

  const outputLen = Math.ceil(data.length / factor);
  const result = new Float32Array(outputLen);

  for (let i = 0; i < outputLen; i++) {
    const start = i * factor;
    const end = Math.min(start + factor, data.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += data[j];
    }
    result[i] = sum / (end - start);
  }

  return result;
}

/**
 * Automatically choose the best decimation strategy based on viewport width.
 * Returns data suitable for rendering: if decimation is needed, returns
 * min/max interleaved pairs; otherwise returns the original data.
 *
 * @param data - Source sample data
 * @param viewportWidth - Width of the viewport in pixels
 * @returns Decimated data optimized for the viewport
 */
export function autoDecimate(data: Float32Array, viewportWidth: number): Float32Array {
  if (data.length === 0) return data;

  const ratio = data.length / viewportWidth;

  if (ratio <= 1) {
    // Fewer samples than pixels - no decimation needed
    return data;
  }

  if (ratio <= 2) {
    // Slight oversampling - use averaging
    return decimateAverage(data, Math.ceil(ratio));
  }

  // Significant oversampling - use min/max for faithful peak representation
  return decimateMinMax(data, viewportWidth);
}

/**
 * Multi-level LOD cache for a single channel.
 * Pre-computes decimated versions at power-of-2 levels.
 */
export class LODCache {
  private levels: Map<number, Float32Array> = new Map();
  private sourceLength: number = 0;

  /**
   * Build LOD levels from source data.
   * Creates min/max decimated versions at factors 2, 4, 8, 16, ...
   */
  build(data: Float32Array, maxLevels: number = 8): void {
    this.levels.clear();
    this.sourceLength = data.length;

    let current = data;
    for (let level = 0; level < maxLevels; level++) {
      const factor = 1 << (level + 1);
      const targetPoints = Math.ceil(data.length / factor);
      if (targetPoints < 2) break;

      const decimated = decimateMinMax(data, targetPoints);
      this.levels.set(factor, decimated);
      current = decimated;
    }
  }

  /**
   * Get the best LOD level for a given viewport width and sample range.
   */
  getLevel(sampleCount: number, viewportWidth: number): Float32Array | null {
    const desiredFactor = sampleCount / viewportWidth;
    if (desiredFactor <= 1) return null; // Use raw data

    // Find the closest power-of-2 factor that is <= desiredFactor
    let bestFactor = 2;
    for (const factor of this.levels.keys()) {
      if (factor <= desiredFactor && factor > bestFactor) {
        bestFactor = factor;
      }
    }

    return this.levels.get(bestFactor) ?? null;
  }

  get size(): number {
    return this.levels.size;
  }
}
