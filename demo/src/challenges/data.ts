// SPDX-License-Identifier: AGPL-3.0-or-later
import { solutionHref } from './solutionLinks'
import type { ChallengeEntry, ChallengeMetricRecord, ChallengeSolution, ChallengeTestCase, ChallengeTestManifest } from './types'

const schemaModules = import.meta.glob('../../../challenges/test-schema.json', {
  import: 'default',
  eager: true,
})

const readmeModules = import.meta.glob('../../../challenges/*/readme.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const solutionReadmeModules = import.meta.glob('../../../challenges/*/solutions/readme.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const metricModules = import.meta.glob('../../../challenges/*/solutions/*.json', {
  import: 'default',
  eager: true,
})

const testModules = import.meta.glob('../../../challenges/*/tests/*.json', {
  import: 'default',
  eager: true,
})

const hintModules = import.meta.glob('../../../challenges/*/hint.tpp', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const solutionSourceModules = import.meta.glob('../../../challenges/*/solutions/*.tpp', {
  query: '?raw',
  import: 'default',
  eager: true,
})

interface ChallengeTestSchema {
  manifest_keys: string[]
  case_keys: string[]
  required_case_keys: string[]
  resource_keys: string[]
  resource_name_pattern: string
  expected_output_resources: string[]
}

const challengeTestSchema = Object.values(schemaModules)[0] as ChallengeTestSchema
const manifestKeys = new Set(challengeTestSchema.manifest_keys)
const caseKeys = new Set(challengeTestSchema.case_keys)
const requiredCaseKeys = new Set(challengeTestSchema.required_case_keys)
const resourceKeys = new Set(challengeTestSchema.resource_keys)
const resourceNamePattern = new RegExp(challengeTestSchema.resource_name_pattern)
const expectedOutputResources = new Set(challengeTestSchema.expected_output_resources)

export const challenges: ChallengeEntry[] = Object.entries(readmeModules)
  .map(([readmePath, rawMarkdown]) => {
    const slug = challengeSlugFromReadmePath(readmePath)
    const { frontMatter, body } = splitFrontMatter(String(rawMarkdown))
    const solutions = solutionsForSlug(slug)

    return {
      slug,
      title: frontMatter.title || titleFromSlug(slug),
      summary: frontMatter.description || summaryFromBody(body),
      readme: body,
      solutionsReadme: solutionsReadmeForSlug(slug),
      path: `/challenges/${slug}/`,
      solutionsPath: `/challenges/${slug}/solutions`,
      bestSolutionId: solutions[0]?.id ?? null,
      tests: testsForSlug(slug),
      hintSource: hintForSlug(slug),
      solutions,
    }
  })
  .sort((left, right) => left.slug.localeCompare(right.slug))

function testsForSlug(slug: string): ChallengeTestCase[] {
  return Object.entries(testModules)
    .filter(([testPath]) => challengeSlugFromTestPath(testPath) === slug)
    .flatMap(([testPath, rawManifest]) => validateChallengeTestManifest(rawManifest, testPath).cases)
}

export function validateChallengeTestManifest(rawManifest: unknown, sourcePath = 'challenge manifest'): ChallengeTestManifest {
  if (!rawManifest || typeof rawManifest !== 'object' || Array.isArray(rawManifest)) {
    throw new Error(`${sourcePath} must contain a JSON object`)
  }
  const manifestObject = rawManifest as Record<string, unknown>
  const unknownManifestKeys = Object.keys(manifestObject).filter(key => !manifestKeys.has(key)).sort()
  if (unknownManifestKeys.length > 0) {
    throw new Error(`${sourcePath} has unknown top-level keys: ${unknownManifestKeys.join(', ')}`)
  }
  if (!Array.isArray(manifestObject.cases) || manifestObject.cases.length === 0) {
    throw new Error(`${sourcePath} must contain non-empty cases array`)
  }

  const cases = manifestObject.cases.map((rawCase, caseIndex) => validateChallengeTestCase(rawCase, sourcePath, caseIndex + 1))
  return { cases }
}

function validateChallengeTestCase(rawCase: unknown, sourcePath: string, caseNumber: number): ChallengeTestCase {
  if (!rawCase || typeof rawCase !== 'object' || Array.isArray(rawCase)) {
    throw new Error(`${sourcePath} case ${caseNumber} is not an object`)
  }
  const caseObject = rawCase as Record<string, unknown>
  const unknownCaseKeys = Object.keys(caseObject).filter(key => !caseKeys.has(key)).sort()
  if (unknownCaseKeys.length > 0) {
    throw new Error(`${sourcePath} case ${caseNumber} has unknown keys: ${unknownCaseKeys.join(', ')}`)
  }
  const missingCaseKeys = [...requiredCaseKeys].filter(key => !(key in caseObject)).sort()
  if (missingCaseKeys.length > 0) {
    throw new Error(`${sourcePath} case ${caseNumber} is missing required keys: ${missingCaseKeys.join(', ')}`)
  }
  if (typeof caseObject.name !== 'string' || caseObject.name.length === 0) {
    throw new Error(`${sourcePath} case ${caseNumber} name must be a non-empty string`)
  }
  const caseName = caseObject.name
  if (!caseObject.resources || typeof caseObject.resources !== 'object' || Array.isArray(caseObject.resources) || Object.keys(caseObject.resources).length === 0) {
    throw new Error(`${sourcePath} case ${caseNumber} must contain non-empty resources object`)
  }
  if (!Number.isInteger(caseObject.exit_code)) {
    throw new Error(`${sourcePath} case ${caseNumber} exit_code must be an integer`)
  }
  const exitCode = caseObject.exit_code as number

  const resources: Record<string, { buffer?: string, expected_output?: string }> = {}
  Object.entries(caseObject.resources as Record<string, unknown>).forEach(([resourceName, rawResource]) => {
    if (!resourceNamePattern.test(resourceName)) {
      throw new Error(`${sourcePath} case ${caseNumber} has invalid resource name ${JSON.stringify(resourceName)}`)
    }
    if (!rawResource || typeof rawResource !== 'object' || Array.isArray(rawResource)) {
      throw new Error(`${sourcePath} case ${caseNumber} resource ${resourceName} is not an object`)
    }
    const resourceObject = rawResource as Record<string, unknown>
    const unknownResourceKeys = Object.keys(resourceObject).filter(key => !resourceKeys.has(key)).sort()
    if (unknownResourceKeys.length > 0) {
      throw new Error(`${sourcePath} case ${caseNumber} resource ${resourceName} has unknown keys: ${unknownResourceKeys.join(', ')}`)
    }
    if (!Object.keys(resourceObject).some(key => resourceKeys.has(key))) {
      throw new Error(`${sourcePath} case ${caseNumber} resource ${resourceName} must define buffer or expected_output`)
    }
    if ('expected_output' in resourceObject && !expectedOutputResources.has(resourceName)) {
      throw new Error(`${sourcePath} case ${caseNumber} resource ${resourceName} expected_output is supported only for stdout or stderr`)
    }
    const resource: { buffer?: string, expected_output?: string } = {}
    Object.entries(resourceObject).forEach(([key, value]) => {
      if (typeof value !== 'string') {
        throw new Error(`${sourcePath} case ${caseNumber} resource ${resourceName} ${key} must be a string`)
      }
      resource[key as 'buffer' | 'expected_output'] = value
    })
    resources[resourceName] = resource
  })

  return {
    name: caseName,
    resources,
    exit_code: exitCode,
  }
}

function hintForSlug(slug: string): string | undefined {
  const match = Object.entries(hintModules).find(([hintPath]) => challengeSlugFromHintPath(hintPath) === slug)
  return match ? String(match[1]) : undefined
}

function solutionsReadmeForSlug(slug: string): string {
  const match = Object.entries(solutionReadmeModules).find(([readmePath]) => challengeSlugFromSolutionReadmePath(readmePath) === slug)
  return match ? String(match[1]) : `# ${titleFromSlug(slug)} Solutions\n\n_No qualifying solutions yet._\n`
}

function solutionsForSlug(slug: string): ChallengeSolution[] {
  return Object.entries(metricModules)
    .filter(([metricPath]) => challengeSlugFromMetricPath(metricPath) === slug)
    .map(([_metricPath, rawRecord]) => solutionFromRecord(rawRecord as ChallengeMetricRecord, slug))
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
}

function solutionFromRecord(record: ChallengeMetricRecord, challengeSlug: string): ChallengeSolution {
  return {
    rank: record.rank,
    id: record.solution_id,
    title: record.solution_metadata.title,
    author: record.solution_metadata.author,
    website: record.solution_metadata.website,
    source: sourceForRecord(record),
    path: solutionHref(challengeSlug, record.solution_id),
    ruleCount: record.rule_count,
    stepCount: record.successful_rewrites,
    evalCheckCount: record.eval_check_count,
    cumulativeStateBytes: record.cumulative_state_bytes,
  }
}

function sourceForRecord(record: ChallengeMetricRecord): string {
  const match = Object.entries(solutionSourceModules).find(([sourcePath]) => sourcePath.endsWith(`/${record.solution_path}`))
  if (!match) throw new Error(`Missing challenge solution source: ${record.solution_path}`)
  return String(match[1])
}

function challengeSlugFromReadmePath(path: string): string {
  const match = path.match(/\/challenges\/([^/]+)\/readme\.md$/)
  if (!match) throw new Error(`Invalid challenge readme path: ${path}`)
  return match[1]
}

function challengeSlugFromSolutionReadmePath(path: string): string {
  const match = path.match(/\/challenges\/([^/]+)\/solutions\/readme\.md$/)
  if (!match) throw new Error(`Invalid challenge solution readme path: ${path}`)
  return match[1]
}

function challengeSlugFromMetricPath(path: string): string {
  const match = path.match(/\/challenges\/([^/]+)\/solutions\/[^/]+\.json$/)
  if (!match) throw new Error(`Invalid challenge metric path: ${path}`)
  return match[1]
}

function challengeSlugFromTestPath(path: string): string {
  const match = path.match(/\/challenges\/([^/]+)\/tests\/[^/]+\.json$/)
  if (!match) throw new Error(`Invalid challenge test path: ${path}`)
  return match[1]
}

function challengeSlugFromHintPath(path: string): string {
  const match = path.match(/\/challenges\/([^/]+)\/hint\.tpp$/)
  if (!match) throw new Error(`Invalid challenge hint path: ${path}`)
  return match[1]
}

function splitFrontMatter(markdown: string): { frontMatter: Record<string, string>, body: string } {
  if (!markdown.startsWith('---\n')) return { frontMatter: {}, body: markdown }
  const end = markdown.indexOf('\n---', 4)
  if (end < 0) return { frontMatter: {}, body: markdown }

  const rawFrontMatter = markdown.slice(4, end)
  const body = markdown.slice(end + '\n---'.length).replace(/^\n+/, '')
  const frontMatter: Record<string, string> = {}
  for (const line of rawFrontMatter.split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const value = line.slice(separator + 1).trim().replace(/^["']|["']$/g, '')
    if (key) frontMatter[key] = value
  }
  return { frontMatter, body }
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(' ')
}

function summaryFromBody(body: string): string {
  const goal = body.match(/## Goal\s+([\s\S]+?)(?:\n## |\Z)/)
  if (goal) {
    const paragraph = goal[1]
      .split('\n')
      .map(line => line.trim())
      .find(line => line && !line.startsWith('<!--'))
    if (paragraph) return stripMarkdown(paragraph)
  }
  const firstTextLine = body
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#') && !line.startsWith('<!--'))
  return firstTextLine ? stripMarkdown(firstTextLine) : 'A small executable Thue++ puzzle.'
}

function stripMarkdown(text: string): string {
  return text.replace(/[`*_]/g, '')
}
