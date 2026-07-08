export interface Dimensions {
  width: number
  height: number
}

/** Fixed pixel sizes offered as quick presets. */
export const COMMON_SIZES: Array<{ width: number; height: number }> = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1280, height: 768 },
  { width: 1024, height: 768 },
  { width: 800, height: 600 }
]

/** Screen aspect ratios; height is derived from the current width. */
export const ASPECT_RATIOS: Array<{ label: string; w: number; h: number }> = [
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:2', w: 3, h: 2 },
  { label: '1:1', w: 1, h: 1 },
  { label: '16:10', w: 16, h: 10 }
]

export const MIN_DIMENSION = 100
export const MAX_DIMENSION = 8000

/** Clamp a parsed custom dimension, returning null when it is not usable. */
export function parseDimension(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (n < MIN_DIMENSION || n > MAX_DIMENSION) return null
  return n
}
