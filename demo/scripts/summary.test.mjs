import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

describe('summary', () => {
  it('has one entry per bench file plus latest.json at HEAD', () => {
    const files = globSync('metrics/**/bench.json', { cwd: repoRoot })
    const latest = JSON.parse(readFileSync(join(repoRoot, 'metrics', 'latest.json'), 'utf8'))
    const summary = JSON.parse(readFileSync(join(demoRoot, 'src', 'generated', 'summary.json'), 'utf8'))
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    assert.ok(latest.schema_version === 2 || latest.schema_version === 3)
    assert.equal(latest.commit, undefined)
    assert.ok(latest.machine)
    assert.equal(summary.schema_version, 1)
    assert.equal(summary.entries.length, files.length + 1)
    assert.ok(files.length > 0)
    assert.equal(new Set(summary.entries.map(entry => entry.commit)).size, files.length + 1)
    assert.equal(summary.entries[summary.entries.length - 1].commit, head)
    assert.deepEqual(summary.entries[summary.entries.length - 1].machine, latest.machine)
    assert.equal(summary.entries.some(entry => entry.machine === null), true)
  })
})
