<script setup lang="ts">
import { Moon, Sun } from '@lucide/vue'
import { onBeforeUnmount, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { applyTheme, readTheme, setTheme, type ThemeChoice } from '@/theme'

let media: MediaQueryList | undefined

function onSystemChange(): void {
  if (readTheme() === 'system') applyTheme('system')
}

function choose(theme: ThemeChoice): void {
  setTheme(theme)
}

onMounted(() => {
  applyTheme(readTheme())
  media = window.matchMedia('(prefers-color-scheme: dark)')
  media.addEventListener('change', onSystemChange)
})

onBeforeUnmount(() => {
  media?.removeEventListener('change', onSystemChange)
})
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button variant="ghost" size="icon" data-test="theme-toggle" aria-label="Toggle theme">
        <Sun class="dark:hidden" />
        <Moon class="hidden dark:block" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem data-test="theme-light" @click="choose('light')">Light</DropdownMenuItem>
      <DropdownMenuItem data-test="theme-dark" @click="choose('dark')">Dark</DropdownMenuItem>
      <DropdownMenuItem data-test="theme-system" @click="choose('system')">System</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
