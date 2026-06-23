// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { Writable } from 'node:stream'
import {
  escapeValue,
  quoteIdent,
  splitSqlStatements,
  dumpDatabaseToFile,
  restoreFromText,
  type DumpRow
} from '../mysqlDump'
import type { MySqlBackupOptions, MySqlRestoreOptions } from '../../types'

/** A Writable that accumulates everything written to it into a string. */
function collector(): { stream: Writable; text: () => string } {
  let buf = ''
  const stream = new Writable({
    write(chunk, _enc, cb): void {
      buf += chunk.toString()
      cb()
    }
  })
  return { stream, text: () => buf }
}

function backupOptions(overrides: Partial<MySqlBackupOptions> = {}): MySqlBackupOptions {
  return {
    databaseName: 'shop',
    filePath: '/tmp/shop.sql',
    content: 'schema-and-data',
    addDropTable: true,
    singleTransaction: true,
    includeRoutines: false,
    includeTriggers: false,
    includeEvents: false,
    extendedInsert: true,
    addCreateDatabase: false,
    charset: 'utf8mb4',
    compress: false,
    ...overrides
  }
}

describe('escapeValue', () => {
  it('renders NULL for null and undefined', () => {
    expect(escapeValue(null)).toBe('NULL')
    expect(escapeValue(undefined)).toBe('NULL')
  })

  it('renders numbers and booleans without quotes', () => {
    expect(escapeValue(42)).toBe('42')
    expect(escapeValue(true)).toBe('1')
    expect(escapeValue(false)).toBe('0')
  })

  it('escapes single quotes and control characters in strings', () => {
    expect(escapeValue("O'Brien")).toBe("'O\\'Brien'")
    expect(escapeValue('line1\nline2')).toBe("'line1\\nline2'")
    expect(escapeValue('back\\slash')).toBe("'back\\\\slash'")
  })

  it('hex-encodes buffers', () => {
    expect(escapeValue(Buffer.from([0xde, 0xad]))).toBe('0xdead')
  })
})

describe('quoteIdent', () => {
  it('wraps identifiers in backticks and doubles embedded backticks', () => {
    expect(quoteIdent('users')).toBe('`users`')
    expect(quoteIdent('we`ird')).toBe('`we``ird`')
  })
})

describe('splitSqlStatements', () => {
  it('splits plain semicolon-delimited statements', () => {
    const out = splitSqlStatements('SELECT 1;\nSELECT 2;')
    expect(out).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('ignores semicolons inside string literals', () => {
    const out = splitSqlStatements("INSERT INTO t VALUES ('a;b');\nSELECT 1;")
    expect(out).toEqual(["INSERT INTO t VALUES ('a;b')", 'SELECT 1'])
  })

  it('strips line and block comments', () => {
    const out = splitSqlStatements('-- a comment\nSELECT 1; /* block */ SELECT 2;')
    expect(out).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('honors DELIMITER directives for routine bodies', () => {
    const sql = [
      'DELIMITER ;;',
      'CREATE PROCEDURE p() BEGIN SELECT 1; SELECT 2; END ;;',
      'DELIMITER ;',
      'SELECT 3;'
    ].join('\n')
    const out = splitSqlStatements(sql)
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('CREATE PROCEDURE p()')
    expect(out[0]).toContain('SELECT 1; SELECT 2;')
    expect(out[1]).toBe('SELECT 3')
  })
})

/** Builds a query mock that answers the dump queries for a single-table DB. */
function dumpQueryMock(): (sql: string) => Promise<DumpRow[]> {
  return vi.fn(async (sql: string): Promise<DumpRow[]> => {
    if (sql.startsWith('SHOW FULL TABLES')) {
      return [{ Tables_in_shop: 'users', Table_type: 'BASE TABLE' }]
    }
    if (sql.startsWith('SHOW CREATE TABLE')) {
      return [{ Table: 'users', 'Create Table': 'CREATE TABLE `users` (\n  `id` int\n)' }]
    }
    if (sql.startsWith('SELECT * FROM')) {
      return [
        { id: 1, name: "O'Brien" },
        { id: 2, name: 'Smith' }
      ]
    }
    return []
  })
}

describe('dumpDatabaseToFile', () => {
  it('emits DROP, CREATE and INSERT for schema-and-data', async () => {
    const { stream, text } = collector()
    const count = await dumpDatabaseToFile(dumpQueryMock(), backupOptions(), stream)
    const sql = text()
    expect(count).toBe(1)
    expect(sql).toContain('DROP TABLE IF EXISTS `users`;')
    expect(sql).toContain('CREATE TABLE `users`')
    expect(sql).toContain('INSERT INTO `users`')
    expect(sql).toContain("'O\\'Brien'")
    expect(sql).toContain('SET FOREIGN_KEY_CHECKS=0;')
  })

  it('omits data when content is schema-only', async () => {
    const { stream, text } = collector()
    await dumpDatabaseToFile(dumpQueryMock(), backupOptions({ content: 'schema-only' }), stream)
    const sql = text()
    expect(sql).toContain('CREATE TABLE `users`')
    expect(sql).not.toContain('INSERT INTO `users`')
  })

  it('omits schema when content is data-only', async () => {
    const { stream, text } = collector()
    await dumpDatabaseToFile(dumpQueryMock(), backupOptions({ content: 'data-only' }), stream)
    const sql = text()
    expect(sql).not.toContain('CREATE TABLE `users`')
    expect(sql).toContain('INSERT INTO `users`')
  })

  it('emits CREATE DATABASE when requested', async () => {
    const { stream, text } = collector()
    await dumpDatabaseToFile(dumpQueryMock(), backupOptions({ addCreateDatabase: true }), stream)
    expect(text()).toContain('CREATE DATABASE IF NOT EXISTS `shop`')
  })

  it('uses one INSERT per row when extendedInsert is off', async () => {
    const { stream, text } = collector()
    await dumpDatabaseToFile(dumpQueryMock(), backupOptions({ extendedInsert: false }), stream)
    const inserts = text().match(/INSERT INTO `users`/g) ?? []
    expect(inserts).toHaveLength(2)
  })
})

function restoreOptions(overrides: Partial<MySqlRestoreOptions> = {}): MySqlRestoreOptions {
  return {
    filePath: '/tmp/shop.sql',
    targetDatabaseName: 'shop',
    createDatabaseIfNotExists: false,
    stopOnError: true,
    ...overrides
  }
}

describe('restoreFromText', () => {
  it('selects the target database and runs each statement', async () => {
    const run: string[] = []
    const query = vi.fn(async (sql: string) => {
      run.push(sql)
      return [] as DumpRow[]
    })
    const count = await restoreFromText(query, 'CREATE TABLE a (id int);\nINSERT INTO a VALUES (1);', restoreOptions())
    expect(count).toBe(2)
    expect(run[0]).toBe('USE `shop`')
    expect(run).toContain('CREATE TABLE a (id int)')
  })

  it('creates the database first when requested', async () => {
    const run: string[] = []
    const query = vi.fn(async (sql: string) => {
      run.push(sql)
      return [] as DumpRow[]
    })
    await restoreFromText(query, 'SELECT 1;', restoreOptions({ createDatabaseIfNotExists: true }))
    expect(run[0]).toBe('CREATE DATABASE IF NOT EXISTS `shop`')
    expect(run[1]).toBe('USE `shop`')
  })

  it('aborts on the first error when stopOnError is set', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('BOOM')) throw new Error('syntax error')
      return [] as DumpRow[]
    })
    await expect(
      restoreFromText(query, 'SELECT 1;\nBOOM;\nSELECT 2;', restoreOptions({ stopOnError: true }))
    ).rejects.toThrow(/Statement #2 failed/)
  })

  it('keeps going past errors when stopOnError is off', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('BOOM')) throw new Error('syntax error')
      return [] as DumpRow[]
    })
    const count = await restoreFromText(
      query,
      'SELECT 1;\nBOOM;\nSELECT 2;',
      restoreOptions({ stopOnError: false })
    )
    // SELECT 1 + SELECT 2 succeed; BOOM fails silently (USE is not counted).
    expect(count).toBe(2)
  })
})
