/**
 * Page break. Shards are clones, so Vue keeps owning the real nodes.
 * Full motion pops them up and lets them bounce. Reduced motion is a short
 * opacity fade and a static crack, with no translation.
 */

export interface Shard {
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  width: number
  height: number
}

export interface ShardPlan {
  fall: boolean
  fade: boolean
  vx: number
  vy: number
  vr: number
}

const GRAVITY = 2200

export function burst(index: number): { vx: number, vy: number, vr: number } {
  const n = fract(Math.sin(index * 12.9898) * 43758.5453)
  const m = fract(Math.sin(index * 78.233 + 1.7) * 12345.678)
  return {
    vx: (n - 0.5) * 560,
    vy: -280 - m * 320,
    vr: (n - 0.5) * 320,
  }
}

export function planBreak(reduced: boolean, index: number): ShardPlan {
  if (reduced) return { fall: false, fade: true, vx: 0, vy: 0, vr: 0 }
  const pop = burst(index)
  return { fall: true, fade: false, ...pop }
}

export function stepShards(shards: readonly Shard[], dt: number, floor: number, width: number): Shard[] {
  if (!Number.isFinite(dt) || dt < 0) throw new Error(`dt must be >= 0, got ${dt}`)
  if (!(floor > 0) || !(width > 0)) throw new Error(`floor and width must be positive, got ${floor} ${width}`)
  return shards.map(shard => {
    let { x, y, vx, vy, rot, vr } = shard
    vy += GRAVITY * dt
    vx *= Math.max(0, 1 - dt * 0.35)
    x += vx * dt
    y += vy * dt
    rot += vr * dt
    const bottom = floor - shard.height
    if (y > bottom) {
      y = bottom
      vy = -vy * 0.32
      vx *= 0.62
      vr *= 0.55
      if (Math.abs(vy) < 70) vy = 0
      if (Math.abs(vx) < 12) vx = 0
      if (Math.abs(vr) < 8) vr = 0
    }
    if (x < 0) {
      x = 0
      vx = Math.abs(vx) * 0.45
    }
    const right = width - shard.width
    if (x > right) {
      x = right
      vx = -Math.abs(vx) * 0.45
    }
    return { ...shard, x, y, vx, vy, rot, vr }
  })
}

function fract(n: number): number {
  return n - Math.floor(n)
}

interface Held {
  el: HTMLElement
  x: number
  y: number
  vx: number
  vy: number
  rot: number
  vr: number
  width: number
  height: number
  originX: number
  originY: number
}

export interface Rubble {
  reduced: boolean
  restore: (immediate?: boolean) => void
}

export function beginRubble(reduced: boolean): Rubble {
  const nodes = [...document.querySelectorAll<HTMLElement>('[data-shard]')]
  const cracks = mountCracks()
  const previousOverflow = document.documentElement.style.overflow
  document.documentElement.style.overflow = 'hidden'

  if (reduced) {
    let frame = 0
    const started = performance.now()
    const fadeMs = 220
    const tick = (now: number) => {
      const u = Math.min(1, (now - started) / fadeMs)
      const dip = u < 0.5 ? 1 - u * 1.2 : 0.4 + (u - 0.5) * 1.2
      const opacity = String(Math.max(0.4, Math.min(1, dip)))
      for (const el of nodes) el.style.opacity = opacity
      cracks.style.opacity = String(Math.min(1, u * 1.4))
      if (u < 1) frame = requestAnimationFrame(tick)
      else {
        for (const el of nodes) el.style.opacity = ''
        cracks.style.opacity = '1'
      }
    }
    frame = requestAnimationFrame(tick)
    return {
      reduced: true,
      restore(immediate?: boolean) {
        cancelAnimationFrame(frame)
        for (const el of nodes) el.style.opacity = ''
        document.documentElement.style.overflow = previousOverflow
        if (immediate) cracks.remove()
        else fadeOut(cracks, () => cracks.remove())
      },
    }
  }

  document.documentElement.classList.add('rex-shattered')
  const overlay = document.createElement('div')
  overlay.className = 'rex-rubble'
  overlay.setAttribute('data-test', 'page-rubble')
  const held: Held[] = nodes.map((el, index) => {
    const rect = el.getBoundingClientRect()
    const pop = burst(index)
    const clone = el.cloneNode(true) as HTMLElement
    clone.style.position = 'fixed'
    clone.style.margin = '0'
    clone.style.left = `${rect.left}px`
    clone.style.top = `${rect.top}px`
    clone.style.width = `${rect.width}px`
    clone.style.height = `${rect.height}px`
    clone.style.boxSizing = 'border-box'
    clone.style.transformOrigin = 'center center'
    clone.style.zIndex = String(40 + index)
    clone.style.pointerEvents = 'none'
    overlay.appendChild(clone)
    return {
      el: clone,
      x: rect.left,
      y: rect.top,
      vx: pop.vx,
      vy: pop.vy,
      rot: 0,
      vr: pop.vr,
      width: rect.width,
      height: rect.height,
      originX: rect.left,
      originY: rect.top,
    }
  })
  document.body.appendChild(overlay)
  cracks.style.opacity = '1'

  let alive = true
  let mode: 'fall' | 'snap' = 'fall'
  let snapT = 0
  let from = held.map(shard => ({ x: shard.x, y: shard.y, rot: shard.rot }))
  let last = performance.now()
  let frame = 0

  const paint = (shard: Held) => {
    shard.el.style.left = `${shard.x}px`
    shard.el.style.top = `${shard.y}px`
    shard.el.style.transform = `rotate(${shard.rot}deg)`
  }

  const finish = () => {
    if (!alive) return
    alive = false
    cancelAnimationFrame(frame)
    overlay.remove()
    cracks.remove()
    document.documentElement.classList.remove('rex-shattered')
    document.documentElement.style.overflow = previousOverflow
  }

  const tick = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.034, Math.max(0, (now - last) / 1000))
    last = now
    if (mode === 'fall') {
      const next = stepShards(held, dt, window.innerHeight - 8, window.innerWidth)
      next.forEach((shard, index) => {
        held[index].x = shard.x
        held[index].y = shard.y
        held[index].vx = shard.vx
        held[index].vy = shard.vy
        held[index].rot = shard.rot
        held[index].vr = shard.vr
        paint(held[index])
      })
    } else {
      snapT += dt
      const u = Math.min(1, snapT / 0.32)
      const e = 1 + 1.4 * (u - 1) ** 3 + 0.4 * (u - 1) ** 2
      held.forEach((shard, index) => {
        shard.x = from[index].x + (shard.originX - from[index].x) * e
        shard.y = from[index].y + (shard.originY - from[index].y) * e
        shard.rot = from[index].rot * (1 - u)
        paint(shard)
      })
      cracks.style.opacity = String(1 - u)
      if (u >= 1) {
        finish()
        return
      }
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)

  return {
    reduced: false,
    restore(immediate?: boolean) {
      if (!alive) return
      if (immediate) {
        finish()
        return
      }
      if (mode === 'snap') return
      mode = 'snap'
      snapT = 0
      from = held.map(shard => ({ x: shard.x, y: shard.y, rot: shard.rot }))
    },
  }
}

function mountCracks(): HTMLElement {
  const cracks = document.createElement('div')
  cracks.className = 'rex-cracks'
  cracks.setAttribute('data-test', 'page-cracks')
  cracks.style.opacity = '0'
  const width = window.innerWidth
  const height = window.innerHeight
  cracks.innerHTML = `<svg viewBox="0 0 ${width} ${height}" width="100%" height="100%" fill="none" aria-hidden="true">
    <path d="M${width * 0.18} 0 L${width * 0.28} ${height * 0.22} L${width * 0.2} ${height * 0.48} L${width * 0.34} ${height}" />
    <path d="M${width * 0.28} ${height * 0.22} L${width * 0.46} ${height * 0.3} L${width * 0.42} ${height * 0.62}" />
    <path d="M${width * 0.72} 0 L${width * 0.64} ${height * 0.18} L${width * 0.78} ${height * 0.4} L${width * 0.6} ${height}" />
    <path d="M${width * 0.64} ${height * 0.18} L${width * 0.5} ${height * 0.28}" />
  </svg>`
  document.body.appendChild(cracks)
  return cracks
}

function fadeOut(el: HTMLElement, done: () => void): void {
  const started = performance.now()
  const tick = (now: number) => {
    const u = Math.min(1, (now - started) / 180)
    el.style.opacity = String(1 - u)
    if (u < 1) requestAnimationFrame(tick)
    else done()
  }
  requestAnimationFrame(tick)
}
