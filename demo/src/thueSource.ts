export interface SplitProgramSourceResult {
  rules: string
  state: string
  error: string
}

export function splitProgramSource(source: string): SplitProgramSourceResult {
  const lines = normalizedLines(source)
  const separator = lines.findIndex(line => line.trim() === '::=')
  if (separator < 0) return { rules: source, state: '', error: '' }

  const stateRows = lines.slice(separator + 1)
  while (stateRows.length > 0 && stateRows[stateRows.length - 1] === '') stateRows.pop()
  return { rules: source, state: stateRows.join('\n'), error: '' }
}

function normalizedLines(source: string): string[] {
  return source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}
