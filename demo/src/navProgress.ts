export type NavProgressState = 'idle' | 'run' | 'done' | 'fade'

export interface NavProgressSnapshot {
  scale: number
  state: NavProgressState
}

const RUN_CEILING = 0.9
const RUN_TAU_MS = 700
const DONE_MS = 450
const FADE_MS = 220

export function createNavProgress(reduced: () => boolean) {
  let scale = 0
  let state: NavProgressState = 'idle'
  let started = 0

  function snapshot(): NavProgressSnapshot {
    return { scale, state }
  }

  function start(now: number): NavProgressSnapshot {
    state = 'run'
    started = now
    scale = reduced() ? 1 : 0.08
    return snapshot()
  }

  function tick(now: number): NavProgressSnapshot {
    if (state === 'run' && !reduced()) {
      const elapsed = Math.max(0, now - started)
      scale = Math.max(scale, RUN_CEILING * (1 - Math.exp(-elapsed / RUN_TAU_MS)))
    } else if (state === 'done' && !reduced() && now - started >= DONE_MS) {
      state = 'fade'
      started = now
    } else if (state === 'fade' && !reduced() && now - started >= FADE_MS) {
      state = 'idle'
      scale = 0
    }
    return snapshot()
  }

  function finish(now: number): NavProgressSnapshot {
    if (reduced()) {
      state = 'idle'
      scale = 0
      return snapshot()
    }
    state = 'done'
    started = now
    scale = 1
    return snapshot()
  }

  function fail(): NavProgressSnapshot {
    state = 'idle'
    scale = 0
    return snapshot()
  }

  return { start, tick, finish, fail, snapshot }
}
