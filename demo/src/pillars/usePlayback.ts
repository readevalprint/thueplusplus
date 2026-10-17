import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import type { ProofFrame } from './playback'

const frameMs = 380

export function usePlayback(frames: Ref<readonly ProofFrame[]>) {
  const reduced = ref(false)
  const index = ref(0)
  let timer = 0
  let media: MediaQueryList | undefined
  let onMedia: (() => void) | undefined

  function still(): boolean {
    return import.meta.env.MODE === 'test' || reduced.value
  }

  function stop(): void {
    window.clearInterval(timer)
    timer = 0
  }

  function start(): void {
    stop()
    if (frames.value.length === 0) {
      index.value = 0
      return
    }
    if (still()) {
      index.value = frames.value.length - 1
      return
    }
    index.value = 0
    if (frames.value.length === 1) return
    timer = window.setInterval(() => {
      if (index.value >= frames.value.length - 1) {
        stop()
        return
      }
      index.value += 1
    }, frameMs)
  }

  watch(frames, start)

  onMounted(() => {
    media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.value = media.matches
    onMedia = () => {
      reduced.value = media?.matches ?? false
      if (reduced.value) start()
    }
    media.addEventListener('change', onMedia)
    start()
  })

  onBeforeUnmount(() => {
    if (media && onMedia) media.removeEventListener('change', onMedia)
    stop()
  })

  const frame = computed(() => frames.value[index.value])
  const settled = computed(() => frames.value.length > 0 && index.value === frames.value.length - 1)
  return { frame, settled }
}
