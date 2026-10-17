<script setup lang="ts">
/** RexFigure is the only drawing of the mark. */
import { computed } from 'vue'
import type { Pose } from '@/rex/motion'
import {
  MARK,
  bandFill,
  hat,
  hatFill,
  hatInk,
  hatOffsetAt,
  hatShape,
  hatSwapFrame,
  hatTiltAt,
  shineFill,
} from '@/rex/geometry.mjs'
import { hat as wornHat, prefersReduced, swap, swapT } from '@/rex/mascot'

const props = withDefaults(defineProps<{
  pose: Pose
  hatPaint?: string
  markPaint?: string
  reachSide?: 'left' | 'right' | 'none'
  reachRadius?: number
}>(), {
  hatPaint: hatFill,
  markPaint: 'currentColor',
  reachSide: 'none',
  reachRadius: MARK.dotR,
})

const bulge = computed(() => 1 + (1 - props.pose.squash) * 0.45)
const eyeMidX = computed(() => (props.pose.eyeLX + props.pose.eyeRX) / 2)
const eyeMidY = computed(() => (props.pose.eyeLY + props.pose.eyeRY) / 2)
const eyeRx = computed(() => Math.min(MARK.eyeW / 2, Math.max(props.pose.eyeH, 0.8) / 2))

const layers = computed(() => {
  const eyeX = eyeMidX.value
  const eyeY = eyeMidY.value
  const motion = swap.value
  const reduced = prefersReduced()
  if (!motion || reduced) {
    const id = wornHat.value
    return [placed(id, 0, 0, 1, false)]
  }
  const frame = hatSwapFrame(swapT.value, eyeX, eyeY)
  return [
    placed(motion.from, frame.outgoing.x, frame.outgoing.y, frame.outgoing.scale, false),
    placed(motion.to, frame.incoming.x, frame.incoming.y, frame.incoming.scale, true),
  ].filter(layer => layer.scale > 0.012)
})

function placed(id: string, x: number, y: number, scale: number, incoming: boolean) {
  const shape = hatShape(id)
  const reduced = prefersReduced()
  const tilt = props.pose.hatRot + (incoming && !reduced ? hatTiltAt(shape.tilt, swapT.value, false) : shape.tilt)
  const shift = incoming && !reduced
    ? hatOffsetAt(shape.offset, swapT.value, false)
    : { x: shape.offset.x * scale, y: shape.offset.y * scale }
  return {
    key: `${incoming ? 'in' : 'out'}-${id}`,
    id,
    scale,
    tilt,
    test: id === 'hard' ? 'hard-hat' : 'rex-hat',
    transform: `translate(${eyeMidX.value + x + shift.x} ${eyeMidY.value + y + shift.y}) rotate(${tilt}) scale(${scale})`,
    parts: shape.parts,
  }
}

function dotRadius(side: 'left' | 'right'): number {
  if (props.reachSide === side) return props.reachRadius
  return MARK.dotR
}

function partFill(role: string): string {
  if (role === 'band') return bandFill
  if (role === 'shine') return shineFill
  if (role === 'hat') return props.hatPaint
  throw new Error(`rex hat has no fill for ${role}`)
}
</script>

<template>
  <g :transform="`scale(${bulge} ${pose.squash})`" :fill="markPaint">
    <g
      v-for="layer in layers"
      :key="layer.key"
      :data-test="layer.test"
      :data-hat="layer.id"
      :data-tilt="layer.tilt"
      :transform="layer.transform"
    >
      <template v-for="(part, index) in layer.parts" :key="index">
        <path v-if="part.kind === 'path' && part.role === 'hat'" :d="part.d" :fill="partFill(part.role)" />
        <path
          v-else-if="part.kind === 'path' && part.role === 'stroke'"
          :d="part.d"
          fill="none"
          :stroke="hatInk"
          :stroke-width="hat.strokeWidth"
          :opacity="hat.strokeOpacity"
        />
        <path
          v-else-if="part.kind === 'path' && part.role === 'shine'"
          :d="part.d"
          fill="none"
          :stroke="shineFill"
          :stroke-width="hat.shineWidth"
          stroke-linecap="round"
          :opacity="hat.shineOpacity"
        />
        <ellipse
          v-else-if="part.kind === 'ellipse'"
          :cx="part.cx"
          :cy="part.cy"
          :rx="part.rx"
          :ry="part.ry"
          :fill="partFill(part.role)"
        />
        <rect
          v-else-if="part.kind === 'rect'"
          :x="part.x"
          :y="part.y"
          :width="part.w"
          :height="part.h"
          :rx="part.rx"
          :fill="partFill(part.role)"
        />
        <circle
          v-else-if="part.kind === 'circle'"
          :cx="part.cx"
          :cy="part.cy"
          :r="part.r"
          :fill="partFill(part.role)"
        />
      </template>
    </g>
    <rect class="rex-eye" data-test="rex-eye" :x="pose.eyeLX - MARK.eyeW / 2" :y="pose.eyeLY - pose.eyeH / 2" :width="MARK.eyeW" :height="Math.max(pose.eyeH, 0.8)" :rx="eyeRx" :fill="markPaint" />
    <rect class="rex-eye" data-test="rex-eye" :x="pose.eyeRX - MARK.eyeW / 2" :y="pose.eyeRY - pose.eyeH / 2" :width="MARK.eyeW" :height="Math.max(pose.eyeH, 0.8)" :rx="eyeRx" :fill="markPaint" />
    <circle data-test="rex-dot" :cx="pose.handLX" :cy="pose.handLY" :r="dotRadius('left')" :fill="markPaint" />
    <circle data-test="rex-dot" :cx="pose.handRX" :cy="pose.handRY" :r="dotRadius('right')" :fill="markPaint" />
    <circle data-test="rex-dot" :cx="pose.footLX" :cy="pose.footLY" :r="MARK.dotR" :fill="markPaint" />
    <circle data-test="rex-dot" :cx="pose.footRX" :cy="pose.footRY" :r="MARK.dotR" :fill="markPaint" />
  </g>
</template>
