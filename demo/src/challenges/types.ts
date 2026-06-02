// SPDX-License-Identifier: AGPL-3.0-or-later
export interface ChallengeSolution {
  rank: number
  id: string
  title: string
  author: string
  website: string
  source: string
  path: string
  ruleCount: number
  stepCount: number
  evalCheckCount: number
  cumulativeStateBytes: number
}

export interface ChallengeTestResource {
  buffer?: string
  expected_output?: string
}

export interface ChallengeTestCase {
  name: string
  resources: Record<string, ChallengeTestResource>
  exit_code: number
}

export interface ChallengeTestManifest {
  cases: ChallengeTestCase[]
}

export interface ChallengeEntry {
  slug: string
  title: string
  summary: string
  readme: string
  solutionsReadme: string
  path: string
  solutionsPath: string
  bestSolutionId: string | null
  tests: ChallengeTestCase[]
  hintSource?: string
  solutions: ChallengeSolution[]
}

export interface ChallengeSolutionMetadata {
  title: string
  slug: string
  author: string
  website: string
  summary?: string
}

export interface ChallengeMetricRecord {
  challenge: string
  rank: number
  rule_count: number
  successful_rewrites: number
  eval_check_count: number
  cumulative_state_bytes: number
  solution_id: string
  solution_path: string
  solution_sha256: string
  solution_metadata: ChallengeSolutionMetadata
}
