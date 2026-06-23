export interface SedTask {
  id: string
  label: string
  sql: string
}

export type SedPanelItem =
  | { type: 'text'; content: string }
  | { type: 'task'; id: string; label: string }

export interface SedScript {
  items: SedPanelItem[]
  tasks: SedTask[]
}

const SED_ON_RE = /^--\s*sed\s*:\s*on\s*$/i
const CHECKBOX_RE = /^--\s*-\s*\[\s*\]\s*(.+)/i
const COMMENT_RE = /^--/

function stripCommentPrefix(line: string): string {
  return line.trimStart().replace(/^--\s?/, '')
}

export function parseSedScript(sql: string): SedScript | null {
  const lines = sql.trimStart().split('\n')
  if (lines.length === 0) return null
  if (!SED_ON_RE.test(lines[0].trim())) return null

  const items: SedPanelItem[] = []
  const tasks: SedTask[] = []
  const taskSqlLines: string[][] = []

  let textBuffer: string[] = []
  let currentTaskIndex = -1

  function flushText(): void {
    const content = textBuffer.join('\n').trim()
    if (content) items.push({ type: 'text', content })
    textBuffer = []
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trimStart()
    const checkboxMatch = CHECKBOX_RE.exec(trimmed)

    if (checkboxMatch) {
      flushText()
      const id = String(tasks.length)
      const label = checkboxMatch[1].trim()
      tasks.push({ id, label, sql: '' })
      taskSqlLines.push([])
      items.push({ type: 'task', id, label })
      currentTaskIndex = tasks.length - 1
    } else if (COMMENT_RE.test(trimmed)) {
      textBuffer.push(stripCommentPrefix(line))
    } else {
      // SQL line
      flushText()
      if (currentTaskIndex >= 0) {
        taskSqlLines[currentTaskIndex].push(line)
      }
      // lines before first task are preamble — ignored
    }
  }

  flushText()

  if (tasks.length === 0) return null

  // Finalize SQL for each task
  for (let i = 0; i < tasks.length; i++) {
    tasks[i].sql = taskSqlLines[i].join('\n').trim()
  }

  return { items, tasks }
}
