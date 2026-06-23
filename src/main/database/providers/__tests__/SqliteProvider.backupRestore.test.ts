// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Database from 'better-sqlite3'
import { SqliteProvider } from '../SqliteProvider'

// ── Helpers ───────────────────────────────────────────────────────────────────

let workDir: string

/** Connects a provider to a real on-disk SQLite file and seeds two rows. */
async function buildConnectedProvider(filePath: string): Promise<SqliteProvider> {
  const provider = new SqliteProvider()
  await provider.connect({
    id: 'test-id',
    name: 'Test',
    provider: 'sqlite',
    host: '',
    port: 0,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: '',
    filePath
  })
  await provider.executeQuery('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)')
  await provider.executeQuery("INSERT INTO users (id, name) VALUES (1, 'Ada'), (2, 'Linus')")
  return provider
}

/** Reads the `users` table directly from a backup file. */
function readUsers(filePath: string): Array<{ id: number; name: string }> {
  const db = new Database(filePath, { readonly: true, fileMustExist: true })
  try {
    return db.prepare('SELECT id, name FROM users ORDER BY id').all() as Array<{
      id: number
      name: string
    }>
  } finally {
    db.close()
  }
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'spiral-sqlite-test-'))
})

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true })
})

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('SqliteProvider backup', () => {
  it('writes an exact copy with default options', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)
    const out = join(workDir, 'backup.db')

    const result = await provider.executeBackup({ filePath: out, compact: false, compress: false })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.filePath).toBe(out)
      expect(result.bytes).toBeGreaterThan(0)
    }
    expect(readUsers(out)).toEqual([
      { id: 1, name: 'Ada' },
      { id: 2, name: 'Linus' }
    ])
    await provider.disconnect()
  })

  it('compacts the output with VACUUM INTO when compact is set', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)
    const out = join(workDir, 'compact.db')

    const result = await provider.executeBackup({ filePath: out, compact: true, compress: false })

    expect(result.status).toBe('ok')
    expect(readUsers(out)).toHaveLength(2)
    await provider.disconnect()
  })

  it('gzip-compresses the output when compress is set', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)
    const out = join(workDir, 'backup.db.gz')

    const result = await provider.executeBackup({ filePath: out, compact: false, compress: true })

    expect(result.status).toBe('ok')
    // gzip magic bytes
    const head = readFileSync(out)
    expect(head[0]).toBe(0x1f)
    expect(head[1]).toBe(0x8b)
    await provider.disconnect()
  })
})

describe('SqliteProvider restore', () => {
  it('overwrites the live database and stays usable afterwards', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)

    // Build a separate backup with different data.
    const backup = join(workDir, 'other.db')
    const other = new Database(backup)
    other.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)').run()
    other.prepare("INSERT INTO users (id, name) VALUES (9, 'Grace')").run()
    other.close()

    const result = await provider.executeRestore({ filePath: backup, safetyCopy: false })

    expect(result.status).toBe('ok')
    // The reconnected provider should now see the restored data.
    const query = await provider.executeQuery('SELECT id, name FROM users ORDER BY id')
    expect(query.status).toBe('ok')
    if (query.status === 'ok') {
      expect(query.resultSets[0].rows).toEqual([{ id: 9, name: 'Grace' }])
    }
    await provider.disconnect()
  })

  it('creates a safety copy of the current database when requested', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)

    const backup = join(workDir, 'other.db')
    const other = new Database(backup)
    other.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)').run()
    other.close()

    const result = await provider.executeRestore({ filePath: backup, safetyCopy: true })

    expect(result.status).toBe('ok')
    if (result.status === 'ok') {
      expect(result.safetyCopyPath).toBeDefined()
      expect(existsSync(result.safetyCopyPath!)).toBe(true)
      // The safety copy preserves the pre-restore data.
      expect(readUsers(result.safetyCopyPath!)).toHaveLength(2)
    }
    await provider.disconnect()
  })

  it('does not create a safety copy when disabled', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)

    const backup = join(workDir, 'other.db')
    const other = new Database(backup)
    other.prepare('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)').run()
    other.close()

    await provider.executeRestore({ filePath: backup, safetyCopy: false })

    const preRestore = readdirSync(workDir).filter((f) => f.includes('pre-restore'))
    expect(preRestore).toHaveLength(0)
    await provider.disconnect()
  })

  it('restores from a gzip backup (auto-detected)', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)

    const gz = join(workDir, 'snapshot.db.gz')
    const backupResult = await provider.executeBackup({
      filePath: gz,
      compact: false,
      compress: true
    })
    expect(backupResult.status).toBe('ok')

    // Mutate the live db, then restore from the gzip snapshot.
    await provider.executeQuery("INSERT INTO users (id, name) VALUES (3, 'Dennis')")
    const result = await provider.executeRestore({ filePath: gz, safetyCopy: false })

    expect(result.status).toBe('ok')
    const query = await provider.executeQuery('SELECT COUNT(*) AS c FROM users')
    if (query.status === 'ok') {
      expect(query.resultSets[0].rows[0].c).toBe(2)
    }
    await provider.disconnect()
  })

  it('rejects a file that is not a valid SQLite database', async () => {
    const src = join(workDir, 'app.db')
    const provider = await buildConnectedProvider(src)

    const junk = join(workDir, 'not-a-db.db')
    writeFileSync(junk, 'this is plain text, not sqlite')

    const result = await provider.executeRestore({ filePath: junk, safetyCopy: false })

    expect(result.status).toBe('error')
    if (result.status === 'error') {
      expect(result.message).toMatch(/not a valid SQLite database/i)
    }
    // The live database must be untouched.
    const query = await provider.executeQuery('SELECT COUNT(*) AS c FROM users')
    if (query.status === 'ok') {
      expect(query.resultSets[0].rows[0].c).toBe(2)
    }
    await provider.disconnect()
  })
})

describe('SqliteProvider capabilities', () => {
  it('reports backup/restore support', async () => {
    const provider = await buildConnectedProvider(join(workDir, 'app.db'))
    expect(provider.getCapabilities().hasBackupRestore).toBe(true)
    await provider.disconnect()
  })
})
