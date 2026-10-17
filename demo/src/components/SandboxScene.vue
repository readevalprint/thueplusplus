<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import Rex from './Rex.vue'
import {
  BELT_H,
  BELT_MOUTH,
  BELT_TOP,
  BELT_X0,
  CAGE_BASE,
  CAGE_H,
  CAGE_W,
  CAGE_X,
  GROUND,
  LEVER_LEN,
  LEVER_PIVOT,
  MACHINE,
  SCALE,
  VIEW_H,
  VIEW_W,
  beltPoint,
  cageOrigin,
  leverDegrees,
  leverKnob,
} from '@/sandbox/layout'
import { framePose, settledSpring, type Pose, type Spring } from '@/sandbox/motion'
import {
  createGame,
  difficulty,
  inZone,
  pull as pullGame,
  rebuild as rebuildGame,
  scoreJump,
  step,
  type Box,
  type Game,
} from '@/sandbox/game'

const BEST_KEY = 'rex-sandbox-best'

const portholeScrews = [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({
  cx: 112 + Math.cos((n / 8) * Math.PI * 2) * 30,
  cy: 112 + Math.sin((n / 8) * Math.PI * 2) * 30,
}))

const emit = defineEmits<{ break: [reduced: boolean], rebuilt: [] }>()

const reduced = ref(false)
const game = ref<Game>(createGame({ seed: 1, reduced: false, best: 0 }))
const clock = ref(0)
const spring = ref<Spring>(settledSpring())
const pose = ref<Pose>(restPose(false))
const beltScroll = ref(0)
const floatFrom = ref<{ x: number, y: number } | null>(null)
const status = ref('Rex is waiting. Pull the lever to start.')
let raf = 0
let last = 0
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
  if (current.showRebuild) status.value = `Score ${current.score}. Rebuild puts the page back.`
  else if (current.phase === 'broken') status.value = 'A box got through. The page broke.'
  else if (current.phase === 'waiting') status.value = 'Rex is waiting. Pull the lever to start.'
  else if (current.miss > 0) status.value = `Miss. Score ${current.score}.`
  else status.value = `Score ${current.score}.`
}

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
  const before = game.value.phase
  const wasRebuild = game.value.showRebuild
  game.value = next
  syncPose(dt)
  if (next.phase === 'broken' && before !== 'broken') {
    const stored = readBest()
    if (next.best > stored) localStorage.setItem(BEST_KEY, String(next.best))
    emit('break', next.reduced)
    note()
  } else if (next.showRebuild && !wasRebuild) note()
}

function applyReduced(isReduced: boolean): void {
  reduced.value = isReduced
  game.value = { ...game.value, reduced: isReduced }
  syncPose(0)
}

const diff = computed(() => difficulty(game.value.score, game.value.reduced))
const waiting = computed(() => game.value.phase === 'waiting')
const playing = computed(() => game.value.phase === 'playing')
const controlsOff = computed(() => game.value.phase === 'broken')
const rexLabel = computed(() => (
  waiting.value ? 'Rex. Pull the lever to start' : 'Rex. Pull the lever'
))
const leverLabel = computed(() => (
  waiting.value ? 'Lever. Pull to start' : 'Lever. Pull to sandbox the box'
))
const leverAngle = computed(() => leverDegrees(game.value.lever))
const glass = computed(() => {
  if (reduced.value) return 0.18 + (game.value.flash > 0 ? 0.7 : 0)
  return 0.18 + game.value.flash * 0.75
})
const tickOffset = computed(() => (reduced.value || !game.value.beltOn ? 0 : -(beltScroll.value % 16)))
const zone = computed(() => {
  const start = beltPoint(1 - diff.value.span)
  const end = beltPoint(1)
  return { x: start.x, w: Math.max(8, end.x - start.x) }
})
const SCORE_X = VIEW_W - 36
const SCORE_Y = 58
const jump = computed(() => scoreJump(
  game.value.pop,
  game.value.streak,
  Math.max(diff.value.beltRate, 0.01),
  reduced.value,
))
const scoreTransform = computed(() => {
  const scale = jump.value.scale
  return `translate(${SCORE_X} ${SCORE_Y}) scale(${scale}) translate(${-SCORE_X} ${-SCORE_Y})`
})
const floatPos = computed(() => {
  const from = floatFrom.value ?? beltPoint(1)
  const travel = jump.value.travel
  return {
    x: from.x + (SCORE_X - 80 - from.x) * travel,
    y: from.y - 36 + (SCORE_Y - 18 - (from.y - 36)) * travel,
  }
})
const bubblePath = computed(() => {
  const tipX = pose.value.rootX + 36
  const tipY = pose.value.rootY + (Math.min(pose.value.eyeLY, pose.value.eyeRY) - 8) * SCALE
  const right = Math.min(VIEW_W - 36, tipX + 28)
  const left = right - 268
  const top = 12
  return `M${left + 16} ${top} H${right - 16} Q${right} ${top} ${right} ${top + 16} V${top + 28} L${tipX} ${tipY} L${right - 36} ${top + 64} H${left + 16} Q${left} ${top + 64} ${left} ${top + 48} V${top + 16} Q${left} ${top} ${left + 16} ${top} Z`
})
const speechX = computed(() => {
  const tipX = pose.value.rootX + 36
  const right = Math.min(VIEW_W - 36, tipX + 28)
  return right - 252
})
const machineTransform = computed(() => {
  if (reduced.value || game.value.jolt === 0) return `translate(${MACHINE.x} ${MACHINE.y})`
  const jolt = game.value.jolt
  const shakeX = Math.sin(clock.value * 48) * jolt * 8
  const shakeY = Math.cos(clock.value * 39) * jolt * 5
  const rot = Math.sin(clock.value * 54) * jolt * 2.5
  return `translate(${MACHINE.x + shakeX} ${MACHINE.y + shakeY}) rotate(${rot} 80 150)`
})
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

function pull(): void {
  const before = game.value.score
  const beforeMiss = game.value.miss
  const hot = game.value.boxes
    .filter(box => inZone(box.progress, game.value.score, game.value.reduced))
    .sort((a, b) => b.progress - a.progress || a.id - b.id)[0]
  commit(pullGame(game.value), 0)
  if (hot && game.value.score !== before) floatFrom.value = beltPoint(hot.progress)
  if (game.value.score !== before || game.value.miss !== beforeMiss || game.value.phase !== 'waiting') note()
}

function onRebuild(): void {
  game.value = rebuildGame(game.value)
  floatFrom.value = null
  spring.value = settledSpring()
  syncPose(0)
  note()
  emit('rebuilt')
}

function onButtonKey(event: KeyboardEvent): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (event.repeat) return
  event.preventDefault()
  event.stopPropagation()
  pull()
}

function tick(now: number): void {
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

function advance(dt: number): void {
  if (!Number.isFinite(dt) || dt < 0) throw new Error(`dt must be >= 0, got ${dt}`)
  if (dt === 0) return
  clock.value += reduced.value ? 0 : dt
  const miss = game.value.miss
  commit(step(game.value, dt), dt)
  if (miss > 0 && game.value.miss === 0) note()
}

onMounted(() => {
  const seed = import.meta.env.MODE === 'test' ? 1 : freshSeed()
  game.value = createGame({ seed, reduced: false, best: readBest() })
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  applyReduced(media.matches)
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
    pull()
  }
  window.addEventListener('keydown', onWindowKey)
  if (import.meta.env.MODE === 'test') return
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (media && onMedia) media.removeEventListener('change', onMedia)
  if (onWindowKey) window.removeEventListener('keydown', onWindowKey)
  cancelAnimationFrame(raf)
})

defineExpose({ game, advance })
</script>

<template>
  <div
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
          <stop offset="0" stop-color="white" />
          <stop offset="0.34" stop-color="white" />
          <stop offset="0.52" stop-color="black" />
        </linearGradient>
        <linearGradient id="rex-belt-sharp" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="black" />
          <stop offset="0.34" stop-color="black" />
          <stop offset="0.52" stop-color="white" />
        </linearGradient>
        <mask id="rex-belt-left">
          <rect :width="VIEW_W" :height="VIEW_H" fill="url(#rex-belt-fade)" />
        </mask>
        <mask id="rex-belt-right">
          <rect :width="VIEW_W" :height="VIEW_H" fill="url(#rex-belt-sharp)" />
        </mask>
      </defs>
      <path :d="`M0 ${BELT_TOP + BELT_H + 18} H${VIEW_W}`" stroke="currentColor" stroke-width="2" opacity="0.28" />

      <g
        data-test="score-jump"
        :data-scale="jump.scale.toFixed(2)"
        :data-flash="jump.flash.toFixed(2)"
        :transform="scoreTransform"
        fill="currentColor"
        font-family="JetBrains Mono, ui-monospace, monospace"
        text-anchor="end"
      >
        <circle
          v-if="!reduced && jump.flash > 0"
          :cx="SCORE_X - 18"
          :cy="SCORE_Y - 16"
          :r="22 + jump.flash * 18"
          fill="var(--signal)"
          :opacity="jump.flash * 0.28"
        />
        <text :x="SCORE_X" y="28" font-size="14" opacity="0.7">score</text>
        <text
          data-test="score"
          :x="SCORE_X"
          :y="SCORE_Y"
          font-size="48"
          :fill="jump.flash > 0.2 ? 'var(--signal)' : 'currentColor'"
        >{{ game.score }}</text>
        <text v-if="game.best > 0" data-test="best" :x="SCORE_X" y="84" font-size="16" opacity="0.75">best {{ game.best }}</text>
      </g>

      <g v-if="waiting" data-test="speech-bubble">
        <path :d="bubblePath" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <text data-test="speech-text" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="20">
          <tspan :x="speechX" y="36">i guess we </tspan>
          <tspan :x="speechX" y="62">sandboxin' now</tspan>
        </text>
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
        v-if="waiting"
        data-test="start-hint"
        :x="LEVER_PIVOT.x - 150"
        :y="BELT_TOP - 28"
        fill="currentColor"
        font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="16"
      >pull the lever</text>
      <text
        v-if="game.miss > 0"
        data-test="miss"
        :x="SCORE_X"
        y="112"
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
        <circle data-test="belt-lamp" :cx="BELT_MOUTH - 28" :cy="BELT_TOP - 22" r="5" :fill="game.beltOn ? 'var(--signal)' : 'currentColor'" :opacity="game.beltOn ? 1 : 0.35" />
        <path
          v-if="playing"
          data-test="capture-zone"
          :d="`M${zone.x} ${BELT_TOP - 22} H${zone.x + zone.w} M${zone.x} ${BELT_TOP - 22} V${BELT_TOP + 18} M${zone.x + zone.w} ${BELT_TOP - 22} V${BELT_TOP + 18}`"
          fill="none"
          stroke="var(--signal)"
          stroke-width="2.5"
          stroke-linecap="square"
        />
      </g>

      <g
        v-for="box in game.boxes"
        :key="box.id"
        data-test="box"
        :data-progress="box.progress.toFixed(3)"
        :data-zone="inZone(box.progress, game.score, game.reduced) ? 'yes' : 'no'"
        :transform="boxTransform(box)"
      >
        <rect x="-18" y="-36" width="36" height="36" rx="2" fill="var(--surface)" :stroke="inZone(box.progress, game.score, game.reduced) ? 'var(--signal)' : 'currentColor'" stroke-width="2.4" />
        <path d="M-18 -18 H18 M0 -36 V0" stroke="currentColor" stroke-width="1.4" opacity="0.5" />
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

      <g data-test="machine" :transform="machineTransform">
        <path d="M16 36 H128 L150 62 V236 H0 V86 L16 36 Z" fill="var(--surface)" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
        <path d="M28 58 H112 L128 78 V214 H12 V80 Z" fill="var(--raised)" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
        <g data-test="grille">
          <rect x="30" y="92" width="58" height="48" fill="var(--void)" stroke="currentColor" stroke-width="2" />
          <g stroke="currentColor" stroke-width="1.4" opacity="0.75">
            <line x1="30" y1="104" x2="88" y2="104" />
            <line x1="30" y1="116" x2="88" y2="116" />
            <line x1="30" y1="128" x2="88" y2="128" />
            <line x1="44" y1="92" x2="44" y2="140" />
            <line x1="58" y1="92" x2="58" y2="140" />
            <line x1="72" y1="92" x2="72" y2="140" />
          </g>
        </g>
        <g data-test="porthole">
          <circle cx="112" cy="112" r="30" fill="var(--void)" stroke="currentColor" stroke-width="3" />
          <circle cx="112" cy="112" r="21" fill="var(--signal)" :opacity="glass" />
          <circle cx="104" cy="104" r="5" fill="#fff" opacity="0.45" />
          <circle v-for="(screw, index) in portholeScrews" :key="index" :cx="screw.cx" :cy="screw.cy" r="1.7" fill="currentColor" />
        </g>
        <path d="M0 176 H24 V214 H0" fill="var(--void)" stroke="currentColor" stroke-width="2" />
        <g stroke="var(--signal)" stroke-width="3" stroke-linecap="round" opacity="0.9">
          <line x1="4" y1="168" x2="14" y2="174" />
          <line x1="4" y1="180" x2="16" y2="186" />
          <line x1="4" y1="192" x2="16" y2="198" />
          <line x1="4" y1="204" x2="14" y2="210" />
        </g>
        <g fill="currentColor">
          <circle cx="34" cy="70" r="2.1" />
          <circle cx="108" cy="70" r="2.1" />
          <circle cx="24" cy="204" r="2.1" />
          <circle cx="124" cy="204" r="2.1" />
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
      :disabled="controlsOff"
      @click="pull"
      @keydown="onButtonKey"
    />
    <button
      type="button"
      class="rex-hit"
      data-test="lever-hit"
      :style="leverBox"
      :aria-label="leverLabel"
      aria-keyshortcuts="Space Enter"
      :disabled="controlsOff"
      @click="pull"
      @keydown="onButtonKey"
    />
    <p class="sr-only" aria-live="polite" data-test="scene-status">{{ status }}</p>

    <Teleport to="body">
      <div v-if="game.showRebuild" class="rex-end" data-test="rebuild-bar">
        <p class="rex-final" data-test="final-score">score {{ game.score }}</p>
        <Button type="button" data-test="rebuild" @click="onRebuild">rebuild</Button>
      </div>
    </Teleport>
  </div>
</template>
