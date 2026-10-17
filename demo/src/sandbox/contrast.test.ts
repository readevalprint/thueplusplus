import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { contrastRatio, mix } from './contrast'

function block(css: string, marker: string): string {
  const at = css.indexOf(marker)
  if (at < 0) throw new Error(`missing ${marker}`)
  const open = css.indexOf('{', at)
  const close = css.indexOf('}', open)
  return css.slice(open + 1, close)
}

function color(blockText: string, name: string): string {
  const match = blockText.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))
  if (!match) throw new Error(`missing --${name}`)
  return match[1]
}

describe('hero contrast', () => {
  const css = readFileSync('src/style.css', 'utf8')
  const veil = css.match(/\.hero-veil\s*\{[^}]*color-mix\(in srgb, var\(--void\)\s+(\d+)%/)
  const amount = veil ? Number(veil[1]) / 100 : Number.NaN

  it('gate veil', () => {
    expect(amount).toBeGreaterThanOrEqual(0.55)
    expect(css).toMatch(/\.hero-veil[\s\S]*backdrop-filter:\s*blur\(/)
    expect(css).toMatch(/\.hero-copy[\s\S]*z-index:\s*2/)
    expect(css).toMatch(/\.rex-bleed[\s\S]*width:\s*100vw/)
  })

  it('gate contrast', () => {
    expect(amount).toBeGreaterThan(0)
    const themes = [
      block(css, ':root,'),
      block(css, 'html:not(.dark)'),
    ]
    for (const theme of themes) {
      for (const under of ['surface', 'dim']) {
        const behind = mix(color(theme, under), color(theme, 'void'), amount)
        expect(contrastRatio(color(theme, 'bone'), behind)).toBeGreaterThanOrEqual(4.5)
        expect(contrastRatio(color(theme, 'ash'), behind)).toBeGreaterThanOrEqual(4.5)
      }
    }
  })
})
