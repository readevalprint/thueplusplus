import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CatalogError, aggregateSum, commonProblems, parseFrontmatter, sitemapXml } from './build-site.mjs'

describe('site data', () => {
  it('rejects limits in frontmatter', () => {
    assert.throws(() => parseFrontmatter('---\nruleset: direct\nlimits: 1\n---\n\nNotes.\n', 'README.md'), CatalogError)
  })

  it('sums cost over the common problems', () => {
    const common = commonProblems({
      direct: ['hello-world', 'factorial', 'fizzbuzz'],
      forth: ['hello-world', 'factorial'],
      lisp: [],
    })
    assert.deepEqual(common, ['hello-world', 'factorial'])
    assert.deepEqual(aggregateSum({
      direct: { 'hello-world': 10, factorial: 30, fizzbuzz: 100 },
      forth: { 'hello-world': 4, factorial: 6 },
    }, common), { direct: 40, forth: 10 })
  })

  it('writes a sitemap', () => {
    const xml = sitemapXml([{ loc: 'https://thuelang.org/problems/factorial', priority: '0.6' }])
    assert.match(xml, /factorial/)
  })
})
