import { describe, expect, it } from 'vitest'
import { thueppLanguageConfiguration, thueppMonarchLanguage } from './thueppMonarch'

function stateRules(name: string): unknown[] {
  const tokenizer = thueppMonarchLanguage.tokenizer as Record<string, unknown[]>
  return tokenizer[name] ?? []
}

function missingOperatorCommentPattern(): RegExp {
  for (const rule of stateRules('root')) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (action === 'comment' && pattern instanceof RegExp) return pattern
  }
  throw new Error('missing inert-row comment tokenizer rule')
}

function rulePrefixPattern(): RegExp {
  for (const rule of stateRules('root')) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (pattern instanceof RegExp && Array.isArray(action) && action[0] === 'source') return pattern
  }
  throw new Error('missing rule prefix tokenizer rule')
}

function invalidOperatorPattern(): RegExp {
  for (const rule of stateRules('source')) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (action === 'invalid' && pattern instanceof RegExp && pattern.source.startsWith('::')) return pattern
  }
  throw new Error('missing invalid operator tokenizer rule')
}

function aliasPrefixPatternAndAction(): [RegExp, unknown[]] {
  for (const rule of stateRules('root')) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (pattern instanceof RegExp && pattern.test('PCT <- [A-Z]+') && Array.isArray(action)) return [pattern, action]
  }
  throw new Error('missing alias prefix tokenizer rule')
}

function aliasReferenceAction(): string {
  for (const rule of stateRules('common')) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (pattern instanceof RegExp && pattern.test('$PCT') && typeof action === 'string') return action
  }
  throw new Error('missing alias reference tokenizer rule')
}

function nonCapturingGroupPattern(): RegExp {
  for (const rule of stateRules('common')) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (Array.isArray(action) && action[0] === '@brackets' && action[1] === 'regexp' && pattern instanceof RegExp) {
      const match = pattern.exec('(?:[A-Z])')
      if (match?.[2] === '?:') return pattern
    }
  }
  throw new Error('missing non-capturing group tokenizer rule')
}

function namedCapturePatternAndAction(): [RegExp, unknown[]] {
  for (const rule of stateRules('common')) {
    if (!Array.isArray(rule)) continue
    const [pattern, action] = rule
    if (pattern instanceof RegExp && Array.isArray(action) && pattern.test('(?<name>$NAME)')) return [pattern, action]
  }
  throw new Error('missing named capture tokenizer rule')
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

  it('uses alias-specific token classes for definitions and references', () => {
    const [, action] = aliasPrefixPatternAndAction()

    expect(action).toEqual([
      'white',
      'type.identifier.alias',
      'white',
      'operator.alias',
    ])
    expect(aliasReferenceAction()).toBe('type.identifier.alias')
  })

  it('does not color alias-looking LHS text as an alias on rule rows', () => {
    const ruleMatch = rulePrefixPattern().exec('A <- B ::= C')
    const [aliasPattern] = aliasPrefixPatternAndAction()

    expect(ruleMatch?.[1]).toBe('A <- B ')
    expect(ruleMatch?.[2]).toBe('::=')
    expect(ruleMatch?.[3]).toBe(' C')
    expect(aliasPattern.test('A <- B ::= C')).toBe(false)
  })

  it('only treats the first rule operator on a row as the delimiter', () => {
    const ruleMatch = rulePrefixPattern().exec('B ::= C ::= D3')

    expect(ruleMatch?.[1]).toBe('B ')
    expect(ruleMatch?.[2]).toBe('::=')
    expect(ruleMatch?.[3]).toBe(' C ::= D3')
    expect(stateRules('ruleRhs')).toEqual([])
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

  it('lets named capture rows use inner token rules so capture names are variables', () => {
    const ruleRow = '^READ<(?<name>$NAME)> KTOP$ ::= CBOOT<{{name}}|KDONE>'
    const [pattern, action] = namedCapturePatternAndAction()
    const match = pattern.exec('(?<name>$NAME)')

    expect(rulePrefixPattern().test(ruleRow)).toBe(false)
    expect(match?.[3]).toBe('name')
    expect(action).toEqual(['@brackets', 'regexp', 'variable', 'regexp'])
  })

  it('does not treat alias operators as angle brackets', () => {
    expect(thueppMonarchLanguage.brackets).not.toContainEqual({ open: '<', close: '>', token: 'delimiter.angle' })
    expect(thueppLanguageConfiguration.brackets).not.toContainEqual(['<', '>'])
    expect(thueppLanguageConfiguration.autoClosingPairs).not.toContainEqual({ open: '<', close: '>' })
    expect(thueppLanguageConfiguration.surroundingPairs).not.toContainEqual({ open: '<', close: '>' })
  })
})
