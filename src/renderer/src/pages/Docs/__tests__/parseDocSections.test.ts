import { describe, expect, it } from 'vitest'
import { parseDocSections, type DocSection } from '../parseDocSections'

describe('parseDocSections', () => {
  it('returns empty array for empty string', () => {
    expect(parseDocSections('')).toEqual([])
  })

  it('returns empty array for content with no headers', () => {
    expect(parseDocSections('Just some text\nno headers here')).toEqual([])
  })

  it('parses a single h1 section', () => {
    const md = '# Getting Started\n\nWelcome to the app.'
    const sections = parseDocSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].title).toBe('Getting Started')
    expect(sections[0].level).toBe(1)
    expect(sections[0].id).toBe('getting-started')
    expect(sections[0].content).toContain('Welcome to the app.')
  })

  it('parses h1 and h2 sections', () => {
    const md = [
      '# Section One',
      'Intro text.',
      '## Subsection A',
      'Sub content A.',
      '## Subsection B',
      'Sub content B.'
    ].join('\n')

    const sections = parseDocSections(md)
    expect(sections).toHaveLength(3)

    const [h1, h2a, h2b] = sections as [DocSection, DocSection, DocSection]

    expect(h1.level).toBe(1)
    expect(h1.title).toBe('Section One')
    expect(h1.content).toContain('Intro text.')
    expect(h1.content).toContain('## Subsection A')
    expect(h1.content).toContain('## Subsection B')

    expect(h2a.level).toBe(2)
    expect(h2a.title).toBe('Subsection A')
    expect(h2a.parentId).toBe(h1.id)
    expect(h2a.content).toContain('Sub content A.')
    expect(h2a.content).not.toContain('Sub content B.')

    expect(h2b.level).toBe(2)
    expect(h2b.title).toBe('Subsection B')
    expect(h2b.parentId).toBe(h1.id)
    expect(h2b.content).toContain('Sub content B.')
  })

  it('assigns parentId correctly across multiple h1 sections', () => {
    const md = [
      '# First',
      '## Child of First',
      '# Second',
      '## Child of Second'
    ].join('\n')

    const sections = parseDocSections(md)
    expect(sections).toHaveLength(4)

    const [h1a, sub1, h1b, sub2] = sections as [DocSection, DocSection, DocSection, DocSection]
    expect(sub1.parentId).toBe(h1a.id)
    expect(sub2.parentId).toBe(h1b.id)
  })

  it('scopes h1 content to before the next h1', () => {
    const md = [
      '# Alpha',
      'alpha content',
      '# Beta',
      'beta content'
    ].join('\n')

    const sections = parseDocSections(md)
    const alpha = sections.find((s) => s.title === 'Alpha')!
    const beta = sections.find((s) => s.title === 'Beta')!

    expect(alpha.content).toContain('alpha content')
    expect(alpha.content).not.toContain('beta content')
    expect(beta.content).toContain('beta content')
    expect(beta.content).not.toContain('alpha content')
  })

  it('generates unique ids for duplicate titles', () => {
    const md = '# Intro\n# Intro\n# Intro'
    const sections = parseDocSections(md)
    const ids = sections.map((s) => s.id)
    expect(new Set(ids).size).toBe(3)
    expect(ids[0]).toBe('intro')
    expect(ids[1]).toBe('intro-1')
    expect(ids[2]).toBe('intro-2')
  })

  it('ignores h3+ headers', () => {
    const md = '# Top\n### Not parsed\n#### Also not'
    const sections = parseDocSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].level).toBe(1)
  })

  it('does not treat ## as h1 and ### as h2', () => {
    const md = '## Only H2\n### H3 ignored'
    const sections = parseDocSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].level).toBe(2)
  })

  it('handles h2 before any h1 with no parentId', () => {
    const md = '## Orphan\ncontent'
    const sections = parseDocSections(md)
    expect(sections).toHaveLength(1)
    expect(sections[0].level).toBe(2)
    expect(sections[0].parentId).toBeUndefined()
  })
})
