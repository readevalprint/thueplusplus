import { describe, expect, it } from 'vitest'
import { flattenTestManifests } from './testCases'

describe('manifest test case helpers', () => {
  const manifestPath = './examples/lisp/tests/closure_binding_flattening.toml'
  const manifestText = `program = "../lisp.tpp"
timeout = 10
args = ["--max-evals", "60000"]

[[case]]
name = "zero arg closure call still evaluates body"
input = '((fn () 7))'
[case.expect]
exit_code = 0
stdout_stripped = "7"

[[case]]
name = "partial closure preserves lexical capture"
input = '(let ((a 10)) (((fn (x y) (add (add a x) y)) 1) 2))'
[case.expect]
exit_code = 0
stdout_stripped = "13"
`

  it('flattens manifest cases with paths, case names, and input previews', () => {
    const cases = flattenTestManifests({ [manifestPath]: manifestText })

    expect(cases).toHaveLength(2)
    expect(cases[0]).toMatchObject({
      manifestPath: 'examples/lisp/tests/closure_binding_flattening.toml',
      programPath: 'examples/lisp/lisp.tpp',
      caseName: 'zero arg closure call still evaluates body',
      input: '((fn () 7))',
      inputPreview: '((fn () 7))',
      args: ['--max-evals', '60000'],
    })
    expect(cases[1].inputPreview).toContain('(let ((a 10))')
  })
})
