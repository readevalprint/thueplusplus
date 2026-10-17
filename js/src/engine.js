// Node and browser entry for one program run. The options object matches the
// other embedder hosts so the CLI and the playground can share it.

import { Interpreter } from './interpreter.js'

const RESOURCE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

export async function run(options = {}) {
  if (options && typeof options === 'object' && options.procs && typeof options.procs === 'object' && Object.keys(options.procs).length > 0) {
    throw new Error('subprocess resources are not supported')
  }
  try {
    return execute(options)
  } catch (error) {
    return errorResult(error && error.message ? error.message : String(error))
  }
}

function execute(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return errorResult('run requires an options object')
  if (typeof options.sourceText !== 'string') return errorResult('sourceText is required')
  const sourcePath = optionalString(options, 'sourcePath', 'js://source.thue')
  const interp = new Interpreter()
  applyIntOption(options, 'maxEvals', interp, 'maxEvals')
  applyIntOption(options, 'maxStateBytes', interp, 'maxStateBytes')
  applyIntOption(options, 'maxSteps', interp, 'maxSteps')
  interp.debug = Boolean(options.debug)
  interp.traceEnabled = Boolean(options.trace)
  if (options.replaceBindings) interp.clearBindings()
  if (options.resources != null) installResources(interp, options.resources)
  try {
    interp.loadProgramText(sourcePath, options.sourceText)
  } catch (error) {
    return errorResult(error && error.message ? error.message : String(error), interp.stdoutParts.join(''), interp.stderrParts.join(''))
  }
  if (options.listRules) {
    const listed = interp.rules.map((rule) => `${rule.sourcePath}:${rule.lineNumber}\t${rule.lhs}`).join('\n')
    return { exitCode: 0, stdout: listed.length ? `${listed}\n` : '', stderr: '', state: interp.state, evalCount: 0, appliedSteps: 0 }
  }
  if (Object.prototype.hasOwnProperty.call(options, 'input')) {
    if (typeof options.input !== 'string') return errorResult('input must be a string')
    interp.applyInputOverride(options.input)
  }
  const stopped = interp.run()
  interp.cleanup()
  const result = {
    exitCode: stopped.code,
    stdout: interp.stdoutParts.join(''),
    stderr: interp.stderrParts.join(''),
    state: interp.state,
    evalCount: interp.evalCount,
    appliedSteps: interp.appliedSteps,
    metrics: interp.metrics(),
  }
  if (stopped.error) {
    result.error = stopped.error
    result.errors = stopped.error
    if (stopped.code === 0) result.exitCode = 1
  }
  if (stopped.limit) result.limit = stopped.limit
  if (options.coverage) result.coverageTSV = interp.coverageTSV()
  if (interp.traceEnabled) result.trace = interp.trace
  return result
}

function installResources(interp, resources) {
  if (typeof resources !== 'object' || Array.isArray(resources)) throw new Error('resources must be an object')
  for (const name of Object.keys(resources)) {
    if (!RESOURCE_NAME.test(name)) throw new Error(`invalid resource binding name ${JSON.stringify(name)}`)
    const resource = resources[name]
    if (!resource || typeof resource !== 'object') throw new Error(`resource ${JSON.stringify(name)} must be an object`)
    interp.addCallback(name, resource)
  }
}

function applyIntOption(options, key, interp, field) {
  if (!Object.prototype.hasOwnProperty.call(options, key) || options[key] === undefined) return
  const value = options[key]
  if (value === null) {
    interp[field] = null
    return
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    interp[field] = value
    return
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    interp[field] = Number(value)
    return
  }
  throw new Error(`${key} must be an integer`)
}

function optionalString(options, key, fallback) {
  if (!Object.prototype.hasOwnProperty.call(options, key) || options[key] == null) return fallback
  const value = options[key]
  if (typeof value !== 'string') throw new Error(`${key} must be a string`)
  if (value.trim() === '') return fallback
  return value
}

function errorResult(message, stdout = '', stderr = '') {
  return { exitCode: 1, stdout, stderr, error: message, errors: message }
}
