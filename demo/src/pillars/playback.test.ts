import { describe, expect, it } from 'vitest'
import { meterWidth, proofFrames, refusedResources, visibleNewlines, type TraceStep } from './playback'
import { portableInput, portableRequest, sandboxLimits, sandboxRequest, sandboxSource } from './programs'

const trace: TraceStep[] = [
  { operator: '::>', stateBefore: 'start', stateAfter: '', replacement: '' },
  { operator: '::>', stateBefore: '', stateAfter: 'ERR:resource:socket', replacement: 'ERR:resource:socket' },
  { operator: '::=', stateBefore: 'ERR:resource:socket', stateAfter: 'a', replacement: 'a' },
  { operator: '::=', stateBefore: 'a', stateAfter: 'aa', replacement: 'aa' },
]

describe('playback', () => {
  it('keeps one stdout and ends on the engine result', () => {
    const frames = proofFrames(trace, 'in\n', 'aa')
    expect(frames[0]).toEqual({ state: 'start', stdout: '' })
    expect(frames[1]).toEqual({ state: '', stdout: 'in\n' })
    expect(frames[frames.length - 1]).toEqual({ state: 'aa', stdout: 'in\n' })
    expect(visibleNewlines('in\n')).toBe('in↵')
  })

  it('names the unbound resource and ignores a bound one', () => {
    expect(refusedResources(trace, ['stdin', 'stdout', 'stderr'])).toEqual(['socket'])
    expect(refusedResources(trace, ['socket'])).toEqual([])
  })

  it('rejects a meter that has no positive cap', () => {
    expect(meterWidth(4, 4)).toBe(100)
    expect(meterWidth(19, 64)).toBeCloseTo(29.6875)
    expect(() => meterWidth(1, 0)).toThrow(/meter cap/)
    expect(() => meterWidth(-1, 4)).toThrow(/meter used/)
  })

  it('runs hello from its own initial state and caps the sandbox run', () => {
    expect(portableInput).toBe('START')
    const portable = portableRequest()
    expect(portable.sourcePath).toBe('examples/hello/hello.thue')
    expect(portable.input).toBe('START')
    expect(portable.trace).toBe(true)
    const sandbox = sandboxRequest()
    expect(sandbox.maxSteps).toBe(sandboxLimits.maxSteps)
    expect(sandbox.maxEvals).toBe(sandboxLimits.maxEvals)
    expect(sandbox.maxStateBytes).toBe(sandboxLimits.maxStateBytes)
    expect(sandbox.sourceText).toBe(sandboxSource)
    expect(sandbox.sourceText).toContain('::> stdout')
    expect(sandbox.sourceText).toContain('::> socket')
    expect(sandbox.input).toBe('start')
  })
})