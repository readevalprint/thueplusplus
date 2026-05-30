<script setup lang="ts">
import type { CollapsibleRootProps, CollapsibleRootEmits } from 'reka-ui'
import { CollapsibleRoot, useForwardPropsEmits } from 'reka-ui'

const props = defineProps<CollapsibleRootProps>()
const emits = defineEmits<CollapsibleRootEmits>()

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <CollapsibleRoot v-bind="forwarded" data-slot="collapsible">
    <slot />
  </CollapsibleRoot>
</template>
