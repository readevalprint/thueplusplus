import { describe, expect, it } from 'vitest'
import { BREAK_BEAT } from './layout'
import { WALK_DURATION } from './motion'
import {
  GRACE,
  MISS_COOLDOWN,
  createGame,
  difficulty,
  inZone,
  pull,
  rebuild,
  roll,
  step,
  type Game,
} from './game'

function until(game: Game, pred: (current: Game) => boolean, limit = 40): Game {
  let current = game
  let elapsed = 0
  while (!pred(current)) {
    current = step(current, 1 / 60)
    elapsed += 1 / 60
    if (elapsed > limit) throw new Error(`timed out at ${elapsed.toFixed(2)}s phase=${current.phase} score=${current.score}`)
  }
  return current
}

function started(seed: number, reduced: boolean, best = 0): Game {
  return pull(createGame({ seed, reduced, best }))
}

function canPull(game: Game): boolean {
  return game.phase === 'playing' && game.rex !== 'to-lever' && game.rex !== 'yank' && game.rex !== 'cheer' && game.cooldown === 0
}

function playUntil(game: Game, score: number): Game {
  let current = game.phase === 'waiting' ? pull(game) : game
  let elapsed = 0
  while (current.score < score) {
    if (current.phase === 'broken') throw new Error(`broke at score ${current.score}`)
    const zoned = current.boxes.some(box => inZone(box.progress, current.score, current.reduced))
    if (zoned && canPull(current)) current = pull(current)
    current = step(current, 1 / 60)
    elapsed += 1 / 60
    if (elapsed > 70) throw new Error(`timed out playing, score ${current.score}`)
  }
  return current
}

function spawnTimes(seed: number, n: number): number[] {
  let game = started(seed, true)
  const times: number[] = []
  let seen = 0
  let t = 0
  while (times.length < n && t < 60) {
    const zoned = game.boxes.some(box => inZone(box.progress, game.score, true))
    if (zoned && canPull(game)) game = pull(game)
    game = step(game, 1 / 60)
    t += 1 / 60
    if (game.phase === 'broken') throw new Error(`broke while sampling seed ${seed}`)
    const count = game.score + game.boxes.length
    if (count > seen) {
      times.push(Number(t.toFixed(4)))
      seen = count
    }
  }
  if (times.length < n) throw new Error(`only ${times.length} spawns`)
  return times
}

function crossHalf(game: Game): { game: Game, dt: number } {
  const box = game.boxes.find(entry => entry.progress < 0.2)
  if (!box) throw new Error('no fresh box')
  const start = box.progress
  let current = game
  let dt = 0
  while (true) {
    const live = current.boxes.find(entry => entry.id === box.id)
    if (!live) throw new Error('box left the belt')
    if (live.progress >= start + 0.5) return { game: current, dt }
    if (current.phase !== 'playing') throw new Error(`phase ${current.phase}`)
    current = step(current, 1 / 60)
    dt += 1 / 60
    if (dt > 20) throw new Error('box did not cross')
  }
}

describe('lever game', () => {
  it('gate waits', () => {
    const game = createGame({ seed: 1, reduced: false, best: 0 })
    expect(game.phase).toBe('waiting')
    expect(game.beltOn).toBe(false)
    expect(game.rex).toBe('idle')
    expect(game.score).toBe(0)
    expect(game.boxes).toHaveLength(0)
    expect(game.lever).toBe(0)
    expect(step(game, 8)).toBe(game)
    expect(step(game, 0)).toBe(game)
  })

  it('gate grace', () => {
    const reduced = started(1, true)
    expect(step(reduced, GRACE - 0.05).boxes).toHaveLength(0)
    expect(step(reduced, GRACE + 0.05).boxes).toHaveLength(1)

    const full = started(1, false)
    expect(full.rex).toBe('to-lever')
    expect(full.beltOn).toBe(true)
    const before = step(full, WALK_DURATION + GRACE - 0.05)
    expect(before.boxes).toHaveLength(0)
    expect(before.rex).toBe('ready')
    expect(step(full, WALK_DURATION + GRACE + 0.05).boxes).toHaveLength(1)

    expect(() => step(reduced, -0.1)).toThrow(/dt/)
    expect(() => step(reduced, Number.NaN)).toThrow(/dt/)
    expect(() => createGame({ seed: 0, reduced: false, best: 0 })).toThrow(/seed/)
    expect(() => createGame({ seed: 1.5, reduced: false, best: 0 })).toThrow(/seed/)
    expect(() => createGame({ seed: 1, reduced: false, best: -1 })).toThrow(/best/)
    expect(() => difficulty(-1, false)).toThrow(/score/)
  })

  it('gate gaps', () => {
    expect(roll(1).value).toBeCloseTo(0.6270739405881613, 12)
    const first = spawnTimes(1, 6)
    const again = spawnTimes(1, 6)
    const other = spawnTimes(2, 6)
    expect(again).toEqual(first)
    expect(other).not.toEqual(first)
    const gaps = first.slice(1).map((time, index) => Number((time - first[index]).toFixed(3)))
    expect(new Set(gaps).size).toBeGreaterThan(1)
    expect(Math.min(...gaps)).toBeGreaterThan(0.4)
  })

  it('gate capture and miss', () => {
    let game = started(3, true)
    game = until(game, current => current.boxes.some(box => inZone(box.progress, current.score, true)))
    const hit = game.boxes.find(box => inZone(box.progress, game.score, true))
    if (!hit) throw new Error('missing box')
    game = pull(game)
    expect(game.phase).toBe('playing')
    expect(game.score).toBe(1)
    expect(game.cages.map(cage => cage.id)).toEqual([hit.id])
    expect(game.boxes.some(box => box.id === hit.id)).toBe(false)
    expect(game.jolt).toBe(1)
    expect(game.flash).toBe(1)
    expect(game.pop).toBe(1)

    let miss = started(3, true)
    miss = pull(miss)
    expect(miss.phase).toBe('playing')
    expect(miss.score).toBe(0)
    expect(miss.miss).toBe(1)
    expect(miss.cooldown).toBe(MISS_COOLDOWN)
    expect(pull(miss)).toBe(miss)

    let early = started(4, true)
    early = until(early, current => current.boxes.some(box => box.progress > 0.25 && !inZone(box.progress, current.score, true)) && canPull(current))
    early = pull(early)
    expect(early.score).toBe(0)
    expect(early.phase).toBe('playing')
    expect(early.miss).toBe(1)

    expect(inZone(0.7, 0, false)).toBe(true)
    expect(inZone(0.7, 3, false)).toBe(false)
    let tight = playUntil(createGame({ seed: 9, reduced: true, best: 0 }), 3)
    tight = until(tight, current => {
      const start = 1 - difficulty(current.score, true).span
      return canPull(current) && current.boxes.some(box => box.progress >= 0.7 && box.progress < start)
    })
    const score = tight.score
    tight = pull(tight)
    expect(tight.score).toBe(score)
    expect(tight.phase).toBe('playing')
    expect(tight.miss).toBe(1)
  })

  it('gate ramp', () => {
    const low = difficulty(0, false)
    const mid = difficulty(6, false)
    const high = difficulty(18, false)
    expect(low.beltRate).toBeLessThan(mid.beltRate)
    expect(mid.beltRate).toBeLessThan(high.beltRate)
    expect(low.gapLo).toBeGreaterThan(mid.gapLo)
    expect(mid.gapLo).toBeGreaterThan(high.gapLo)
    expect(low.span).toBeGreaterThan(mid.span)
    expect(mid.span).toBeGreaterThan(high.span)
    expect(high.gapHi - high.gapLo).toBeGreaterThan(0.4)
    expect(difficulty(4, true).beltRate).toBeLessThan(difficulty(4, false).beltRate)
    expect(difficulty(4, true).gapLo).toBeGreaterThan(difficulty(4, false).gapLo)
    expect(high.span).toBeGreaterThan(0.1)
    expect(high.gapLo).toBeGreaterThan(0.4)

    let slowGame = started(4, false)
    slowGame = until(slowGame, current => current.boxes.some(box => box.progress < 0.2))
    const slow = crossHalf(slowGame)
    let fastGame = playUntil(slow.game, 8)
    fastGame = until(fastGame, current => current.boxes.some(box => box.progress < 0.15) && current.phase === 'playing')
    const fast = crossHalf(fastGame)
    expect(fast.dt).toBeLessThan(slow.dt * 0.75)
  })

  it('gate break', () => {
    let game = started(5, true, 2)
    game = until(game, current => current.phase === 'broken')
    expect(game.score).toBe(0)
    expect(game.best).toBe(2)
    expect(game.beltOn).toBe(false)
    expect(game.showRebuild).toBe(false)
    expect(game.rex).toBe('startled')
    game = step(game, BREAK_BEAT - 0.05)
    expect(game.showRebuild).toBe(false)
    game = step(game, 0.08)
    expect(game.showRebuild).toBe(true)
    const next = rebuild(game)
    expect(next.phase).toBe('waiting')
    expect(next.score).toBe(0)
    expect(next.boxes).toHaveLength(0)
    expect(next.cages).toHaveLength(0)
    expect(next.beltOn).toBe(false)
    expect(next.lever).toBe(0)
    expect(next.rex).toBe('idle')
    expect(next.best).toBe(2)
    expect(next.seed).toBe(game.seed + 1)
    expect(rebuild(next)).toBe(next)

    let scored = playUntil(createGame({ seed: 6, reduced: true, best: 0 }), 2)
    scored = until(scored, current => current.phase === 'broken', 30)
    expect(scored.score).toBe(2)
    expect(scored.best).toBe(2)
    expect(rebuild(scored).best).toBe(2)
    expect(rebuild(scored).score).toBe(0)
  })

  it('gate input', () => {
    const full = started(1, false)
    const reduced = started(1, true)
    expect(full.rex).toBe('to-lever')
    expect(full.lever).toBe(0)
    expect(reduced.rex).toBe('ready')
    expect(reduced.lever).toBe(1)
    expect(reduced.beltOn).toBe(true)

    let fullBox = until(full, current => current.boxes.length > 0)
    const fullCross = crossHalf(fullBox)
    let slowBox = until(reduced, current => current.boxes.length > 0)
    const slowCross = crossHalf(slowBox)
    expect(slowCross.dt).toBeGreaterThan(fullCross.dt * 1.5)

    let nervous = until(started(8, false), current => current.boxes.some(box => box.progress >= 0.84) && current.phase === 'playing')
    expect(nervous.rex).toBe('nervous')

    const cheer = playUntil(createGame({ seed: 11, reduced: false, best: 0 }), 5)
    expect(cheer.rex).toBe('cheer')
    expect(cheer.score).toBe(5)
  })
})
