/**
 * Rex's sandbox machine.
 *
 * The belt starts stopped. Rex walks to the lever and pulls it; the lever
 * value is 0 when the belt is stopped and 1 when it is running. Good glyphs
 * leave with a glow. Evil glyphs jolt the machine and stack in cages.
 * Clicking an evil glyph while it is still on the belt breaks the page.
 * Rebuild clears the break and does not persist anything.
 */

import {
  BELT_RATE,
  BREAK_BEAT,
  FIRST_SPAWN,
  GLOW,
  ITEM_GAP,
  PROCESS,
  PULL,
  SPAWN_GAP,
  EXIT_LIFE,
} from './layout'
import { WALK_DURATION } from './motion'

export type Kind = 'good' | 'evil'
export type Glyph = 'assign' | 'dot' | 'rule' | 'spike' | 'fuse' | 'face'
export type RexMode = 'idle' | 'to-lever' | 'pull' | 'from-lever' | 'wander'

export interface Item {
  id: number
  kind: Kind
  glyph: Glyph
  /** 0 at the belt entrance, 1 at the machine mouth. */
  progress: number
  /** Seconds of extra glow left after a click. */
  glow: number
}

export interface Cage {
  id: number
  glyph: Glyph
}

export interface GoodExit {
  id: number
  glyph: Glyph
  age: number
  glow: number
}

export interface Processing {
  id: number
  kind: Kind
  glyph: Glyph
  t: number
}

export interface Scene {
  beltOn: boolean
  /** 0 is off, 1 is on. Mid-pull values sit between them. */
  lever: number
  rex: RexMode
  rexT: number
  items: Item[]
  processing: Processing | null
  cages: Cage[]
  exits: GoodExit[]
  broken: boolean
  brokenT: number
  showRebuild: boolean
  nextId: number
  spawnT: number
  script: number
  /** 1 on an evil exit, then decays. */
  jolt: number
  /** Porthole flash, 1 then decays. */
  flash: number
  reduced: boolean
}

export const SCRIPT: readonly { kind: Kind, glyph: Glyph }[] = [
  { kind: 'good', glyph: 'assign' },
  { kind: 'evil', glyph: 'spike' },
  { kind: 'good', glyph: 'dot' },
  { kind: 'evil', glyph: 'fuse' },
  { kind: 'good', glyph: 'rule' },
  { kind: 'evil', glyph: 'face' },
]

const GLYPH_NAME: Record<Glyph, string> = {
  assign: 'calm rewrite mark',
  dot: 'calm dot',
  rule: 'calm rule',
  spike: 'spiky object',
  fuse: 'object with a lit fuse',
  face: 'object marked x x',
}

export function itemLabel(item: Pick<Item, 'kind' | 'glyph'>): string {
  const name = GLYPH_NAME[item.glyph]
  if (item.kind === 'evil') return `${name} on the belt, before the machine`
  return `${name} on the belt`
}

export function createScene(options?: { reduced?: boolean }): Scene {
  return {
    beltOn: false,
    lever: 0,
    rex: 'idle',
    rexT: 0,
    items: [],
    processing: null,
    cages: [],
    exits: [],
    broken: false,
    brokenT: 0,
    showRebuild: false,
    nextId: 1,
    spawnT: FIRST_SPAWN,
    script: 0,
    jolt: 0,
    flash: 0,
    reduced: options?.reduced ?? false,
  }
}

export function pressRex(scene: Scene): Scene {
  if (scene.broken || scene.rex !== 'idle') return scene
  if (scene.reduced) {
    const beltOn = !scene.beltOn
    return { ...scene, beltOn, lever: beltOn ? 1 : 0 }
  }
  return { ...scene, rex: 'to-lever', rexT: 0 }
}

export function pressItem(scene: Scene, id: number): Scene {
  if (scene.broken) return scene
  const item = scene.items.find(entry => entry.id === id)
  if (item) {
    if (item.kind === 'evil') {
      return {
        ...scene,
        broken: true,
        brokenT: 0,
        showRebuild: false,
        beltOn: false,
        rex: 'idle',
        rexT: 0,
        items: scene.items.filter(entry => entry.id !== id),
      }
    }
    return {
      ...scene,
      items: scene.items.map(entry => (entry.id === id ? { ...entry, glow: GLOW } : entry)),
    }
  }
  if (!scene.exits.some(entry => entry.id === id)) return scene
  return {
    ...scene,
    exits: scene.exits.map(entry => (entry.id === id ? { ...entry, glow: GLOW } : entry)),
  }
}

export function rebuild(scene: Scene): Scene {
  if (!scene.broken) return scene
  return {
    ...scene,
    broken: false,
    brokenT: 0,
    showRebuild: false,
    rex: 'idle',
    rexT: 0,
    beltOn: false,
    lever: 0,
    processing: null,
    jolt: 0,
    flash: 0,
  }
}

function decayGlow(item: Item, dt: number): Item {
  if (item.glow === 0) return item
  return { ...item, glow: Math.max(0, item.glow - dt) }
}

function advanceBelt(scene: Scene, dt: number): Scene {
  const items = scene.items.map(item => decayGlow(item, dt))
  if (!scene.beltOn) return { ...scene, items }
  const ordered = [...items].sort((a, b) => b.progress - a.progress || a.id - b.id)
  const moved: Item[] = []
  for (let i = 0; i < ordered.length; i += 1) {
    const item = ordered[i]
    const cap = i === 0 ? 1 : moved[i - 1].progress - ITEM_GAP
    const waiting = i === 0 && scene.processing !== null && item.progress >= 1 - 1e-6
    const room = Math.max(cap, 0)
    const progress = waiting ? item.progress : Math.min(room, item.progress + BELT_RATE * dt)
    moved.push({ ...item, progress })
  }
  let processing = scene.processing
  let kept = moved
  if (!processing) {
    const lead = kept.find(item => item.progress >= 1 - 1e-6)
    if (lead) {
      processing = { id: lead.id, kind: lead.kind, glyph: lead.glyph, t: 0 }
      kept = kept.filter(item => item.id !== lead.id)
    }
  }
  return { ...scene, items: kept, processing }
}

function advanceProcess(scene: Scene, dt: number): Scene {
  if (!scene.processing) return scene
  const t = scene.processing.t + dt
  if (t < PROCESS) return { ...scene, processing: { ...scene.processing, t } }
  const done = scene.processing
  if (done.kind === 'good') {
    return {
      ...scene,
      processing: null,
      flash: Math.max(scene.flash, 0.45),
      exits: [...scene.exits, { id: done.id, glyph: done.glyph, age: 0, glow: 0.35 }],
    }
  }
  return {
    ...scene,
    processing: null,
    jolt: 1,
    flash: 1,
    cages: [...scene.cages, { id: done.id, glyph: done.glyph }],
  }
}

function advanceSpawn(scene: Scene, dt: number): Scene {
  if (!scene.beltOn) return scene
  const spawnT = scene.spawnT + dt
  const crowded = scene.items.some(item => item.progress < SPAWN_GAP)
  if (spawnT < SPAWN_GAP || crowded || scene.items.length >= 4) {
    return { ...scene, spawnT }
  }
  const next = SCRIPT[scene.script % SCRIPT.length]
  return {
    ...scene,
    spawnT: 0,
    script: scene.script + 1,
    nextId: scene.nextId + 1,
    items: [...scene.items, { id: scene.nextId, kind: next.kind, glyph: next.glyph, progress: 0, glow: 0 }],
  }
}

function advanceExits(scene: Scene, dt: number): Scene {
  return {
    ...scene,
    exits: scene.exits
      .map(exit => ({ ...exit, age: exit.age + dt, glow: Math.max(0, exit.glow - dt) }))
      .filter(exit => exit.age < EXIT_LIFE),
  }
}

function advanceRex(scene: Scene, dt: number): Scene {
  if (scene.rex === 'idle' || scene.rex === 'wander') return scene
  if (scene.rex === 'to-lever') {
    const t = scene.rexT + dt
    if (t < WALK_DURATION) return { ...scene, rexT: t }
    return { ...scene, rex: 'pull', rexT: t - WALK_DURATION }
  }
  if (scene.rex === 'pull') {
    const t = scene.rexT + dt
    const from = scene.beltOn ? 1 : 0
    const target = scene.beltOn ? 0 : 1
    if (t < PULL) return { ...scene, rexT: t, lever: from + (target - from) * (t / PULL) }
    const beltOn = !scene.beltOn
    return { ...scene, rex: 'from-lever', rexT: t - PULL, beltOn, lever: beltOn ? 1 : 0 }
  }
  const t = scene.rexT + dt
  if (t < WALK_DURATION) return { ...scene, rexT: t }
  return { ...scene, rex: 'idle', rexT: 0 }
}

function advanceBroken(scene: Scene, dt: number): Scene {
  const brokenT = scene.brokenT + dt
  if (scene.showRebuild) {
    if (scene.rex !== 'wander' || scene.reduced) return { ...scene, brokenT }
    return { ...scene, brokenT, rexT: scene.rexT + dt }
  }
  if (brokenT < BREAK_BEAT) return { ...scene, brokenT }
  if (scene.reduced) return { ...scene, brokenT, showRebuild: true, rex: 'idle', rexT: 0 }
  return { ...scene, brokenT, showRebuild: true, rex: 'wander', rexT: 0 }
}

function stepOnce(scene: Scene, dt: number): Scene {
  if (scene.broken) return advanceBroken(scene, dt)
  let next = advanceRex(scene, dt)
  next = advanceProcess(next, dt)
  next = advanceBelt(next, dt)
  next = advanceSpawn(next, dt)
  next = advanceExits(next, dt)
  return {
    ...next,
    jolt: Math.max(0, next.jolt - dt / 0.45),
    flash: Math.max(0, next.flash - dt / 0.28),
  }
}

export function step(scene: Scene, dt: number): Scene {
  if (!Number.isFinite(dt) || dt < 0) throw new Error(`dt must be >= 0, got ${dt}`)
  if (dt === 0) return scene
  let next = scene
  let left = dt
  const slice = 1 / 30
  while (left > 1e-8) {
    const h = Math.min(slice, left)
    next = stepOnce(next, h)
    left -= h
  }
  return next
}
