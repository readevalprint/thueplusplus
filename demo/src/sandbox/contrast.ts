/** WCAG relative luminance and contrast. Channels are 0–255. */

function channel(hex: string, shift: number): number {
  const n = Number.parseInt(hex.slice(1), 16)
  const s = ((n >> shift) & 255) / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function luminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`color must be #rrggbb, got ${hex}`)
  return 0.2126 * channel(hex, 16) + 0.7152 * channel(hex, 8) + 0.0722 * channel(hex, 0)
}

export function contrastRatio(foreground: string, background: string): number {
  const a = luminance(foreground)
  const b = luminance(background)
  const [hi, lo] = a > b ? [a, b] : [b, a]
  return (hi + 0.05) / (lo + 0.05)
}

export function mix(base: string, over: string, overAmount: number): string {
  if (!Number.isFinite(overAmount) || overAmount < 0 || overAmount > 1) {
    throw new Error(`mix amount must be from 0 to 1, got ${overAmount}`)
  }
  const paint = (shift: number) => {
    const from = (Number.parseInt(base.slice(1), 16) >> shift) & 255
    const to = (Number.parseInt(over.slice(1), 16) >> shift) & 255
    return Math.round(from * (1 - overAmount) + to * overAmount)
  }
  const n = (paint(16) << 16) | (paint(8) << 8) | paint(0)
  return `#${n.toString(16).padStart(6, '0')}`
}
