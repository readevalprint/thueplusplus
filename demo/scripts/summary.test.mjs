import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

describe('summary', () => {
  it('has one entry per bench file', () => {
    const files = globSync('metrics/**/bench.json', { cwd: repoRoot })
    const summary = JSON.parse(readFileSync(join(demoRoot, 'src', 'generated', 'summary.json'), 'utf8'))
    assert.equal(summary.schema_version, 1)
    assert.equal(summary.entries.length, files.length)
    assert.ok(files.length > 0)
    assert.equal(new Set(summary.entries.map(entry => entry.commit)).size, files.length)
  })
})
