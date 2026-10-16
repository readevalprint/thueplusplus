export type ThemeChoice = 'light' | 'dark' | 'system'

const storageKey = 'theme'

export function readTheme(): ThemeChoice {
  const stored = localStorage.getItem(storageKey)
  if (stored === 'light' || stored === 'dark' || stored === 'system') return stored
  return 'system'
}

export function applyTheme(theme: ThemeChoice): void {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function setTheme(theme: ThemeChoice): void {
  localStorage.setItem(storageKey, theme)
  applyTheme(theme)
}
