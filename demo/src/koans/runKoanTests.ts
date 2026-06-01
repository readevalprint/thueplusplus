// SPDX-License-Identifier: AGPL-3.0-or-later
import { runWithWorker, type DemoResourceLog } from '../wasm'
import type { KoanEntry, KoanTestCase } from './types'

export interface KoanResourceResult {
  name: string
  expected: string
  actual: string
  passed: boolean
}

export interface KoanExitCodeResult {
  expected: number
  actual: number | undefined
  passed: boolean
}

export interface KoanTestResult {
  name: string
  passed: boolean
  exitCode: KoanExitCodeResult
  resources: KoanResourceResult[]
  error?: string
}

export async function runKoanTests(koan: KoanEntry, source: string, signal?: AbortSignal): Promise<KoanTestResult[]> {
  const results: KoanTestResult[] = []
  for (const testCase of koan.tests) {
    if (signal?.aborted) throw abortError()
    const result = await runKoanTest(koan, source, testCase, signal)
    results.push(result)
    if (!result.passed) break
  }
  return results
}

async function runKoanTest(koan: KoanEntry, source: string, testCase: KoanTestCase, signal?: AbortSignal): Promise<KoanTestResult> {
  try {
    const result = await runWithWorker({
      sourceText: source,
      sourcePath: `koans/${koan.slug}/attempt.tpp`,
      input: testCase.resources.stdin?.buffer ?? '',
      evalLimit: 10000,
      maxStateBytes: 1_000_000,
      coverage: false,
      resources: Object.entries(testCase.resources)
        .filter(([name]) => name !== 'stdin' && name !== 'stdout' && name !== 'stderr')
        .map(([name, resource]) => ({
          name,
          inputText: resource.buffer ?? '',
          lineMode: true,
        })),
      signal,
    })
    const actualExitCode = result.exitCode ?? (result.error || result.errors ? 1 : 0)
    const exitCode = {
      expected: testCase.exit_code,
      actual: actualExitCode,
      passed: actualExitCode === testCase.exit_code,
    }
    const resources = expectedResources(testCase).map(({ name, expected }) => {
      const actual = resourceOutput(result.resourceLogs, name, result.stdout ?? '', result.stderr ?? '')
      return {
        name,
        expected,
        actual,
        passed: actual === expected,
      }
    })
    return {
      name: testCase.name,
      passed: exitCode.passed && resources.every(resource => resource.passed) && !result.error,
      exitCode,
      resources,
      error: result.error || result.errors || undefined,
    }
  } catch (error) {
    if (isAbortError(error)) throw error
    return {
      name: testCase.name,
      passed: false,
      exitCode: {
        expected: testCase.exit_code,
        actual: undefined,
        passed: false,
      },
      resources: expectedResources(testCase).map(({ name, expected }) => ({
        name,
        expected,
        actual: '',
        passed: false,
      })),
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function expectedResources(testCase: KoanTestCase): Array<{ name: string; expected: string }> {
  return Object.entries(testCase.resources)
    .filter((entry): entry is [string, { expected_output: string }] => typeof entry[1].expected_output === 'string')
    .map(([name, resource]) => ({ name, expected: resource.expected_output }))
}

function resourceOutput(logs: DemoResourceLog[] | undefined, name: string, stdout: string, stderr: string): string {
  const log = logs?.find(resource => resource.name === name)
  if (log) return log.outputText ?? log.writes.join('')
  if (name === 'stdout') return stdout
  if (name === 'stderr') return stderr
  return ''
}

function abortError(): DOMException {
  return new DOMException('Koan test run aborted', 'AbortError')
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
