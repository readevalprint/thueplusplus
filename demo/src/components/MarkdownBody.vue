<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/markdown'

const props = defineProps<{ source: string }>()
const html = computed(() => renderMarkdown(props.source))
</script>

<template>
  <div class="markdown-body flex flex-col gap-3 leading-7" v-html="html" />
</template>
