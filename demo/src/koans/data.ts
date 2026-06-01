// SPDX-License-Identifier: AGPL-3.0-or-later
import type { KoanEntry, KoanMetricRecord, KoanSolution, KoanTestCase, KoanTestManifest } from './types'

const readmeModules = import.meta.glob('../../../koans/*/readme.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const metricModules = import.meta.glob('../../../koans/*/solutions/*.json', {
  import: 'default',
  eager: true,
})

const testModules = import.meta.glob('../../../koans/*/tests/*.json', {
  import: 'default',
  eager: true,
})

const hintModules = import.meta.glob('../../../koans/*/hint.tpp', {
  query: '?raw',
  import: 'default',
  eager: true,
})

const solutionSourceModules = import.meta.glob('../../../koans/*/solutions/*.tpp', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const koans: KoanEntry[] = Object.entries(readmeModules)
  .map(([readmePath, rawMarkdown]) => {
    const slug = koanSlugFromReadmePath(readmePath)
    const { frontMatter, body } = splitFrontMatter(String(rawMarkdown))
    const solutions = solutionsForSlug(slug)

    return {
      slug,
      title: frontMatter.title || titleFromSlug(slug),
      summary: frontMatter.description || summaryFromBody(body),
      readme: stripGeneratedLeaderboard(body),
      path: `/koans/${slug}/`,
      bestSolutionId: solutions[0]?.id ?? null,
      tests: testsForSlug(slug),
      hintSource: hintForSlug(slug),
      solutions,
    }
  })
  .sort((left, right) => left.slug.localeCompare(right.slug))

function testsForSlug(slug: string): KoanTestCase[] {
  return Object.entries(testModules)
    .filter(([testPath]) => koanSlugFromTestPath(testPath) === slug)
    .flatMap(([_testPath, rawManifest]) => (rawManifest as KoanTestManifest).cases)
}

function hintForSlug(slug: string): string | undefined {
  const match = Object.entries(hintModules).find(([hintPath]) => koanSlugFromHintPath(hintPath) === slug)
  return match ? String(match[1]) : undefined
}

function solutionsForSlug(slug: string): KoanSolution[] {
  return Object.entries(metricModules)
    .filter(([metricPath]) => koanSlugFromMetricPath(metricPath) === slug)
    .map(([_metricPath, rawRecord]) => solutionFromRecord(rawRecord as KoanMetricRecord))
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
}

function solutionFromRecord(record: KoanMetricRecord): KoanSolution {
  return {
    rank: record.rank,
    id: record.solution_id,
    title: record.solution_metadata.title,
    author: record.solution_metadata.author,
    website: record.solution_metadata.website,
    source: sourceForRecord(record),
    path: `/koans/${record.koan}/${record.solution_id}`,
    ruleCount: record.rule_count,
    stepCount: record.successful_rewrites,
    evalCheckCount: record.eval_check_count,
    cumulativeStateBytes: record.cumulative_state_bytes,
  }
}

function stripGeneratedLeaderboard(body: string): string {
  return body.replace(/\n*<!-- koans:leaderboard:start -->[\s\S]*?<!-- koans:leaderboard:end -->\n*/g, '\n').trimEnd() + '\n'
}

function sourceForRecord(record: KoanMetricRecord): string {
  const match = Object.entries(solutionSourceModules).find(([sourcePath]) => sourcePath.endsWith(`/${record.solution_path}`))
  if (!match) throw new Error(`Missing koan solution source: ${record.solution_path}`)
  return String(match[1])
}

function koanSlugFromReadmePath(path: string): string {
  const match = path.match(/\/koans\/([^/]+)\/readme\.md$/)
  if (!match) throw new Error(`Invalid koan readme path: ${path}`)
  return match[1]
}

function koanSlugFromMetricPath(path: string): string {
  const match = path.match(/\/koans\/([^/]+)\/solutions\/[^/]+\.json$/)
  if (!match) throw new Error(`Invalid koan metric path: ${path}`)
  return match[1]
}

function koanSlugFromTestPath(path: string): string {
  const match = path.match(/\/koans\/([^/]+)\/tests\/[^/]+\.json$/)
  if (!match) throw new Error(`Invalid koan test path: ${path}`)
  return match[1]
}

function koanSlugFromHintPath(path: string): string {
  const match = path.match(/\/koans\/([^/]+)\/hint\.tpp$/)
  if (!match) throw new Error(`Invalid koan hint path: ${path}`)
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
