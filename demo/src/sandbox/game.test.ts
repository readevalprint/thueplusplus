import { describe, expect, it } from 'vitest'
import { BELT_ENTRANCE, BELT_MOUTH, BELT_X0, BREAK_BEAT, beltPoint } from './layout'
import { WALK_DURATION } from './motion'
import {
  GRACE,
  MISS_COOLDOWN,
  IDLE,
  RETURN,
  beginAutoplay,
  beginPlayer,
  createGame,
  demoRuns,
  TRACK,
  difficulty,
  inZone,
  playerAct,
  pull,
  rebuild,
  roll,
  scoreJump,
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
  return beginPlayer(createGame({ seed, reduced, best }))
}

function canPull(game: Game): boolean {
  return game.phase === 'playing' && game.rex !== 'to-lever' && game.rex !== 'yank' && game.rex !== 'cheer' && game.cooldown === 0
}

function fumbleUntilBroken(game: Game, limit = 40): Game {
  let current = game.control === 'player' && game.phase === 'playing' ? game : beginPlayer(game)
  let elapsed = 0
  while (current.phase !== 'broken') {
    const zoned = current.boxes.some(box => inZone(box.progress, current.score, current.reduced))
    if (!zoned && canPull(current)) current = pull(current)
    current = step(current, 1 / 60)
    elapsed += 1 / 60
    if (elapsed > limit) {
      throw new Error(`timed out fumbling at ${elapsed.toFixed(2)}s phase=${current.phase} control=${current.control}`)
    }
  }
  return current
}

function playUntil(game: Game, score: number): Game {
  let current = game.control === 'player' && game.phase === 'playing' ? game : beginPlayer(game)
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

    expect(game.streak).toBe(1)
    expect(inZone(0.86, 0, false)).toBe(true)
    expect(inZone(0.86, 18, false)).toBe(false)
    expect(inZone(0.7, 0, false)).toBe(false)
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
    expect(high.span).toBeGreaterThan(0.08)
    expect(high.gapLo).toBeGreaterThan(0.4)

    let slowGame = started(4, false)
    slowGame = until(slowGame, current => current.boxes.some(box => box.progress < 0.2))
    const slow = crossHalf(slowGame)
    let fastGame = playUntil(slow.game, 8)
    fastGame = until(fastGame, current => current.boxes.some(box => box.progress < 0.15) && current.phase === 'playing')
    const fast = crossHalf(fastGame)
    expect(fast.dt).toBeLessThan(slow.dt * 0.75)
  })

  it('gate scale', () => {
    expect(TRACK).toBeGreaterThan(1)
    expect(BELT_X0).toBe(0)
    expect(BELT_ENTRANCE - BELT_MOUTH).toBeGreaterThan(1000)
    expect(beltPoint(0).x).toBe(BELT_ENTRANCE)
    expect(beltPoint(1).x).toBe(BELT_MOUTH)
    expect(beltPoint(0).x).toBeGreaterThan(beltPoint(1).x)
    for (const score of [0, 6, 18]) {
      const now = difficulty(score, false)
      const u = 1 - Math.exp(-score / 6)
      const legacyRate = 0.17 + u * 0.45
      const legacySpan = 0.32 - u * 0.14
      expect(now.beltRate).toBeCloseTo(legacyRate / TRACK, 6)
      expect(now.span).toBeCloseTo(legacySpan / TRACK, 6)
      expect(now.span / now.beltRate).toBeCloseTo(legacySpan / legacyRate, 5)
      expect(1 / now.beltRate).toBeCloseTo(TRACK / legacyRate, 5)
    }
  })

  it('gate pop', () => {
    const rate = difficulty(0, false).beltRate
    const rest = scoreJump(1, 1, rate, false)
    expect(rest.scale).toBe(1)
    expect(rest.travel).toBe(0)
    const peak = scoreJump(0.84, 1, rate, false)
    expect(peak.scale).toBeGreaterThan(1.5)
    const dipped = scoreJump(0.66, 1, rate, false)
    expect(dipped.scale).toBeLessThan(1)
    const done = scoreJump(0, 1, rate, false)
    expect(done.scale).toBe(1)
    expect(done.travel).toBe(1)
    const harder = scoreJump(0.84, 8, difficulty(18, false).beltRate, false)
    expect(harder.scale).toBeGreaterThan(peak.scale + 0.4)
    const reduced = scoreJump(0.84, 8, difficulty(18, false).beltRate, true)
    expect(reduced.scale).toBe(1)
    expect(reduced.travel).toBe(0)
    expect(reduced.flash).toBeCloseTo(0.84, 5)
    expect(scoreJump(0, 3, rate, true).flash).toBe(0)
  })

  it('gate break', () => {
    let game = started(5, true, 2)
    game = fumbleUntilBroken(game)
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
    expect(next.control).toBe('auto')
    expect(next.phase).toBe('playing')
    expect(next.score).toBe(0)
    expect(next.boxes).toHaveLength(0)
    expect(next.cages).toHaveLength(0)
    expect(next.beltOn).toBe(true)
    expect(next.best).toBe(2)
    expect(next.seed).toBe(game.seed + 1)
    expect(rebuild(next)).toBe(next)
    const resumed = until(game, current => current.control === 'auto' && current.phase === 'playing', RETURN + 1)
    expect(resumed.score).toBe(0)
    expect(resumed.beltOn).toBe(true)

    let scored = playUntil(createGame({ seed: 6, reduced: true, best: 0 }), 2)
    scored = fumbleUntilBroken(scored)
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

  it('gate autoplay', () => {
    for (const reduced of [false, true]) {
      let game = beginAutoplay(createGame({ seed: 4, reduced, best: 3 }))
      expect(game.control).toBe('auto')
      expect(game.phase).toBe('playing')
      expect(game.beltOn).toBe(true)
      expect(game.score).toBe(0)
      expect(game.best).toBe(3)
      let elapsed = 0
      while (elapsed < 60) {
        game = step(game, 1 / 30)
        elapsed += 1 / 30
        if (game.phase === 'broken') throw new Error(`autoplay broke at ${elapsed.toFixed(2)}s score ${game.score}`)
        expect(game.miss).toBe(0)
        expect(game.control).toBe('auto')
      }
      expect(game.score).toBeGreaterThan(0)
      expect(game.best).toBe(3)
    }

    let visible = beginAutoplay(createGame({ seed: 9, reduced: false, best: 0 }))
    let sawScan = false
    let elapsed = 0
    while (visible.score === 0 && elapsed < 20) {
      visible = step(visible, 1 / 30)
      elapsed += 1 / 30
      if (visible.boxes.some(box => inZone(box.progress, visible.score, false))) sawScan = true
    }
    expect(sawScan).toBe(true)
    expect(visible.score).toBeGreaterThan(0)
    expect(visible.phase).toBe('playing')
  })

  it('gate takeover', () => {
    const demo = beginAutoplay(createGame({ seed: 2, reduced: true, best: 4 }))
    const playing = until(demo, current => current.score >= 1, 50)
    const taken = playerAct(playing)
    expect(taken.control).toBe('player')
    expect(taken.score).toBe(0)
    expect(taken.best).toBe(4)
    expect(taken.phase).toBe('playing')
    expect(taken.boxes).toHaveLength(0)

    const again = playerAct(taken)
    expect(again.score).toBe(0)
    expect(again.control).toBe('player')

    let missed = started(7, true)
    missed = fumbleUntilBroken(missed)
    expect(missed.control).toBe('player')
    expect(missed.score).toBe(0)

    let idle = started(7, true)
    idle = step(idle, IDLE - 0.05)
    expect(idle.control).toBe('player')
    expect(idle.phase).toBe('playing')
    idle = step(idle, 0.1)
    expect(idle.control).toBe('auto')
    expect(idle.phase).toBe('playing')
    expect(idle.phase).not.toBe('broken')
    expect(idle.score).toBe(0)
  })

  it('gate demo', () => {
    expect(demoRuns(false, true)).toBe(true)
    expect(demoRuns(true, true)).toBe(false)
    expect(demoRuns(false, false)).toBe(false)
    expect(demoRuns(true, false)).toBe(false)
    expect(() => demoRuns(0 as unknown as boolean, true)).toThrow(/hidden/)
    expect(() => demoRuns(false, 'yes' as unknown as boolean)).toThrow(/inView/)
  })
})
