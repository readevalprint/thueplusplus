<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: HTMLAttributes["class"]
}>()
</script>

<template>
  <tr
    data-slot="table-row"
    :class="cn('border-b border-line transition-colors data-[state=selected]:bg-raised', props.class)"
  >
    <slot />
  </tr>
</template>
