/** Shared scene geometry. Units are the hero SVG viewBox. */

export const VIEW_W = 760
export const VIEW_H = 460
export const GROUND = 408
export const SCALE = 2.5

/** Rex root (point between the feet) at rest, and where he stands to pull. */
export const REX_HOME = 132
export const REX_LEVER = 228

export const LEVER_PIVOT = { x: 308, y: 348 }
export const LEVER_LEN = 74
/** Degrees from straight up. Negative leans back toward Rex. */
export const LEVER_OFF = -52
export const LEVER_ON = 16

export const BELT_X0 = 358
export const BELT_MOUTH = 528
export const BELT_Y = 376

export const BELT_RATE = 0.3
export const ITEM_GAP = 0.36
export const SPAWN_GAP = 0.42
export const FIRST_SPAWN = 0.18
export const PROCESS = 0.68
export const PULL = 0.46
export const GLOW = 0.6
export const EXIT_LIFE = 3.2
export const BREAK_BEAT = 0.85

export const EXIT_X = 678
export const CAGE_X = 706
export const CAGE_W = 44
export const CAGE_H = 42
export const CAGE_BASE = 366
export const CAGE_PITCH = 46

export const MACHINE = { x: 520, y: 172, w: 150, h: 236 }

export interface Pt {
  x: number
  y: number
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}

export function leverDegrees(lever: number): number {
  return LEVER_OFF + (LEVER_ON - LEVER_OFF) * clamp(lever, 0, 1)
}

export function leverKnob(lever: number): Pt {
  const rad = (leverDegrees(lever) * Math.PI) / 180
  return {
    x: LEVER_PIVOT.x + Math.sin(rad) * LEVER_LEN,
    y: LEVER_PIVOT.y - Math.cos(rad) * LEVER_LEN,
  }
}

export function beltPoint(progress: number): Pt {
  const p = clamp(progress, 0, 1)
  return { x: BELT_X0 + (BELT_MOUTH - BELT_X0) * p, y: BELT_Y }
}

/** Cage `index` 0 sits on the exit. Later cages stack upward, then compress. */
export function cageOrigin(index: number): Pt {
  if (index < 0) throw new Error(`cage index must be >= 0, got ${index}`)
  const y = index <= 5
    ? CAGE_BASE - index * CAGE_PITCH
    : CAGE_BASE - 5 * CAGE_PITCH - (index - 5) * 14
  return { x: CAGE_X, y }
}

export function exitPoint(age: number): Pt & { opacity: number } {
  const u = clamp(age / EXIT_LIFE, 0, 1)
  const hop = Math.sin(clamp(age / 0.35, 0, 1) * Math.PI) * 18
  const opacity = u < 0.72 ? 1 : 1 - (u - 0.72) / 0.28
  return { x: EXIT_X + u * 10, y: BELT_Y - hop - u * 46, opacity }
}

/** Source-unit distance Rex walks between home and the lever. */
export function walkDistance(): number {
  return (REX_LEVER - REX_HOME) / SCALE
}
