export interface KoanSolution {
  rank: number
  id: string
  title: string
  author: string
  website: string
  source: string
  path: string
  ruleCount: number
  steps: number
  cumulativeStateBytes: number
}

export interface KoanTestResource {
  buffer?: string
  expected_output?: string
}

export interface KoanTestCase {
  name: string
  state?: string
  resources: Record<string, KoanTestResource>
  exit_code: number
}

export interface KoanTestManifest {
  cases: KoanTestCase[]
}

export interface KoanEntry {
  slug: string
  title: string
  summary: string
  readme: string
  path: string
  bestSolutionId: string | null
  tests: KoanTestCase[]
  solutions: KoanSolution[]
}

export interface KoanSolutionMetadata {
  title: string
  slug: string
  author: string
  website: string
  summary?: string
}

export interface KoanMetricRecord {
  koan: string
  rank: number
  rule_count: number
  total_probes: number
  cumulative_state_bytes: number
  solution_id: string
  solution_path: string
  solution_sha256: string
  solution_metadata: KoanSolutionMetadata
}
