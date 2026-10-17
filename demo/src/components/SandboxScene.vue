<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import Rex from './Rex.vue'
import {
  BELT_H,
  BELT_TOP,
  BELT_X0,
  CAGE_BASE,
  CAGE_H,
  CAGE_W,
  CAGE_X,
  GROUND,
  LEVER_LEN,
  LEVER_PIVOT,
  MACHINE_S,
  MACHINE_X,
  MACHINE_Y,
  SCALE,
  SCAN_TOP,
  SCORE_LABEL_SIZE,
  SCORE_LABEL_Y,
  SCORE_NUMBER_SIZE,
  SCORE_NUMBER_Y,
  SCORE_X,
  TUNNEL_BOTTOM,
  TUNNEL_DEEP,
  TUNNEL_LIP,
  VIEW_H,
  VIEW_W,
  WINDOW_H,
  WINDOW_W,
  WINDOW_X,
  WINDOW_Y,
  beltPoint,
  flapBend,
  flapXs,
  scanLineX,
  scannerAperture,
  scoreFlashRadius,
  scoreNumberCenterY,
  cageOrigin,
  leverDegrees,
  leverKnob,
} from '@/sandbox/layout'
import { MACHINE_D } from '@/sandbox/machine'
import { framePose, settledSpring, type Pose, type Spring } from '@/sandbox/motion'
import {
  beginAutoplay,
  createGame,
  demoRuns,
  difficulty,
  inZone,
  playerAct,
  scoreJump,
  step,
  type Box,
  type Game,
} from '@/sandbox/game'

const BEST_KEY = 'rex-sandbox-best'

const emit = defineEmits<{ break: [reduced: boolean], rebuilt: [], offer: [value: boolean] }>()

function motionReduced(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

const reduced = ref(motionReduced())
const inView = ref(true)
const pageHidden = ref(false)
const sceneEl = ref<HTMLElement | null>(null)
const game = ref<Game>(beginAutoplay(createGame({
  seed: import.meta.env.MODE === 'test' ? 1 : freshSeed(),
  reduced: reduced.value,
  best: typeof localStorage === 'undefined' ? 0 : readBest(),
})))
const clock = ref(0)
const spring = ref<Spring>(settledSpring())
const pose = ref<Pose>(restPose(false))
const beltScroll = ref(0)
const floatFrom = ref<{ x: number, y: number } | null>(null)
const status = ref('Rex is waiting. Pull the lever to start.')
let raf = 0
let last = 0
let observer: IntersectionObserver | undefined
let media: MediaQueryList | undefined
let onMedia: (() => void) | undefined
let onWindowKey: ((event: KeyboardEvent) => void) | undefined

function restPose(isReduced: boolean): Pose {
  return framePose({ mode: 'idle', t: 0, clock: 0, lever: 0, reduced: isReduced, spring: settledSpring(), dt: 0 })
}

function freshSeed(): number {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return buf[0] === 0 ? 1 : buf[0]
}

function readBest(): number {
  const raw = localStorage.getItem(BEST_KEY)
  if (raw === null) return 0
  if (!/^\d+$/.test(raw)) {
    localStorage.removeItem(BEST_KEY)
    return 0
  }
  const n = Number(raw)
  if (!Number.isSafeInteger(n) || n < 0) return 0
  return n
}

function note(): void {
  const current = game.value
  if (current.phase === 'broken') status.value = 'A box got through. The page broke.'
  else if (current.control === 'auto') status.value = 'Rex is playing. Your turn to take over.'
  else if (current.miss > 0) status.value = `Miss. Score ${current.score}.`
  else status.value = `Score ${current.score}.`
}

note()
syncPose(0)

function syncPose(dt: number): void {
  const next = framePose({
    mode: game.value.rex,
    t: game.value.rexT,
    clock: clock.value,
    lever: game.value.lever,
    reduced: reduced.value,
    spring: spring.value,
    dt,
  })
  spring.value = next.spring
  pose.value = next
}

function commit(next: Game, dt: number): void {
  const before = game.value
  if (next.score > before.score) floatFrom.value = beltPoint(0.92)
  game.value = next
  syncPose(dt)
  if (next.phase === 'broken' && before.phase !== 'broken') {
    if (before.control === 'player') {
      const stored = readBest()
      if (next.best > stored) localStorage.setItem(BEST_KEY, String(next.best))
    }
    emit('break', next.reduced)
    note()
  } else if (before.phase === 'broken' && next.phase !== 'broken') {
    emit('rebuilt')
    note()
  } else if (next.score !== before.score || next.control !== before.control || next.miss !== before.miss) note()
}

function applyReduced(isReduced: boolean): void {
  reduced.value = isReduced
  game.value = { ...game.value, reduced: isReduced }
  syncPose(0)
}

const diff = computed(() => difficulty(game.value.score, game.value.reduced))
const offerTurn = computed(() => game.value.control === 'auto' || game.value.phase === 'broken')
const rexLabel = computed(() => (
  offerTurn.value ? 'Your turn. Take over the lever.' : 'Rex. Pull the lever.'
))
const leverLabel = computed(() => (
  offerTurn.value ? 'Your turn. Take over the lever.' : 'Pull the lever to sandbox the box.'
))
const leverHint = computed(() => (offerTurn.value ? 'your turn' : 'pull the lever'))
watch(offerTurn, value => emit('offer', value), { immediate: true })
const leverAngle = computed(() => leverDegrees(game.value.lever))
const tickOffset = computed(() => (reduced.value || !game.value.beltOn ? 0 : -(beltScroll.value % 16)))
const jump = computed(() => scoreJump(
  game.value.pop,
  game.value.streak,
  Math.max(diff.value.beltRate, 0.01),
  reduced.value,
))
const numberCenterY = computed(() => scoreNumberCenterY())
const flashRadius = computed(() => scoreFlashRadius(jump.value.scale, reduced.value ? 0 : jump.value.flash))
const scoreTransform = computed(() => {
  const scale = jump.value.scale
  const y = numberCenterY.value
  return `translate(${SCORE_X} ${y}) scale(${scale}) translate(${-SCORE_X} ${-y})`
})
const floatPos = computed(() => {
  const from = floatFrom.value ?? beltPoint(1)
  const travel = jump.value.travel
  return {
    x: from.x + (SCORE_X - 80 - from.x) * travel,
    y: from.y - 36 + (numberCenterY.value - (from.y - 36)) * travel,
  }
})
const aperture = computed(() => scannerAperture(diff.value.span))
const entranceFlaps = computed(() => flapXs(TUNNEL_LIP))
const exitFlaps = computed(() => flapXs(TUNNEL_DEEP))
const zoneLeft = computed(() => Math.min(aperture.value.entrance, aperture.value.exit))
const scanned = computed(() => game.value.boxes
  .filter(box => inZone(box.progress, game.value.score, game.value.reduced))
  .sort((a, b) => b.progress - a.progress || a.id - b.id)[0])
const scanX = computed(() => {
  const lead = scanned.value
  if (!lead) return null
  return scanLineX(clock.value, reduced.value, WINDOW_X, WINDOW_X + WINDOW_W, beltPoint(lead.progress).x)
})
const scannerTransform = computed(() => {
  if (reduced.value || game.value.jolt === 0) return 'translate(0 0)'
  const jolt = game.value.jolt
  const shakeX = Math.sin(clock.value * 48) * jolt * 8
  const shakeY = Math.cos(clock.value * 39) * jolt * 5
  const rot = Math.sin(clock.value * 54) * jolt * 2.5
  const pivotX = (aperture.value.entrance + aperture.value.exit) / 2
  const pivotY = (SCAN_TOP + BELT_TOP) / 2
  return `translate(${shakeX} ${shakeY}) rotate(${rot} ${pivotX} ${pivotY})`
})

function flapTransform(x: number): string {
  let bend = 0
  for (const box of game.value.boxes) {
    const next = flapBend(x, beltPoint(box.progress).x)
    if (Math.abs(next) > Math.abs(bend)) bend = next
  }
  return `rotate(${bend.toFixed(2)} ${x} ${SCAN_TOP})`
}
const rexBox = computed(() => pct(pose.value.rootX - 78, pose.value.rootY - 268, 160, 286))
const leverBox = computed(() => {
  const knob = leverKnob(game.value.lever)
  return {
    left: `${(knob.x / VIEW_W) * 100}%`,
    top: `${(knob.y / VIEW_H) * 100}%`,
    width: '64px',
    height: '72px',
    transform: 'translate(-50%, -70%)',
  }
})

function pct(x: number, y: number, w: number, h: number): Record<string, string> {
  return {
    left: `${(x / VIEW_W) * 100}%`,
    top: `${(y / VIEW_H) * 100}%`,
    width: `${(w / VIEW_W) * 100}%`,
    height: `${(h / VIEW_H) * 100}%`,
  }
}

function boxTransform(box: Box): string {
  const point = beltPoint(box.progress)
  const hot = inZone(box.progress, game.value.score, game.value.reduced)
  const scale = hot ? 1.12 : 1
  return `translate(${point.x} ${point.y}) scale(${scale})`
}

function act(): void {
  const before = game.value
  const hot = before.control === 'player'
    ? before.boxes
      .filter(box => inZone(box.progress, before.score, before.reduced))
      .sort((a, b) => b.progress - a.progress || a.id - b.id)[0]
    : undefined
  commit(playerAct(before), 0)
  if (hot && game.value.score === before.score + 1) floatFrom.value = beltPoint(hot.progress)
}

function onButtonKey(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (event.repeat) return
  event.preventDefault()
  event.stopPropagation()
  act()
}

function tick(now: number): void {
  if (!demoRuns(document.hidden, inView.value)) {
    raf = 0
    last = 0
    return
  }
  const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000)
  last = now
  if (dt > 0) {
    clock.value += reduced.value ? 0 : dt
    if (game.value.beltOn && !reduced.value && game.value.phase === 'playing') {
      beltScroll.value += dt * diff.value.beltRate * 220
    }
    const miss = game.value.miss
    commit(step(game.value, dt), dt)
    if (miss > 0 && game.value.miss === 0) note()
  }
  raf = requestAnimationFrame(tick)
}

function stopLoop(): void {
  cancelAnimationFrame(raf)
  raf = 0
  last = 0
}

function startLoop(): void {
  if (import.meta.env.MODE === 'test') return
  if (!demoRuns(document.hidden, inView.value)) return
  if (raf === 0) raf = requestAnimationFrame(tick)
}

function onVisibility(): void {
  pageHidden.value = document.hidden
  if (!demoRuns(document.hidden, inView.value)) {
    stopLoop()
    return
  }
  startLoop()
}

function advance(dt: number): void {
  if (!Number.isFinite(dt) || dt < 0) throw new Error(`dt must be >= 0, got ${dt}`)
  if (dt === 0) return
  clock.value += reduced.value ? 0 : dt
  const miss = game.value.miss
  commit(step(game.value, dt), dt)
  if (miss > 0 && game.value.miss === 0) note()
}

onMounted(() => {
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (media.matches !== reduced.value) applyReduced(media.matches)
  onMedia = () => applyReduced(media?.matches ?? false)
  media.addEventListener('change', onMedia)
  onWindowKey = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    if (event.repeat) return
    const target = event.target
    if (target instanceof HTMLElement) {
      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'A' || tag === 'BUTTON') return
    }
    event.preventDefault()
    act()
  }
  window.addEventListener('keydown', onWindowKey)
  document.addEventListener('visibilitychange', onVisibility)
  pageHidden.value = document.hidden
  if (typeof IntersectionObserver === 'function' && sceneEl.value) {
    observer = new IntersectionObserver(entries => {
      inView.value = entries.some(entry => entry.isIntersecting)
      if (!demoRuns(document.hidden, inView.value)) stopLoop()
      else startLoop()
    })
    observer.observe(sceneEl.value)
  }
  if (import.meta.env.MODE === 'test') return
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (media && onMedia) media.removeEventListener('change', onMedia)
  if (onWindowKey) window.removeEventListener('keydown', onWindowKey)
  document.removeEventListener('visibilitychange', onVisibility)
  observer?.disconnect()
  observer = undefined
  cancelAnimationFrame(raf)
})

defineExpose({ game, advance, act })
</script>

<template>
  <div
    ref="sceneEl"
    class="rex-scene text-bone relative h-full min-h-0 w-full"
    data-test="sandbox-scene"
    data-side="yes"
    data-pin
    role="group"
    :aria-label="`Sandbox game. ${status}`"
    :data-belt="game.beltOn ? 'on' : 'off'"
    :data-broken="game.phase === 'broken' ? 'yes' : 'no'"
    :data-reduced="reduced ? 'yes' : 'no'"
    :data-phase="game.phase"
    :data-control="game.control"
    :data-paused="pageHidden || !inView ? 'yes' : 'no'"
    :data-score="game.score"
    :data-miss="game.miss > 0 ? 'yes' : 'no'"
  >
    <svg
      class="rex-svg absolute inset-0"
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <filter id="rex-belt-blur" x="-8%" y="-40%" width="116%" height="200%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <linearGradient id="rex-belt-fade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.48" stop-color="black" />
          <stop offset="0.66" stop-color="white" />
          <stop offset="1" stop-color="white" />
        </linearGradient>
        <linearGradient id="rex-belt-sharp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0.48" stop-color="white" />
          <stop offset="0.66" stop-color="black" />
          <stop offset="1" stop-color="black" />
        </linearGradient>
        <mask id="rex-belt-left">
          <rect :width="VIEW_W" :height="VIEW_H" fill="url(#rex-belt-fade)" />
        </mask>
        <mask id="rex-belt-right">
          <rect :width="VIEW_W" :height="VIEW_H" fill="url(#rex-belt-sharp)" />
        </mask>
      </defs>
      <path data-test="floor" :d="`M0 ${GROUND} H${VIEW_W}`" stroke="currentColor" stroke-width="2" opacity="0.45" />

      <circle
        v-if="flashRadius > 0"
        data-test="score-flash"
        :cx="SCORE_X - 20"
        :cy="numberCenterY"
        :r="flashRadius"
        fill="var(--signal)"
        :opacity="jump.flash * 0.28"
      />
      <g
        data-test="score-jump"
        :data-scale="jump.scale.toFixed(2)"
        :data-flash="jump.flash.toFixed(2)"
        :transform="scoreTransform"
        fill="currentColor"
        font-family="JetBrains Mono, ui-monospace, monospace"
        text-anchor="end"
      >
        <text
          data-test="score"
          :x="SCORE_X"
          :y="SCORE_NUMBER_Y"
          :font-size="SCORE_NUMBER_SIZE"
          :fill="jump.flash > 0.2 ? 'var(--signal)' : 'currentColor'"
        >{{ game.score }}</text>
      </g>
      <g fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" text-anchor="end">
        <text data-test="score-label" :x="SCORE_X" :y="SCORE_LABEL_Y" :font-size="SCORE_LABEL_SIZE" opacity="0.7">score</text>
        <text v-if="game.best > 0" data-test="best" :x="SCORE_X" :y="SCORE_NUMBER_Y + 28" font-size="16" opacity="0.75">best {{ game.best }}</text>
      </g>

      <g
        v-if="game.control === 'auto' && game.rex !== 'cheer'"
        data-test="speech"
        :transform="`translate(${pose.rootX - 180} ${pose.rootY - 372})`"
      >
        <path
          data-test="speech-bubble"
          d="M0 18 C0 6 10 0 24 0 H188 C204 0 214 8 214 22 V58 C214 72 204 80 188 80 H46 L22 102 L28 80 H24 C10 80 0 74 0 62 Z"
          fill="var(--surface)"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linejoin="round"
        />
        <text
          data-test="speech-text"
          x="107"
          y="32"
          fill="currentColor"
          font-family="JetBrains Mono, ui-monospace, monospace"
          font-size="15"
          text-anchor="middle"
        >i guess we</text>
        <text
          x="107"
          y="54"
          fill="currentColor"
          font-family="JetBrains Mono, ui-monospace, monospace"
          font-size="15"
          text-anchor="middle"
        >sandboxin' now</text>
      </g>

      <g :transform="`translate(${pose.rootX} ${pose.rootY}) scale(${SCALE})`">
        <Rex :pose="pose" />
      </g>

      <g data-test="lever" :data-on="game.lever >= 0.5 ? 'yes' : 'no'">
        <rect :x="LEVER_PIVOT.x - 18" :y="GROUND - 16" width="36" height="16" rx="2" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <g :transform="`rotate(${leverAngle} ${LEVER_PIVOT.x} ${LEVER_PIVOT.y})`">
          <line :x1="LEVER_PIVOT.x" :y1="LEVER_PIVOT.y" :x2="LEVER_PIVOT.x" :y2="LEVER_PIVOT.y - LEVER_LEN" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
          <circle :cx="LEVER_PIVOT.x" :cy="LEVER_PIVOT.y - LEVER_LEN" r="9" fill="var(--signal)" stroke="currentColor" stroke-width="2" />
        </g>
      </g>

      <text
        data-test="start-hint"
        :x="LEVER_PIVOT.x"
        :y="BELT_TOP - 72"
        text-anchor="middle"
        fill="currentColor"
        font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="16"
      >{{ leverHint }}</text>
      <text
        v-if="game.miss > 0"
        data-test="miss"
        :x="SCORE_X"
        :y="SCORE_NUMBER_Y + 52"
        fill="var(--signal)"
        font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="18"
        text-anchor="end"
        :opacity="Math.min(1, game.miss + 0.25)"
      >miss</text>
      <text
        v-if="game.rex === 'cheer'"
        data-test="cheer"
        :x="pose.rootX"
        :y="pose.rootY - 278"
        fill="var(--signal)"
        font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="20"
        text-anchor="middle"
      >yeah</text>

      <g data-test="belt" data-span="full" :data-running="game.beltOn ? 'yes' : 'no'">
        <rect :x="BELT_X0" :y="BELT_TOP" :width="VIEW_W" :height="BELT_H" fill="var(--gutter)" stroke="currentColor" stroke-width="3" />
        <rect data-test="belt-surface" :x="BELT_X0" :y="BELT_TOP - 14" :width="VIEW_W" height="16" fill="var(--dim)" stroke="currentColor" stroke-width="3" />
        <clipPath id="rex-belt-clip">
          <rect :x="BELT_X0" :y="BELT_TOP + 8" :width="VIEW_W" :height="BELT_H - 16" />
        </clipPath>
        <g clip-path="url(#rex-belt-clip)">
          <g :transform="`translate(${tickOffset} 0)`" stroke="currentColor" stroke-width="2.2" opacity="0.72">
            <line v-for="mark in 96" :key="mark" :x1="mark * 18" :y1="BELT_TOP + 10" :x2="mark * 18 - 14" :y2="BELT_TOP + BELT_H - 6" />
          </g>
        </g>
      </g>

      <g
        v-for="box in game.boxes"
        :key="box.id"
        data-test="box"
        :data-progress="box.progress.toFixed(3)"
        :data-zone="inZone(box.progress, game.score, game.reduced) ? 'yes' : 'no'"
        :transform="boxTransform(box)"
      >
        <template v-if="inZone(box.progress, game.score, game.reduced)">
          <rect data-test="x-ray" x="-24" y="-42" width="48" height="46" rx="3" fill="var(--signal)" opacity="0.22" />
          <rect x="-18" y="-36" width="36" height="36" rx="2" fill="var(--signal)" opacity="0.42" stroke="var(--bone)" stroke-width="1.6" />
          <path data-test="x-ray-silhouette" d="M-18 -18 H18 M0 -36 V0" fill="none" stroke="var(--bone)" stroke-width="1.8" opacity="0.95" />
        </template>
        <template v-else>
          <rect x="-18" y="-36" width="36" height="36" rx="2" fill="var(--surface)" stroke="currentColor" stroke-width="2.4" />
          <path d="M-18 -18 H18 M0 -36 V0" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
        </template>
      </g>

      <g data-test="scanner" data-test-machine="sketch" :data-scanning="scanned ? 'yes' : 'no'" :transform="scannerTransform">
        <g
          data-test="machine"
          :transform="`translate(${MACHINE_X} ${MACHINE_Y}) scale(${MACHINE_S})`"
          fill="currentColor"
        >
          <g transform="translate(0 500) scale(0.1 -0.1)">
            <path :d="MACHINE_D" />
          </g>
        </g>
        <rect
          data-test="capture-zone"
          :x="zoneLeft"
          :y="SCAN_TOP"
          :width="aperture.width"
          :height="TUNNEL_BOTTOM - SCAN_TOP"
          fill="none"
        />
      </g>

      <g data-test="belt-blur" filter="url(#rex-belt-blur)" mask="url(#rex-belt-left)" opacity="0.9">
        <rect :x="BELT_X0" :y="BELT_TOP - 14" :width="VIEW_W" height="16" fill="var(--dim)" />
        <rect :x="BELT_X0" :y="BELT_TOP" :width="VIEW_W" :height="BELT_H" fill="var(--gutter)" />
        <g v-for="box in game.boxes" :key="`blur-${box.id}`" :transform="boxTransform(box)">
          <rect x="-18" y="-36" width="36" height="36" fill="var(--raised)" />
        </g>
      </g>

      <text
        v-if="game.pop > 0 && !reduced && floatFrom"
        data-test="score-float"
        :x="floatPos.x"
        :y="floatPos.y"
        fill="var(--signal)"
        font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="22"
        text-anchor="middle"
        :opacity="Math.min(1, game.pop + 0.2)"
      >+1</text>

      <line
        v-if="scanX !== null"
        data-test="scan-line"
        :x1="scanX"
        :x2="scanX"
        :y1="WINDOW_Y + 4"
        :y2="WINDOW_Y + WINDOW_H - 4"
        stroke="var(--signal)"
        stroke-width="2.5"
        stroke-linecap="round"
        opacity="0.9"
      />
      <g data-test="scanner-flaps" fill="var(--surface)" stroke="currentColor" stroke-width="1.6">
        <g v-for="(x, index) in entranceFlaps" :key="`in-${index}`" data-test="scanner-flap" data-edge="entrance" :transform="flapTransform(x)">
          <rect :x="x - 4" :y="SCAN_TOP" width="8" :height="TUNNEL_BOTTOM - SCAN_TOP" rx="1.5" opacity="0.92" />
        </g>
        <g v-for="(x, index) in exitFlaps" :key="`out-${index}`" data-test="scanner-flap" data-edge="exit" :transform="flapTransform(x)">
          <rect :x="x - 4" :y="SCAN_TOP" width="8" :height="TUNNEL_BOTTOM - SCAN_TOP" rx="1.5" opacity="0.92" />
        </g>
      </g>

      <g data-test="jail">
        <rect :x="CAGE_X - 8" :y="GROUND - 10" width="60" height="10" rx="1" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <g v-if="game.cages.length === 0" :transform="`translate(${CAGE_X} ${CAGE_BASE})`">
          <rect :width="CAGE_W" :height="CAGE_H" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
          <g stroke="currentColor" stroke-width="1.6">
            <line x1="14" y1="2" x2="14" :y2="CAGE_H - 2" />
            <line x1="22" y1="2" x2="22" :y2="CAGE_H - 2" />
            <line x1="30" y1="2" x2="30" :y2="CAGE_H - 2" />
          </g>
        </g>
      </g>

      <g
        v-for="(cage, index) in game.cages"
        :key="`cage-${cage.id}`"
        data-test="cage"
        :transform="`translate(${cageOrigin(index).x} ${cageOrigin(index).y})`"
      >
        <rect :width="CAGE_W" :height="CAGE_H" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <g stroke="currentColor" stroke-width="1.6">
          <line x1="14" y1="2" x2="14" :y2="CAGE_H - 2" />
          <line x1="22" y1="2" x2="22" :y2="CAGE_H - 2" />
          <line x1="30" y1="2" x2="30" :y2="CAGE_H - 2" />
        </g>
        <g transform="translate(22 22) scale(0.5)">
          <rect x="-14" y="-14" width="28" height="28" rx="1.5" fill="var(--raised)" stroke="currentColor" stroke-width="2" />
          <path d="M-14 0 H14 M0 -14 V14" stroke="currentColor" stroke-width="1.2" opacity="0.5" />
        </g>
      </g>

      <g v-if="game.phase === 'broken'" data-test="scene-cracks" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
        <path d="M70 18 L128 96 L104 168 L176 250 L150 340" />
        <path d="M128 96 L210 132 L248 210" />
        <path d="M560 12 L520 90 L600 150 L548 240 L620 340" />
      </g>
    </svg>

    <button
      type="button"
      class="rex-hit"
      data-test="rex"
      :style="rexBox"
      :aria-label="rexLabel"
      aria-keyshortcuts="Space Enter"
      @click="act"
      @keydown="onButtonKey"
    />
    <button
      type="button"
      class="rex-hit"
      data-test="lever-hit"
      :style="leverBox"
      :aria-label="leverLabel"
      aria-keyshortcuts="Space Enter"
      @click="act"
      @keydown="onButtonKey"
    />
    <p class="sr-only" aria-live="polite" data-test="scene-status">{{ status }}</p>
  </div>
</template>
