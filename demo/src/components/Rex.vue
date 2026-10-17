<script setup lang="ts">
import type { Pose } from '@/rex/motion'
import RexFigure from './RexFigure.vue'

defineProps<{ pose: Pose }>()
</script>

<template>
  <g data-test="rex-mark">
    <RexFigure :pose="pose" />
  </g>
</template>
