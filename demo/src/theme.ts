export type ThemeChoice = 'system' | 'light' | 'dark'

const storageKey = 'theme'
const cycle: ThemeChoice[] = ['system', 'light', 'dark']

export function nextTheme(theme: ThemeChoice): ThemeChoice {
  const index = cycle.indexOf(theme)
  if (index === -1) throw new Error(`unknown theme ${theme}`)
  return cycle[(index + 1) % cycle.length]
}

export function themeLabel(theme: ThemeChoice): string {
  if (theme === 'system') return 'System theme'
  if (theme === 'light') return 'Light theme'
  if (theme === 'dark') return 'Dark theme'
  throw new Error(`unknown theme ${theme}`)
}

export function readTheme(): ThemeChoice {
  const stored = localStorage.getItem(storageKey)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'dark'
}

export function applyTheme(theme: ThemeChoice): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  // Same turn as the class. color-scheme otherwise clears the canvas to the
  // new scheme for a frame before the tokens update, and Rex vanishes.
  root.style.colorScheme = dark ? 'dark' : 'light'
  root.style.backgroundColor = dark ? '#0a0a0c' : '#f4f3ef'
  root.style.color = dark ? '#e8e6e1' : '#1a1916'
}

export function setTheme(theme: ThemeChoice): void {
  localStorage.setItem(storageKey, theme)
  applyTheme(theme)
}
