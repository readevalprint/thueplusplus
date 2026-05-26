export interface SplitProgramSourceResult {
  rules: string
  state: string
  error: string
}

export function splitProgramSource(source: string): SplitProgramSourceResult {
  const separator = findStateSeparator(source)
  if (!separator) return { rules: source, state: '', error: '' }

  const state = trimTrailingEmptyRows(normalizeNewlines(source.slice(separator.end)))
  return { rules: source.slice(0, separator.start), state, error: '' }
}

interface SeparatorRange {
  start: number
  end: number
}

function findStateSeparator(source: string): SeparatorRange | undefined {
  let rowStart = 0
  while (rowStart <= source.length) {
    let rowEnd = rowStart
    while (rowEnd < source.length && source[rowEnd] !== '\n' && source[rowEnd] !== '\r') rowEnd += 1

    if (source.slice(rowStart, rowEnd).trim() === '::=') {
      let end = rowEnd
      if (source[end] === '\r' && source[end + 1] === '\n') end += 2
      else if (source[end] === '\r' || source[end] === '\n') end += 1
      return { start: rowStart, end }
    }

    if (rowEnd >= source.length) break
    rowStart = rowEnd + 1
    if (source[rowEnd] === '\r' && source[rowStart] === '\n') rowStart += 1
  }
  return undefined
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function trimTrailingEmptyRows(text: string): string {
  const rows = text.split('\n')
  while (rows.length > 0 && rows[rows.length - 1] === '') rows.pop()
  return rows.join('\n')
}
