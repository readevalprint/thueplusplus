<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppShell from '@/components/AppShell.vue'

const route = useRoute()
const bare = computed(() => route.meta.layout === 'bare')

watch(route, () => {
  const meta = route.meta as {
    documentTitle?: string
    description?: string
    canonical?: string
    robots?: string
  }
  if (!meta.documentTitle || !meta.description || !meta.canonical || !meta.robots) return
  document.title = meta.documentTitle
  setMeta('name', 'description', meta.description)
  setMeta('name', 'robots', meta.robots)
  setLink('canonical', meta.canonical)
  setMeta('property', 'og:title', meta.documentTitle)
  setMeta('property', 'og:description', meta.description)
  setMeta('property', 'og:url', meta.canonical)
  setMeta('name', 'twitter:title', meta.documentTitle)
  setMeta('name', 'twitter:description', meta.description)
}, { immediate: true })

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.content = content
}

function setLink(rel: string, href: string): void {
  let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!element) {
    element = document.createElement('link')
    element.rel = rel
    document.head.appendChild(element)
  }
  element.href = href
}
</script>

<template>
  <RouterView v-if="bare" />
  <AppShell v-else />
</template>
