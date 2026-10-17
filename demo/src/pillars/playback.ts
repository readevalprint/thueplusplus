export interface TraceStep {
  operator: string
  stateBefore: string
  stateAfter: string
  replacement: string
}

export interface ProofFrame {
  state: string
  stdout: string
}

const refusedToken = /^ERR:resource:(\S+)$/

export function visibleNewlines(text: string): string {
  return text.replaceAll('\n', '↵').replaceAll('\r', '␍')
}

export function meterWidth(used: number, cap: number): number {
  if (!Number.isFinite(used) || used < 0) throw new Error(`meter used must be >= 0, got ${used}`)
  if (!Number.isFinite(cap) || cap <= 0) throw new Error(`meter cap must be > 0, got ${cap}`)
  return Math.min(100, (used / cap) * 100)
}

/** One frame per trace event, after the state the run started from. The last frame is the engine's stdout and state. */
export function proofFrames(trace: readonly TraceStep[] | undefined, stdout: string, state: string): ProofFrame[] {
  if (!trace || trace.length === 0) return [{ state, stdout }]
  const frames: ProofFrame[] = [{ state: trace[0].stateBefore, stdout: '' }]
  let written = ''
  for (const event of trace) {
    if (event.operator === '::>') written = stdout
    frames.push({ state: event.stateAfter, stdout: written })
  }
  const last = frames[frames.length - 1]
  if (last.state !== state || last.stdout !== stdout) frames.push({ state, stdout })
  return frames
}

/** Resource names the trace shows as unbound, minus the names the run actually bound. */
export function refusedResources(trace: readonly TraceStep[] | undefined, bound: readonly string[]): string[] {
  const names: string[] = []
  for (const event of trace ?? []) {
    for (const text of [event.replacement, event.stateAfter, event.stateBefore]) {
      const match = refusedToken.exec(text)
      if (!match) continue
      const name = match[1]
      if (bound.includes(name) || names.includes(name)) continue
      names.push(name)
    }
  }
  return names
}
