<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

interface PageHeading {
  id: string
  text: string
  level: 2 | 3
}

const route = useRoute()
const host = ref<HTMLElement | null>(null)
const headings = ref<PageHeading[]>([])
const activeHeadingId = ref('')

function shell(): ParentNode | null {
  return host.value?.closest('[data-test="app-shell"]') ?? null
}

function collect(): void {
  const root = shell()?.querySelector('.doc-page')
  if (!root) {
    headings.value = []
    activeHeadingId.value = ''
    return
  }
  const seen = new Set<string>()
  const next: PageHeading[] = []
  for (const node of root.querySelectorAll('h2, h3')) {
    const id = node.id || node.closest('[id]')?.id || ''
    if (!id || seen.has(id)) continue
    const text = node.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    if (!text) continue
    seen.add(id)
    next.push({ id, text, level: node.tagName === 'H3' ? 3 : 2 })
  }
  headings.value = next
  updateActiveHeading()
}

async function collectSoon(): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await nextTick()
    if (shell()?.querySelector('.doc-page')) {
      collect()
      return
    }
  }
  collect()
}

function updateActiveHeading(): void {
  const scope = shell()
  const elements = headings.value
    .map(heading => scope?.querySelector<HTMLElement>(`#${heading.id}`) ?? null)
    .filter((element): element is HTMLElement => element !== null)
  if (!elements.length) {
    activeHeadingId.value = ''
    return
  }
  const anchorLine = Math.min(180, window.innerHeight * 0.25)
  const current = elements.reduce((active, heading) => (
    heading.getBoundingClientRect().top <= anchorLine ? heading : active
  ), elements[0])
  activeHeadingId.value = current.id
}

onMounted(() => {
  void collectSoon()
  window.addEventListener('scroll', updateActiveHeading, { passive: true })
  window.addEventListener('resize', updateActiveHeading, { passive: true })
  window.addEventListener('hashchange', updateActiveHeading)
})

watch(() => route.fullPath, () => {
  void collectSoon()
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateActiveHeading)
  window.removeEventListener('resize', updateActiveHeading)
  window.removeEventListener('hashchange', updateActiveHeading)
})
</script>

<template>
  <div ref="host" class="contents">
    <nav v-if="headings.length" id="on-this-page" class="page-toc" aria-label="On this page">
      <p>On this page</p>
      <a
        v-for="heading in headings"
        :key="heading.id"
        :href="`#${heading.id}`"
        :class="{ active: activeHeadingId === heading.id }"
        :aria-current="activeHeadingId === heading.id ? 'location' : undefined"
        :data-level="heading.level"
        @click="activeHeadingId = heading.id"
      >
        {{ heading.text }}
      </a>
    </nav>
  </div>
</template>
