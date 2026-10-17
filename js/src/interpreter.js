// Native Thue++ interpreter. Behavior follows the Go host. Patterns are
// compiled with re2js and lookbehinds stay off.

import { RE2JS } from 're2js'
import { literalPrefix } from './prefix.js'

const DEFAULT_MAX_EVALS = 1000000
const DEFAULT_MAX_STATE_BYTES = 8 * 1024 * 1024
const DEFAULT_MAX_STEPS = 1000000
const MAX_NUMERIC_LITERAL_CHARS = 4096
const MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE = 10000
const MAX_EXPANDED_PATTERN_BYTES = 1000000

const EXIT_RUNTIME = 1
const EXIT_STEP_LIMIT = 10
const EXIT_EVAL_LIMIT = 11
const EXIT_STATE_LIMIT = 12
const EXIT_READ_TIMEOUT = 13

const SUBSTITUTE = '::='
const READ = '::<'
const WRITE = '::>'
const EXIT = '::-'
const BUILTIN = '::!'

const ALIAS_DEF = /^\s*([A-Z][A-Z0-9_]*)\s*<-\s*(.*)$/
const INVALID_ALIAS = /<\|([A-Z][A-Z0-9_]*)\|>/
const NAMED_CAPTURE = /\(\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>/g
const NUMERIC_LITERAL = /^-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+\/[0-9]+)$/
const ZERO_DENOMINATOR = /^-?[0-9]+\/0+$/
const RE_META = '\\.+*?()|[]{}^$'
const BUILTIN_ARITY = {
  eq: 2, add: 2, sub: 2, mul: 2, div: 2, mod: 2, numeq: 2,
  lt: 2, le: 2, gt: 2, ge: 2, num: 1, b64enc: 1, b64dec: 1,
  pctenc: 1, pctdec: 1, escape: 1, unescape: 1,
}
const encoder = new TextEncoder()
const compiledPatterns = new Map()

export class LimitError extends Error {
  constructor(kind, code, message) {
    super(message)
    this.name = 'LimitError'
    this.kind = kind
    this.code = code
  }
}

export class Interpreter {
  constructor() {
    this.rules = []
    this.state = ''
    this.bindings = new Map()
    this.maxEvals = DEFAULT_MAX_EVALS
    this.maxStateBytes = DEFAULT_MAX_STATE_BYTES
    this.maxSteps = DEFAULT_MAX_STEPS
    this.evalCount = 0
    this.appliedSteps = 0
    this.cost = 0
    this.regexEvals = 0
    this.regexMatches = 0
    this.stateBytes = 0
    this.statePeak = 0
    this.debug = false
    this.traceEnabled = false
    this.trace = []
    this.coverage = new Map()
    this.programPath = ''
    this.stdoutParts = []
    this.stderrParts = []
    this._installDefaults()
  }

  _installDefaults() {
    this.bindings = new Map()
    this.bindings.set('stdin', binding('stdin', emptyStdin()))
    this.bindings.set('stdout', binding('stdout', bufferWriter(this.stdoutParts)))
    this.bindings.set('stderr', binding('stderr', bufferWriter(this.stderrParts)))
  }

  clearBindings() {
    this.cleanup()
    this.bindings = new Map()
  }

  addCallback(name, resource) {
    this.bindings.set(name, binding(name, resource))
  }

  loadProgramText(sourcePath, content) {
    if (typeof sourcePath !== 'string' || sourcePath.trim() === '') throw new Error('source path is required')
    this.programPath = sourcePath
    this.parseProgram(annotate(sourcePath, content))
  }

  applyInputOverride(value) {
    this.state = value
  }

  metrics() {
    let ruleChars = 0
    for (const rule of this.rules) ruleChars += utf8Length(rule.source)
    return {
      cost: this.cost,
      applied_steps: this.appliedSteps,
      regex_evals: this.regexEvals,
      regex_matches: this.regexMatches,
      state_bytes: this.stateBytes,
      state_peak: this.statePeak,
      rule_count: this.rules.length,
      rule_chars: ruleChars,
    }
  }

  coverageTSV() {
    const ids = [...this.coverage.keys()].sort()
    return ids.map((id) => `${id}\t${this.coverage.get(id)}`).join('\n') + (ids.length ? '\n' : '')
  }

  cleanup() {
    for (const item of this.bindings.values()) {
      if (item.resource && typeof item.resource.close === 'function') item.resource.close()
    }
  }

  parseProgram(content) {
    const sourceRows = iterSourceRows(content, this.programPath)
    let separator = -1
    for (let index = 0; index < sourceRows.length; index += 1) {
      if (sourceRows[index].text.trim() === '::=') {
        separator = index
        break
      }
    }
    const prefixRows = separator >= 0 ? sourceRows.slice(0, separator) : sourceRows
    const stateRows = separator >= 0 ? sourceRows.slice(separator + 1) : []
    const expanded = expandPatterns(annotatedContentFromRows(prefixRows))
    this.rules = []
    let currentSourcePath = this.programPath
    let currentSourceLine = 0
    const lines = splitAnnotatedLines(expanded)
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]
      const lineNumber = index + 1
      const trimmed = line.trim()
      if (trimmed.startsWith('# thue-source: ')) {
        const marker = trimmed.slice('# thue-source: '.length)
        const colon = marker.lastIndexOf(':')
        if (colon >= 0 && /^\d+$/.test(marker.slice(colon + 1))) {
          currentSourcePath = marker.slice(0, colon)
          currentSourceLine = Number(marker.slice(colon + 1))
        }
        continue
      }
      const sourceLine = currentSourceLine || lineNumber
      const rule = parseRule(line, sourceLine, currentSourcePath)
      if (rule) this.rules.push(rule)
    }
    this.state = stateRows.map((row) => row.text).join('\n')
  }

  run() {
    this.appliedSteps = 0
    this.cost = 0
    this.regexEvals = 0
    this.regexMatches = 0
    this.stateBytes = 0
    this.statePeak = 0
    this.trace = []
    this.noteState()
    while (true) {
      let applied = false
      for (let ruleIndex = 0; ruleIndex < this.rules.length; ruleIndex += 1) {
        const rule = this.rules[ruleIndex]
        if (this.maxEvals != null && this.evalCount >= this.maxEvals) {
          return stop(new LimitError('evals', EXIT_EVAL_LIMIT, `Evaluation step limit (${this.maxEvals}) exceeded`))
        }
        this.evalCount += 1
        const match = this.findMatch(rule, this.state)
        if (!match) continue
        const stateBefore = this.state
        let groups
        try {
          const mid = this.applyMids(rule, match.groups)
          if (!mid.ok) continue
          groups = mid.groups
        } catch (error) {
          this.recordTrace(rule, ruleIndex, match, stateBefore, '', null, error.message)
          return stop(error)
        }
        match.groups = groups
        applied = true
        if (this.debug) {
          const start = utf8Offset(stateBefore, match.start)
          const end = utf8Offset(stateBefore, match.end)
          this.writeDebug(`[${this.evalCount}] STATE: ${this.state.replaceAll('\n', '\\n')}\n`)
          this.writeDebug(`[${this.evalCount}] RULE ${rule.lineNumber} MATCHES STATE AT ${start}:${end}: ${rule.lhs}\n`)
          this.writeDebug(`[${this.evalCount}] GROUPS: ${formatDebugGroups(groups)}\n`)
        }
        if (rule.operator !== EXIT && this.maxSteps != null && this.appliedSteps >= this.maxSteps) {
          return stop(new LimitError('steps', EXIT_STEP_LIMIT, `Applied step limit (${this.maxSteps}) exceeded`))
        }
        const magic = { rule_index: String(ruleIndex) }
        let repl = ''
        try {
          if (rule.operator === SUBSTITUTE) {
            repl = expandTemplate(rule.rhs, groups, magic)
            this.recordCoverage(rule)
          } else if (rule.operator === READ) {
            const read = this.applyRead(rule, stateBefore)
            repl = read
            this.recordCoverage(rule)
          } else if (rule.operator === WRITE) {
            const expandedText = expandTemplate(rule.rhs, groups, magic)
            const { resource, content } = splitResource(expandedText)
            const target = this.bindings.get(resource)
            if (!target) repl = `ERR:resource:${resource}`
            else {
              repl = this.writeString(target, content)
              if (repl === '') this.recordCoverage(rule)
            }
          } else if (rule.operator === BUILTIN) {
            const values = []
            for (const arg of rule.builtinArgs) {
              if (!Object.prototype.hasOwnProperty.call(groups, arg)) {
                throw new Error(`Line ${rule.lineNumber}: ::! argument '${arg}' was not captured`)
              }
              values.push(groups[arg])
            }
            repl = evalBuiltin(rule.builtinName, values)
            this.recordCoverage(rule)
          } else if (rule.operator === EXIT) {
            let codeStr = rule.rhs.trim()
            if (codeStr.startsWith('{') && codeStr.endsWith('}')) codeStr = codeStr.slice(1, -1)
            if (!/^-?\d+$/.test(codeStr)) {
              this.recordCoverage(rule)
              this.recordTrace(rule, ruleIndex, match, stateBefore, '', null, '')
              return { code: EXIT_RUNTIME, error: null }
            }
            const code = Number(codeStr)
            this.recordCoverage(rule)
            this.recordTrace(rule, ruleIndex, match, stateBefore, '', code, '')
            return { code, error: null }
          }
          this.setState(this.state.slice(0, match.start) + repl + this.state.slice(match.end))
        } catch (error) {
          this.recordTrace(rule, ruleIndex, match, stateBefore, repl, null, error.message)
          return stop(error)
        }
        this.noteState()
        this.recordTrace(rule, ruleIndex, match, stateBefore, repl, null, '')
        this.chargeStep(rule.rhs)
        if (this.maxSteps != null && this.appliedSteps >= this.maxSteps) {
          return stop(new LimitError('steps', EXIT_STEP_LIMIT, `Applied step limit (${this.maxSteps}) exceeded`))
        }
        if (this.debug) this.writeDebug(`[${this.evalCount}] RESULT: ${this.state.replaceAll('\n', '\\n')}\n\n`)
        break
      }
      if (!applied) return { code: 0, error: null }
    }
  }

  applyRead(rule) {
    const parsed = parseReadRHS(rule.lineNumber, rule.rhs)
    const target = this.bindings.get(parsed.resource)
    if (!target) throw new Error(`Unknown resource '${parsed.resource}'`)
    return pctEncode(this.readLine(target, parsed.seconds))
  }

  findMatch(rule, state) {
    if (rule.literalPrefix !== '' && !state.includes(rule.literalPrefix)) return null
    this.chargeEval(state, rule.lhs)
    const matcher = rule.pattern.matcher(state)
    if (!matcher.find()) return null
    this.regexMatches += 1
    return { start: matcher.start(), end: matcher.end(), groups: participatingGroups(matcher) }
  }

  applyMids(rule, groups) {
    if (rule.mids.length === 0) return { groups, ok: true }
    const out = { ...groups }
    for (const mid of rule.mids) {
      let expanded
      try {
        expanded = expandMidPattern(mid, out)
      } catch (error) {
        throw new Error(`Line ${rule.lineNumber}: ${error.message}`)
      }
      const compiled = compileMultiline(expanded)
      if (compiled.error) throw new Error(`Line ${rule.lineNumber}: Invalid ::| regex '${expanded}'`)
      this.chargeEval(this.state, rule.lhs)
      const matcher = compiled.re.matcher(this.state)
      if (!matcher.find()) return { groups: out, ok: false }
      this.regexMatches += 1
      const found = participatingGroups(matcher)
      for (const [name, value] of Object.entries(found)) out[name] = value
    }
    return { groups: out, ok: true }
  }

  readLine(target, timeoutSeconds) {
    if (!target.resource || typeof target.resource.readLine !== 'function') {
      throw new Error(`ERR:resource:${target.name}:missing host resource`)
    }
    const result = target.resource.readLine(timeoutSeconds)
    if (result && typeof result === 'object' && Object.prototype.hasOwnProperty.call(result, 'error')) {
      const message = formatResourceError(target.name, String(result.error), Boolean(result.omitName))
      if (result.error === 'timeout') throw new LimitError('timeout', EXIT_READ_TIMEOUT, message)
      throw new Error(message)
    }
    return result == null ? '' : String(result)
  }

  writeDebug(text) {
    const target = this.bindings.get('stderr')
    if (target) {
      this.writeString(target, text)
      return
    }
    this.stderrParts.push(text)
  }

  writeString(target, content) {
    if (!target.resource || typeof target.resource.write !== 'function') {
      return `ERR:resource:${target.name}:missing host resource`
    }
    const result = target.resource.write(content)
    if (result && typeof result === 'object' && result.error) {
      return formatResourceError(target.name, String(result.error), Boolean(result.omitName))
    }
    return ''
  }

  setState(next) {
    if (this.maxStateBytes != null) {
      const size = utf8Length(next)
      if (size > this.maxStateBytes) {
        throw new LimitError('state', EXIT_STATE_LIMIT, `State size (${size} bytes) exceeds maximum (${this.maxStateBytes} bytes)`)
      }
    }
    this.state = next
  }

  noteState() {
    const size = utf8Length(this.state)
    this.stateBytes += size
    if (size > this.statePeak) this.statePeak = size
  }

  chargeEval(state, lhs) {
    this.regexEvals += 1
    this.cost += utf8Length(state) + utf8Length(lhs)
  }

  chargeStep(rhs) {
    this.appliedSteps += 1
    this.cost += utf8Length(rhs)
  }

  recordCoverage(rule) {
    const id = `${displayPath(rule.sourcePath)}:${rule.lineNumber}`
    this.coverage.set(id, (this.coverage.get(id) || 0) + 1)
  }

  recordTrace(rule, ruleIndex, match, stateBefore, replacement, exitCode, errorMessage) {
    if (!this.traceEnabled) return
    this.trace.push({
      step: this.evalCount,
      ruleIndex,
      sourcePath: rule.sourcePath,
      lineNumber: rule.lineNumber,
      operator: rule.operator,
      lhs: rule.lhs,
      matchStart: utf8Offset(stateBefore, match.start),
      matchEnd: utf8Offset(stateBefore, match.end),
      groups: { ...match.groups },
      stateBefore,
      replacement,
      stateAfter: this.state,
      exitCode,
      error: errorMessage,
    })
  }
}

function stop(error) {
  if (error instanceof LimitError) return { code: error.code, error: error.message, limit: error.kind }
  return { code: EXIT_RUNTIME, error: error.message }
}

function binding(name, resource) {
  return { name, resource }
}

function emptyStdin() {
  return {
    readLine() {
      return { error: 'EOF before newline' }
    },
    write() {
      return { error: 'write requires process or output stream binding' }
    },
  }
}

function bufferWriter(parts) {
  return {
    readLine() {
      return { error: 'cannot_read_output_stream', omitName: true }
    },
    write(content) {
      parts.push(String(content))
      return ''
    },
  }
}

function formatResourceError(name, message, omitName) {
  if (omitName) return `ERR:resource:${message}`
  return `ERR:resource:${name}:${message}`
}

function participatingGroups(matcher) {
  const named = matcher.getNamedGroups()
  const groups = {}
  for (const [name, value] of Object.entries(named)) {
    if (value !== null && value !== undefined) groups[name] = value
  }
  return groups
}

function compileMultiline(pattern) {
  let cached = compiledPatterns.get(pattern)
  if (!cached) {
    try {
      cached = { re: RE2JS.compile(`(?m)${pattern}`) }
    } catch (error) {
      const relaxed = relaxBraces(pattern)
      if (relaxed !== pattern) {
        try {
          cached = { re: RE2JS.compile(`(?m)${relaxed}`) }
        } catch {
          cached = { error }
        }
      } else {
        cached = { error }
      }
    }
    compiledPatterns.set(pattern, cached)
  }
  return cached
}

// re2js remembers a `{` that was not a quantifier and then rejects the next
// real quantifier as nested. Go treats that `{` as a literal and still parses
// the following `{n}`. Escape only a `{` that is not itself `{n}`, `{n,}`, or
// `{n,m}`, and only after the original pattern fails to compile.
function relaxBraces(pattern) {
  let out = ''
  for (let index = 0; index < pattern.length;) {
    const ch = pattern[index]
    if (ch === '\\') {
      const next = index + 1 < pattern.length ? 2 : 1
      out += pattern.slice(index, index + next)
      index += next
      continue
    }
    if (ch === '[') {
      const start = index
      index += 1
      if (pattern[index] === '^') index += 1
      if (pattern[index] === ']') index += 1
      while (index < pattern.length && pattern[index] !== ']') {
        if (pattern[index] === '\\' && index + 1 < pattern.length) index += 2
        else index += 1
      }
      if (pattern[index] === ']') index += 1
      out += pattern.slice(start, index)
      continue
    }
    if (ch === '{') {
      const match = /^\{(?:0|[1-9][0-9]*)(?:,(?:0|[1-9][0-9]*)?)?\}/u.exec(pattern.slice(index))
      if (match) {
        out += match[0]
        index += match[0].length
        continue
      }
      out += '\\{'
      index += 1
      continue
    }
    out += ch
    index += 1
  }
  return out
}

function annotate(sourcePath, content) {
  const lines = sourceLines(content)
  let out = ''
  for (let index = 0; index < lines.length; index += 1) {
    out += `# thue-source: ${sourcePath}:${index + 1}\n${lines[index]}\n`
  }
  return out
}

function sourceLines(content) {
  if (content === '') return []
  const parts = content.split('\n')
  if (content.endsWith('\n')) parts.pop()
  return parts
}

function splitAnnotatedLines(content) {
  if (content === '') return []
  const trimmed = content.endsWith('\n') ? content.slice(0, -1) : content
  return trimmed.split('\n')
}

function iterSourceRows(content, programPath) {
  const rows = []
  let currentSourcePath = programPath
  let currentSourceLine = 0
  const lines = splitAnnotatedLines(content)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed.startsWith('# thue-source: ')) {
      const marker = trimmed.slice('# thue-source: '.length)
      const colon = marker.lastIndexOf(':')
      if (colon >= 0 && /^\d+$/.test(marker.slice(colon + 1))) {
        currentSourcePath = marker.slice(0, colon)
        currentSourceLine = Number(marker.slice(colon + 1))
      }
      continue
    }
    rows.push({
      text: line,
      sourcePath: currentSourcePath,
      sourceLine: currentSourceLine || index + 1,
    })
  }
  return rows
}

function annotatedContentFromRows(rows) {
  let out = ''
  for (let index = 0; index < rows.length; index += 1) {
    if (index > 0) out += '\n'
    out += `# thue-source: ${rows[index].sourcePath}:${rows[index].sourceLine}\n${rows[index].text}`
  }
  return out
}

function expandPatterns(content) {
  const aliases = new Map()
  const out = []
  let currentSourceLine = 0
  const lines = splitAnnotatedLines(content)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineNumber = index + 1
    const stripped = line.trim()
    if (stripped.startsWith('# thue-source: ')) {
      const marker = stripped.slice('# thue-source: '.length)
      const colon = marker.lastIndexOf(':')
      if (colon >= 0 && /^\d+$/.test(marker.slice(colon + 1))) currentSourceLine = Number(marker.slice(colon + 1))
      out.push(line)
      continue
    }
    const effectiveLine = currentSourceLine || lineNumber
    if (stripped === '') {
      out.push(line)
      continue
    }
    const aliasMatch = ALIAS_DEF.exec(line)
    if (aliasMatch && !hasTerminalOperator(line)) {
      const name = aliasMatch[1]
      const pattern = aliasMatch[2].trim()
      if (aliases.has(name)) throw new Error(`Line ${effectiveLine}: Duplicate pattern alias '${name}'`)
      if (namedCaptureNames(pattern).size > 0) {
        throw new Error(`Line ${effectiveLine}: Pattern alias '${name}' must not contain named captures`)
      }
      aliases.set(name, `(?:${expandAliasRefs(pattern, aliases, effectiveLine)})`)
      continue
    }
    let split
    try {
      split = splitRuleLine(line)
    } catch (error) {
      throw new Error(`Line ${effectiveLine}: ${error.message}`)
    }
    if (split) {
      let rebuilt = expandAliasRefs(split.lhs, aliases, effectiveLine)
      for (const mid of split.mids) rebuilt += `::|${expandAliasRefs(mid, aliases, effectiveLine)}`
      rebuilt += `::${split.op}${split.rhs}`
      out.push(rebuilt)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function expandAliasRefs(pattern, aliases, lineNumber) {
  const invalid = INVALID_ALIAS.exec(pattern)
  if (invalid) {
    throw new Error(`Line ${lineNumber}: Invalid pattern alias token '<|${invalid[1]}|>'; use '$${invalid[1]}' aliases`)
  }
  let out = ''
  let substitutions = 0
  for (let index = 0; index < pattern.length;) {
    if (pattern[index] !== '$' || (index > 0 && pattern[index - 1] === '\\')) {
      out += pattern[index]
      index += 1
      continue
    }
    let end = index + 1
    if (end >= pattern.length || pattern[end] < 'A' || pattern[end] > 'Z') {
      out += pattern[index]
      index += 1
      continue
    }
    end += 1
    while (end < pattern.length) {
      const ch = pattern[end]
      if ((ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_') {
        end += 1
        continue
      }
      break
    }
    const name = pattern.slice(index + 1, end)
    if (!aliases.has(name)) throw new Error(`Line ${lineNumber}: Unknown pattern alias '$${name}'`)
    substitutions += 1
    if (substitutions > MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE) {
      throw new Error(`Line ${lineNumber}: Pattern alias expansion exceeded substitution limit (${MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE})`)
    }
    out += aliases.get(name)
    index = end
  }
  if (utf8Length(out) > MAX_EXPANDED_PATTERN_BYTES) {
    throw new Error(`Line ${lineNumber}: Pattern alias expansion exceeded byte limit (${MAX_EXPANDED_PATTERN_BYTES})`)
  }
  return out
}

function parseRule(line, lineNumber, sourcePath) {
  const trimmed = line.trim()
  if (trimmed === '' || trimmed === '::=') return null
  let split
  try {
    split = splitRuleLine(line)
  } catch (error) {
    throw new Error(`Line ${lineNumber}: ${error.message}`)
  }
  if (!split) {
    if (hasInvalidOperator(line)) throw new Error(`Line ${lineNumber}: Invalid rule syntax: ${line}`)
    return null
  }
  const lhs = split.lhs.replace(/[ \t]+$/u, '')
  const rhs = split.rhs.replace(/^[ \t]+/u, '')
  if (lhs === '') return null
  const operator = { '=': SUBSTITUTE, '<': READ, '>': WRITE, '-': EXIT, '!': BUILTIN }[split.op]
  if (!operator) throw new Error(`Line ${lineNumber}: Invalid rule syntax: ${line}`)
  const mids = []
  for (const text of split.mids) {
    const pattern = text.replace(/^[ \t]+|[ \t]+$/gu, '')
    if (pattern === '') throw new Error(`Line ${lineNumber}: ::| requires a regex`)
    mids.push(pattern)
  }
  const compiled = compileMultiline(lhs)
  if (compiled.error) {
    throw new Error(`Line ${lineNumber}: Invalid regex '${lhs}': ${compiled.error.message || compiled.error}`)
  }
  let builtinName = ''
  let builtinArgs = []
  if (operator === BUILTIN) {
    const names = new Set(Object.keys(compiled.re.namedGroups()))
    for (const mid of mids) for (const name of namedCaptureNames(mid)) names.add(name)
    const parsed = parseBuiltinCall(rhs, lineNumber, names)
    builtinName = parsed.name
    builtinArgs = parsed.args
  }
  return {
    lhs,
    pattern: compiled.re,
    mids,
    operator,
    rhs,
    lineNumber,
    sourcePath,
    source: trimmed,
    builtinName,
    builtinArgs,
    literalPrefix: literalPrefix(lhs),
  }
}

function parseBuiltinCall(rhs, lineNumber, captures) {
  const tokens = rhs.trim() === '' ? [] : rhs.trim().split(/\s+/)
  if (tokens.length === 0) throw new Error(`Line ${lineNumber}: ::! requires a builtin name`)
  const name = tokens[0]
  if (!Object.prototype.hasOwnProperty.call(BUILTIN_ARITY, name)) {
    throw new Error(`Line ${lineNumber}: Unknown builtin '${name}'`)
  }
  const args = tokens.slice(1)
  const arity = BUILTIN_ARITY[name]
  if (args.length !== arity) throw new Error(`Line ${lineNumber}: Builtin '${name}' expects ${arity} args, got ${args.length}`)
  for (const arg of args) {
    if (!isName(arg)) throw new Error(`Line ${lineNumber}: ::! arguments must be capture names, got '${arg}'`)
    if (!captures.has(arg)) throw new Error(`Line ${lineNumber}: ::! argument '${arg}' is not a named capture`)
  }
  return { name, args }
}

function splitRuleLine(line) {
  let sawMid = false
  let lhs = ''
  const mids = []
  for (let index = 0; index + 2 < line.length;) {
    const op = structuralOpAt(line, index)
    if (!op) {
      index += 1
      continue
    }
    if (op === '|') {
      if (!sawMid) {
        lhs = line.slice(0, index)
        sawMid = true
      }
      const next = nextStructuralOp(line, index + 3)
      if (!next) throw new Error('::| requires a terminal operator')
      mids.push(line.slice(index + 3, next.index))
      if (next.op === '|') {
        index = next.index
        continue
      }
      return { lhs, mids, op: next.op, rhs: line.slice(next.index + 3) }
    }
    if (!sawMid) lhs = line.slice(0, index)
    return { lhs, mids, op, rhs: line.slice(index + 3) }
  }
  if (sawMid) throw new Error('::| requires a terminal operator')
  return null
}

function hasTerminalOperator(line) {
  for (let index = 0; index + 2 < line.length; index += 1) {
    const op = structuralOpAt(line, index)
    if (op && op !== '|') return true
  }
  return false
}

function structuralOpAt(line, index) {
  if (index + 2 >= line.length || line[index] !== ':' || line[index + 1] !== ':') return ''
  if (index > 0 && line[index - 1] === '\\') return ''
  const op = line[index + 2]
  if (op === '|' || op === '=' || op === '<' || op === '>' || op === '-' || op === '!') return op
  return ''
}

function nextStructuralOp(line, start) {
  for (let index = start; index + 2 < line.length; index += 1) {
    const op = structuralOpAt(line, index)
    if (op) return { index, op }
  }
  return null
}

function hasInvalidOperator(line) {
  for (let index = 0; index + 2 < line.length; index += 1) {
    if ((index === 0 || line[index - 1] !== '\\') && line[index] === ':' && line[index + 1] === ':') {
      if (!/[\s\w=<>!-]/.test(line[index + 2])) return true
    }
  }
  return false
}

function namedCaptureNames(pattern) {
  const names = new Set()
  for (const match of pattern.matchAll(NAMED_CAPTURE)) names.add(match[1])
  return names
}

function expandTemplate(template, groups, extra) {
  const raw = { ...groups, ...extra }
  const vars = {}
  for (const [key, value] of Object.entries(raw)) vars[key] = String(value).replaceAll('\\', '\\\\')
  let out = ''
  let pos = 0
  while (pos < template.length) {
    if (template.startsWith('{{', pos)) {
      const end = template.indexOf('}}', pos + 2)
      if (end >= 0) {
        const inside = template.slice(pos + 2, end)
        if (inside.includes('|')) {
          const parts = inside.split('|')
          if (parts.length !== 2 || !isName(parts[0]) || !isName(parts[1])) {
            throw new Error(`Malformed template filter '{{${inside}}}'`)
          }
          if (!Object.prototype.hasOwnProperty.call(raw, parts[0])) throw new Error(`Missing template capture '${parts[0]}'`)
          const value = String(raw[parts[0]])
          if (parts[1] === 'pctenc') out += pctEncode(value)
          else if (parts[1] === 'pctdec') out += pctDecode(value)
          else throw new Error(`Unknown template filter '${parts[1]}'`)
          pos = end + 2
          continue
        }
        if (isWord(inside)) {
          out += vars[inside] || ''
          pos = end + 2
          continue
        }
      }
    }
    if (template.startsWith('{{', pos)) {
      out += template[pos]
      pos += 1
      continue
    }
    const next = template.indexOf('{{', pos)
    const literal = next < 0 ? template.slice(pos) : template.slice(pos, next)
    out += decodeReplacementEscapes(literal)
    if (next < 0) break
    pos = next
  }
  return out
}

function expandMidPattern(pattern, groups) {
  let out = ''
  let pos = 0
  while (pos < pattern.length) {
    if (pattern.startsWith('{{', pos)) {
      const end = pattern.indexOf('}}', pos + 2)
      if (end >= 0) {
        const inside = pattern.slice(pos + 2, end)
        if (inside.includes('|')) {
          out += expandMidFilters(inside, groups)
          pos = end + 2
          continue
        }
        if (isName(inside)) {
          out += Object.prototype.hasOwnProperty.call(groups, inside) ? String(groups[inside]) : ''
          pos = end + 2
          continue
        }
      }
    }
    const next = pattern.indexOf('{{', pos)
    if (next < 0) {
      out += pattern.slice(pos)
      break
    }
    if (next === pos) {
      out += pattern[pos]
      pos += 1
      continue
    }
    out += pattern.slice(pos, next)
    pos = next
  }
  return out
}

function expandMidFilters(inside, groups) {
  const parts = inside.split('|')
  if (parts.length < 2 || !isName(parts[0]) || parts.slice(1).some((part) => !isName(part))) {
    throw new Error(`Malformed template filter '{{${inside}}}'`)
  }
  if (!Object.prototype.hasOwnProperty.call(groups, parts[0])) throw new Error(`Missing template capture '${parts[0]}'`)
  let value = String(groups[parts[0]])
  for (const filter of parts.slice(1)) {
    if (filter === 'pctenc') value = pctEncode(value)
    else if (filter === 'pctdec') value = pctDecode(value)
    else if (filter === 'quote') value = quoteMeta(value)
    else throw new Error(`Unknown template filter '${filter}'`)
  }
  return value
}

function decodeReplacementEscapes(text) {
  const placeholder = '\u0000BACKSLASH\u0000'
  return text.replaceAll('\\\\', placeholder).replaceAll('\\n', '\n').replaceAll('\\t', '\t').replaceAll('\\r', '\r').replaceAll(placeholder, '\\')
}

function isWord(value) {
  return /^[A-Za-z0-9_]+$/.test(value)
}

function isName(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}

function parseReadRHS(lineNumber, rhs) {
  const parts = rhs.trim() === '' ? [] : rhs.trim().split(/\s+/)
  if (parts.length !== 2) throw new Error(`Line ${lineNumber}: ::< requires read_spec and literal resource`)
  const [readSpec, resource] = parts
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(readSpec)) {
    throw new Error(`Line ${lineNumber}: invalid read timeout '${readSpec}'`)
  }
  const seconds = Number(readSpec)
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Line ${lineNumber}: invalid read timeout '${readSpec}'`)
  if (!isName(resource)) throw new Error(`Line ${lineNumber}: ::< resource must be a literal binding name`)
  return { resource, seconds }
}

function splitResource(expanded) {
  for (let index = 0; index < expanded.length; index += 1) {
    const ch = expanded[index]
    if (ch === ' ' || ch === '\t') return { resource: expanded.slice(0, index), content: expanded.slice(index + 1) }
  }
  return { resource: expanded, content: '' }
}

function quoteMeta(value) {
  let out = ''
  for (const ch of value) {
    if (RE_META.includes(ch)) out += '\\'
    out += ch
  }
  return out
}

function pctEncode(value) {
  let out = ''
  for (const byte of encoder.encode(value)) {
    if ((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122) || (byte >= 48 && byte <= 57) || byte === 95 || byte === 46 || byte === 45) {
      out += String.fromCharCode(byte)
    } else {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

function pctDecode(value) {
  const data = []
  for (let pos = 0; pos < value.length;) {
    const ch = value[pos]
    if (ch === '%') {
      if (pos + 2 >= value.length) throw new Error('PCT payload has incomplete percent escape')
      const hx = value.slice(pos + 1, pos + 3)
      if (!/^[0-9A-F]{2}$/.test(hx)) throw new Error('PCT payload has malformed or non-canonical percent escape')
      data.push(Number.parseInt(hx, 16))
      pos += 3
    } else {
      if (!/^[A-Za-z0-9_.-]$/.test(ch)) throw new Error('PCT payload contains unencoded unsafe byte')
      data.push(ch.charCodeAt(0))
      pos += 1
    }
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(data))
  } catch {
    throw new Error('PCT payload decoded bytes are not valid UTF-8')
  }
}

function escapePctPayload(value) {
  const text = pctDecode(value)
  let out = ''
  for (const rune of text) {
    if (rune === '\\') out += '\\\\'
    else if (rune === '"') out += '\\"'
    else if (rune === '\n') out += '\\n'
    else if (rune === '\t') out += '\\t'
    else if (rune === '\r') out += '\\r'
    else if (rune === '\b') out += '\\b'
    else if (rune === '\f') out += '\\f'
    else out += rune
  }
  return pctEncode(out)
}

function unescapePctPayload(value) {
  const text = pctDecode(value)
  let out = ''
  for (let pos = 0; pos < text.length; pos += 1) {
    const ch = text[pos]
    if (ch !== '\\') {
      out += ch
      continue
    }
    if (pos + 1 >= text.length) throw new Error("Builtin 'unescape' has trailing backslash escape")
    pos += 1
    const esc = text[pos]
    if (esc === '\\') out += '\\'
    else if (esc === '"') out += '"'
    else if (esc === 'n') out += '\n'
    else if (esc === 't') out += '\t'
    else if (esc === 'r') out += '\r'
    else if (esc === 'b') out += '\b'
    else if (esc === 'f') out += '\f'
    else throw new Error(`Builtin 'unescape' unsupported escape '\\${esc}'`)
  }
  return pctEncode(out)
}

function b64urlEncode(value) {
  const bytes = encoder.encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '')
}

function b64urlDecode(value) {
  if (value.includes('=')) throw new Error("Builtin 'b64dec' expected unpadded Base64url input")
  if (!/^[A-Za-z0-9_-]*$/.test(value)) throw new Error("Builtin 'b64dec' expected Base64url input")
  if (value.length % 4 === 1) throw new Error("Builtin 'b64dec' invalid Base64url length")
  const padded = value + '='.repeat((4 - (value.length % 4)) % 4)
  let binary
  try {
    binary = atob(padded.replaceAll('-', '+').replaceAll('_', '/'))
  } catch (error) {
    throw new Error(`Builtin 'b64dec' invalid Base64url input: ${error.message || error}`)
  }
  const bytes = Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new Error("Builtin 'b64dec' decoded bytes are not valid UTF-8")
  }
  if (b64urlEncode(text) !== value) throw new Error("Builtin 'b64dec' expected canonical unpadded Base64url input")
  return text
}

function parseNumber(value, builtin) {
  if (!NUMERIC_LITERAL.test(value)) throw new Error(`Builtin '${builtin}' expected numeric input, got '${value}'`)
  if (value.length > MAX_NUMERIC_LITERAL_CHARS) {
    throw new Error(`Builtin '${builtin}' numeric input exceeds maximum length (${MAX_NUMERIC_LITERAL_CHARS} characters)`)
  }
  if (ZERO_DENOMINATOR.test(value)) throw new Error(`Builtin '${builtin}' fraction denominator must be non-zero`)
  let sign = 1n
  let body = value
  if (body.startsWith('-')) {
    sign = -1n
    body = body.slice(1)
  }
  let numerator
  let denominator
  if (body.includes('/')) {
    const [left, right] = body.split('/')
    numerator = BigInt(left)
    denominator = BigInt(right)
  } else if (body.includes('.')) {
    const [whole, frac] = body.split('.')
    numerator = BigInt(whole + frac)
    denominator = 10n ** BigInt(frac.length)
  } else {
    numerator = BigInt(body)
    denominator = 1n
  }
  return reduce(sign * numerator, denominator)
}

function reduce(numerator, denominator) {
  if (denominator < 0n) {
    numerator = -numerator
    denominator = -denominator
  }
  const divisor = gcd(numerator < 0n ? -numerator : numerator, denominator)
  return { n: numerator / divisor, d: denominator / divisor }
}

function gcd(left, right) {
  let a = left
  let b = right
  while (b) {
    const next = a % b
    a = b
    b = next
  }
  return a
}

function formatRat(value) {
  if (value.d === 1n) return value.n.toString()
  return `${value.n.toString()}/${value.d.toString()}`
}

function cmpRat(left, right) {
  const a = left.n * right.d
  const b = right.n * left.d
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

function evalBuiltin(name, values) {
  const arity = BUILTIN_ARITY[name]
  if (arity == null || values.length !== arity) {
    throw new Error(`internal error: invalid validated builtin '${name}' with ${values.length} values`)
  }
  if (name === 'eq') return values[0] === values[1] ? '1' : '0'
  if (name === 'b64enc') return b64urlEncode(values[0])
  if (name === 'b64dec') return b64urlDecode(values[0])
  if (name === 'pctenc') return pctEncode(values[0])
  if (name === 'pctdec') return pctDecode(values[0])
  if (name === 'escape') return escapePctPayload(values[0])
  if (name === 'unescape') return unescapePctPayload(values[0])
  if (name === 'num') return `<num>${formatRat(parseNumber(values[0], name))}</num>`
  const a = parseNumber(values[0], name)
  const b = parseNumber(values[1], name)
  if (name === 'add') return formatRat(reduce(a.n * b.d + b.n * a.d, a.d * b.d))
  if (name === 'sub') return formatRat(reduce(a.n * b.d - b.n * a.d, a.d * b.d))
  if (name === 'mul') return formatRat(reduce(a.n * b.n, a.d * b.d))
  if (name === 'div') {
    if (b.n === 0n) throw new Error("Builtin 'div' division by zero")
    return formatRat(reduce(a.n * b.d, a.d * b.n))
  }
  if (name === 'mod') {
    if (b.n === 0n) throw new Error("Builtin 'mod' modulo by zero")
    if (a.d !== 1n || b.d !== 1n) throw new Error("Builtin 'mod' expected integer inputs")
    if (a.n < 0n || b.n < 0n) throw new Error("Builtin 'mod' expected non-negative integer inputs")
    return (a.n % b.n).toString()
  }
  if (name === 'numeq') return cmpRat(a, b) === 0 ? '1' : '0'
  if (name === 'lt') return cmpRat(a, b) < 0 ? '1' : '0'
  if (name === 'le') return cmpRat(a, b) <= 0 ? '1' : '0'
  if (name === 'gt') return cmpRat(a, b) > 0 ? '1' : '0'
  if (name === 'ge') return cmpRat(a, b) >= 0 ? '1' : '0'
  throw new Error(`internal error: validated builtin '${name}' has no evaluator`)
}

function formatDebugGroups(groups) {
  const keys = Object.keys(groups).sort()
  const parts = keys.map((key) => `${key}:${String(groups[key]).replaceAll('\n', '\\n').replaceAll('\r', '\\r')}`)
  return `map[${parts.join(' ')}]`
}

function displayPath(source) {
  if (typeof process === 'undefined' || typeof process.cwd !== 'function') return source.replaceAll('\\', '/')
  const cwd = process.cwd()
  if (source === cwd || source.startsWith(`${cwd}/`)) {
    const relative = source.slice(cwd.length).replace(/^\//, '')
    if (relative !== '' && !relative.startsWith('..')) return relative
  }
  return source.replaceAll('\\', '/')
}

export function utf8Length(text) {
  return encoder.encode(text).length
}

function utf8Offset(text, index) {
  return encoder.encode(text.slice(0, index)).length
}

export function formatTrace(events) {
  if (!events || events.length === 0) return ''
  const lines = events.map((event) => JSON.stringify({
    step: event.step,
    ruleIndex: event.ruleIndex,
    lineNumber: event.lineNumber,
    operator: event.operator,
    matchStart: event.matchStart,
    matchEnd: event.matchEnd,
    error: event.error || '',
    stateBefore: event.stateBefore,
    replacement: event.replacement || '',
    stateAfter: event.stateAfter,
    exitCode: event.exitCode == null ? null : event.exitCode,
  }).replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029'))
  return `${lines.join('\n')}\n`
}
