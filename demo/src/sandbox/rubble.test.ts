import { describe, expect, it } from 'vitest'
import { burst, planBreak, stepShards, type Shard } from './rubble'

describe('page rubble', () => {
  it('gate physics', () => {
    const pop = burst(1)
    const start: Shard = { x: 100, y: 40, vx: pop.vx, vy: pop.vy, rot: 0, vr: pop.vr, width: 80, height: 40 }
    let shards = [start]
    let peak = start.y
    for (let i = 0; i < 180; i += 1) {
      shards = stepShards(shards, 1 / 60, 400, 800)
      peak = Math.min(peak, shards[0].y)
    }
    expect(peak).toBeLessThan(start.y)
    expect(shards[0].y).toBe(360)
    expect(shards[0].vy).toBe(0)
    expect(burst(1)).toEqual(burst(1))
    expect(burst(2).vx).not.toBe(burst(1).vx)
    expect(() => stepShards(shards, -1, 400, 800)).toThrow(/dt/)
  })

  it('gate reduced fade', () => {
    const plan = planBreak(true, 0)
    expect(plan.fade).toBe(true)
    expect(plan.fall).toBe(false)
    expect(plan.vx).toBe(0)
    expect(plan.vy).toBe(0)
    expect(plan.vr).toBe(0)
    const full = planBreak(false, 3)
    expect(full.fall).toBe(true)
    expect(full.fade).toBe(false)
    expect(full.vy).toBeLessThan(0)
  })
})