export interface ResourceUsage {
  name: string
  reads: boolean
  writes: boolean
}

export interface RuleAnalysis {
  resources: ResourceUsage[]
  errors: string[]
}

const bindingName = /^[A-Za-z_][A-Za-z0-9_]*$/
const goFloat = /^[+-]?(?:(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?|Inf|NaN)$/
const invalidOperator = /(?:^|[^\\])::[^\s\w=<>!-]/

interface RuleSplit {
  lhs: string
  op: string
  rhs: string
  error?: string
}

export function analyzeRules(rules: string): RuleAnalysis {
  const byName = new Map<string, ResourceUsage>()
  const order: string[] = []
  const errors: string[] = []
  const lines = rules.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  lines.forEach((line, index) => {
    const lineNumber = index + 1
    const split = splitRuleLine(line)
    if (split.error) {
      errors.push(`Line ${lineNumber}: ${split.error}`)
      return
    }
    if (!split.op) {
      if (invalidOperator.test(line)) errors.push(`Line ${lineNumber}: Invalid rule syntax: ${line}`)
      return
    }
    const lhs = split.lhs.replace(/[ \t]+$/g, '')
    if (lhs === '') return
    const rhs = split.rhs.replace(/^[ \t]+/g, '')
    if (split.op === '<') {
      const readError = readRuleError(lineNumber, rhs)
      if (readError) {
        errors.push(readError)
        return
      }
      const name = rhs.trim().split(/\s+/)[1]
      if (name) markResource(byName, order, name, 'read')
      return
    }
    if (split.op === '>') {
      const name = literalWriteResource(rhs)
      if (name) markResource(byName, order, name, 'write')
    }
  })
  return {
    resources: order.map(name => byName.get(name)!),
    errors,
  }
}

function readRuleError(lineNumber: number, rhs: string): string | undefined {
  const parts = rhs.trim().split(/\s+/).filter(part => part.length > 0)
  if (parts.length !== 2) return `Line ${lineNumber}: ::< requires read_spec and literal resource`
  const [readSpec, resource] = parts
  if (!isPositiveFiniteTimeout(readSpec)) return `Line ${lineNumber}: invalid read timeout '${readSpec}'`
  if (!bindingName.test(resource)) return `Line ${lineNumber}: ::< resource must be a literal binding name`
  return undefined
}

function isPositiveFiniteTimeout(spec: string): boolean {
  if (!goFloat.test(spec)) return false
  const value = Number(spec)
  return Number.isFinite(value) && value > 0
}

function literalWriteResource(rhs: string): string | undefined {
  let end = rhs.length
  for (let index = 0; index < rhs.length; index += 1) {
    const char = rhs[index]
    if (char === ' ' || char === '\t') {
      end = index
      break
    }
  }
  const token = rhs.slice(0, end)
  if (!token || token.includes('{{') || token.includes('\\')) return undefined
  if (!bindingName.test(token)) return undefined
  return token
}

function markResource(resources: Map<string, ResourceUsage>, order: string[], name: string, mode: 'read' | 'write'): void {
  const current = resources.get(name) ?? { name, reads: false, writes: false }
  if (!resources.has(name)) order.push(name)
  if (mode === 'read') current.reads = true
  else current.writes = true
  resources.set(name, current)
}

function splitRuleLine(line: string): RuleSplit {
  let lhs = ''
  let sawMid = false
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
      if (!next) return { lhs: '', op: '', rhs: '', error: '::| requires a terminal operator' }
      if (next.op === '|') {
        index = next.index
        continue
      }
      return { lhs, op: next.op, rhs: line.slice(next.index + 3) }
    }
    if (!sawMid) lhs = line.slice(0, index)
    return { lhs, op, rhs: line.slice(index + 3) }
  }
  if (sawMid) return { lhs: '', op: '', rhs: '', error: '::| requires a terminal operator' }
  return { lhs: '', op: '', rhs: '' }
}

function structuralOpAt(line: string, index: number): string | undefined {
  if (index + 2 >= line.length || line[index] !== ':' || line[index + 1] !== ':') return undefined
  if (index > 0 && line[index - 1] === '\\') return undefined
  const op = line[index + 2]
  if (op === '|' || op === '=' || op === '<' || op === '>' || op === '-' || op === '!') return op
  return undefined
}

function nextStructuralOp(line: string, start: number): { index: number; op: string } | undefined {
  for (let index = start; index + 2 < line.length; index += 1) {
    const op = structuralOpAt(line, index)
    if (op) return { index, op }
  }
  return undefined
}
