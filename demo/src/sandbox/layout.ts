/** Shared scene geometry. Units are the hero SVG viewBox. */

export const VIEW_W = 1440
export const VIEW_H = 420
/** Top surface of the foreground belt. Boxes sit on this line. */
export const BELT_TOP = 292
export const BELT_H = 72
export const BELT_Y = BELT_TOP + BELT_H / 2
/** Rex stands on the far side, so his feet fall behind the belt's front face. */
export const GROUND = BELT_TOP + 28
export const SCALE = 2.5

/** Rex root (point between the feet) at rest, and where he stands to pull. */
export const REX_HOME = 944
export const REX_LEVER = 1040

export const LEVER_PIVOT = { x: 1120, y: BELT_TOP }
export const LEVER_LEN = 74
/** Degrees from straight up. Negative leans back toward Rex. */
export const LEVER_OFF = -52
export const LEVER_ON = 16

/** The belt runs from the left edge of the page to the machine mouth. */
export const BELT_X0 = 0
export const BELT_MOUTH = 1176

/** Seconds for one yank, from rest through the pull and back. */
export const YANK = 0.24
/** Seconds Rex holds a milestone cheer. */
export const CHEER = 0.7
export const BREAK_BEAT = 0.85

export const CAGE_X = 1320
export const CAGE_W = 44
export const CAGE_H = 42
export const CAGE_BASE = BELT_TOP - CAGE_H
export const CAGE_PITCH = 46

export const MACHINE = { x: 1160, y: BELT_TOP - 188, w: 150, h: 216 }

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

/** `progress` 0 is the belt entrance. 1 is the machine mouth. Values past 1 draw through it. */
export function beltPoint(progress: number): Pt {
  const p = clamp(progress, 0, 1.2)
  return { x: BELT_X0 + (BELT_MOUTH - BELT_X0) * p, y: BELT_TOP }
}

/** Cage `index` 0 sits on the exit. Later cages stack upward, then compress. */
export function cageOrigin(index: number): Pt {
  if (index < 0) throw new Error(`cage index must be >= 0, got ${index}`)
  const y = index <= 5
    ? CAGE_BASE - index * CAGE_PITCH
    : CAGE_BASE - 5 * CAGE_PITCH - (index - 5) * 14
  return { x: CAGE_X, y }
}

/** Source-unit distance Rex walks between home and the lever. */
export function walkDistance(): number {
  return (REX_LEVER - REX_HOME) / SCALE
}
