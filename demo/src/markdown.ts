function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

function inline(value: string): string {
  const escaped = escapeHtml(value)
  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noreferrer">$1</a>')
}

function renderBlock(block: string): string {
  const lines = block.split('\n')
  if (lines.every(line => line.startsWith('- '))) {
    const items = lines.map(line => `<li>${inline(line.slice(2))}</li>`).join('')
    return `<ul>${items}</ul>`
  }
  if (block.startsWith('```')) {
    const code = block.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '')
    return `<pre><code>${escapeHtml(code)}</code></pre>`
  }
  return `<p>${inline(lines.join(' '))}</p>`
}

export function renderMarkdown(source: string): string {
  const body = source.trim()
  if (body.length === 0) return ''
  return body.split(/\n\n+/).map(block => renderBlock(block.trim())).join('')
}
