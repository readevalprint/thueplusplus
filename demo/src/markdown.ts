// SPDX-License-Identifier: AGPL-3.0-or-later
export type MarkdownBlock =
  | { kind: 'heading'; level: number; id: string; text: string; html: string }
  | { kind: 'paragraph'; html: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] }
  | { kind: 'code'; language: string; monacoLanguage: string; code: string; lineNumberStart: number }
  | { kind: 'rule' }

export function parseMarkdown(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const parsed: MarkdownBlock[] = []
  let i = 0
  let pendingLineNumberStart = 1
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) {
      i += 1
      continue
    }
    const sourceLineMatch = line.match(/<!--\s*thuepp-readme-example:[\s\S]*?source-lines=(\d+)(?:-\d+)?[\s\S]*?-->/)
    if (sourceLineMatch) {
      pendingLineNumberStart = Number.parseInt(sourceLineMatch[1], 10) || 1
      i += 1
      continue
    }
    if (/^\s*<!--[\s\S]*-->\s*$/.test(line)) {
      i += 1
      continue
    }
    const fence = line.match(/^```([^`]*)$/)
    if (fence) {
      const info = fence[1].trim()
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      const language = parseFenceLanguage(info)
      parsed.push({
        kind: 'code',
        language,
        monacoLanguage: getMonacoLanguage(language),
        code: trimSingleTrailingBlank(codeLines).join('\n'),
        lineNumberStart: parseFenceLineStart(info, pendingLineNumberStart),
      })
      pendingLineNumberStart = 1
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const text = heading[2].trim()
      const plainText = stripMarkdown(text)
      parsed.push({ kind: 'heading', level: heading[1].length, id: slugify(plainText), text: plainText, html: renderInline(text) })
      i += 1
      continue
    }
    if (isMarkdownTableStart(lines, i)) {
      const headers = splitTableRow(lines[i]).map(renderInline)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitTableRow(lines[i]).map(renderInline))
        i += 1
      }
      parsed.push({ kind: 'table', headers, rows })
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(renderInline(lines[i].replace(/^\s*[-*]\s+/, '').trim()))
        i += 1
      }
      parsed.push({ kind: 'list', items })
      continue
    }
    if (/^---+$/.test(line.trim())) {
      parsed.push({ kind: 'rule' })
      i += 1
      continue
    }

    const paragraph: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].match(/^```/) &&
      !lines[i].match(/^(#{1,6})\s+(.+)$/) &&
      !isMarkdownTableStart(lines, i) &&
      !/^\s*<!--[\s\S]*-->\s*$/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    parsed.push({ kind: 'paragraph', html: renderInline(paragraph.join(' ')) })
  }
  return parsed
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  return /^\s*\|.*\|\s*$/.test(lines[index] ?? '') && /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1] ?? '')
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim())
}

function parseFenceLanguage(info: string): string {
  return (info.match(/^([^\s{]+)/)?.[1] ?? '').toLowerCase()
}

function getMonacoLanguage(language: string): string {
  if (['thue', 'thuepp', 'tpp'].includes(language)) return 'thuepp'
  if (['lisp', 'clojure', 'clj'].includes(language)) return 'clojure'
  return ''
}

function parseFenceLineStart(info: string, fallbackStart: number): number {
  const match = info.match(/(?:^|[\s,{])(?:line(?:-?number)?s?|linenums?|start(?:-?line)?|firstLineNumber)\s*[=:]\s*(\d+)/i)
    ?? info.match(/(?:^|[\s,{])numberLines\s*[=:]\s*(\d+)/i)
    ?? info.match(/\{\s*(\d+)\s*\}/)
  const parsed = match ? Number.parseInt(match[1], 10) : fallbackStart
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1
}

function trimSingleTrailingBlank(lines: string[]): string[] {
  return lines.at(-1) === '' ? lines.slice(0, -1) : lines
}

function renderInline(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/_([^_]+)_/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = escapeAttribute(href)
    return `<a href="${safeHref}">${label}</a>`
  })
  return html
}

function stripMarkdown(text: string): string {
  return text.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_]/g, '')
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", '&#39;')
}
