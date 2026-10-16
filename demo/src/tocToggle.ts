import { shallowRef } from 'vue'

export const tocToggle = shallowRef<(() => void) | null>(null)
