import type { IpcMainInvokeEvent } from 'electron'
import type { AiChatChunk, AiSchemaContext } from '../../shared/ai.types'
import type { DatabaseManager } from '../database/DatabaseManager'
import type { ErdTable, ErdRelationship } from '../database/types'

// Safety cap: SQLCoder 7B Q4_K_M context = 4096 tokens; ~80 tokens/table
const MAX_TABLES = 25

const SQL_PROVIDERS = new Set(['sqlserver', 'postgres', 'mysql', 'sqlite'])

export class AiService {
  private llama: unknown = null
  private model: unknown = null
  private readonly activeSessions = new Map<string, AbortController>()

  constructor(private readonly dbManager: DatabaseManager) {}

  async extractSchemaContext(
    connectionId: string,
    databaseName: string,
    provider: string
  ): Promise<AiSchemaContext> {
    if (!SQL_PROVIDERS.has(provider)) {
      return {
        databaseName,
        provider,
        ddl: '-- Non-relational database. Describe the relevant collections or data structures in your question.',
        tableCount: 0
      }
    }

    const result = await this.dbManager.getErdSchema(connectionId, databaseName)
    if (result.status !== 'ok') {
      return {
        databaseName,
        provider,
        ddl: `-- Could not load schema: ${result.message}`,
        tableCount: 0
      }
    }

    const { tables, relationships } = result.schema
    const truncated = tables.length > MAX_TABLES
    const selectedTables = truncated ? tables.slice(0, MAX_TABLES) : tables

    const ddlLines: string[] = []

    for (const table of selectedTables) {
      ddlLines.push(buildTableDDL(table, provider))
      const tableFks = relationships.filter(
        (r) => r.fromSchema === table.schema && r.fromTable === table.name
      )
      for (const fk of tableFks) {
        ddlLines.push(buildFkComment(fk, provider))
      }
      ddlLines.push('')
    }

    if (truncated) {
      ddlLines.push(
        `-- Schema truncated: showing ${MAX_TABLES} of ${tables.length} tables. Mention specific table names in your question for full context.`
      )
    }

    return {
      databaseName,
      provider,
      ddl: ddlLines.join('\n').trim(),
      tableCount: tables.length
    }
  }

  buildPrompt(
    message: string,
    schema: AiSchemaContext,
    history: Array<{ role: 'user' | 'assistant'; content: string }>
  ): string {
    const lines: string[] = []

    // Include last 3 history turns as plain context
    const recentHistory = history.slice(-6)
    if (recentHistory.length > 0) {
      lines.push('-- Previous conversation context:')
      for (const turn of recentHistory) {
        lines.push(`-- ${turn.role === 'user' ? 'User' : 'Assistant'}: ${turn.content.slice(0, 200)}`)
      }
      lines.push('')
    }

    lines.push('### Task')
    lines.push(`Generate a SQL query to answer the following question:`)
    lines.push(`\`${message}\``)
    lines.push('')
    lines.push('### Database Schema')
    lines.push(
      `The query will run on a database with the following schema:`
    )
    lines.push(schema.ddl)
    lines.push('')
    lines.push('### Answer')
    lines.push(
      `Given the database schema, here is the SQL query that answers the question:`
    )

    return lines.join('\n')
  }

  async streamCompletion(
    event: IpcMainInvokeEvent,
    sessionId: string,
    modelPath: string,
    prompt: string
  ): Promise<void> {
    const controller = new AbortController()
    this.activeSessions.set(sessionId, controller)

    try {
      // Lazy-init: load model once per app session
      if (!this.llama || !this.model) {
        const { getLlama } = await import('node-llama-cpp')
        this.llama = await getLlama()
        this.model = await (this.llama as { loadModel: (opts: unknown) => Promise<unknown> }).loadModel({
          modelPath,
          gpuLayers: 0 // CPU-only for broadest compatibility; can be tuned later
        })
      }

      const llamaModel = this.model as {
        createContext: (opts?: unknown) => Promise<unknown>
      }
      const context = await llamaModel.createContext({ contextSize: 4096 })

      const contextObj = context as {
        getSequence: () => unknown
        dispose: () => Promise<void>
      }
      const sequence = contextObj.getSequence()

      // Use LlamaCompletion for raw (non-chat) completion
      const { LlamaCompletion } = await import('node-llama-cpp')
      const completion = new LlamaCompletion({ contextSequence: sequence as never })

      let fullText = ''

      await completion.generateCompletion(prompt, {
        signal: controller.signal,
        onTextChunk: (text: string) => {
          if (controller.signal.aborted) return
          fullText += text
          const chunk: AiChatChunk = { sessionId, delta: text, done: false }
          event.sender.send('ai:chat-chunk', chunk)
        },
        maxTokens: 512
      })

      if (!controller.signal.aborted) {
        event.sender.send('ai:chat-chunk', {
          sessionId,
          delta: '',
          done: true,
          fullText
        } satisfies AiChatChunk)
      } else {
        event.sender.send('ai:chat-chunk', {
          sessionId,
          delta: '',
          done: true,
          fullText
        } satisfies AiChatChunk)
      }

      await contextObj.dispose()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      event.sender.send('ai:chat-chunk', {
        sessionId,
        delta: '',
        done: true,
        error: message
      } satisfies AiChatChunk)
    } finally {
      this.activeSessions.delete(sessionId)
    }
  }

  abortCompletion(sessionId: string): void {
    this.activeSessions.get(sessionId)?.abort()
  }

  async dispose(): Promise<void> {
    for (const controller of this.activeSessions.values()) {
      controller.abort()
    }
    this.activeSessions.clear()

    if (this.model) {
      const m = this.model as { dispose?: () => Promise<void> }
      if (typeof m.dispose === 'function') {
        await m.dispose()
      }
      this.model = null
    }
    if (this.llama) {
      const l = this.llama as { dispose?: () => Promise<void> }
      if (typeof l.dispose === 'function') {
        await l.dispose()
      }
      this.llama = null
    }
  }
}

// ── DDL builders ───────────────────────────────────────────────────────────────

function quoteIdentifier(name: string, provider: string): string {
  if (provider === 'mysql') return `\`${name}\``
  if (provider === 'sqlserver') return `[${name}]`
  return `"${name}"`
}

function buildTableDDL(table: ErdTable, provider: string): string {
  const q = (n: string) => quoteIdentifier(n, provider)
  const tableRef =
    provider === 'mysql'
      ? q(table.name)
      : `${q(table.schema)}.${q(table.name)}`

  const colDefs = table.columns.map((col) => {
    let def = `  ${q(col.name)} ${col.type}`
    if (col.maxLength !== null && col.maxLength > 0) {
      def += `(${col.maxLength})`
    }
    if (col.isPrimaryKey) def += ' PRIMARY KEY'
    if (!col.isNullable && !col.isPrimaryKey) def += ' NOT NULL'
    return def
  })

  return `CREATE TABLE ${tableRef} (\n${colDefs.join(',\n')}\n);`
}

function buildFkComment(rel: ErdRelationship, provider: string): string {
  const q = (n: string) => quoteIdentifier(n, provider)
  const fromRef = provider === 'mysql'
    ? `${q(rel.fromTable)}.${q(rel.fromColumn)}`
    : `${q(rel.fromSchema)}.${q(rel.fromTable)}.${q(rel.fromColumn)}`
  const toRef = provider === 'mysql'
    ? `${q(rel.toTable)}(${q(rel.toColumn)})`
    : `${q(rel.toSchema)}.${q(rel.toTable)}(${q(rel.toColumn)})`
  return `-- FK: ${fromRef} REFERENCES ${toRef}`
}
