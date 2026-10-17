<script setup lang="ts">
import { Monitor, Moon, Sun } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { applyTheme, nextTheme, readTheme, setTheme, themeLabel, type ThemeChoice } from '@/theme'

defineProps<{
  class?: string
}>()

const choice = ref<ThemeChoice>(readTheme())
let media: MediaQueryList | undefined

function onSystemChange(): void {
  if (readTheme() === 'system') applyTheme('system')
}

function cycle(): void {
  const next = nextTheme(choice.value)
  setTheme(next)
  choice.value = next
}

onMounted(() => {
  choice.value = readTheme()
  applyTheme(choice.value)
  media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onSystemChange)
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', onSystemChange)
})
</script>

<template>
  <Button
    type="button"
    variant="ghost"
    size="icon"
    data-test="theme-toggle"
    :data-mode="choice"
    :aria-label="themeLabel(choice)"
    :title="themeLabel(choice)"
    :class="$props.class"
    @click="cycle"
  >
    <Monitor v-if="choice === 'system'" />
    <Sun v-else-if="choice === 'light'" />
    <Moon v-else />
  </Button>
</template>
