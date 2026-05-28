// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { splitProgramSource } from './thueSource'
import lispSource from '../../examples/lisp/lisp.tpp?raw'

describe('splitProgramSource', () => {
  it('preserves exact rules and derives empty state when there is no separator', () => {
    const source = '#x ::= y\n^y$ ::> stdout ok\\n\n'

    expect(splitProgramSource(source)).toEqual({
      rules: source,
      state: '',
      error: '',
    })
  })

  it('derives state from the first bare separator', () => {
    const source = '\n^START$ ::= done\n::=\nSTART\n'

    expect(splitProgramSource(source)).toEqual({
      rules: '\n^START$ ::= done\n',
      state: 'START',
      error: '',
    })
  })

  it('keeps hash-prefixed state as data', () => {
    const source = '#x ::= y\n::=\n#x\n'

    expect(splitProgramSource(source).state).toBe('#x')
  })

  it('does not treat prose before the separator as state', () => {
    const source = 'plain prose that is still source text\n^x$ ::= y\n::=\nx\n'
    const split = splitProgramSource(source)

    expect(split.rules).toBe('plain prose that is still source text\n^x$ ::= y\n')
    expect(split.state).toBe('x')
    expect(split.error).toBe('')
  })

  it('uses the first separator and preserves multiline state', () => {
    const source = '^x$ ::= y\n::=\nx\n::=\ny\n'
    const split = splitProgramSource(source)

    expect(split.rules).toBe('^x$ ::= y\n')
    expect(split.state).toBe('x\n::=\ny')
    expect(split.error).toBe('')
  })

  it('normalizes CRLF and CR newlines for state detection only', () => {
    const crlf = '^x$ ::= y\r\n::=\r\nx\r\n'
    const cr = '^x$ ::= y\r::=\rx\r'

    expect(splitProgramSource(crlf)).toEqual({ rules: '^x$ ::= y\r\n', state: 'x', error: '' })
    expect(splitProgramSource(cr)).toEqual({ rules: '^x$ ::= y\r', state: 'x', error: '' })
  })

  it('splits lisp source state out before sending rules to wasm', () => {
    const split = splitProgramSource(lispSource)

    expect(split.rules).not.toContain('\n::=\n')
    expect(split.rules).toContain('^RET<(?<v>$VAL)\\|KDONE>$')
    expect(split.state).toBe('(add\n  (add 1 2)\n  (mul\n    3\n    4))')
    expect(split.error).toBe('')
  })
})
