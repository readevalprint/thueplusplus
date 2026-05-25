import { describe, expect, it } from 'vitest'
import { thueppLanguageConfiguration, thueppMonarchLanguage } from './thueppMonarch'

function missingOperatorCommentPattern(): RegExp {
  const root = thueppMonarchLanguage.tokenizer.root as unknown[]
  for (const rule of root) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (action === 'comment' && pattern instanceof RegExp) return pattern
  }
  throw new Error('missing inert-row comment tokenizer rule')
}

function invalidOperatorPattern(): RegExp {
  const source = thueppMonarchLanguage.tokenizer.source as unknown[]
  for (const rule of source) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (action === 'invalid' && pattern instanceof RegExp && pattern.source.startsWith('::')) return pattern
  }
  throw new Error('missing invalid operator tokenizer rule')
}

function nonCapturingGroupPattern(): RegExp {
  const source = thueppMonarchLanguage.tokenizer.source as unknown[]
  for (const rule of source) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (Array.isArray(action) && action[0] === '@brackets' && action[1] === 'regexp' && pattern instanceof RegExp) {
      const match = pattern.exec('(?:[A-Z])')
      if (match?.[2] === '?:') return pattern
    }
  }
  throw new Error('missing non-capturing group tokenizer rule')
}

describe('thue++ Monarch tokenizer', () => {
  it('colors inert rows without an operator as comments', () => {
    const pattern = missingOperatorCommentPattern()

    expect(pattern.test('Lisp evaluator guide')).toBe(true)
    expect(pattern.test('  Rows like this one are inert prose rows')).toBe(true)
    expect(pattern.test('^start$ ::= done')).toBe(false)
    expect(pattern.test('PCT <- (?:[A-Z])*')).toBe(false)
    expect(pattern.test('^bad$ ::x nope')).toBe(false)
    expect(pattern.test('<|OLD|>')).toBe(false)
  })

  it('only treats current rule operators as operators', () => {
    const invalid = invalidOperatorPattern()

    expect(invalid.test('::x')).toBe(true)
    expect(invalid.test('::%')).toBe(true)
    expect(invalid.test('::=')).toBe(false)
    expect(invalid.test('::<')).toBe(false)
    expect(invalid.test('::>')).toBe(false)
    expect(invalid.test('::-')).toBe(false)
    expect(invalid.test('::!')).toBe(false)
  })

  it('keeps regex group opening parens visible to bracket matching', () => {
    const match = nonCapturingGroupPattern().exec('(?:[A-Z])')

    expect(match?.[1]).toBe('(')
    expect(match?.[2]).toBe('?:')
  })

  it('does not treat alias operators as angle brackets', () => {
    expect(thueppMonarchLanguage.brackets).not.toContainEqual({ open: '<', close: '>', token: 'delimiter.angle' })
    expect(thueppLanguageConfiguration.brackets).not.toContainEqual(['<', '>'])
    expect(thueppLanguageConfiguration.autoClosingPairs).not.toContainEqual({ open: '<', close: '>' })
    expect(thueppLanguageConfiguration.surroundingPairs).not.toContainEqual({ open: '<', close: '>' })
  })
})