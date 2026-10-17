<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ source: string }>()

const lines = computed(() => props.source.split('\n').map(line => {
  const match = line.match(/::[=<>!|-]/)
  if (!match || match.index === undefined) {
    const comment = line.trim().length > 0 && !line.includes('::')
    return [{ kind: comment ? 'comment' : 'text', text: line }]
  }
  return [
    { kind: 'text', text: line.slice(0, match.index) },
    { kind: 'op', text: match[0] },
    { kind: 'text', text: line.slice(match.index + match[0].length) },
  ]
}))
</script>

<template>
  <pre class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]"><code><span v-for="(line, index) in lines" :key="index"><span v-for="(token, tokenIndex) in line" :key="tokenIndex" :class="token.kind === 'op' ? 'text-signal' : token.kind === 'comment' ? 'text-dim' : undefined">{{ token.text }}</span><span v-if="index < lines.length - 1">{{ '\n' }}</span></span></code></pre>
</template>
