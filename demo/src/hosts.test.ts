import { readFileSync } from 'node:fs'
import { parse as parseToml } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { registryHosts, soonLanguages } from './hosts'

describe('shipped hosts', () => {
  it('gate hosts', () => {
    const parsed = parseToml(readFileSync('../hosts.toml', 'utf8')) as {
      host?: { id?: string }[]
    }
    const ids = (parsed.host ?? []).map(row => row.id)
    expect(registryHosts.map(host => host.id)).toEqual(ids)
    expect(soonLanguages).toEqual([])
    expect(ids).toContain('ruby')
    expect(ids).toContain('csharp')
    expect(ids).toContain('java')
    expect(registryHosts.map(host => host.landing)).toEqual(['python', 'go', 'js', 'wasm', 'rust', 'cpp', 'ruby', 'csharp', 'java'])
  })
})
