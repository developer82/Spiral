import type { Writable } from 'node:stream'
import type { MySqlBackupOptions, MySqlRestoreOptions } from '../types'

/**
 * Pure-JS MySQL dump/restore engine used as a fallback when the mysqldump /
 * mysql client binaries are not available. It reuses the provider's existing
 * mysql2 connection via the injected `query` callback, so no extra connection
 * handling lives here.
 *
 * This is intentionally dependency-free (its own value escaper, its own
 * DELIMITER-aware statement splitter) so it can be unit-tested in isolation.
 */

/** Minimal row shape returned by the injected query function. */
export type DumpRow = Record<string, unknown>
export type QueryFn = (sql: string) => Promise<DumpRow[]>

/** Wraps a MySQL identifier in backticks, escaping embedded backticks. */
export function quoteIdent(identifier: string): string {
  return '`' + identifier.replace(/`/g, '``') + '`'
}

const ESCAPE_MAP: Record<string, string> = {
  '\0': '\\0',
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\r': '\\r',
  '\x1a': '\\Z',
  '"': '\\"',
  "'": "\\'",
  '\\': '\\\\'
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n)
}

function formatDate(d: Date): string {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  )
}

/** Escapes a single SQL value into a literal suitable for an INSERT statement. */
export function escapeValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'bigint') return value.toString()
  if (Buffer.isBuffer(value)) return '0x' + (value.length ? value.toString('hex') : '')
  if (value instanceof Date) return `'${formatDate(value)}'`
  if (typeof value === 'object') {
    return "'" + JSON.stringify(value).replace(/[\0\b\t\n\r\x1a"'\\]/g, (c) => ESCAPE_MAP[c]) + "'"
  }
  return "'" + String(value).replace(/[\0\b\t\n\r\x1a"'\\]/g, (c) => ESCAPE_MAP[c]) + "'"
}

/** Writes a chunk and resolves once the stream is ready for more (backpressure). */
function write(stream: Writable, chunk: string): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (err) => (err ? reject(err) : resolve()))
  })
}

const INSERT_BATCH = 200

/**
 * Streams a logical SQL dump of the given database to `out`.
 * Returns the number of tables dumped.
 */
export async function dumpDatabaseToFile(
  query: QueryFn,
  opts: MySqlBackupOptions,
  out: Writable
): Promise<number> {
  const charset = opts.charset || 'utf8mb4'
  const includeSchema = opts.content !== 'data-only'
  const includeData = opts.content !== 'schema-only'

  await write(
    out,
    `-- Spiral MySQL dump\n-- Database: ${opts.databaseName}\n-- Generated: ${new Date().toISOString()}\n\n` +
      `SET NAMES ${charset};\n` +
      `SET FOREIGN_KEY_CHECKS=0;\n\n`
  )

  if (opts.addCreateDatabase) {
    await write(
      out,
      `CREATE DATABASE IF NOT EXISTS ${quoteIdent(opts.databaseName)} ` +
        `/*!40100 DEFAULT CHARACTER SET ${charset} */;\n` +
        `USE ${quoteIdent(opts.databaseName)};\n\n`
    )
  }

  // Resolve the list of base tables to dump.
  let tables = opts.tables && opts.tables.length > 0 ? [...opts.tables] : []
  let views: string[] = []
  if (tables.length === 0) {
    const rows = await query(
      `SHOW FULL TABLES FROM ${quoteIdent(opts.databaseName)}`
    )
    for (const row of rows) {
      const name = String(Object.values(row)[0])
      const type = String(row['Table_type'] ?? '')
      if (type === 'VIEW') views.push(name)
      else tables.push(name)
    }
  }

  for (const table of tables) {
    if (includeSchema) {
      if (opts.addDropTable) {
        await write(out, `DROP TABLE IF EXISTS ${quoteIdent(table)};\n`)
      }
      const created = await query(`SHOW CREATE TABLE ${quoteIdent(table)}`)
      const ddl = created.length ? String(created[0]['Create Table'] ?? '') : ''
      if (ddl) await write(out, ddl + ';\n\n')
    }
    if (includeData) {
      await dumpTableData(query, table, opts.extendedInsert, out)
    }
  }

  if (includeSchema) {
    for (const view of views) {
      const created = await query(`SHOW CREATE VIEW ${quoteIdent(view)}`)
      const ddl = created.length ? String(created[0]['Create View'] ?? '') : ''
      if (ddl) {
        await write(out, `DROP VIEW IF EXISTS ${quoteIdent(view)};\n${ddl};\n\n`)
      }
    }

    if (opts.includeRoutines) {
      await dumpRoutines(query, opts.databaseName, out)
    }
    if (opts.includeTriggers) {
      await dumpTriggers(query, opts.databaseName, out)
    }
    if (opts.includeEvents) {
      await dumpEvents(query, opts.databaseName, out)
    }
  }

  await write(out, `SET FOREIGN_KEY_CHECKS=1;\n`)
  return tables.length
}

async function dumpTableData(
  query: QueryFn,
  table: string,
  extendedInsert: boolean,
  out: Writable
): Promise<void> {
  const rows = await query(`SELECT * FROM ${quoteIdent(table)}`)
  if (rows.length === 0) return

  const columns = Object.keys(rows[0])
  const colList = columns.map(quoteIdent).join(', ')
  const prefix = `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES`

  if (extendedInsert) {
    for (let i = 0; i < rows.length; i += INSERT_BATCH) {
      const batch = rows.slice(i, i + INSERT_BATCH)
      const tuples = batch
        .map((r) => '(' + columns.map((c) => escapeValue(r[c])).join(', ') + ')')
        .join(',\n')
      await write(out, `${prefix}\n${tuples};\n`)
    }
  } else {
    for (const r of rows) {
      const tuple = '(' + columns.map((c) => escapeValue(r[c])).join(', ') + ')'
      await write(out, `${prefix} ${tuple};\n`)
    }
  }
  await write(out, '\n')
}

async function dumpRoutines(query: QueryFn, db: string, out: Writable): Promise<void> {
  for (const kind of ['PROCEDURE', 'FUNCTION'] as const) {
    const rows = await query(
      `SHOW ${kind} STATUS WHERE Db = '${db.replace(/'/g, "''")}'`
    )
    for (const row of rows) {
      const name = String(row['Name'] ?? '')
      if (!name) continue
      const created = await query(`SHOW CREATE ${kind} ${quoteIdent(name)}`)
      const ddl = created.length ? String(created[0][`Create ${kind === 'PROCEDURE' ? 'Procedure' : 'Function'}`] ?? '') : ''
      if (!ddl) continue
      await write(
        out,
        `DROP ${kind} IF EXISTS ${quoteIdent(name)};\nDELIMITER ;;\n${ddl} ;;\nDELIMITER ;\n\n`
      )
    }
  }
}

async function dumpTriggers(query: QueryFn, db: string, out: Writable): Promise<void> {
  const rows = await query(`SHOW TRIGGERS FROM ${quoteIdent(db)}`)
  for (const row of rows) {
    const name = String(row['Trigger'] ?? '')
    if (!name) continue
    const created = await query(`SHOW CREATE TRIGGER ${quoteIdent(name)}`)
    const ddl = created.length ? String(created[0]['SQL Original Statement'] ?? '') : ''
    if (!ddl) continue
    await write(
      out,
      `DROP TRIGGER IF EXISTS ${quoteIdent(name)};\nDELIMITER ;;\n${ddl} ;;\nDELIMITER ;\n\n`
    )
  }
}

async function dumpEvents(query: QueryFn, db: string, out: Writable): Promise<void> {
  let rows: DumpRow[] = []
  try {
    rows = await query(`SHOW EVENTS FROM ${quoteIdent(db)}`)
  } catch {
    return
  }
  for (const row of rows) {
    const name = String(row['Name'] ?? '')
    if (!name) continue
    const created = await query(`SHOW CREATE EVENT ${quoteIdent(name)}`)
    const ddl = created.length ? String(created[0]['Create Event'] ?? '') : ''
    if (!ddl) continue
    await write(
      out,
      `DROP EVENT IF EXISTS ${quoteIdent(name)};\nDELIMITER ;;\n${ddl} ;;\nDELIMITER ;\n\n`
    )
  }
}

/**
 * Splits a SQL script into individual statements, honoring `DELIMITER`
 * directives (used by routine/trigger/event blocks). Line and block comments
 * are stripped. Exported for unit testing.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = []
  let delimiter = ';'
  let buffer = ''
  let i = 0
  const len = sql.length

  // Process line-by-line so we can detect DELIMITER directives, but track
  // string/quote state so delimiters inside literals are ignored.
  let inSingle = false
  let inDouble = false
  let inBacktick = false
  let inLineComment = false
  let inBlockComment = false

  const atLineStart = (): boolean => buffer.length === 0 || /\n\s*$/.test(buffer) || buffer.trim() === ''

  while (i < len) {
    // Handle DELIMITER directive only at the start of a line, outside literals.
    if (
      !inSingle &&
      !inDouble &&
      !inBacktick &&
      !inBlockComment &&
      atLineStart() &&
      /^delimiter[ \t]/i.test(sql.slice(i, i + 11))
    ) {
      const eol = sql.indexOf('\n', i)
      const line = sql.slice(i, eol === -1 ? len : eol)
      const newDelim = line.replace(/^delimiter[ \t]+/i, '').trim()
      if (newDelim) delimiter = newDelim
      i = eol === -1 ? len : eol + 1
      buffer = ''
      continue
    }

    const ch = sql[i]
    const rest = sql.slice(i)

    if (inLineComment) {
      if (ch === '\n') inLineComment = false
      i++
      continue
    }
    if (inBlockComment) {
      if (ch === '*' && sql[i + 1] === '/') {
        inBlockComment = false
        i += 2
      } else {
        i++
      }
      continue
    }
    if (!inSingle && !inDouble && !inBacktick) {
      if ((ch === '-' && sql[i + 1] === '-' && (sql[i + 2] === ' ' || sql[i + 2] === '\t' || sql[i + 2] === '\n' || sql[i + 2] === undefined)) || ch === '#') {
        inLineComment = true
        i++
        continue
      }
      if (ch === '/' && sql[i + 1] === '*') {
        inBlockComment = true
        i += 2
        continue
      }
      if (rest.startsWith(delimiter)) {
        const stmt = buffer.trim()
        if (stmt) statements.push(stmt)
        buffer = ''
        i += delimiter.length
        continue
      }
    }

    // Quote state transitions.
    if (ch === "'" && !inDouble && !inBacktick) {
      if (inSingle && sql[i + 1] === "'") {
        buffer += "''"
        i += 2
        continue
      }
      inSingle = !inSingle
    } else if (ch === '"' && !inSingle && !inBacktick) {
      inDouble = !inDouble
    } else if (ch === '`' && !inSingle && !inDouble) {
      inBacktick = !inBacktick
    } else if (ch === '\\' && (inSingle || inDouble)) {
      buffer += ch + (sql[i + 1] ?? '')
      i += 2
      continue
    }

    buffer += ch
    i++
  }

  const tail = buffer.trim()
  if (tail) statements.push(tail)
  return statements
}

/**
 * Restores a SQL script (already decompressed to text) into the target
 * database via the injected `query` callback. Returns the number of statements
 * executed successfully.
 */
export async function restoreFromText(
  query: QueryFn,
  sqlText: string,
  opts: MySqlRestoreOptions
): Promise<number> {
  if (opts.createDatabaseIfNotExists) {
    await query(`CREATE DATABASE IF NOT EXISTS ${quoteIdent(opts.targetDatabaseName)}`)
  }
  await query(`USE ${quoteIdent(opts.targetDatabaseName)}`)

  const statements = splitSqlStatements(sqlText)
  let run = 0
  for (const stmt of statements) {
    try {
      await query(stmt)
      run++
    } catch (err) {
      if (opts.stopOnError) {
        const message = err instanceof Error ? err.message : String(err)
        throw new Error(`Statement #${run + 1} failed: ${message}`)
      }
    }
  }
  return run
}
