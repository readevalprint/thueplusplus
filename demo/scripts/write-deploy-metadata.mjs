// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const repoRoot = new URL('../../', import.meta.url).pathname
const dist = new URL('../dist/', import.meta.url).pathname
const outputPath = join(dist, 'deploy.json')

const metadata = {
  commit_sha: env('CI_COMMIT_SHA') ?? git(['rev-parse', 'HEAD']),
  branch: env('CI_COMMIT_BRANCH') ?? git(['branch', '--show-current']) ?? env('CI_COMMIT_REF_NAME') ?? 'detached',
  ref: env('CI_COMMIT_REF_NAME') ?? null,
  pipeline_id: env('CI_PIPELINE_ID') ?? null,
  pipeline_url: env('CI_PIPELINE_URL') ?? null,
  job_id: env('CI_JOB_ID') ?? null,
  job_url: env('CI_JOB_URL') ?? null,
  built_at: new Date().toISOString(),
  source_host: env('CI_SERVER_HOST') ?? 'local',
  project_path: env('CI_PROJECT_PATH') ?? null,
}

mkdirSync(dirname(outputPath), { recursive: true })
writeFileSync(outputPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8')
console.log(`deployment metadata written: ${outputPath}`)

function env(name) {
  const value = process.env[name]
  return value && value.trim() ? value : null
}

function git(args) {
  try {
    const value = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
    return value || null
  } catch {
    return null
  }
}
