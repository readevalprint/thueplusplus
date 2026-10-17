import { describe, expect, it } from 'vitest'
import { createNavProgress } from './navProgress'

describe('progress line', () => {
  it('advances while running, completes, fades, and resets on error', () => {
    const bar = createNavProgress(() => false)
    const started = bar.start(0)
    expect(started.state).toBe('run')
    expect(started.scale).toBeCloseTo(0.08)

    const early = bar.tick(400)
    const later = bar.tick(1200)
    expect(early.scale).toBeGreaterThan(started.scale)
    expect(later.scale).toBeGreaterThan(early.scale)
    expect(later.scale).toBeLessThan(0.92)

    const done = bar.finish(1200)
    expect(done.state).toBe('done')
    expect(done.scale).toBe(1)
    expect(bar.tick(1200 + 449).state).toBe('done')
    expect(bar.tick(1200 + 450).state).toBe('fade')
    expect(bar.tick(1200 + 450).scale).toBe(1)
    const cleared = bar.tick(1200 + 450 + 220)
    expect(cleared.state).toBe('idle')
    expect(cleared.scale).toBe(0)

    bar.start(2000)
    const failed = bar.fail()
    expect(failed.state).toBe('idle')
    expect(failed.scale).toBe(0)
    expect(bar.tick(9999).scale).toBe(0)
  })

  it('stays still when reduced motion is requested', () => {
    const bar = createNavProgress(() => true)
    const started = bar.start(0)
    expect(started.state).toBe('run')
    expect(started.scale).toBe(1)
    expect(bar.tick(400).scale).toBe(1)
    expect(bar.tick(400).state).toBe('run')
    const finished = bar.finish(400)
    expect(finished.state).toBe('idle')
    expect(finished.scale).toBe(0)
  })
})
