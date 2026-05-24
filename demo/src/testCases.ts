import { parse as parseToml } from 'smol-toml'

const DEFAULT_MAX_EVALS = 10000

export interface TestManifestCaseExpect {
  exit_code?: number
  stdout?: string
  stdout_stripped?: string
  stderr?: string
  stderr_stripped?: string
  stderr_contains?: string[]
}

export interface TestCaseOption {
  id: string
  manifestPath: string
  manifestLabel: string
  programPath: string
  caseName: string
  input: string
  inputPreview: string
  args: string[]
  stdin?: string
  expect: TestManifestCaseExpect
  searchableText: string
}

interface RawManifestCase {
  name?: unknown
  input?: unknown
  stdin?: unknown
  args?: unknown
  expect?: unknown
}

interface RawManifest {
  program?: unknown
  args?: unknown
  case?: unknown
}

export function normalizeRepoPath(path: string): string {
  return path.replace(/^\.\//, '').replace(/^\/+/g, '')
}

function dirname(path: string): string {
  const normalized = normalizeRepoPath(path)
  const index = normalized.lastIndexOf('/')
  return index < 0 ? '' : normalized.slice(0, index)
}

function normalizePathParts(parts: string[]): string {
  const stack: string[] = []
  for (const part of parts.join('/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

export function resolveManifestProgram(manifestPath: string, program: string): string {
  return normalizePathParts([dirname(manifestPath), program])
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : []
}

function expectObject(value: unknown): TestManifestCaseExpect {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as TestManifestCaseExpect : {}
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function manifestLabel(manifestPath: string): string {
  const normalized = normalizeRepoPath(manifestPath)
  const parts = normalized.split('/')
  const examplesIndex = parts.indexOf('examples')
  if (examplesIndex >= 0 && parts.length >= examplesIndex + 4) {
    return `${parts[examplesIndex + 1]} / ${parts[parts.length - 1]}`
  }
  return normalized
}

export function inputPreview(input: string | undefined): string {
  if (!input) return 'no input'
  const compact = input.replace(/\s+/g, ' ').trim()
  return compact.length > 90 ? `${compact.slice(0, 89)}…` : compact
}

export function flattenTestManifests(manifests: Record<string, string>): TestCaseOption[] {
  const options: TestCaseOption[] = []
  for (const [rawPath, text] of Object.entries(manifests)) {
    const manifestPath = normalizeRepoPath(rawPath.replace(/^\.\.\/\.\.\//, ''))
    const parsed = parseToml(text) as RawManifest
    if (typeof parsed.program !== 'string') continue
    const programPath = resolveManifestProgram(manifestPath, parsed.program)
    const manifestArgs = asStringArray(parsed.args)
    const cases = Array.isArray(parsed.case) ? parsed.case as RawManifestCase[] : []
    for (const [index, testCase] of cases.entries()) {
      const caseName = typeof testCase.name === 'string' ? testCase.name : `case ${index + 1}`
      const input = typeof testCase.input === 'string' ? testCase.input : ''
      const args = [...manifestArgs, ...asStringArray(testCase.args)]
      if (!args.some(arg => arg === '--max-evals' || arg.startsWith('--max-evals='))) {
        args.push('--max-evals', String(DEFAULT_MAX_EVALS))
      }
      const label = manifestLabel(manifestPath)
      const searchableText = [manifestPath, label, caseName].join(' ')
      options.push({
        id: `${manifestPath}::${slug(caseName)}`,
        manifestPath,
        manifestLabel: label,
        programPath,
        caseName,
        input,
        inputPreview: inputPreview(input),
        args,
        stdin: typeof testCase.stdin === 'string' ? testCase.stdin : undefined,
        expect: expectObject(testCase.expect),
        searchableText,
      })
    }
  }
  return options
}

