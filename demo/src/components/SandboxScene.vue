<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import GlyphMark from './GlyphMark.vue'
import RexFigure from './RexFigure.vue'
import {
  BELT_Y,
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
  exitPoint,
  leverDegrees,
  leverKnob,
} from '@/sandbox/layout'
import { WALK_DURATION, framePose, settledSpring, type Pose, type PoseMode, type Spring } from '@/sandbox/motion'
import { createScene, itemLabel, pressItem, pressRex, rebuild, step, type Item, type Scene } from '@/sandbox/scene'

const portholeScrews = [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({
  cx: 112 + Math.cos((n / 8) * Math.PI * 2) * 30,
  cy: 112 + Math.sin((n / 8) * Math.PI * 2) * 30,
}))

const emit = defineEmits<{ break: [reduced: boolean], rebuilt: [] }>()

const reduced = ref(false)
const scene = ref<Scene>(createScene())
const clock = ref(0)
const spring = ref<Spring>(settledSpring())
const pose = ref<Pose>(restPose(false))
const beltScroll = ref(0)
const wanderFrom = ref({ x: 0, y: 0 })
const wanderTo = ref({ x: 0, y: 0 })
const rexHit = ref<HTMLButtonElement | null>(null)
let raf = 0
let last = 0
let media: MediaQueryList | undefined
let onMedia: (() => void) | undefined

function restPose(isReduced: boolean): Pose {
  return framePose({ mode: 'idle', t: 0, clock: 0, lever: 0, reduced: isReduced, spring: settledSpring(), dt: 0 })
}

function readReduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function visualMode(current: Scene): PoseMode {
  if (current.rex === 'wander') return current.rexT >= WALK_DURATION ? 'idle' : 'wander'
  if (current.broken && current.rex === 'idle') return 'startled'
  return current.rex
}

function syncPose(dt: number): void {
  const next = framePose({
    mode: visualMode(scene.value),
    t: scene.value.broken && scene.value.rex === 'idle' ? scene.value.brokenT : scene.value.rexT,
    clock: clock.value,
    lever: scene.value.lever,
    reduced: reduced.value,
    spring: spring.value,
    dt,
  })
  spring.value = next.spring
  pose.value = next
}

function applyReduced(isReduced: boolean): void {
  reduced.value = isReduced
  scene.value = { ...scene.value, reduced: isReduced }
  syncPose(0)
}

const controlsOff = computed(() => scene.value.broken || (!reduced.value && scene.value.rex !== 'idle'))
const rexLabel = computed(() => (
  scene.value.beltOn ? 'Rex. Pull the lever to stop the belt' : 'Rex. Pull the lever to start the belt'
))
const leverLabel = computed(() => (scene.value.beltOn ? 'Lever. Belt is running' : 'Lever. Belt is stopped'))
const status = computed(() => {
  if (scene.value.showRebuild) return 'The page broke. Rebuild puts it back.'
  if (scene.value.broken) return 'The page broke.'
  return scene.value.beltOn ? 'Belt running.' : 'Belt stopped.'
})
const leverAngle = computed(() => {
  const flop = scene.value.broken && !reduced.value ? Math.min(1, scene.value.brokenT / 0.45) * 36 : 0
  return leverDegrees(scene.value.lever) + flop
})
const glass = computed(() => {
  if (scene.value.processing) {
    if (reduced.value) return 0.92
    return 0.3 + 0.7 * Math.abs(Math.sin(clock.value * 36))
  }
  return 0.18 + scene.value.flash * 0.75
})
const fuseHot = computed(() => (reduced.value ? 1 : 0.4 + 0.6 * Math.abs(Math.sin(clock.value * 16))))
const tickOffset = computed(() => (reduced.value || !scene.value.beltOn ? 0 : -(beltScroll.value % 16)))
const showRex = computed(() => scene.value.rex !== 'wander')
const bubblePath = computed(() => {
  const tipX = Math.min(220, Math.max(108, pose.value.rootX))
  const hatY = pose.value.rootY + (Math.min(pose.value.eyeLY, pose.value.eyeRY) - 28) * SCALE
  const tipY = Math.min(164, Math.max(142, hatY))
  return `M40 24 H292 Q308 24 308 40 V104 Q308 120 292 120 H168 L${tipX} ${tipY} L124 120 H56 Q40 120 40 104 V40 Q40 24 56 24 Z`
})
const machineTransform = computed(() => {
  if (reduced.value) return `translate(${MACHINE.x} ${MACHINE.y})`
  const jolt = scene.value.jolt
  const shakeX = Math.sin(clock.value * 48) * jolt * 8
  const shakeY = Math.cos(clock.value * 39) * jolt * 5
  const fall = scene.value.broken ? Math.min(1, scene.value.brokenT / 0.8) : 0
  const rot = fall * 9 + Math.sin(clock.value * 54) * jolt * 2.5
  return `translate(${MACHINE.x + shakeX} ${MACHINE.y + shakeY + fall * fall * 90}) rotate(${rot} 80 150)`
})
const beltSag = computed(() => {
  if (reduced.value || !scene.value.broken) return ''
  const fall = Math.min(1, scene.value.brokenT / 0.8)
  return `translate(0 ${fall * fall * 36}) rotate(${fall * 4} 450 380)`
})
const rexBox = computed(() => pct(pose.value.rootX - 78, pose.value.rootY - 268, 160, 286))
const leverBox = computed(() => {
  const knob = leverKnob(scene.value.lever)
  return {
    left: `${(knob.x / VIEW_W) * 100}%`,
    top: `${(knob.y / VIEW_H) * 100}%`,
    width: '48px',
    height: '64px',
    transform: 'translate(-50%, -70%)',
  }
})
const wandering = computed(() => scene.value.rex === 'wander')
const wanderStyle = computed(() => {
  const arrived = scene.value.rex === 'wander' && scene.value.rexT >= WALK_DURATION
  const travel = arrived ? 1 : pose.value.travel
  return {
    left: `${wanderFrom.value.x + (wanderTo.value.x - wanderFrom.value.x) * travel}px`,
    top: `${wanderFrom.value.y + (wanderTo.value.y - wanderFrom.value.y) * travel}px`,
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

function shown(progress: number): number {
  if (!reduced.value) return progress
  return Math.round(progress * 4) / 4
}

function pointStyle(x: number, y: number): Record<string, string> {
  return {
    left: `${(x / VIEW_W) * 100}%`,
    top: `${(y / VIEW_H) * 100}%`,
    width: '48px',
    height: '48px',
    transform: 'translate(-50%, -50%)',
  }
}

function itemStyle(item: Item): Record<string, string> {
  const point = beltPoint(shown(item.progress))
  return pointStyle(point.x, point.y)
}

function exitStyle(age: number): Record<string, string> {
  const point = exitPoint(age)
  return pointStyle(point.x, point.y)
}

function itemTransform(item: Item): string {
  const point = beltPoint(shown(item.progress))
  const spin = item.kind === 'evil' && !reduced.value ? Math.sin(clock.value * 7 + item.id) * 8 : 0
  const pop = 1 + Math.min(0.35, item.glow) * 0.7
  return `translate(${point.x} ${point.y}) rotate(${spin}) scale(${pop})`
}

function exitTransform(age: number, glow: number): string {
  const point = exitPoint(age)
  const pop = 1 + Math.min(0.35, glow) * 0.8
  return `translate(${point.x} ${point.y}) scale(${pop})`
}

function halo(age: number, glow: number): number {
  const pulse = reduced.value ? 0.5 : 0.32 + 0.22 * (Math.sin(age * 3.4) * 0.5 + 0.5)
  return Math.min(0.85, pulse + glow * 0.5)
}

function pull(): void {
  scene.value = pressRex(scene.value)
  syncPose(0)
}

function poke(id: number): void {
  const before = scene.value.broken
  scene.value = pressItem(scene.value, id)
  syncPose(0)
  if (scene.value.broken && !before) emit('break', reduced.value)
}

function onRebuild(): void {
  scene.value = rebuild(scene.value)
  spring.value = settledSpring()
  syncPose(0)
  emit('rebuilt')
}

function onKey(event: KeyboardEvent, run: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (event.repeat) return
  event.preventDefault()
  run()
}

function tick(now: number): void {
  const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000)
  last = now
  if (dt > 0) {
    clock.value += dt
    if (scene.value.beltOn && !reduced.value && !scene.value.broken) beltScroll.value += dt * 46
    scene.value = step(scene.value, dt)
    syncPose(dt)
  }
  raf = requestAnimationFrame(tick)
}

watch(() => scene.value.rex, mode => {
  if (mode !== 'wander' || reduced.value) return
  const rect = rexHit.value?.getBoundingClientRect()
  wanderFrom.value = rect
    ? { x: rect.left + rect.width / 2, y: rect.bottom - 6 }
    : { x: window.innerWidth * 0.25, y: window.innerHeight * 0.45 }
  wanderTo.value = { x: window.innerWidth * 0.48, y: window.innerHeight * 0.7 }
})

onMounted(() => {
  applyReduced(readReduced())
  media = window.matchMedia('(prefers-reduced-motion: reduce)')
  onMedia = () => applyReduced(media?.matches ?? false)
  media.addEventListener('change', onMedia)
  if (import.meta.env.MODE === 'test') return
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (media && onMedia) media.removeEventListener('change', onMedia)
  cancelAnimationFrame(raf)
})

defineExpose({ scene, pose })
</script>

<template>
  <div
    class="rex-scene text-bone relative w-full"
    data-test="sandbox-scene"
    data-pin
    :data-belt="scene.beltOn ? 'on' : 'off'"
    :data-broken="scene.broken ? 'yes' : 'no'"
    :data-reduced="reduced ? 'yes' : 'no'"
  >
    <svg
      class="rex-svg h-auto w-full"
      :viewBox="`0 0 ${VIEW_W} ${VIEW_H}`"
      role="img"
      aria-labelledby="rex-scene-title"
    >
      <title id="rex-scene-title">Rex beside the sandbox machine</title>
      <path :d="`M28 ${GROUND} H${VIEW_W - 24}`" stroke="currentColor" stroke-width="2" opacity="0.4" />

      <g v-if="showRex" data-test="speech-bubble">
        <path :d="bubblePath" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <text data-test="speech-text" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="22">
          <tspan x="56" y="66">i guess we </tspan>
          <tspan x="56" y="98">sandboxin' now</tspan>
        </text>
      </g>

      <g v-if="showRex" :transform="`translate(${pose.rootX} ${pose.rootY}) scale(${SCALE})`">
        <RexFigure :pose="pose" />
      </g>

      <g data-test="lever" :data-on="scene.beltOn ? 'yes' : 'no'">
        <rect :x="LEVER_PIVOT.x - 18" :y="GROUND - 16" width="36" height="16" rx="2" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <g :transform="`rotate(${leverAngle} ${LEVER_PIVOT.x} ${LEVER_PIVOT.y})`">
          <line :x1="LEVER_PIVOT.x" :y1="LEVER_PIVOT.y" :x2="LEVER_PIVOT.x" :y2="LEVER_PIVOT.y - LEVER_LEN" stroke="currentColor" stroke-width="4" stroke-linecap="round" />
          <circle :cx="LEVER_PIVOT.x" :cy="LEVER_PIVOT.y - LEVER_LEN" r="9" fill="#ff5a36" stroke="currentColor" stroke-width="2" />
        </g>
      </g>

      <g :transform="beltSag">
        <g data-test="belt" :data-running="scene.beltOn ? 'yes' : 'no'">
          <rect x="346" :y="BELT_Y - 20" width="186" height="42" rx="3" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
          <circle cx="362" :cy="BELT_Y" r="12" fill="var(--raised)" stroke="currentColor" stroke-width="2" />
          <circle cx="516" :cy="BELT_Y" r="12" fill="var(--raised)" stroke="currentColor" stroke-width="2" />
          <clipPath id="rex-belt-clip">
            <rect x="376" :y="BELT_Y - 16" width="128" height="32" />
          </clipPath>
          <g clip-path="url(#rex-belt-clip)">
            <g :transform="`translate(${tickOffset} 0)`" stroke="currentColor" stroke-width="1.7" opacity="0.55">
              <line v-for="mark in 16" :key="mark" :x1="360 + mark * 16" :y1="BELT_Y - 14" :x2="350 + mark * 16" :y2="BELT_Y + 14" />
            </g>
          </g>
          <circle data-test="belt-lamp" cx="338" :cy="BELT_Y - 28" r="5" :fill="scene.beltOn ? '#ff5a36' : 'currentColor'" :opacity="scene.beltOn ? 1 : 0.35" />
        </g>

        <g
          v-for="item in scene.items"
          :key="item.id"
          data-test="belt-item"
          :data-kind="item.kind"
          :data-glyph="item.glyph"
          :transform="itemTransform(item)"
        >
          <circle v-if="item.glow > 0" r="18" fill="#ff5a36" :opacity="0.2 + item.glow * 0.5" />
          <GlyphMark :glyph="item.glyph" :hot="fuseHot" />
        </g>
      </g>

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
          <circle cx="112" cy="112" r="21" fill="#ff5a36" :opacity="glass" />
          <circle cx="104" cy="104" r="5" fill="#fff" opacity="0.45" />
          <circle v-for="(screw, index) in portholeScrews" :key="index" :cx="screw.cx" :cy="screw.cy" r="1.7" fill="currentColor" />
        </g>
        <path d="M0 176 H24 V214 H0" fill="var(--void)" stroke="currentColor" stroke-width="2" />
        <g stroke="#ff5a36" stroke-width="3" stroke-linecap="round" opacity="0.9">
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

      <g
        v-for="exit in scene.exits"
        :key="`out-${exit.id}`"
        data-test="good-exit"
        :data-glyph="exit.glyph"
        :transform="exitTransform(exit.age, exit.glow)"
        :opacity="exitPoint(exit.age).opacity"
      >
        <circle r="20" fill="#ff5a36" :opacity="halo(exit.age, exit.glow)" />
        <GlyphMark :glyph="exit.glyph" :hot="1" />
      </g>

      <g data-test="jail" :transform="beltSag">
        <rect :x="CAGE_X - 8" :y="GROUND - 10" width="60" height="10" rx="1" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <g v-if="scene.cages.length === 0" :transform="`translate(${CAGE_X} ${CAGE_BASE})`">
          <rect :width="CAGE_W" :height="CAGE_H" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
          <g stroke="currentColor" stroke-width="1.6">
            <line x1="14" y1="2" x2="14" :y2="CAGE_H - 2" />
            <line x1="22" y1="2" x2="22" :y2="CAGE_H - 2" />
            <line x1="30" y1="2" x2="30" :y2="CAGE_H - 2" />
          </g>
        </g>
      </g>

      <g
        v-for="(cage, index) in scene.cages"
        :key="`cage-${cage.id}`"
        data-test="cage"
        :data-glyph="cage.glyph"
        :transform="`translate(${cageOrigin(index).x} ${cageOrigin(index).y})`"
      >
        <rect :width="CAGE_W" :height="CAGE_H" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
        <g stroke="currentColor" stroke-width="1.6">
          <line x1="14" y1="2" x2="14" :y2="CAGE_H - 2" />
          <line x1="22" y1="2" x2="22" :y2="CAGE_H - 2" />
          <line x1="30" y1="2" x2="30" :y2="CAGE_H - 2" />
        </g>
        <g transform="translate(22 22) scale(0.62)">
          <GlyphMark :glyph="cage.glyph" :hot="0.4" />
        </g>
      </g>

      <g v-if="scene.broken" data-test="scene-cracks" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">
        <path d="M70 18 L128 96 L104 168 L176 250 L150 340" />
        <path d="M128 96 L210 132 L248 210" />
        <path d="M560 12 L520 90 L600 150 L548 240 L620 340" />
      </g>
    </svg>

    <button
      ref="rexHit"
      type="button"
      class="rex-hit"
      data-test="rex"
      :style="rexBox"
      :aria-label="rexLabel"
      :aria-pressed="scene.beltOn"
      :disabled="controlsOff"
      @click="pull"
      @keydown="onKey($event, pull)"
    />
    <button
      type="button"
      class="rex-hit"
      data-test="lever-hit"
      :style="leverBox"
      :aria-label="leverLabel"
      :aria-pressed="scene.beltOn"
      :disabled="controlsOff"
      @click="pull"
      @keydown="onKey($event, pull)"
    />
    <button
      v-for="item in scene.items"
      :key="`hit-${item.id}`"
      type="button"
      class="rex-hit"
      data-test="belt-hit"
      :data-kind="item.kind"
      :data-glyph="item.glyph"
      :style="itemStyle(item)"
      :aria-label="itemLabel(item)"
      :disabled="scene.broken"
      @click="poke(item.id)"
      @keydown="onKey($event, () => poke(item.id))"
    />
    <button
      v-for="exit in scene.exits"
      :key="`glow-${exit.id}`"
      type="button"
      class="rex-hit"
      data-test="exit-hit"
      :data-glyph="exit.glyph"
      :style="exitStyle(exit.age)"
      :aria-label="`shiny ${exit.glyph === 'assign' ? 'rewrite mark' : exit.glyph === 'dot' ? 'dot' : 'rule'} that left the machine`"
      @click="poke(exit.id)"
      @keydown="onKey($event, () => poke(exit.id))"
    />
    <p class="sr-only" aria-live="polite" data-test="scene-status">{{ status }}</p>

    <Teleport to="body">
      <div v-if="wandering" class="rex-wander" data-test="rex-wander" :style="wanderStyle">
        <p class="rex-wander-line">i guess we sandboxin' now</p>
        <svg viewBox="-46 -118 92 132" aria-hidden="true">
          <RexFigure :pose="pose" />
        </svg>
      </div>
      <Button
        v-if="scene.showRebuild"
        type="button"
        class="rex-rebuild"
        data-test="rebuild"
        @click="onRebuild"
      >
        rebuild
      </Button>
    </Teleport>
  </div>
</template>
