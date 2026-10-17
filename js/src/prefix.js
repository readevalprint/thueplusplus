// Literal prefix of a rule pattern, matching the Go engine.
// A miss on this text cannot be a match, so the runner skips the regex and
// does not count a regex eval. A hit still runs the regex.

const CONT = 'cont'
const STOP = 'stop'
const BLOCK = 'block'
const FLAGS = 'flags'
const CAP = 'cap'
const INF = -1
const MAX_REPEAT = 100000

class Bad extends Error {}

class Flags {
  constructor(multiline = false, fold = false) {
    this.multiline = multiline
    this.fold = fold
  }

  copy() {
    return new Flags(this.multiline, this.fold)
  }
}

export function literalPrefix(lhs) {
  if (lhs.includes('(?i')) return ''
  const body = lhs.startsWith('^') ? lhs.slice(1) : lhs
  try {
    const onePass = onePassOf(body)
    const [text, , index] = sequence(body, 0, new Flags(), true, false, onePass)
    if (index !== body.length) return ''
    return text
  } catch (error) {
    if (error instanceof Bad) return ''
    throw error
  }
}

function onePassOf(body) {
  try {
    if (!leadingBeginText(body)) return false
    if (altPresent(body) && !endAnchored(body)) return false
    if (swallowsNext(body)) return false
  } catch (error) {
    if (error instanceof Bad) return false
    throw error
  }
  return true
}

function swallowsNext(body) {
  const tokens = ['[\\s\\S]*', '[\\s\\S]+', '[\\S\\s]*', '[\\S\\s]+', '[\\s\\S]?', '[\\S\\s]?']
  for (const token of tokens) {
    let start = 0
    while (true) {
      const found = body.indexOf(token, start)
      if (found < 0) break
      let cursor = found + token.length
      if (cursor < body.length && body[cursor] === '?') cursor += 1
      while (cursor < body.length && body[cursor] === ')') cursor += 1
      if (cursor < body.length && !body.startsWith('\\z', cursor) && body[cursor] !== '$') return true
      start = found + token.length
    }
  }
  return false
}

function leadingBeginText(body) {
  let index = 0
  let multiline = false
  while (index < body.length) {
    if (body.startsWith('(?P<', index) || body.startsWith('(?<', index)) return false
    if (body.startsWith('(?:', index)) {
      index += 3
      continue
    }
    if (body.startsWith('(?', index)) {
      index += 2
      let sign = 1
      let saw = false
      while (index < body.length && body[index] !== ':' && body[index] !== ')') {
        const char = body[index]
        index += 1
        if (char === '-') {
          sign = -1
          saw = false
          continue
        }
        if (char === 'm') multiline = sign > 0
        saw = true
      }
      if (index >= body.length) return false
      if (body[index] === ':') {
        index += 1
        continue
      }
      index += 1
      continue
    }
    if (body[index] === '(') return false
    if (body.startsWith('\\A', index)) return true
    if (body[index] === '^') return !multiline
    return false
  }
  return false
}

function endAnchored(body) {
  if (body.includes('(?m')) return body.endsWith('\\z')
  return body.endsWith('\\z') || body.endsWith('$')
}

function altPresent(body) {
  let index = 0
  while (index < body.length) {
    if (body.startsWith('\\Q', index)) {
      const end = body.indexOf('\\E', index + 2)
      index = end < 0 ? body.length : end + 2
      continue
    }
    if (body[index] === '\\') {
      index += 2
      continue
    }
    if (body[index] === '[') {
      index = classSpan(body, index)[0]
      continue
    }
    if (body[index] === '|') return true
    index += 1
  }
  return false
}

function sequence(pattern, index, flags, atStart, stopParen, onePass) {
  const branches = [[]]
  while (index < pattern.length) {
    if (stopParen && pattern[index] === ')') break
    if (pattern[index] === '|') {
      branches.push([])
      index += 1
      atStart = true
      continue
    }
    let text
    let status
    ;[text, status, index, flags, atStart] = atom(pattern, index, flags, atStart, onePass)
    if (status === FLAGS) continue
    let minimum
    let maximum
    ;[minimum, maximum, index] = quantifier(pattern, index)
    ;[text, status] = applyQuantifier(text, status, minimum, maximum)
    if (status === CONT && text === '') continue
    branches[branches.length - 1].push([text, status])
    if (status !== CAP) atStart = false
  }
  const folded = branches.map(fold)
  if (folded.length === 1) return [folded[0][0], folded[0][1], index]
  const [text, status] = common(folded)
  return [text, status, index]
}

function common(folded) {
  const texts = []
  for (const [text, status] of folded) {
    if (status === BLOCK) return ['', BLOCK]
    texts.push(text)
  }
  let shared = texts[0]
  for (const text of texts.slice(1)) {
    const limit = Math.min(shared.length, text.length)
    let size = 0
    while (size < limit && shared[size] === text[size]) size += 1
    shared = shared.slice(0, size)
  }
  if (!shared) return ['', BLOCK]
  if (folded.every(([text, status]) => status === CONT && text === shared)) return [shared, CONT]
  return [shared, STOP]
}

function fold(atoms) {
  let text = ''
  let sawCap = false
  for (const [atomText, status] of atoms) {
    if (status === CAP) {
      sawCap = true
      continue
    }
    if (status === BLOCK) return [text, text ? STOP : BLOCK]
    text += atomText
    if (status === STOP) return [text, STOP]
  }
  if (sawCap && text === '') return ['', CAP]
  return [text, CONT]
}

function atom(pattern, index, flags, atStart, onePass) {
  if (index >= pattern.length) throw new Bad('truncated pattern')
  const char = pattern[index]
  if (char === '^') {
    if (flags.multiline || !atStart || !onePass) return ['', BLOCK, index + 1, flags, false]
    return ['', CONT, index + 1, flags, true]
  }
  if (char === '$') return ['', BLOCK, index + 1, flags, false]
  if (char === '.') return ['', BLOCK, index + 1, flags, false]
  if (char === '[') {
    const [end, rune] = classSpan(pattern, index)
    if (rune == null || flags.fold) return ['', BLOCK, end, flags, false]
    return [rune, CONT, end, flags, false]
  }
  if (char === '(') return group(pattern, index, flags, atStart, onePass)
  if (char === '\\') return escape(pattern, index, flags, atStart, onePass)
  if ('*+?)|'.includes(char)) throw new Bad('bare operator')
  if (flags.fold) return ['', BLOCK, index + 1, flags, false]
  return [char, CONT, index + 1, flags, false]
}

function group(pattern, index, flags, atStart, onePass) {
  const capturing = true
  if (pattern.slice(index, index + 2) === '(?') {
    const named = namedCapture(pattern, index)
    if (named == null) return perlGroup(pattern, index, flags, atStart, onePass)
    index = named
  } else {
    index += 1
  }
  let text
  let status
  ;[text, status, index] = sequence(pattern, index, flags, atStart, true, onePass)
  if (index >= pattern.length || pattern[index] !== ')') throw new Bad('unclosed group')
  index += 1
  if (onePass && capturing) return ['', BLOCK, index, flags, false]
  if (capturing && status === CONT && text === '') return ['', CAP, index, flags, atStart]
  const stillStart = atStart && status === CONT && text === ''
  return [text, status, index, flags, stillStart]
}

function namedCapture(pattern, index) {
  let start
  if (pattern.startsWith('(?P<', index)) start = index + 4
  else if (pattern.startsWith('(?<', index)) start = index + 3
  else return null
  const end = pattern.indexOf('>', start)
  if (end < 0 || end === start) throw new Bad('bad capture name')
  const name = pattern.slice(start, end)
  if ([...name].some((char) => char !== '_' && !/[A-Za-z0-9]/.test(char))) throw new Bad('bad capture name')
  return end + 1
}

function perlGroup(pattern, index, flags, atStart, onePass) {
  let cursor = index + 2
  let sign = 1
  let saw = false
  const updated = flags.copy()
  while (cursor < pattern.length) {
    const char = pattern[cursor]
    if (char === ':' || char === ')') {
      if (sign < 0 && !saw) throw new Bad('bad flags')
      cursor += 1
      if (char === ')') return ['', FLAGS, cursor, updated, atStart]
      let text
      let status
      ;[text, status, cursor] = sequence(pattern, cursor, updated, atStart, true, onePass)
      if (cursor >= pattern.length || pattern[cursor] !== ')') throw new Bad('unclosed group')
      const stillStart = atStart && status === CONT && text === ''
      return [text, status, cursor + 1, flags, stillStart]
    }
    if (char === '-') {
      if (sign < 0) throw new Bad('bad flags')
      sign = -1
      saw = false
      cursor += 1
      continue
    }
    if (!'imsU'.includes(char)) throw new Bad('bad flags')
    saw = true
    const enabled = sign > 0
    if (char === 'i') updated.fold = enabled
    else if (char === 'm') updated.multiline = enabled
    cursor += 1
  }
  throw new Bad('bad flags')
}

function escape(pattern, index, flags, atStart, onePass) {
  if (index + 1 >= pattern.length) throw new Bad('trailing backslash')
  if (pattern.startsWith('\\Q', index)) {
    const end = pattern.indexOf('\\E', index + 2)
    const literal = end < 0 ? pattern.slice(index + 2) : pattern.slice(index + 2, end)
    index = end < 0 ? pattern.length : end + 2
    if (flags.fold && literal) return ['', BLOCK, index, flags, false]
    return [literal, CONT, index, flags, atStart && literal === '']
  }
  const char = pattern[index + 1]
  if (char === 'A') {
    if (atStart && onePass) return ['', CONT, index + 2, flags, true]
    return ['', BLOCK, index + 2, flags, false]
  }
  if ('zZbBdDwWsS'.includes(char)) {
    if (char === 'Z') throw new Bad('bad escape')
    return ['', BLOCK, index + 2, flags, false]
  }
  let literal
  ;[literal, index] = literalEscape(pattern, index)
  if (flags.fold) return ['', BLOCK, index, flags, false]
  return [literal, CONT, index, flags, false]
}

function literalEscape(pattern, index) {
  if (index + 1 >= pattern.length) throw new Bad('trailing backslash')
  let rest = pattern.slice(index + 1)
  const char = rest[0]
  rest = rest.slice(1)
  if ('01234567'.includes(char)) {
    if (char !== '0' && (!rest || !'01234567'.includes(rest[0]))) throw new Bad('bad escape')
    let value = char.charCodeAt(0) - 48
    let consumed = 1
    while (consumed < 3 && rest && '01234567'.includes(rest[0])) {
      value = value * 8 + rest.charCodeAt(0) - 48
      rest = rest.slice(1)
      consumed += 1
    }
    return [String.fromCharCode(value), pattern.length - rest.length]
  }
  if (char === 'x') {
    if (!rest) throw new Bad('bad escape')
    if (rest[0] === '{') {
      rest = rest.slice(1)
      let digits = ''
      while (rest && rest[0] !== '}') {
        if (!'0123456789abcdefABCDEF'.includes(rest[0])) throw new Bad('bad escape')
        digits += rest[0]
        rest = rest.slice(1)
        if (Number.parseInt(digits, 16) > 0x10ffff) throw new Bad('bad escape')
      }
      if (!digits || !rest || rest[0] !== '}') throw new Bad('bad escape')
      return [String.fromCodePoint(Number.parseInt(digits, 16)), pattern.length - rest.length + 1]
    }
    if (rest.length < 2) throw new Bad('bad escape')
    const pair = rest.slice(0, 2)
    if ([...pair].some((item) => !'0123456789abcdefABCDEF'.includes(item))) throw new Bad('bad escape')
    return [String.fromCharCode(Number.parseInt(pair, 16)), index + 4]
  }
  const named = { a: '\u0007', f: '\f', n: '\n', r: '\r', t: '\t', v: '\v' }
  if (Object.prototype.hasOwnProperty.call(named, char)) return [named[char], index + 2]
  if (char.charCodeAt(0) < 128 && !/[A-Za-z0-9]/.test(char)) return [char, index + 2]
  if (char === '_') return [char, index + 2]
  throw new Bad('bad escape')
}

function classSpan(pattern, index) {
  if (pattern[index] !== '[') throw new Bad('class')
  index += 1
  let negated = false
  if (index < pattern.length && pattern[index] === '^') {
    negated = true
    index += 1
  }
  const runes = []
  let ranged = false
  let posix = false
  if (index < pattern.length && pattern[index] === ']') {
    runes.push(']')
    index += 1
  }
  while (index < pattern.length && pattern[index] !== ']') {
    if (pattern.startsWith('[:', index)) {
      const end = pattern.indexOf(':]', index + 2)
      if (end < 0) throw new Bad('class')
      posix = true
      index = end + 2
      continue
    }
    if (pattern[index] === '\\') {
      try {
        let literal
        ;[literal, index] = literalEscape(pattern, index)
        runes.push(literal)
      } catch (error) {
        if (!(error instanceof Bad)) throw error
        if (index + 1 >= pattern.length) throw error
        index += 2
        posix = true
        continue
      }
    } else {
      runes.push(pattern[index])
      index += 1
    }
    if (index + 1 < pattern.length && pattern[index] === '-' && pattern[index + 1] !== ']') {
      ranged = true
      index += 1
    }
  }
  if (index >= pattern.length || pattern[index] !== ']') throw new Bad('class')
  index += 1
  if (!negated && !ranged && !posix && runes.length === 1) return [index, runes[0]]
  return [index, null]
}

function quantifier(pattern, index) {
  if (index >= pattern.length) return [1, 1, index]
  const char = pattern[index]
  let minimum
  let maximum
  if (char === '*') {
    minimum = 0
    maximum = INF
    index += 1
  } else if (char === '+') {
    minimum = 1
    maximum = INF
    index += 1
  } else if (char === '?') {
    minimum = 0
    maximum = 1
    index += 1
  } else if (char === '{') {
    const parsed = repeat(pattern, index)
    if (parsed == null) return [1, 1, index]
    ;[minimum, maximum, index] = parsed
  } else {
    return [1, 1, index]
  }
  if (index < pattern.length && pattern[index] === '?') index += 1
  return [minimum, maximum, index]
}

function repeat(pattern, index) {
  if (pattern[index] !== '{') return null
  let cursor = index + 1
  let minimum
  ;[minimum, cursor] = integer(pattern, cursor)
  if (minimum == null || cursor >= pattern.length) return null
  let maximum
  if (pattern[cursor] !== ',') maximum = minimum
  else {
    cursor += 1
    if (cursor < pattern.length && pattern[cursor] === '}') maximum = INF
    else {
      ;[maximum, cursor] = integer(pattern, cursor)
      if (maximum == null) return null
    }
  }
  if (cursor >= pattern.length || pattern[cursor] !== '}') return null
  if (minimum < 0 || (maximum >= 0 && maximum < minimum)) throw new Bad('bad repeat')
  if (minimum > MAX_REPEAT || maximum > MAX_REPEAT) throw new Bad('bad repeat')
  return [minimum, maximum, cursor + 1]
}

function integer(pattern, index) {
  if (index >= pattern.length || !/[0-9]/.test(pattern[index])) return [null, index]
  if (pattern[index] === '0' && index + 1 < pattern.length && /[0-9]/.test(pattern[index + 1])) return [null, index]
  let value = 0
  while (index < pattern.length && /[0-9]/.test(pattern[index])) {
    value = value * 10 + pattern.charCodeAt(index) - 48
    if (value >= 100000000) return [-1, index]
    index += 1
  }
  return [value, index]
}

function applyQuantifier(text, status, minimum, maximum) {
  if (minimum === 1 && maximum === 1) return [text, status]
  if (status === CAP) {
    if (minimum === maximum) return ['', minimum === 0 ? CONT : CAP]
    return ['', BLOCK]
  }
  if (status === CONT && text === '') return ['', CONT]
  if (minimum === 0 && maximum === 0) return ['', CONT]
  if (status === CONT) {
    if (minimum === 0) return ['', BLOCK]
    const repeated = text.repeat(minimum)
    if (maximum === minimum) return [repeated, CONT]
    return [repeated, STOP]
  }
  if (status === STOP) {
    if (minimum === 0) return ['', BLOCK]
    return [text, STOP]
  }
  if (minimum === 0 && maximum === 0) return ['', CONT]
  return ['', BLOCK]
}
