/**
 * Electrode site index conversion utilities.
 * Maps between linear site indices and row/col positions on a 64x64 electrode array.
 */

const ARRAY_ROWS = 64;
const ARRAY_COLS = 64;

/**
 * Convert a flat site index (0..4095) to row and column.
 */
export function siteToRowCol(siteIndex: number): { row: number; col: number } {
  const clamped = Math.max(0, Math.min(siteIndex, ARRAY_ROWS * ARRAY_COLS - 1));
  const row = Math.floor(clamped / ARRAY_COLS);
  const col = clamped % ARRAY_COLS;
  return { row, col };
}

/**
 * Convert row and column to a flat site index.
 */
export function rowColToSite(row: number, col: number): number {
  if (row < 0 || row >= ARRAY_ROWS || col < 0 || col >= ARRAY_COLS) {
    return -1;
  }
  return row * ARRAY_COLS + col;
}

/**
 * Column reordering map from the original GUI.
 * The hardware readout order does not match the physical column order.
 * This returns a mapping: physicalCol = reorder[readoutCol].
 * Based on the CMOS sensor interleaved readout pattern.
 */
export function getColumnReorder(): number[] {
  const reorder: number[] = new Array(ARRAY_COLS);
  // Interleaved pattern: even columns first (0, 2, 4, ...), then odd (1, 3, 5, ...)
  let idx = 0;
  for (let c = 0; c < ARRAY_COLS; c += 2) {
    reorder[idx++] = c;
  }
  for (let c = 1; c < ARRAY_COLS; c += 2) {
    reorder[idx++] = c;
  }
  return reorder;
}

/**
 * Get a human-readable label for a site index.
 */
export function getSiteLabel(siteIndex: number): string {
  const { row, col } = siteToRowCol(siteIndex);
  return `E${row.toString().padStart(2, "0")}:${col.toString().padStart(2, "0")}`;
}

/**
 * Get neighbor sites (4-connected) for a given site index.
 */
export function getNeighborSites(siteIndex: number): number[] {
  const { row, col } = siteToRowCol(siteIndex);
  const neighbors: number[] = [];
  if (row > 0) neighbors.push(rowColToSite(row - 1, col));
  if (row < ARRAY_ROWS - 1) neighbors.push(rowColToSite(row + 1, col));
  if (col > 0) neighbors.push(rowColToSite(row, col - 1));
  if (col < ARRAY_COLS - 1) neighbors.push(rowColToSite(row, col + 1));
  return neighbors;
}

/**
 * Get all site indices within a rectangular region.
 */
export function getSitesInRect(
  startRow: number,
  startCol: number,
  endRow: number,
  endCol: number
): number[] {
  const r0 = Math.max(0, Math.min(startRow, endRow));
  const r1 = Math.min(ARRAY_ROWS - 1, Math.max(startRow, endRow));
  const c0 = Math.max(0, Math.min(startCol, endCol));
  const c1 = Math.min(ARRAY_COLS - 1, Math.max(startCol, endCol));

  const sites: number[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      sites.push(rowColToSite(r, c));
    }
  }
  return sites;
}

export { ARRAY_ROWS, ARRAY_COLS };
