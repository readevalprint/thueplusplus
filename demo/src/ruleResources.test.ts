import { describe, expect, it } from 'vitest'
import catalog from './ruleResources.catalog.json'
import { analyzeRules } from './ruleResources'
import { splitProgramSource } from './thueSource'

const exampleSources = import.meta.glob('../../examples/**/*.thue', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

describe('playground rule resources', () => {
  it('rejects a read with only a name and keeps the write resource', () => {
    const analysis = analyzeRules('foo ::> bar\nbaz ::< qux\n')

    expect(analysis.errors).toEqual(['Line 2: ::< requires read_spec and literal resource'])
    expect(analysis.resources).toEqual([{ name: 'bar', reads: false, writes: true }])
  })

  it('labels a read resource from ::< timeout name', () => {
    const analysis = analyzeRules('foo ::> bar\nbaz ::< 30 qux\n')

    expect(analysis.errors).toEqual([])
    expect(analysis.resources).toEqual([
      { name: 'bar', reads: false, writes: true },
      { name: 'qux', reads: true, writes: false },
    ])
  })

  it('accepts the same read forms the Go parser accepts', () => {
    expect(analyzeRules('@IN@ ::< 5 input\n').resources).toEqual([{ name: 'input', reads: true, writes: false }])
    expect(analyzeRules('baz::<30 qux\n').resources).toEqual([{ name: 'qux', reads: true, writes: false }])
    expect(analyzeRules('baz ::< 0.5 qux\n').resources).toEqual([{ name: 'qux', reads: true, writes: false }])
    expect(analyzeRules('baz ::< 1e2 echo\n').resources).toEqual([{ name: 'echo', reads: true, writes: false }])
    expect(analyzeRules('baz ::< 30 qux extra\n').errors).toEqual(['Line 1: ::< requires read_spec and literal resource'])
    expect(analyzeRules('#read ::< @VALUE custom\n').errors).toEqual(["Line 1: invalid read timeout '@VALUE'"])
    expect(analyzeRules('baz ::< 0 qux\n').errors).toEqual(["Line 1: invalid read timeout '0'"])
    expect(analyzeRules('baz ::< 30 1qux\n').errors).toEqual(['Line 1: ::< resource must be a literal binding name'])
    expect(analyzeRules('^out$::>stdout ok\\n\n').resources).toEqual([{ name: 'stdout', reads: false, writes: true }])
  })

  it('matches the Go parser on every example', () => {
    const sourcesByPath = new Map(
      Object.entries(exampleSources).map(([globPath, source]) => [globPath.replace(/^\.\.\/\.\.\//, ''), source]),
    )

    expect(catalog.length).toBeGreaterThan(0)
    expect(sourcesByPath.size).toBe(catalog.length)
    for (const entry of catalog) {
      const source = sourcesByPath.get(entry.path)
      expect(source, entry.path).toBeTypeOf('string')
      const rules = splitProgramSource(source ?? '').rules
      expect(analyzeRules(rules), entry.path).toEqual({ resources: entry.resources, errors: entry.errors })
    }
  })
})
