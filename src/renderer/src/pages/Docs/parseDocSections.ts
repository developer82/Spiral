export interface DocSection {
  id: string
  title: string
  level: 1 | 2
  parentId?: string
  content: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function parseDocSections(markdown: string): DocSection[] {
  const lines = markdown.split('\n')

  type HeaderPos = { index: number; level: 1 | 2; title: string }
  const headers: HeaderPos[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      headers.push({ index: i, level: 1, title: line.slice(2).trim() })
    } else if (line.startsWith('## ') && !line.startsWith('### ')) {
      headers.push({ index: i, level: 2, title: line.slice(3).trim() })
    }
  }

  if (headers.length === 0) return []

  const sections: DocSection[] = []
  const usedIds = new Map<string, number>()
  let currentH1Id: string | undefined

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]

    let endIndex: number
    if (header.level === 1) {
      const nextH1 = headers.slice(i + 1).find((h) => h.level === 1)
      endIndex = nextH1?.index ?? lines.length
    } else {
      const next = headers[i + 1]
      endIndex = next?.index ?? lines.length
    }

    const contentLines = lines.slice(header.index, endIndex)
    const content = contentLines.join('\n').trim()

    const baseId = slugify(header.title) || `section-${i}`
    const count = usedIds.get(baseId) ?? 0
    usedIds.set(baseId, count + 1)
    const id = count === 0 ? baseId : `${baseId}-${count}`

    if (header.level === 1) {
      currentH1Id = id
      sections.push({ id, title: header.title, level: 1, content })
    } else {
      sections.push({ id, title: header.title, level: 2, parentId: currentH1Id, content })
    }
  }

  return sections
}
