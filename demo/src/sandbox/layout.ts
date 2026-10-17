/** Shared scene geometry. Units are the hero SVG viewBox. */

export const VIEW_W = 1440
export const VIEW_H = 420
/** Top surface of the foreground belt. Boxes sit on this line. */
export const BELT_TOP = 292
export const BELT_H = 72
export const BELT_Y = BELT_TOP + BELT_H / 2
/**
 * Rex stands on the far side of the belt. His feet are behind the belt face.
 * His hands rest on that face, so the lowest visible dots are not floating.
 */
export const GROUND = BELT_TOP + 60
export const SCALE = 2.5

/** Score block in the hero viewBox. The label does not scale with the number. */
export const SCORE_X = VIEW_W - 36
export const SCORE_LABEL_Y = 22
export const SCORE_LABEL_SIZE = 14
export const SCORE_NUMBER_Y = 108
export const SCORE_NUMBER_SIZE = 48
const SCORE_CAP = 0.34

export function scoreNumberCenterY(): number {
  return SCORE_NUMBER_Y - SCORE_NUMBER_SIZE * SCORE_CAP
}

/** Baseline plus a little room for the label's descenders. */
export function scoreLabelBottom(): number {
  return SCORE_LABEL_Y + 4
}

/** Top of the digits after the jump scale, around the number's visual center. */
export function scoreNumberTop(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error(`scale must be > 0, got ${scale}`)
  return scoreNumberCenterY() - SCORE_NUMBER_SIZE * SCORE_CAP * scale
}

/** Flash circle radius. It stays under the label at this scale. */
export function scoreFlashRadius(scale: number, flash: number): number {
  if (!Number.isFinite(flash) || flash < 0 || flash > 1) throw new Error(`flash must be from 0 to 1, got ${flash}`)
  if (flash === 0) return 0
  const room = scoreNumberCenterY() - scoreLabelBottom() - 8
  if (room <= 4) throw new Error(`score label has no room under it, got ${room}`)
  const around = SCORE_NUMBER_SIZE * SCORE_CAP * scale + 10
  return Math.min(around, room)
}

/** Rex root (point between the feet) at rest, and where he stands to pull. */
export const REX_HOME = 900
export const REX_LEVER = 996

export const LEVER_PIVOT = { x: 1076, y: BELT_TOP }
export const LEVER_LEN = 74
/** Degrees from straight up. Negative leans back toward Rex. */
export const LEVER_OFF = -52
export const LEVER_ON = 16

/** The belt runs from the left edge, through the scanner, and out the other side. Progress 1 is the exit. */
export const BELT_X0 = 0
export const BELT_MOUTH = 1340

/** Seconds for one yank, from rest through the pull and back. */
export const YANK = 0.24
/** Seconds Rex holds a milestone cheer. */
export const CHEER = 0.7
export const BREAK_BEAT = 0.85

export const CAGE_X = 1368
export const CAGE_W = 44
export const CAGE_H = 42
export const CAGE_BASE = BELT_TOP - CAGE_H
export const CAGE_PITCH = 46

/** Top of the scanner opening. The belt stays visible underneath it. */
export const SCAN_TOP = BELT_TOP - 86
const FLAP_COUNT = 5
const FLAP_PITCH = 9

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

/** `progress` 0 is the belt entrance. 1 is the scanner exit. Values past 1 draw through it. */
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

export interface Aperture {
  entrance: number
  exit: number
  top: number
  width: number
}

/** The tunnel opening is the capture window for this span. */
export function scannerAperture(span: number): Aperture {
  if (!Number.isFinite(span) || span <= 0 || span >= 1) {
    throw new Error(`span must be between 0 and 1, got ${span}`)
  }
  const entrance = beltPoint(1 - span).x
  const exit = beltPoint(1).x
  return { entrance, exit, top: SCAN_TOP, width: exit - entrance }
}

/** X positions of the strips hanging at one edge of the tunnel. */
export function flapXs(edge: number): number[] {
  if (!Number.isFinite(edge)) throw new Error(`flap edge must be finite, got ${edge}`)
  const start = edge - ((FLAP_COUNT - 1) * FLAP_PITCH) / 2
  return Array.from({ length: FLAP_COUNT }, (_, index) => start + index * FLAP_PITCH)
}

/** Degrees a flap leans as a box pushes through it, in the direction of travel. */
export function flapBend(flapX: number, boxX: number): number {
  if (!Number.isFinite(flapX) || !Number.isFinite(boxX)) {
    throw new Error(`flap bend needs finite positions, got ${flapX}, ${boxX}`)
  }
  const reach = 28
  const dist = boxX - flapX
  if (dist < -reach || dist > reach) return 0
  return (1 - Math.abs(dist) / reach) * 28
}

/** Scan line across the tunnel. Reduced motion holds it on the box. */
export function scanLineX(clock: number, reduced: boolean, entrance: number, exit: number, boxX: number): number {
  if (!Number.isFinite(entrance) || !Number.isFinite(exit) || exit <= entrance) {
    throw new Error(`scanner aperture must be wider than 0, got ${entrance} to ${exit}`)
  }
  if (!Number.isFinite(boxX)) throw new Error(`boxX must be finite, got ${boxX}`)
  if (typeof reduced !== 'boolean') throw new Error('reduced must be a boolean')
  if (reduced) return clamp(boxX, entrance, exit)
  if (!Number.isFinite(clock) || clock < 0) throw new Error(`clock must be >= 0, got ${clock}`)
  const u = (clock % 1.4) / 1.4
  return entrance + (exit - entrance) * u
}
