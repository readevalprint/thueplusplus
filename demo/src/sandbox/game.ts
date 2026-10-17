/**
 * Lever-timing game for the home sandbox.
 *
 * Rex autoplays on load: the belt runs and he pulls for every box, so the
 * demo loops and the page does not break. A click, the your-turn control, or
 * the keyboard hands the lever to the player and resets the score. Only the
 * player's missed box breaks the run. After the break, or after the player
 * goes idle, Rex takes the demo back.
 * Nothing here reads the clock, the DOM, or storage.
 */

import { BREAK_BEAT, CHEER, YANK } from './layout'
import { WALK_DURATION } from './motion'

export const GRACE = 0.8
export const MISS_COOLDOWN = 0.42
export const MILESTONE = 5
export const DANGER = 0.84
/**
 * Seconds without a player pull before Rex resumes the demo.
 * Past the moment the first reduced-motion box reaches the scanner, and
 * short of that box leaving the belt, so a quiet takeover ends in the demo
 * and does not break the page on its own.
 */
export const IDLE = 20
/** Seconds the break stays up before the demo resumes. */
export const RETURN = BREAK_BEAT + 1.6
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
export type Control = 'auto' | 'player'
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
  /** Rex runs the demo, or the player has the lever. */
  control: Control
  /** Seconds since the player's last pull. */
  idle: number
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
    control: 'auto',
    idle: 0,
  }
}

function openingDelay(reduced: boolean): number {
  return reduced ? GRACE : WALK_DURATION + GRACE
}

function nextSeed(seed: number): number {
  return seed === 0xffffffff ? 1 : seed + 1
}

function arm(game: Game, control: Control): Game {
  const reduced = game.reduced
  return {
    ...createGame({ seed: nextSeed(game.seed), reduced, best: game.best }),
    control,
    phase: 'playing',
    beltOn: true,
    rex: reduced ? 'ready' : 'to-lever',
    rexT: 0,
    spawnIn: openingDelay(reduced),
    lever: reduced ? 1 : 0,
    leverT: reduced ? 0.12 : 0,
    idle: 0,
  }
}

/** Rex starts the demo. The score climbs and a missed box does not break the page. */
export function beginAutoplay(game: Game): Game {
  return arm(game, 'auto')
}

/** The player takes the lever. The score resets. Their misses can break the page. */
export function beginPlayer(game: Game): Game {
  return arm(game, 'player')
}

function hottest(game: Game): Box | undefined {
  return game.boxes
    .filter(box => inZone(box.progress, game.score, game.reduced))
    .sort((a, b) => b.progress - a.progress || a.id - b.id)[0]
}

function scoreHit(game: Game, hit: Box): Game {
  const score = game.score + 1
  const milestone = score % MILESTONE === 0
  let cages = [...game.cages, { id: hit.id }]
  if (game.control === 'auto' && cages.length > 8) cages = cages.slice(cages.length - 8)
  return {
    ...game,
    score,
    boxes: game.boxes.filter(box => box.id !== hit.id),
    cages,
    flash: 1,
    jolt: 1,
    pop: 1,
    streak: game.streak + 1,
    miss: 0,
    cooldown: 0,
    idle: 0,
    rex: milestone ? 'cheer' : 'yank',
    rexT: 0,
    lever: game.reduced ? 1 : 0,
    leverT: game.reduced ? 0.12 : 0,
  }
}

/**
 * Rex catches once the box is in the middle of the scan.
 * The opening of the tunnel stays visible as an X-ray before he pulls.
 * A box that reaches the exit is still caught, so the demo does not break.
 */
function autoCatch(game: Game): Game {
  if (game.control !== 'auto' || game.phase !== 'playing') return game
  const { span } = difficulty(game.score, game.reduced)
  const mark = 1 - span * 0.45
  const hit = game.boxes
    .filter(box => box.progress >= mark && box.progress < 1)
    .sort((a, b) => b.progress - a.progress || a.id - b.id)[0]
  if (!hit) return game
  return scoreHit(game, hit)
}

export function pull(game: Game): Game {
  if (game.phase !== 'playing' || game.control !== 'player') return game
  if (game.rex === 'to-lever' || game.rex === 'yank' || game.rex === 'cheer') return game
  if (game.cooldown > 0) return game
  const hit = hottest(game)
  if (!hit) {
    return {
      ...game,
      idle: 0,
      cooldown: MISS_COOLDOWN,
      miss: 1,
      streak: 0,
      rex: 'yank',
      rexT: 0,
      lever: game.reduced ? 1 : 0,
      leverT: game.reduced ? 0.12 : 0,
    }
  }
  return scoreHit(game, hit)
}

/** The demo steps only while the tab is visible and the hero is on screen. */
export function demoRuns(hidden: boolean, inView: boolean): boolean {
  if (typeof hidden !== 'boolean') throw new Error(`hidden must be a boolean, got ${hidden}`)
  if (typeof inView !== 'boolean') throw new Error(`inView must be a boolean, got ${inView}`)
  return !hidden && inView
}

/** Lever, your-turn, or the keyboard. Autoplay and a break become the player's run. */
export function playerAct(game: Game): Game {
  if (game.control === 'player' && game.phase === 'playing') return pull(game)
  return beginPlayer(game)
}

export function rebuild(game: Game): Game {
  if (game.phase !== 'broken') return game
  return beginAutoplay(game)
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
  if (game.control === 'auto') return scoreHit({ ...game, boxes }, escaped)
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
  if (game.phase === 'broken') {
    const held = advanceBroken(game, dt)
    if (held.brokenT >= RETURN) return beginAutoplay(held)
    return decay(held, dt)
  }
  if (game.phase === 'waiting') return game
  let next = game
  if (next.control === 'player') {
    const idle = next.idle + dt
    if (idle >= IDLE) return beginAutoplay(next)
    next = { ...next, idle }
  }
  if (next.control === 'auto') next = autoCatch(next)
  next = advanceRex(next, dt)
  if (next.control === 'auto') next = autoCatch(next)
  next = advanceBoxes(next, dt)
  if (next.phase === 'broken') return decay(next, dt)
  next = advanceSpawn(next, dt)
  if (next.control === 'auto') next = autoCatch(next)
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
