import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import type { MongoShellTab as MongoShellTabType } from '../explorer.types'
import type { ConnectionRecord } from '../connections.types'
import { useSettings } from '../../Settings/useSettings'
import { getTerminalTheme, isLightAppBackground } from '../terminalTheme'
import './MongoShellTab.css'

interface MongoShellTabProps {
  tab: MongoShellTabType
  connection: ConnectionRecord | undefined
}

const HELP_TEXT = [
  'MongoDB Shell — supported commands:',
  '',
  '  show dbs / show databases   List all databases',
  '  show collections            List collections in current database',
  '  show users                  List users in current database',
  '  use <db>                    Switch to database',
  '  db                          Show current database',
  '  db.<collection>.find(...)   Query documents',
  '  db.<collection>.insertOne(...)   Insert document',
  '  db.<collection>.updateOne(...)   Update document',
  '  db.<collection>.deleteOne(...)   Delete document',
  '  db.runCommand({...})        Run raw command',
  '  db.adminCommand({...})      Run admin command',
  '  help                        Show this help',
  '  clear                       Clear the terminal',
  '  exit / quit                 Close the shell tab',
  '',
  'Press Enter to execute, Shift+Enter for newline.',
].join('\r\n')

interface LineEditorState {
  buffer: string
  cursor: number
  history: string[]
  historyIndex: number
  historyDraft: string
  currentDb: string
  isRunning: boolean
}

function makePrompt(db: string): string {
  return `\x1b[34m${db}\x1b[0m\x1b[1m>\x1b[0m `
}

function promptVisualLen(db: string): number {
  return db.length + 2  // visible chars: "db> "
}

/**
 * Redraw the current input line in one write call to avoid cursor flicker.
 * All escape sequences are batched into a single string.
 */
function redrawLine(term: Terminal, state: LineEditorState): void {
  const prompt = makePrompt(state.currentDb)
  const moveLeft = state.buffer.length - state.cursor
  let seq = '\r\x1b[K' + prompt + state.buffer
  if (moveLeft > 0) {
    seq += `\x1b[${moveLeft}D`
  }
  term.write(seq)
}

export default function MongoShellTab({ tab, connection }: MongoShellTabProps): React.JSX.Element {
  const { settings } = useSettings()
  const darkTerminals = settings.darkTerminals
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const stateRef = useRef<LineEditorState>({
    buffer: '',
    cursor: 0,
    history: [],
    historyIndex: -1,
    historyDraft: '',
    currentDb: tab.databaseName ?? 'test',
    isRunning: false
  })

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: getTerminalTheme(darkTerminals),
      fontFamily: "'Cascadia Code', 'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: false
    })
    termRef.current = term

    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    fit.fit()
    term.focus()

    const connName = connection?.name ?? tab.connectionId
    term.writeln(`\x1b[32mMongoDB Shell\x1b[0m — \x1b[1m${connName}\x1b[0m`)
    term.writeln(`\x1b[2mType "help" for available commands\x1b[0m`)
    term.writeln('')
    term.write(makePrompt(stateRef.current.currentDb))

    term.onData((data) => handleData(data, term, stateRef.current))

    const ro = new ResizeObserver(() => {
      try { fit.fit() } catch { /* ignore */ }
    })
    ro.observe(containerRef.current)

    return () => {
      ro.disconnect()
      term.dispose()
      termRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the terminal palette in sync with the "Dark Terminals" setting and the
  // active app theme. The resolved theme id lives on <html data-theme>, so
  // observe it directly (same source getTerminalTheme reads).
  useEffect(() => {
    const applyTheme = (): void => {
      const term = termRef.current
      if (term) term.options.theme = getTerminalTheme(darkTerminals)
      const container = containerRef.current
      if (container) {
        container.classList.toggle(
          'mongo-shell--dark-on-light',
          darkTerminals && isLightAppBackground()
        )
      }
    }
    applyTheme()
    const observer = new MutationObserver(applyTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    return () => observer.disconnect()
  }, [darkTerminals])

  function handleData(data: string, term: Terminal, state: LineEditorState): void {
    if (state.isRunning) return

    // Enter
    if (data === '\r') {
      term.write('\r\n')
      void executeCommand(state.buffer.trimEnd(), term, state)
      return
    }

    // Ctrl+C — batch into single write
    if (data === '\x03') {
      state.buffer = ''
      state.cursor = 0
      state.historyIndex = -1
      term.write('^C\r\n' + makePrompt(state.currentDb))
      return
    }

    // Ctrl+L
    if (data === '\x0c') {
      term.clear()
      const moveLeft = state.buffer.length - state.cursor
      let seq = makePrompt(state.currentDb) + state.buffer
      if (moveLeft > 0) seq += `\x1b[${moveLeft}D`
      term.write(seq)
      return
    }

    // Backspace
    if (data === '\x7f') {
      if (state.cursor > 0) {
        state.buffer = state.buffer.slice(0, state.cursor - 1) + state.buffer.slice(state.cursor)
        state.cursor--
        if (state.cursor === state.buffer.length) {
          // Cursor was at end — simple in-place backspace, no full redraw
          term.write('\x08 \x08')
        } else {
          redrawLine(term, state)
        }
      }
      return
    }

    // Delete key
    if (data === '\x1b[3~') {
      if (state.cursor < state.buffer.length) {
        state.buffer = state.buffer.slice(0, state.cursor) + state.buffer.slice(state.cursor + 1)
        redrawLine(term, state)
      }
      return
    }

    // Left arrow
    if (data === '\x1b[D') {
      if (state.cursor > 0) {
        state.cursor--
        term.write('\x1b[D')
      }
      return
    }

    // Right arrow
    if (data === '\x1b[C') {
      if (state.cursor < state.buffer.length) {
        state.cursor++
        term.write('\x1b[C')
      }
      return
    }

    // Up arrow — history prev
    if (data === '\x1b[A') {
      if (state.history.length === 0) return
      if (state.historyIndex === -1) state.historyDraft = state.buffer
      state.historyIndex = Math.min(state.historyIndex + 1, state.history.length - 1)
      state.buffer = state.history[state.historyIndex]
      state.cursor = state.buffer.length
      redrawLine(term, state)
      return
    }

    // Down arrow — history next
    if (data === '\x1b[B') {
      if (state.historyIndex <= 0) {
        state.historyIndex = -1
        state.buffer = state.historyDraft
        state.cursor = state.buffer.length
        redrawLine(term, state)
        return
      }
      state.historyIndex--
      state.buffer = state.history[state.historyIndex]
      state.cursor = state.buffer.length
      redrawLine(term, state)
      return
    }

    // Home / Ctrl+A
    if (data === '\x1b[H' || data === '\x01') {
      if (state.cursor > 0) {
        state.cursor = 0
        term.write(`\x1b[${promptVisualLen(state.currentDb) + 1}G`)
      }
      return
    }

    // End / Ctrl+E
    if (data === '\x1b[F' || data === '\x05') {
      if (state.cursor < state.buffer.length) {
        state.cursor = state.buffer.length
        term.write(`\x1b[${promptVisualLen(state.currentDb) + state.buffer.length + 1}G`)
      }
      return
    }

    // Drop other escape sequences
    if (data.startsWith('\x1b')) return

    // Printable input (single char or paste)
    const printable = data.replace(/[^\x20-\x7e\x80-\xff]/g, '')
    if (printable.length === 0) return

    if (state.cursor === state.buffer.length) {
      // Appending at end — write directly, no redraw needed
      state.buffer += printable
      state.cursor += printable.length
      term.write(printable)
    } else {
      // Inserting in middle — need full redraw
      state.buffer = state.buffer.slice(0, state.cursor) + printable + state.buffer.slice(state.cursor)
      state.cursor += printable.length
      redrawLine(term, state)
    }
  }

  async function executeCommand(command: string, term: Terminal, state: LineEditorState): Promise<void> {
    if (command === '') {
      term.write(makePrompt(state.currentDb))
      return
    }

    if (state.history[0] !== command) {
      state.history.unshift(command)
      if (state.history.length > 200) state.history.length = 200
    }
    state.historyIndex = -1
    state.historyDraft = ''
    state.buffer = ''
    state.cursor = 0

    const lower = command.trim().toLowerCase()

    if (lower === 'help') {
      term.writeln(HELP_TEXT)
      term.write(makePrompt(state.currentDb))
      return
    }

    if (lower === 'clear') {
      term.clear()
      term.write(makePrompt(state.currentDb))
      return
    }

    if (lower === 'exit' || lower === 'quit') {
      term.writeln('\x1b[2mGoodbye.\x1b[0m')
      return
    }

    if (lower === 'db') {
      term.writeln(state.currentDb)
      term.write(makePrompt(state.currentDb))
      return
    }

    const useMatch = lower.match(/^use\s+(\S+)$/)
    if (useMatch) {
      const newDb = command.trim().slice(4).trim()
      state.currentDb = newDb
      term.writeln(`\x1b[32mswitched to db ${newDb}\x1b[0m`)
      term.write(makePrompt(state.currentDb))
      return
    }

    state.isRunning = true

    try {
      const connectResult = await window.api.database.connect(tab.connectionId)
      if (connectResult.status === 'error') {
        term.writeln(`\x1b[31mConnection failed: ${connectResult.message}\x1b[0m`)
        return
      }

      const result = await window.api.database.executeMongoShellCommand(
        tab.connectionId,
        command,
        state.currentDb
      )

      if (result.status === 'error') {
        term.writeln(`\x1b[31m${result.output}\x1b[0m`)
      } else {
        const output = result.output.replace(/\r?\n/g, '\r\n')
        term.writeln(output)
      }
    } catch (err) {
      term.writeln(`\x1b[31m${err instanceof Error ? err.message : String(err)}\x1b[0m`)
    } finally {
      state.isRunning = false
      term.write(makePrompt(state.currentDb))
    }
  }

  return <div ref={containerRef} className="mongo-shell" />
}
