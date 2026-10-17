import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { actPose, settledSpring, type Pose, type PoseMode, type Spring } from '@/rex/motion'

export function useRex(mode: () => PoseMode) {
  const reduced = ref(false)
  const clock = ref(0)
  const spring = ref<Spring>(settledSpring())
  const pose = ref<Pose>(frameAt(false, settledSpring(), 0))
  let raf = 0
  let last = 0
  let media: MediaQueryList | undefined
  let onMedia: (() => void) | undefined

  function frameAt(isReduced: boolean, springState: Spring, dt: number): Pose {
    return actPose({
      mode: mode(),
      clock: clock.value,
      reduced: isReduced,
      spring: springState,
      dt,
    })
  }

  function sync(dt: number): void {
    const next = frameAt(reduced.value, spring.value, dt)
    spring.value = next.spring
    pose.value = next
  }

  function tick(now: number): void {
    const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000)
    last = now
    if (dt > 0 && !reduced.value) clock.value += dt
    sync(dt)
    raf = requestAnimationFrame(tick)
  }

  watch([() => mode(), reduced], () => sync(0))

  onMounted(() => {
    media = window.matchMedia('(prefers-reduced-motion: reduce)')
    reduced.value = media.matches
    onMedia = () => {
      reduced.value = media?.matches ?? false
    }
    media.addEventListener('change', onMedia)
    sync(0)
    if (import.meta.env.MODE === 'test') return
    raf = requestAnimationFrame(tick)
  })

  onBeforeUnmount(() => {
    if (media && onMedia) media.removeEventListener('change', onMedia)
    cancelAnimationFrame(raf)
  })

  return { pose, reduced, clock }
}

export function onControlKey(event: KeyboardEvent, run: () => void): void {
  if (event.key !== 'Enter' && event.key !== ' ') return
  if (event.repeat) return
  event.preventDefault()
  run()
}
