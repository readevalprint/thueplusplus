/**
 * Lever-timing game for the home sandbox.
 *
 * Rex waits. The player pulls the lever. Boxes arrive at seeded random
 * intervals. A pull while a box is in the capture zone scores. An empty
 * pull is a miss. The belt speeds up, the gaps shrink, and the capture zone
 * tightens as the score grows. A box that reaches the mouth breaks the run.
 * Nothing here reads the clock, the DOM, or storage.
 */

import { BREAK_BEAT, CHEER, YANK } from './layout'
import { WALK_DURATION } from './motion'

export const GRACE = 0.8
export const MISS_COOLDOWN = 0.42
export const MILESTONE = 5
export const DANGER = 0.84
/**
 * The page-wide belt is longer than the old machine-side belt.
 * Progress speed and the capture fraction both divide by this, so a box
 * takes longer to arrive and the time inside the capture zone stays put.
 * Gaps multiply by the same factor, so the boxes keep their spacing.
 */
export const TRACK = 2
const POP_LIFE = 0.85
const CROWD = 0.18
const REDUCED = 0.55

export interface Box {
  id: number
  /** 0 at the belt entrance, 1 at the machine mouth. */
  progress: number
}

export interface Cage {
  id: number
}

export type Phase = 'waiting' | 'playing' | 'broken'
export type RexMode = 'idle' | 'to-lever' | 'ready' | 'yank' | 'cheer' | 'nervous' | 'startled'

export interface Game {
  phase: Phase
  seed: number
  rng: number
  score: number
  best: number
  boxes: Box[]
  cages: Cage[]
  nextId: number
  /** Seconds until the next box. */
  spawnIn: number
  cooldown: number
  /** 0 is resting, 1 is yanked. */
  lever: number
  leverT: number
  rex: RexMode
  rexT: number
  flash: number
  jolt: number
  miss: number
  /** Consecutive scores since the last miss. */
  streak: number
  /** 1 at the instant of a score, then falls to 0. */
  pop: number
  brokenT: number
  showRebuild: boolean
  reduced: boolean
  beltOn: boolean
}

export interface Difficulty {
  /** Progress per second. */
  beltRate: number
  /** Shortest and longest seconds between boxes. */
  gapLo: number
  gapHi: number
  /** Capture zone is [1 - span, 1). */
  span: number
}

export interface GameOptions {
  seed: number
  reduced: boolean
  best: number
}

export function difficulty(score: number, reduced: boolean): Difficulty {
  if (!Number.isFinite(score) || score < 0) throw new Error(`score must be >= 0, got ${score}`)
  if (typeof reduced !== 'boolean') throw new Error('reduced must be a boolean')
  const u = 1 - Math.exp(-score / 6)
  const legacyRate = 0.17 + u * 0.45
  const legacySpan = 0.32 - u * 0.14
  const stretch = reduced ? 1 / REDUCED : 1
  return {
    beltRate: (legacyRate / TRACK) * (reduced ? REDUCED : 1),
    gapLo: (1.7 - u * 1.05) * stretch * TRACK,
    gapHi: (3.1 - u * 1.15) * stretch * TRACK,
    span: legacySpan / TRACK,
  }
}

export interface ScoreJump {
  /** 1 at rest. Peaks above 1, dips below 1, then settles. */
  scale: number
  /** 1 at the score, 0 once the pop is over. */
  flash: number
  /** 0 at the caged box, 1 at the score. Reduced motion stays at 0. */
  travel: number
}

/** How hard the score number jumps. Bigger streak and a faster belt hit harder. */
export function scoreJump(pop: number, streak: number, beltRate: number, reduced: boolean): ScoreJump {
  if (!Number.isFinite(pop) || pop < 0 || pop > 1) throw new Error(`pop must be from 0 to 1, got ${pop}`)
  if (!Number.isInteger(streak) || streak < 0) throw new Error(`streak must be an integer >= 0, got ${streak}`)
  if (!Number.isFinite(beltRate) || beltRate <= 0) throw new Error(`beltRate must be > 0, got ${beltRate}`)
  if (typeof reduced !== 'boolean') throw new Error('reduced must be a boolean')
  if (pop === 0) return { scale: 1, flash: 0, travel: reduced ? 0 : 1 }
  const t = 1 - pop
  const punch = 0.62 + Math.min(streak, 12) * 0.07 + Math.max(0, beltRate - 0.05) * 1.1
  let rise = 0
  if (t < 0.16) rise = t / 0.16
  else if (t < 0.34) rise = 1 - ((t - 0.16) / 0.18) * 1.12
  else if (t < 0.55) rise = -0.12 + ((t - 0.34) / 0.21) * 0.28
  else rise = 0.16 * (1 - (t - 0.55) / 0.45)
  if (reduced) return { scale: 1, flash: pop, travel: 0 }
  return { scale: 1 + punch * rise, flash: pop, travel: t }
}

export function inZone(progress: number, score: number, reduced: boolean): boolean {
  const { span } = difficulty(score, reduced)
  return progress >= 1 - span && progress < 1
}

/** mulberry32. Same state, same next value. State 0 is a later stream value, not a seed. */
export function roll(state: number): { state: number, value: number } {
  if (!Number.isInteger(state) || state < 0 || state > 0xffffffff) {
    throw new Error(`rng state must be an integer from 0 to 4294967295, got ${state}`)
  }
  let a = state | 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return { state: a >>> 0, value: ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
}

export function leverCurve(t: number): number {
  const u = t / YANK
  if (u <= 0) return 0
  if (u < 0.3) return u / 0.3
  if (u < 1) return Math.max(0, 1 - (u - 0.3) / 0.7)
  return 0
}

export function createGame(options: GameOptions): Game {
  if (!Number.isInteger(options.seed) || options.seed < 1 || options.seed > 0xffffffff) {
    throw new Error(`seed must be an integer from 1 to 4294967295, got ${options.seed}`)
  }
  if (typeof options.reduced !== 'boolean') throw new Error('reduced must be a boolean')
  if (!Number.isInteger(options.best) || options.best < 0) {
    throw new Error(`best must be an integer >= 0, got ${options.best}`)
  }
  return {
    phase: 'waiting',
    seed: options.seed,
    rng: options.seed,
    score: 0,
    best: options.best,
    boxes: [],
    cages: [],
    nextId: 1,
    spawnIn: 0,
    cooldown: 0,
    lever: 0,
    leverT: 0,
    rex: 'idle',
    rexT: 0,
    flash: 0,
    jolt: 0,
    miss: 0,
    streak: 0,
    pop: 0,
    brokenT: 0,
    showRebuild: false,
    reduced: options.reduced,
    beltOn: false,
  }
}

function openingDelay(reduced: boolean): number {
  return reduced ? GRACE : WALK_DURATION + GRACE
}

export function pull(game: Game): Game {
  if (game.phase === 'broken') return game
  if (game.phase === 'waiting') {
    if (game.reduced) {
      return {
        ...game,
        phase: 'playing',
        beltOn: true,
        rex: 'ready',
        rexT: 0,
        spawnIn: openingDelay(true),
        lever: 1,
        leverT: 0.12,
      }
    }
    return {
      ...game,
      phase: 'playing',
      beltOn: true,
      rex: 'to-lever',
      rexT: 0,
      spawnIn: openingDelay(false),
      lever: 0,
      leverT: 0,
    }
  }
  if (game.rex === 'to-lever' || game.rex === 'yank' || game.rex === 'cheer') return game
  if (game.cooldown > 0) return game
  const hit = game.boxes
    .filter(box => inZone(box.progress, game.score, game.reduced))
    .sort((a, b) => b.progress - a.progress || a.id - b.id)[0]
  if (!hit) {
    return {
      ...game,
      cooldown: MISS_COOLDOWN,
      miss: 1,
      streak: 0,
      rex: 'yank',
      rexT: 0,
      lever: game.reduced ? 1 : 0,
      leverT: game.reduced ? 0.12 : 0,
    }
  }
  const score = game.score + 1
  const milestone = score % MILESTONE === 0
  return {
    ...game,
    score,
    boxes: game.boxes.filter(box => box.id !== hit.id),
    cages: [...game.cages, { id: hit.id }],
    flash: 1,
    jolt: 1,
    pop: 1,
    streak: game.streak + 1,
    miss: 0,
    cooldown: 0,
    rex: milestone ? 'cheer' : 'yank',
    rexT: 0,
    lever: game.reduced ? 1 : 0,
    leverT: game.reduced ? 0.12 : 0,
  }
}

export function rebuild(game: Game): Game {
  if (game.phase !== 'broken') return game
  const seed = game.seed === 0xffffffff ? 1 : game.seed + 1
  return createGame({ seed, reduced: game.reduced, best: game.best })
}

function settle(game: Game): Game {
  if (game.phase !== 'playing') return game
  if (game.rex === 'yank' || game.rex === 'cheer' || game.rex === 'to-lever') return game
  if (game.reduced) return game.rex === 'ready' ? game : { ...game, rex: 'ready', rexT: 0 }
  const danger = game.boxes.some(box => box.progress >= DANGER)
  const rex = danger ? 'nervous' : 'ready'
  if (game.rex === rex) return game
  return { ...game, rex, rexT: 0 }
}

function advanceRex(game: Game, dt: number): Game {
  if (game.phase === 'broken') {
    return { ...game, rex: 'startled', rexT: game.rexT + dt, lever: 0, leverT: 0 }
  }
  if (game.rex === 'to-lever') {
    const t = game.rexT + dt
    if (t < WALK_DURATION) return { ...game, rexT: t }
    return { ...game, rex: 'yank', rexT: 0, lever: 0 }
  }
  if (game.rex === 'yank' || game.rex === 'cheer') {
    const limit = game.rex === 'cheer' ? CHEER : YANK
    const t = game.rexT + dt
    const lever = game.reduced ? (t < 0.12 ? 1 : 0) : (t < YANK ? leverCurve(t) : 0)
    if (t < limit) return { ...game, rexT: t, lever, leverT: 0 }
    return settle({ ...game, rex: 'ready', rexT: 0, lever: 0, leverT: 0 })
  }
  let leverT = game.leverT
  let lever = game.lever
  if (leverT > 0) {
    leverT = Math.max(0, leverT - dt)
    lever = leverT > 0 ? 1 : 0
  }
  return settle({ ...game, lever, leverT })
}

function advanceBoxes(game: Game, dt: number): Game {
  if (game.phase !== 'playing' || !game.beltOn) return game
  const { beltRate } = difficulty(game.score, game.reduced)
  const boxes = game.boxes.map(box => ({ ...box, progress: box.progress + beltRate * dt }))
  const escaped = boxes.find(box => box.progress >= 1)
  if (!escaped) return { ...game, boxes }
  return {
    ...game,
    phase: 'broken',
    beltOn: false,
    boxes,
    best: Math.max(game.best, game.score),
    brokenT: 0,
    showRebuild: false,
    rex: 'startled',
    rexT: 0,
    lever: 0,
    leverT: 0,
    cooldown: 0,
  }
}

function advanceSpawn(game: Game, dt: number): Game {
  if (game.phase !== 'playing' || !game.beltOn) return game
  const spawnIn = game.spawnIn - dt
  if (spawnIn > 0) return { ...game, spawnIn }
  if (game.boxes.some(box => box.progress < CROWD)) return { ...game, spawnIn: 0.05 }
  const diff = difficulty(game.score, game.reduced)
  const rolled = roll(game.rng)
  const gap = diff.gapLo + rolled.value * (diff.gapHi - diff.gapLo)
  return {
    ...game,
    rng: rolled.state,
    spawnIn: gap,
    nextId: game.nextId + 1,
    boxes: [...game.boxes, { id: game.nextId, progress: 0 }],
  }
}

function advanceBroken(game: Game, dt: number): Game {
  const brokenT = game.brokenT + dt
  return {
    ...advanceRex(game, dt),
    brokenT,
    showRebuild: brokenT + 1e-9 >= BREAK_BEAT,
    beltOn: false,
  }
}

function decay(game: Game, dt: number): Game {
  return {
    ...game,
    jolt: Math.max(0, game.jolt - dt / 0.4),
    flash: Math.max(0, game.flash - dt / 0.28),
    pop: Math.max(0, game.pop - dt / POP_LIFE),
    miss: Math.max(0, game.miss - dt / 0.5),
    cooldown: Math.max(0, game.cooldown - dt),
  }
}

function stepOnce(game: Game, dt: number): Game {
  if (game.phase === 'broken') return decay(advanceBroken(game, dt), dt)
  if (game.phase === 'waiting') return game
  let next = advanceRex(game, dt)
  next = advanceBoxes(next, dt)
  if (next.phase === 'broken') return decay(next, dt)
  next = advanceSpawn(next, dt)
  return decay(settle(next), dt)
}

export function step(game: Game, dt: number): Game {
  if (!Number.isFinite(dt) || dt < 0) throw new Error(`dt must be >= 0, got ${dt}`)
  if (dt === 0) return game
  let next = game
  let left = dt
  const slice = 1 / 30
  while (left > 1e-8) {
    const h = Math.min(slice, left)
    next = stepOnce(next, h)
    left -= h
  }
  return next
}
