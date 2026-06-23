import * as net from 'net'
import { spawn, execFile } from 'child_process'
import { createWriteStream, statSync } from 'fs'
import { readFile } from 'fs/promises'
import { createGzip, gunzipSync } from 'zlib'
import { MongoClient } from 'mongodb'
import { ObjectId, EJSON } from 'bson'
import type { MongoClientOptions, Db, Document, Filter } from 'mongodb'
import { Client as SshClient } from 'ssh2'
import type { ConnectionRecord } from '../../store'
import { createSshTunnel } from './sshTunnel'
import type {
  DatabaseProvider,
  ExplorerNode,
  ExecuteQueryResult,
  QueryResultSet,
  GetTableSchemaResult,
  GetErdSchemaResult,
  GetForeignKeysResult,
  GetCheckConstraintsResult,
  GetTriggersResult,
  SaveTriggerParams,
  SaveTriggerResult,
  DeleteTriggerResult,
  GetIndexesResult,
  SaveIndexParams,
  SaveIndexResult,
  DeleteIndexResult,
  RebuildIndexResult,
  ReorganizeIndexResult,
  DisableIndexResult,
  GetViewsResult,
  SaveViewParams,
  SaveViewResult,
  DeleteViewResult,
  GetStoredProceduresResult,
  SaveStoredProcedureParams,
  SaveStoredProcedureResult,
  DeleteStoredProcedureResult,
  GetDataTypesResult,
  SaveDataTypeParams,
  SaveDataTypeResult,
  DeleteDataTypeResult,
  GetTableTypesResult,
  GetTableTypeResult,
  SaveTableTypeParams,
  SaveTableTypeResult,
  DeleteTableTypeResult,
  GetMemoryOptimizedTableTypesResult,
  GetMemoryOptimizedTableTypeResult,
  SaveMemoryOptimizedTableTypeParams,
  SaveMemoryOptimizedTableTypeResult,
  DeleteMemoryOptimizedTableTypeResult,
  GenerateScriptResult,
  ProviderCapabilities,
  GetMongoIndexesResult,
  MongoIndexField,
  SaveMongoIndexParams,
  SaveMongoIndexResult,
  DropMongoIndexResult,
  GetCollectionFieldsResult,
  MongoUserDetails,
  SaveMongoUserParams,
  SaveMongoUserResult,
  DeleteMongoUserResult,
  MongoBackupOptions,
  MongoRestoreOptions,
  MongoToolInfo,
  MongoBackupToolStatusResult,
  BuildMongoBackupPreviewResult,
  ExecuteMongoBackupResult,
  ExecuteMongoRestoreResult
} from '../types'

// ─── Constants ─────────────────────────────────────────────────────────────────

const NOT_SUPPORTED: { status: 'error'; message: string } = {
  status: 'error',
  message: 'Not supported for MongoDB connections'
}

function formatShellBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(Math.floor(Math.log2(Math.max(1, bytes)) / 10), units.length - 1)
  const val = bytes / Math.pow(1024, i)
  return `${val % 1 === 0 ? val : val.toFixed(1)} ${units[i]}`
}

function formatResultSetForShell(rs: QueryResultSet): string {
  if (rs.rawDocuments && rs.rawDocuments.length > 0) {
    const docs = rs.rawDocuments.map((d) => {
      try {
        return JSON.stringify(JSON.parse(d), null, 2)
      } catch {
        return d
      }
    })
    return docs.join('\r\n')
  }
  if (rs.rows.length === 0) return '(no results)'
  return rs.rows
    .map((row) => JSON.stringify(row, null, 2))
    .join('\r\n')
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Convert a value to a JSON-serializable primitive. Used when flattening
 * MongoDB documents to QueryResultSet rows.
 */
function serializeValue(val: unknown): unknown {
  if (val === null || val === undefined) return null
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val
  if (val instanceof Date) return val.toISOString()
  // ObjectId and other BSON types expose toHexString()
  if (
    typeof val === 'object' &&
    val !== null &&
    'toHexString' in val &&
    typeof (val as { toHexString: unknown }).toHexString === 'function'
  ) {
    return (val as { toHexString(): string }).toHexString()
  }
  return JSON.stringify(val)
}

/**
 * Convert a BSON/MongoDB driver value to an Extended JSON (v2 canonical) representation.
 * Used to serialise rawDocuments so every BSON type round-trips through the dialog.
 */
function toExtendedJsonValue(val: unknown, depth = 0): unknown {
  if (depth > 100) return null
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') return val
  if (typeof val === 'number') {
    if (Object.is(val, Infinity)) return { $numberDouble: 'Infinity' }
    if (Object.is(val, -Infinity)) return { $numberDouble: '-Infinity' }
    if (Number.isNaN(val)) return { $numberDouble: 'NaN' }
    return val
  }
  if (val instanceof Date) return { $date: val.toISOString() }
  if (Array.isArray(val)) return val.map((v) => toExtendedJsonValue(v, depth + 1))
  if (typeof val === 'object') {
    const ctor = (val as { constructor?: { name?: string } }).constructor?.name
    if (ctor === 'ObjectId' || ctor === 'ObjectID') {
      return { $oid: (val as { toHexString(): string }).toHexString() }
    }
    if (ctor === 'Int32') {
      return { $numberInt: String((val as { value: number }).value) }
    }
    if (ctor === 'Long') {
      return { $numberLong: (val as { toString(): string }).toString() }
    }
    if (ctor === 'Decimal128') {
      return { $numberDecimal: (val as { toString(): string }).toString() }
    }
    if (ctor === 'Binary' || ctor === 'UUID') {
      const b = val as { buffer: Buffer; sub_type: number }
      const base64 = Buffer.isBuffer(b.buffer) ? b.buffer.toString('base64') : ''
      const subType = typeof b.sub_type === 'number' ? b.sub_type.toString(16).padStart(2, '0') : '00'
      return { $binary: { base64, subType } }
    }
    if (ctor === 'BSONRegExp') {
      const r = val as { pattern: string; options: string }
      return { $regularExpression: { pattern: r.pattern, options: r.options } }
    }
    if (ctor === 'Timestamp') {
      const t = val as { high: number; low: number }
      return { $timestamp: { t: t.high, i: t.low } }
    }
    if (ctor === 'MinKey') return { $minKey: 1 }
    if (ctor === 'MaxKey') return { $maxKey: 1 }
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      result[k] = toExtendedJsonValue(v, depth + 1)
    }
    return result
  }
  return val
}

/**
 * Parse an Extended JSON (v2) plain-JS value (produced by JSON.parse on an
 * EJSON string) back into the BSON / JS equivalents accepted by the MongoDB
 * driver for insertOne / replaceOne calls.
 */
function fromExtendedJsonValue(val: unknown, depth = 0): unknown {
  if (depth > 100) return null
  if (val === null || val === undefined) return null
  if (typeof val === 'boolean') return val
  if (typeof val === 'string') return val
  if (typeof val === 'number') return val
  if (Array.isArray(val)) return val.map((v) => fromExtendedJsonValue(v, depth + 1))
  if (typeof val === 'object') {
    const obj = val as Record<string, unknown>
    if ('$oid' in obj && typeof obj.$oid === 'string') {
      return new ObjectId(obj.$oid)
    }
    if ('$date' in obj) {
      if (typeof obj.$date === 'string') return new Date(obj.$date)
      if (typeof obj.$date === 'object' && obj.$date !== null) {
        const d = obj.$date as Record<string, unknown>
        if ('$numberLong' in d && typeof d.$numberLong === 'string') {
          return new Date(Number(d.$numberLong))
        }
      }
      return new Date(String(obj.$date))
    }
    if ('$numberInt' in obj && typeof obj.$numberInt === 'string') {
      return parseInt(obj.$numberInt, 10)
    }
    if ('$numberLong' in obj && typeof obj.$numberLong === 'string') {
      return parseInt(obj.$numberLong, 10)
    }
    if ('$numberDouble' in obj && typeof obj.$numberDouble === 'string') {
      const s = obj.$numberDouble
      if (s === 'Infinity') return Infinity
      if (s === '-Infinity') return -Infinity
      if (s === 'NaN') return NaN
      return parseFloat(s)
    }
    if ('$numberDecimal' in obj) return parseFloat(String(obj.$numberDecimal))
    if ('$minKey' in obj) return { $minKey: 1 }
    if ('$maxKey' in obj) return { $maxKey: 1 }
    if ('$binary' in obj || '$regularExpression' in obj || '$timestamp' in obj) {
      return obj
    }
    const result: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      result[k] = fromExtendedJsonValue(v, depth + 1)
    }
    return result
  }
  return val
}

/**
 * Convert an array of MongoDB documents to a flat QueryResultSet. All unique
 * top-level field names become columns; nested objects/arrays are serialized
 * to JSON strings.  rawDocuments are serialized as Extended JSON (v2 canonical)
 * so that BSON types round-trip correctly through the add/edit document dialog.
 */
function docsToResultSet(docs: unknown[]): QueryResultSet {
  const rawDocuments = docs.map((d) => JSON.stringify(toExtendedJsonValue(d)))

  if (docs.length === 0) {
    return { columns: [], rows: [], rowCount: 0, rawDocuments: [] }
  }

  const columnSet = new Set<string>()
  for (const doc of docs) {
    if (doc !== null && typeof doc === 'object' && !Array.isArray(doc)) {
      for (const key of Object.keys(doc as object)) {
        columnSet.add(key)
      }
    }
  }

  if (columnSet.size === 0) {
    return {
      columns: ['value'],
      rows: docs.map((d) => ({ value: serializeValue(d) })),
      rowCount: docs.length,
      rawDocuments
    }
  }

  const columns = Array.from(columnSet)
  const rows = docs.map((doc) => {
    const row: Record<string, unknown> = {}
    for (const col of columns) {
      const val = (doc as Record<string, unknown>)[col]
      row[col] = serializeValue(val)
    }
    return row
  })

  return { columns, rows, rowCount: rows.length, rawDocuments }
}

/**
 * Loosely parse a JSON-like string (MongoDB shell object notation) into a
 * plain JS value. Handles common Mongo shell idioms:
 * - Unquoted keys: `{age: 1}`
 * - Single-quoted strings: `{name: 'Alice'}`
 * - Trailing commas: `{a: 1,}`
 * - Inline comments: `// ...`
 * - BSON constructor calls: `ObjectId("...")`, `ISODate("...")`, `NumberLong(n)`, etc.
 *
 * Falls back to raw `JSON.parse` first for efficiency.
 */
function parseLooseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Empty query')

  // Fast path: already valid JSON
  try {
    return JSON.parse(trimmed)
  } catch {
    // continue to preprocessing
  }

  let s = trimmed

  // Remove single-line comments
  s = s.replace(/\/\/[^\n]*/g, '')
  // Remove multi-line comments
  s = s.replace(/\/\*[\s\S]*?\*\//g, '')

  // Replace common BSON type constructors with JSON-compatible equivalents
  s = s.replace(/ObjectId\(['"]([^'"]+)['"]\)/g, '"$1"')
  s = s.replace(/ObjectId\(\)/g, '"000000000000000000000000"')
  s = s.replace(/ISODate\(['"]([^'"]+)['"]\)/g, '"$1"')
  s = s.replace(/ISODate\(\)/g, '"1970-01-01T00:00:00.000Z"')
  s = s.replace(/NumberLong\(["']?(-?\d+)["']?\)/g, '$1')
  s = s.replace(/NumberInt\((-?\d+)\)/g, '$1')
  s = s.replace(/NumberDecimal\(['"]([^'"]+)['"]\)/g, '$1')
  s = s.replace(/Timestamp\(\d+,\s*\d+\)/g, '0')
  s = s.replace(/BinData\([^)]*\)/g, '"<BinData>"')
  s = s.replace(/UUID\(['"]([^'"]+)['"]\)/g, '"$1"')

  // Quote unquoted object keys: {key: ...} → {"key": ...}
  // Handles identifiers preceded by { , or [ (allowing whitespace)
  s = s.replace(/([{[,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3')
  // Also handle first key after a newline in multi-line objects
  s = s.replace(/(\n\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)(\s*:)/g, '$1"$2"$3')

  // Convert single-quoted strings to double-quoted
  // Simple approach: replace 'content' with "content" when content has no double quotes
  s = s.replace(/'([^'\\]*)'/g, (_m, content: string) => '"' + content.replace(/"/g, '\\"') + '"')

  // Remove trailing commas before } or ]
  s = s.replace(/,(\s*[}\]])/g, '$1')

  // Replace JS primitives that aren't valid JSON
  s = s.replace(/\bundefined\b/g, 'null')
  s = s.replace(/\bInfinity\b/g, '1e308')
  s = s.replace(/\b-Infinity\b/g, '-1e308')
  s = s.replace(/\bNaN\b/g, 'null')

  return JSON.parse(s)
}

/**
 * Given a string starting at the opening `(`, return the content inside the
 * matching closing `)`. Correctly handles nested parens, brackets, braces,
 * and quoted strings.
 */
function extractBalancedParens(text: string, openPos: number): string | null {
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = openPos; i < text.length; i++) {
    const ch = text[i]

    if (inString) {
      if (ch === '\\') {
        i++ // skip escaped character
      } else if (ch === stringChar) {
        inString = false
      }
    } else {
      if (ch === '"' || ch === "'") {
        inString = true
        stringChar = ch
      } else if (ch === '(') {
        depth++
      } else if (ch === ')') {
        depth--
        if (depth === 0) {
          return text.slice(openPos + 1, i)
        }
      }
    }
  }
  return null
}

/**
 * Parse a comma-separated argument list into an array of parsed JS values.
 * Handles nested objects and arrays by using balanced-paren extraction.
 */
function parseArgList(rawArgs: string): unknown[] {
  const trimmed = rawArgs.trim()
  if (!trimmed) return []

  // Wrap in [] to parse as JSON array
  try {
    return parseLooseJson('[' + trimmed + ']') as unknown[]
  } catch {
    // Try single argument as fallback
    try {
      return [parseLooseJson(trimmed)]
    } catch {
      throw new Error(
        `Cannot parse query arguments. Make sure arguments are valid JSON or Mongo shell notation. ` +
          `Got: ${trimmed.slice(0, 200)}`
      )
    }
  }
}

// ─── Provider ──────────────────────────────────────────────────────────────────

export class MongoDbProvider implements DatabaseProvider {
  private client: MongoClient | null = null
  private activeDatabase = 'admin'
  private tunnelServer: net.Server | null = null
  private sshClient: SshClient | null = null
  private connectionRecord: ConnectionRecord | null = null

  // ── Connection ──────────────────────────────────────────────────────────────

  async connect(record: ConnectionRecord): Promise<void> {
    this.connectionRecord = record
    let uri: string
    const options: MongoClientOptions = {
      connectTimeoutMS: 15_000,
      serverSelectionTimeoutMS: 15_000
    }

    if (record.mongodbUri?.trim()) {
      // Full URI mode – the user supplied a connection string directly.
      uri = record.mongodbUri.trim()
    } else {
      // Structured mode – build URI from individual fields.
      const host = (record.host || '127.0.0.1').trim()
      const port = record.port || 27017

      if (record.sshEnabled) {
        // Forward the actual database host through SSH tunnel.
        // Limit to direct connections: mongodb+srv:// with SSH makes no sense.
        const tunnel = await createSshTunnel(record, host, port)
        this.tunnelServer = tunnel.server
        this.sshClient = tunnel.sshClient
        uri = `mongodb://127.0.0.1:${tunnel.port}`
        // directConnection prevents the driver from discovering cluster peers
        // through the tunnel.
        options.directConnection = true
      } else if (record.mongodbSrv) {
        // DNS Seedlist (SRV) — port is resolved via DNS SRV records, not specified in the URI.
        uri = `mongodb+srv://${host}`
      } else {
        uri = `mongodb://${host}:${port}`
      }

      // Auth credentials (not needed for X.509 — cert acts as auth token)
      if (record.username?.trim() && record.mongodbAuthMechanism !== 'MONGODB-X509') {
        options.auth = {
          username: record.username.trim(),
          password: record.password || ''
        }
      }

      if (record.mongodbAuthMechanism) {
        options.authMechanism = record.mongodbAuthMechanism
      }

      if (record.mongodbAuthSource?.trim()) {
        options.authSource = record.mongodbAuthSource.trim()
      }

      if (record.mongodbReplicaSet?.trim()) {
        options.replicaSet = record.mongodbReplicaSet.trim()
      }

      if (record.mongodbDirectConnection !== undefined && !record.sshEnabled) {
        options.directConnection = record.mongodbDirectConnection
      }

      // Append the default database to the URI if provided
      if (record.defaultDatabase?.trim()) {
        uri += `/${encodeURIComponent(record.defaultDatabase.trim())}`
      }
    }

    // TLS / SSL options
    if (record.tlsEnabled) {
      options.tls = true
      if (record.tlsCAFile?.trim()) options.tlsCAFile = record.tlsCAFile.trim()
      if (record.tlsCertificateKeyFile?.trim())
        options.tlsCertificateKeyFile = record.tlsCertificateKeyFile.trim()
      if (record.tlsCertificateKeyFilePassword?.trim())
        options.tlsCertificateKeyFilePassword = record.tlsCertificateKeyFilePassword.trim()
      if (record.tlsAllowInvalidHostnames) options.tlsAllowInvalidHostnames = true
      if (record.tlsAllowInvalidCertificates) options.tlsAllowInvalidCertificates = true
    }

    this.activeDatabase = record.defaultDatabase?.trim() || 'admin'
    this.client = new MongoClient(uri, options)
    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close()
      this.client = null
    }
    if (this.tunnelServer) {
      this.tunnelServer.close()
      this.tunnelServer = null
    }
    if (this.sshClient) {
      this.sshClient.end()
      this.sshClient = null
    }
  }

  // ── Explorer tree ───────────────────────────────────────────────────────────

  async listDatabases(_showSystemDatabases: boolean): Promise<ExplorerNode[]> {
    const admin = this.requireClient().db().admin()
    const { databases } = await admin.listDatabases()
    return databases.map((db) => ({
      id: `mongodb-db:${db.name}`,
      label: db.name,
      kind: 'database' as const
    }))
  }

  listCategories(databaseName: string): ExplorerNode[] {
    return [
      {
        id: `mongodb-collections:${databaseName}`,
        label: 'Collections',
        kind: 'mongodb-collections-folder' as const
      }
    ]
  }

  async listTables(databaseName: string): Promise<ExplorerNode[]> {
    const db = this.requireClient().db(databaseName)
    const collections = await db.listCollections().toArray()
    return collections.map((coll) => ({
      id: `mongodb-collection:${databaseName}:${coll.name}`,
      label: coll.name,
      kind: 'mongodb-collection' as const
    }))
  }

  async listCollectionChildren(databaseName: string, collectionName: string): Promise<ExplorerNode[]> {
    let docCount: number | null = null
    try {
      const db = this.requireClient().db(databaseName)
      docCount = await db.collection(collectionName).estimatedDocumentCount()
    } catch {
      // non-critical — show label without count
    }
    const docsLabel = docCount !== null ? `Documents (${docCount.toLocaleString()})` : 'Documents'
    return [
      { id: `mongodb-collection-documents:${databaseName}:${collectionName}`, label: docsLabel, kind: 'mongodb-collection-documents' as const },
      { id: `mongodb-collection-indexes:${databaseName}:${collectionName}`, label: 'Indexes', kind: 'mongodb-collection-indexes' as const },
      { id: `mongodb-collection-aggregations:${databaseName}:${collectionName}`, label: 'Aggregations', kind: 'mongodb-collection-aggregations' as const },
      { id: `mongodb-collection-validation:${databaseName}:${collectionName}`, label: 'Validation', kind: 'mongodb-collection-validation' as const }
    ]
  }

  // ── Query execution ─────────────────────────────────────────────────────────

  async executeQuery(
    queryText: string,
    timeoutMs = 30_000,
    _withPlan = false,
    _withStatistics = false,
    databaseName?: string
  ): Promise<ExecuteQueryResult> {
    const start = Date.now()
    try {
      const db = this.requireClient().db(databaseName || this.activeDatabase)
      const resultSet = await this.runMongoQuery(db, queryText.trim(), timeoutMs)
      return {
        status: 'ok',
        resultSets: [resultSet],
        messages: [],
        durationMs: Date.now() - start
      }
    } catch (err) {
      return {
        status: 'error',
        message: err instanceof Error ? err.message : String(err)
      }
    }
  }

  async executeMonitoringQuery<T>(_sql: string): Promise<T[]> {
    return []
  }

  async createDatabase(databaseName: string): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    try {
      // MongoDB databases are created lazily; materialise the database by
      // creating an initial placeholder collection.
      const db = this.requireClient().db(databaseName)
      await db.createCollection('_init_')
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async createCollection(databaseName: string, collectionName: string): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    try {
      const db = this.requireClient().db(databaseName)
      await db.createCollection(collectionName)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async renameCollection(databaseName: string, oldName: string, newName: string): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    try {
      const db = this.requireClient().db(databaseName)
      await db.collection(oldName).rename(newName)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async dropCollection(databaseName: string, collectionName: string): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    try {
      const db = this.requireClient().db(databaseName)
      await db.dropCollection(collectionName)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async insertMongoDocument(
    databaseName: string,
    collectionName: string,
    ejsonDocString: string
  ): Promise<{ status: 'ok'; insertedId: string } | { status: 'error'; message: string }> {
    try {
      const parsed = JSON.parse(ejsonDocString) as unknown
      const doc = fromExtendedJsonValue(parsed) as Document
      const db = this.requireClient().db(databaseName)
      const collection = db.collection(collectionName)
      const result = await collection.insertOne(doc)
      return { status: 'ok', insertedId: String(result.insertedId) }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async replaceMongoDocument(
    databaseName: string,
    collectionName: string,
    ejsonDocString: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    try {
      const parsed = JSON.parse(ejsonDocString) as unknown
      const doc = fromExtendedJsonValue(parsed) as Document
      if (typeof doc !== 'object' || doc === null || !('_id' in (doc as Record<string, unknown>))) {
        return { status: 'error', message: 'Document must contain an _id field' }
      }
      const id = (doc as Record<string, unknown>)._id
      const db = this.requireClient().db(databaseName)
      const collection = db.collection(collectionName)
      const result = await collection.replaceOne({ _id: id } as Filter<Document>, doc)
      if (result.matchedCount === 0) {
        return { status: 'error', message: 'Document not found — it may have been deleted' }
      }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteMongoDocument(
    databaseName: string,
    collectionName: string,
    ejsonDocString: string
  ): Promise<{ status: 'ok' } | { status: 'error'; message: string }> {
    try {
      const parsed = JSON.parse(ejsonDocString) as unknown
      const doc = fromExtendedJsonValue(parsed) as Document
      if (typeof doc !== 'object' || doc === null || !('_id' in (doc as Record<string, unknown>))) {
        return { status: 'error', message: 'Document must contain an _id field' }
      }
      const id = (doc as Record<string, unknown>)._id
      const db = this.requireClient().db(databaseName)
      const collection = db.collection(collectionName)
      const result = await collection.deleteOne({ _id: id } as Filter<Document>)
      if (result.deletedCount === 0) {
        return { status: 'error', message: 'Document not found — it may have already been deleted' }
      }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── MongoDB Index Operations ─────────────────────────────────────────────────

  async listMongoIndexes(databaseName: string, collectionName: string): Promise<ExplorerNode[]> {
    try {
      const db = this.requireClient().db(databaseName)
      const rawIndexes = await db.collection(collectionName).indexes()
      return (rawIndexes as Array<{ name?: string }>).map((idx) => ({
        id: `mongodb-index:${databaseName}:${collectionName}:${idx.name ?? ''}`,
        label: idx.name ?? '(unnamed)',
        kind: 'mongodb-index' as const
      }))
    } catch {
      return []
    }
  }

  async getMongoIndexes(databaseName: string, collectionName: string): Promise<GetMongoIndexesResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const rawIndexes = await db.collection(collectionName).indexes()
      const indexes = (rawIndexes as Array<Record<string, unknown>>).map((idx) => {
        const key = (idx.key ?? {}) as Record<string, unknown>
        const fields: MongoIndexField[] = Object.entries(key).map(([fieldName, val]) => ({
          fieldName,
          indexType: val as MongoIndexField['indexType']
        }))
        return {
          name: String(idx.name ?? ''),
          fields,
          unique: idx.unique as boolean | undefined,
          expireAfterSeconds: idx.expireAfterSeconds as number | undefined,
          partialFilterExpression: idx.partialFilterExpression,
          wildcardProjection: idx.wildcardProjection,
          sparse: idx.sparse as boolean | undefined,
          collation: idx.collation,
          isIdIndex: idx.name === '_id_'
        }
      })
      return { status: 'ok', indexes }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveMongoIndex(
    databaseName: string,
    collectionName: string,
    params: SaveMongoIndexParams,
    originalName?: string
  ): Promise<SaveMongoIndexResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const collection = db.collection(collectionName)

      if (originalName && originalName !== '_id_') {
        await collection.dropIndex(originalName)
      }

      const keySpec: Record<string, unknown> = {}
      for (const field of params.fields) {
        keySpec[field.fieldName] = field.indexType
      }

      const options: Record<string, unknown> = {}
      if (params.name) options.name = params.name
      if (params.unique) options.unique = true
      if (params.sparse) options.sparse = true
      if (params.expireAfterSeconds !== undefined) {
        options.expireAfterSeconds = params.expireAfterSeconds
      }
      if (params.partialFilterExpression) {
        options.partialFilterExpression = JSON.parse(params.partialFilterExpression) as unknown
      }
      if (params.wildcardProjection) {
        options.wildcardProjection = JSON.parse(params.wildcardProjection) as unknown
      }
      if (params.collation) {
        options.collation = JSON.parse(params.collation) as unknown
      }

      await collection.createIndex(keySpec as Parameters<typeof collection.createIndex>[0], options)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async dropMongoIndex(
    databaseName: string,
    collectionName: string,
    indexName: string
  ): Promise<DropMongoIndexResult> {
    try {
      const db = this.requireClient().db(databaseName)
      await db.collection(collectionName).dropIndex(indexName)
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async getCollectionFields(databaseName: string, collectionName: string): Promise<GetCollectionFieldsResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const docs = await db.collection(collectionName).find({}).limit(20).toArray()
      const fieldSet = new Set<string>()
      for (const doc of docs) {
        for (const key of Object.keys(doc)) {
          fieldSet.add(key)
        }
      }
      return { status: 'ok', fields: Array.from(fieldSet).sort() }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async runMongoAggregation(
    databaseName: string,
    collectionName: string,
    pipeline: unknown[]
  ): Promise<import('../types').RunMongoAggregationResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const docs = await db.collection(collectionName).aggregate(pipeline as import('mongodb').Document[], { maxTimeMS: 30_000 }).toArray()
      return { status: 'ok', resultSet: docsToResultSet(docs) }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async sampleDocuments(
    databaseName: string,
    collectionName: string,
    limit = 3
  ): Promise<import('../types').GetMongoAggregationSampleResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const docs = await db.collection(collectionName).find({}).limit(limit).toArray()
      const documents = docs.map((d) => JSON.stringify(toExtendedJsonValue(d), null, 2))
      return { status: 'ok', documents }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── MongoDB Validation ──────────────────────────────────────────────────────

  async getMongoValidation(
    databaseName: string,
    collectionName: string
  ): Promise<import('../types').GetMongoValidationResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const infos = await db.listCollections({ name: collectionName }).toArray()
      const options = (infos[0] as Record<string, unknown> | undefined)?.options as Record<string, unknown> | undefined ?? {}
      return {
        status: 'ok',
        definition: {
          validator: (options.validator as Record<string, unknown> | undefined) ?? {},
          validationAction: (options.validationAction as string | undefined) ?? 'error',
          validationLevel: (options.validationLevel as string | undefined) ?? 'strict'
        }
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async saveMongoValidation(
    databaseName: string,
    collectionName: string,
    validator: Record<string, unknown>,
    validationAction: string,
    validationLevel: string
  ): Promise<import('../types').SaveMongoValidationResult> {
    try {
      const db = this.requireClient().db(databaseName)
      await db.command({ collMod: collectionName, validator, validationAction, validationLevel })
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async testMongoValidation(
    databaseName: string,
    collectionName: string,
    validator: Record<string, unknown>
  ): Promise<import('../types').TestMongoValidationResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const collection = db.collection(collectionName)
      const isEmpty = Object.keys(validator).length === 0
      let passedDocs: Document[]
      let failedDocs: Document[]
      if (isEmpty) {
        passedDocs = await collection.find({}).limit(200).toArray()
        failedDocs = []
      } else {
        passedDocs = await collection.find(validator as import('mongodb').Filter<Document>).limit(200).toArray()
        failedDocs = await collection.find({ $nor: [validator] } as import('mongodb').Filter<Document>).limit(200).toArray()
      }
      const passed = passedDocs.map((d) => JSON.stringify(toExtendedJsonValue(d), null, 2))
      const failed = failedDocs.map((d) => JSON.stringify(toExtendedJsonValue(d), null, 2))
      return { status: 'ok', passed, failed }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async generateMongoValidationRules(
    databaseName: string,
    collectionName: string
  ): Promise<import('../types').GenerateMongoValidationRulesResult> {
    try {
      const db = this.requireClient().db(databaseName)
      const docs = await db.collection(collectionName).aggregate([{ $sample: { size: 100 } }]).toArray()
      if (docs.length === 0) {
        return { status: 'ok', validatorJson: JSON.stringify({ $jsonSchema: { bsonType: 'object', properties: {} } }, null, 2) }
      }

      const fieldTypes: Record<string, Set<string>> = {}
      const fieldRequired: Record<string, number> = {}

      function getBsonType(val: unknown): string {
        if (val === null || val === undefined) return 'null'
        if (typeof val === 'boolean') return 'bool'
        if (typeof val === 'number') return Number.isInteger(val) ? 'int' : 'double'
        if (typeof val === 'string') return 'string'
        if (val instanceof Date) return 'date'
        if (Array.isArray(val)) return 'array'
        if (typeof val === 'object') {
          const ctor = (val as { constructor?: { name?: string } }).constructor?.name ?? ''
          if (ctor === 'ObjectId' || ctor === 'ObjectID') return 'objectId'
          if (ctor === 'Int32') return 'int'
          if (ctor === 'Long') return 'long'
          if (ctor === 'Decimal128') return 'decimal'
          if (ctor === 'Binary' || ctor === 'UUID') return 'binData'
          return 'object'
        }
        return 'string'
      }

      for (const doc of docs) {
        for (const [key, val] of Object.entries(doc as Record<string, unknown>)) {
          if (key === '_id') continue
          const t = getBsonType(val)
          if (!fieldTypes[key]) fieldTypes[key] = new Set()
          fieldTypes[key].add(t)
          fieldRequired[key] = (fieldRequired[key] ?? 0) + 1
        }
      }

      const properties: Record<string, unknown> = {}
      const required: string[] = []

      for (const [field, types] of Object.entries(fieldTypes)) {
        const typeArr = [...types].filter((t) => t !== 'null')
        const isNullable = types.has('null')
        const bsonType = typeArr.length === 1 && !isNullable ? typeArr[0] : typeArr.length > 0 ? typeArr : 'string'
        properties[field] = { bsonType }
        if ((fieldRequired[field] ?? 0) === docs.length && !isNullable) {
          required.push(field)
        }
      }

      const schema: Record<string, unknown> = { bsonType: 'object', properties }
      if (required.length > 0) schema.required = required

      return { status: 'ok', validatorJson: JSON.stringify({ $jsonSchema: schema }, null, 2) }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Capabilities ────────────────────────────────────────────────────────────

  getCapabilities(): ProviderCapabilities {
    return {
      executionPlan: { kind: 'none' },
      clientStatistics: { kind: 'none' },
      hasCreateDatabase: true,
      hasStoredProcedures: false,
      hasFunctions: false,
      hasUserDefinedTypes: false,
      hasTableTypes: false,
      hasMemoryOptimizedTableTypes: false,
      hasStatistics: false,
      hasIndexRebuild: false,
      hasIndexReorganize: false,
      hasIndexDisable: false,
      hasProfiler: false,
      hasCreateTable: true,
      hasBackupRestore: true
    }
  }

  // ── Unsupported stubs (SQL-only) ────────────────────────────────────────────

  async listViews(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listStoredProcedures(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listFunctions(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listTypes(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  listTypeCategories(_databaseName: string): ExplorerNode[] { return [] }
  async listTypeDataTypes(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listTypeTables(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listTypeMemoryOptimizedTables(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  listTableCategories(_databaseName: string, _tableIdentifier: string): ExplorerNode[] { return [] }
  async listColumns(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listKeys(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listConstraints(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listTriggers(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listIndexes(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async listStatistics(_db: string, _schema: string, _table: string): Promise<ExplorerNode[]> { return [] }
  async getTableSchema(_db: string, _schema: string, _table: string): Promise<GetTableSchemaResult> { return NOT_SUPPORTED }
  async getForeignKeys(_db: string, _schema: string, _table: string): Promise<GetForeignKeysResult> { return NOT_SUPPORTED }
  async getCheckConstraints(_db: string, _schema: string, _table: string): Promise<GetCheckConstraintsResult> { return NOT_SUPPORTED }
  async getTriggers(_db: string, _schema: string, _table: string): Promise<GetTriggersResult> { return NOT_SUPPORTED }
  async saveTrigger(_db: string, _params: SaveTriggerParams, _original?: string): Promise<SaveTriggerResult> { return NOT_SUPPORTED }
  async deleteTrigger(_db: string, _name: string, _schema: string): Promise<DeleteTriggerResult> { return NOT_SUPPORTED }
  async getIndexes(_db: string, _schema: string, _table: string): Promise<GetIndexesResult> { return NOT_SUPPORTED }
  async saveIndex(_db: string, _params: SaveIndexParams, _original?: string): Promise<SaveIndexResult> { return NOT_SUPPORTED }
  async deleteIndex(_db: string, _name: string, _schema: string, _table: string): Promise<DeleteIndexResult> { return NOT_SUPPORTED }
  async rebuildIndex(_db: string, _name: string, _schema: string, _table: string): Promise<RebuildIndexResult> { return NOT_SUPPORTED }
  async reorganizeIndex(_db: string, _name: string, _schema: string, _table: string): Promise<ReorganizeIndexResult> { return NOT_SUPPORTED }
  async disableIndex(_db: string, _name: string, _schema: string, _table: string): Promise<DisableIndexResult> { return NOT_SUPPORTED }
  async getErdSchema(_db: string): Promise<GetErdSchemaResult> { return NOT_SUPPORTED }
  async getViews(_db: string): Promise<GetViewsResult> { return NOT_SUPPORTED }
  async saveView(_db: string, _params: SaveViewParams, _original?: string): Promise<SaveViewResult> { return NOT_SUPPORTED }
  async deleteView(_db: string, _schema: string, _view: string): Promise<DeleteViewResult> { return NOT_SUPPORTED }
  async getStoredProcedures(_db: string): Promise<GetStoredProceduresResult> { return NOT_SUPPORTED }
  async saveStoredProcedure(_db: string, _params: SaveStoredProcedureParams, _original?: string): Promise<SaveStoredProcedureResult> { return NOT_SUPPORTED }
  async deleteStoredProcedure(_db: string, _schema: string, _proc: string): Promise<DeleteStoredProcedureResult> { return NOT_SUPPORTED }
  async getDataTypes(_db: string): Promise<GetDataTypesResult> { return { status: 'ok', dataTypes: [] } }
  async saveDataType(_db: string, _params: SaveDataTypeParams, _orig?: string, _origSchema?: string): Promise<SaveDataTypeResult> { return NOT_SUPPORTED }
  async deleteDataType(_db: string, _schema: string, _type: string): Promise<DeleteDataTypeResult> { return NOT_SUPPORTED }
  async getTableTypes(_db: string): Promise<GetTableTypesResult> { return { status: 'ok', tableTypes: [] } }
  async getTableType(_db: string, _schema: string, _type: string): Promise<GetTableTypeResult> { return NOT_SUPPORTED }
  async saveTableType(_db: string, _params: SaveTableTypeParams, _orig?: string, _origSchema?: string): Promise<SaveTableTypeResult> { return NOT_SUPPORTED }
  async deleteTableType(_db: string, _schema: string, _type: string): Promise<DeleteTableTypeResult> { return NOT_SUPPORTED }
  async getMemoryOptimizedTableTypes(_db: string): Promise<GetMemoryOptimizedTableTypesResult> { return { status: 'ok', tableTypes: [] } }
  async getMemoryOptimizedTableType(_db: string, _schema: string, _type: string): Promise<GetMemoryOptimizedTableTypeResult> { return NOT_SUPPORTED }
  async saveMemoryOptimizedTableType(_db: string, _params: SaveMemoryOptimizedTableTypeParams, _orig?: string, _origSchema?: string): Promise<SaveMemoryOptimizedTableTypeResult> { return NOT_SUPPORTED }
  async deleteMemoryOptimizedTableType(_db: string, _schema: string, _type: string): Promise<DeleteMemoryOptimizedTableTypeResult> { return NOT_SUPPORTED }
  async scriptTableCreate(_db: string, _schema: string, _table: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptTableAlter(_db: string, _schema: string, _table: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptTableDrop(_db: string, _schema: string, _table: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptViewCreate(_db: string, _schema: string, _view: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptViewAlter(_db: string, _schema: string, _view: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptViewDrop(_db: string, _schema: string, _view: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptStoredProcedureCreate(_db: string, _schema: string, _proc: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptStoredProcedureAlter(_db: string, _schema: string, _proc: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptStoredProcedureDrop(_db: string, _schema: string, _proc: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptSelectTopRows(_db: string, _schema: string, _table: string, _count: number): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  async scriptDropDatabase(_db: string): Promise<GenerateScriptResult> { return NOT_SUPPORTED }
  listServerSecurityCategories(): ExplorerNode[] {
    return [{ id: 'security:users', label: 'Users', kind: 'security-users-folder' }]
  }

  async listServerUsers(): Promise<ExplorerNode[]> {
    const client = this.requireClient()
    const db = client.db('admin')
    try {
      const result = await db.command({ usersInfo: 1 })
      return ((result.users ?? []) as { user: string }[]).map((u) => ({
        id: `security:users:${u.user}`,
        label: u.user,
        kind: 'security-user' as const,
        isLeaf: true
      }))
    } catch {
      return []
    }
  }

  async listServerRoles(): Promise<ExplorerNode[]> { return [] }
  async listServerSchemas(): Promise<ExplorerNode[]> { return [] }
  listDatabaseSecurityCategories(_databaseName: string): ExplorerNode[] { return [] }
  async listDatabaseUsers(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listDatabaseRoles(_databaseName: string): Promise<ExplorerNode[]> { return [] }
  async listDatabaseSchemas(_databaseName: string): Promise<ExplorerNode[]> { return [] }

  // ── MongoDB User CRUD ───────────────────────────────────────────────────────

  async getMongoUserDetails(username: string): Promise<MongoUserDetails | null> {
    const client = this.requireClient()
    const db = client.db('admin')
    try {
      const result = await db.command({ usersInfo: { user: username, db: 'admin' } })
      const users = (result.users ?? []) as { user: string; roles: { role: string; db: string }[] }[]
      if (users.length === 0) return null
      const u = users[0]
      return {
        username: u.user,
        roles: (u.roles ?? []).map((r) => ({ role: r.role, db: r.db }))
      }
    } catch {
      return null
    }
  }

  async saveMongoUser(params: SaveMongoUserParams): Promise<SaveMongoUserResult> {
    const client = this.requireClient()
    const db = client.db('admin')
    try {
      if (params.originalUsername) {
        const updateDoc: Record<string, unknown> = { roles: params.roles }
        if (params.password) updateDoc.pwd = params.password
        await db.command({ updateUser: params.originalUsername, ...updateDoc })
      } else {
        const createDoc: Record<string, unknown> = {
          createUser: params.username,
          roles: params.roles
        }
        if (params.password) createDoc.pwd = params.password
        await db.command(createDoc)
      }
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async deleteMongoUser(username: string): Promise<DeleteMongoUserResult> {
    const client = this.requireClient()
    const db = client.db('admin')
    try {
      await db.command({ dropUser: username })
      return { status: 'ok' }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  // ── Backup / Restore ────────────────────────────────────────────────────────

  /**
   * Builds a mongodb connection URI for the external CLI tools (mongodump /
   * mongorestore). Returns null when the connection can't be reached by an
   * external process (SSH tunnel), signalling the caller to use the JS engine.
   */
  private buildToolUri(mask: boolean): string | null {
    const r = this.connectionRecord
    if (!r) return null
    // External tools can't use our in-process SSH tunnel.
    if (r.sshEnabled) return null

    if (r.mongodbUri?.trim()) {
      const uri = r.mongodbUri.trim()
      // Mask the password between "//user:" and "@" for previews.
      return mask ? uri.replace(/(\/\/[^:/?#]+:)[^@]*(@)/, '$1******$2') : uri
    }

    const host = (r.host || '127.0.0.1').trim()
    const port = r.port || 27017
    const pw = mask ? '******' : r.password ?? ''
    const auth =
      r.username?.trim() && r.mongodbAuthMechanism !== 'MONGODB-X509'
        ? `${encodeURIComponent(r.username.trim())}:${encodeURIComponent(pw)}@`
        : ''
    const scheme = r.mongodbSrv ? 'mongodb+srv' : 'mongodb'
    const hostPart = r.mongodbSrv ? host : `${host}:${port}`

    const params: string[] = []
    if (r.mongodbAuthSource?.trim())
      params.push(`authSource=${encodeURIComponent(r.mongodbAuthSource.trim())}`)
    if (r.mongodbAuthMechanism) params.push(`authMechanism=${r.mongodbAuthMechanism}`)
    if (r.mongodbReplicaSet?.trim())
      params.push(`replicaSet=${encodeURIComponent(r.mongodbReplicaSet.trim())}`)
    if (r.mongodbDirectConnection) params.push('directConnection=true')
    if (r.tlsEnabled) {
      params.push('tls=true')
      if (r.tlsCAFile?.trim()) params.push(`tlsCAFile=${encodeURIComponent(r.tlsCAFile.trim())}`)
      if (r.tlsCertificateKeyFile?.trim())
        params.push(`tlsCertificateKeyFile=${encodeURIComponent(r.tlsCertificateKeyFile.trim())}`)
      if (r.tlsAllowInvalidCertificates) params.push('tlsInsecure=true')
      if (r.tlsAllowInvalidHostnames) params.push('tlsAllowInvalidHostnames=true')
    }
    const query = params.length ? `/?${params.join('&')}` : ''
    return `${scheme}://${auth}${hostPart}${query}`
  }

  /** Probes a CLI tool by running `<path> --version`. */
  private probeTool(binPath: string): Promise<MongoToolInfo> {
    return new Promise((resolve) => {
      execFile(binPath, ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err) {
          resolve({ found: false })
          return
        }
        const version = String(stdout).trim().split('\n')[0]
        resolve({ found: true, path: binPath, version })
      })
    })
  }

  async getBackupToolStatus(paths?: {
    mongodumpPath?: string
    mongorestorePath?: string
  }): Promise<MongoBackupToolStatusResult> {
    try {
      const [mongodump, mongorestore] = await Promise.all([
        this.probeTool(paths?.mongodumpPath?.trim() || 'mongodump'),
        this.probeTool(paths?.mongorestorePath?.trim() || 'mongorestore')
      ])
      return { status: 'ok', tools: { mongodump, mongorestore } }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Builds the mongodump argument list, or null when the connection needs the JS engine. */
  private buildDumpArgs(opts: MongoBackupOptions, mask: boolean): string[] | null {
    const uri = this.buildToolUri(mask)
    if (uri === null) return null
    const args = [`--uri=${uri}`, `--db=${opts.databaseName}`, `--archive=${opts.filePath}`]
    if (opts.gzip) args.push('--gzip')
    return args
  }

  buildBackupCommandPreview(opts: MongoBackupOptions): BuildMongoBackupPreviewResult {
    try {
      const bin = opts.mongodumpPath?.trim() || 'mongodump'
      const args = this.buildDumpArgs(opts, true)
      if (args === null) {
        return {
          status: 'error',
          message:
            'Command preview is unavailable for SSH-tunnelled connections — the JS engine will be used.'
        }
      }
      const shown = [bin, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a))
      return { status: 'ok', command: shown.join(' ') }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  async executeBackup(opts: MongoBackupOptions): Promise<ExecuteMongoBackupResult> {
    const start = Date.now()
    try {
      const bin = opts.mongodumpPath?.trim() || 'mongodump'
      const cliArgs = this.buildDumpArgs(opts, false)
      const tool = cliArgs ? await this.probeTool(bin) : { found: false }
      const useCli = Boolean(cliArgs) && tool.found
      if (useCli && cliArgs) {
        await this.runMongodump(bin, cliArgs)
      } else {
        await this.jsBackup(opts)
      }
      const bytes = statSync(opts.filePath).size
      return {
        status: 'ok',
        filePath: opts.filePath,
        engine: useCli ? 'mongodump' : 'js',
        durationMs: Date.now() - start,
        bytes
      }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  /** Runs mongodump; it writes the archive to the path given by --archive. */
  private runMongodump(bin: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(bin, args)
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `mongodump exited with code ${code}`))
      })
    })
  }

  /** Pure-JS backup fallback: serializes each collection as EJSON via the driver. */
  private async jsBackup(opts: MongoBackupOptions): Promise<void> {
    const db = this.requireClient().db(opts.databaseName)
    const collections = await db.collections()
    const dump: Record<string, Document[]> = {}
    for (const coll of collections) {
      dump[coll.collectionName] = await coll.find({}).toArray()
    }
    // relaxed:false keeps ObjectId/Date/etc. round-trippable on restore.
    const json = EJSON.stringify(dump, { relaxed: false })
    await this.writeFileMaybeGzip(opts.filePath, json, opts.gzip)
  }

  private writeFileMaybeGzip(filePath: string, text: string, gzip: boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const fileStream = createWriteStream(filePath)
      fileStream.on('error', reject)
      fileStream.on('finish', resolve)
      if (gzip) {
        const gz = createGzip()
        gz.on('error', reject)
        gz.pipe(fileStream)
        gz.end(text)
      } else {
        fileStream.end(text)
      }
    })
  }

  async executeRestore(opts: MongoRestoreOptions): Promise<ExecuteMongoRestoreResult> {
    const start = Date.now()
    try {
      const lower = opts.filePath.toLowerCase()
      const isArchive = lower.endsWith('.archive') || lower.endsWith('.archive.gz')
      if (isArchive) {
        const bin = opts.mongorestorePath?.trim() || 'mongorestore'
        const uri = this.buildToolUri(false)
        if (!uri) {
          return {
            status: 'error',
            message:
              'mongorestore cannot reach SSH-tunnelled connections. Restore a JSON (.json) backup instead.'
          }
        }
        const tool = await this.probeTool(bin)
        if (!tool.found) {
          return {
            status: 'error',
            message: `${bin} was not found. Install the MongoDB Database Tools or set a custom path in Settings.`
          }
        }
        await this.runMongorestore(bin, uri, opts)
        return { status: 'ok', engine: 'mongodump', durationMs: Date.now() - start }
      }
      const collectionsRestored = await this.jsRestore(opts)
      return { status: 'ok', engine: 'js', durationMs: Date.now() - start, collectionsRestored }
    } catch (err) {
      return { status: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  }

  private runMongorestore(bin: string, uri: string, opts: MongoRestoreOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [`--uri=${uri}`, `--archive=${opts.filePath}`]
      if (opts.filePath.toLowerCase().endsWith('.gz')) args.push('--gzip')
      if (opts.drop) args.push('--drop')
      if (opts.stopOnError) args.push('--stopOnError')
      // Remap the archive's namespaces when restoring into a different database.
      if (opts.targetDatabaseName && opts.targetDatabaseName !== opts.sourceDatabaseName) {
        args.push(`--nsFrom=${opts.sourceDatabaseName}.*`, `--nsTo=${opts.targetDatabaseName}.*`)
      }
      const child = spawn(bin, args)
      let stderr = ''
      child.stderr.on('data', (d) => {
        stderr += String(d)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `mongorestore exited with code ${code}`))
      })
    })
  }

  /** Pure-JS restore fallback: parses an EJSON dump and inserts via the driver. */
  private async jsRestore(opts: MongoRestoreOptions): Promise<number> {
    const buf = await readFile(opts.filePath)
    const text = opts.filePath.toLowerCase().endsWith('.gz')
      ? gunzipSync(buf).toString('utf-8')
      : buf.toString('utf-8')
    const dump = EJSON.parse(text) as Record<string, Document[]>
    const db = this.requireClient().db(opts.targetDatabaseName)
    let restored = 0
    for (const [collName, docs] of Object.entries(dump)) {
      const coll = db.collection(collName)
      if (opts.drop) {
        await coll.drop().catch(() => undefined)
      }
      if (Array.isArray(docs) && docs.length > 0) {
        await coll.insertMany(docs as Document[], { ordered: opts.stopOnError })
      }
      restored++
    }
    return restored
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private requireClient(): MongoClient {
    if (!this.client) throw new Error('Not connected to MongoDB')
    return this.client
  }

  /**
   * Route a query text to the correct MongoDB driver call. Supports:
   * - Shell syntax:  `db.collection.method(args)`
   * - runCommand:    `db.runCommand({...})`
   * - adminCommand:  `db.adminCommand({...})`
   * - JSON command:  `{ find: "users", ... }` (raw runCommand doc)
   */
  private async runMongoQuery(db: Db, text: string, timeoutMs: number): Promise<QueryResultSet> {
    if (text.startsWith('db.')) {
      return this.runShellCommand(db, text, timeoutMs)
    }
    // Treat bare JSON object as a runCommand document
    const cmd = parseLooseJson(text) as Document
    const result = await db.command({ ...cmd, maxTimeMS: timeoutMs })
    return docsToResultSet([result])
  }

  private async runShellCommand(db: Db, text: string, timeoutMs: number): Promise<QueryResultSet> {
    // db.runCommand({...})
    const runCommandParen = text.startsWith('db.runCommand(')
      ? text.indexOf('(', 'db.runCommand'.length)
      : -1
    if (runCommandParen !== -1) {
      const argsStr = extractBalancedParens(text, runCommandParen)
      if (argsStr === null) throw new Error('Unbalanced parentheses in db.runCommand()')
      const cmd = parseLooseJson(argsStr.trim()) as Document
      const result = await db.command({ ...cmd, maxTimeMS: timeoutMs })
      return docsToResultSet([result])
    }

    // db.adminCommand({...})
    const adminCommandParen = text.startsWith('db.adminCommand(')
      ? text.indexOf('(', 'db.adminCommand'.length)
      : -1
    if (adminCommandParen !== -1) {
      const argsStr = extractBalancedParens(text, adminCommandParen)
      if (argsStr === null) throw new Error('Unbalanced parentheses in db.adminCommand()')
      const cmd = parseLooseJson(argsStr.trim()) as Document
      const result = await db.admin().command({ ...cmd, maxTimeMS: timeoutMs })
      return docsToResultSet([result])
    }

    // db.collectionName.method(args)
    const dotAfterDb = text.indexOf('.')  // dot between "db" and collection name
    if (dotAfterDb === -1) throw new Error(`Cannot parse command: ${text}`)

    const dotAfterColl = text.indexOf('.', dotAfterDb + 1)  // dot between collection and method
    if (dotAfterColl === -1) throw new Error(`Cannot parse command: ${text}`)

    const collName = text.slice(dotAfterDb + 1, dotAfterColl)
    const parenPos = text.indexOf('(', dotAfterColl + 1)
    if (parenPos === -1) throw new Error(`Cannot parse command: ${text}`)

    const method = text.slice(dotAfterColl + 1, parenPos)
    const rawArgsStr = extractBalancedParens(text, parenPos)
    if (rawArgsStr === null) throw new Error(`Unbalanced parentheses in db.${collName}.${method}()`)

    const args = parseArgList(rawArgsStr)
    const collection = db.collection(collName)

    switch (method) {
      case 'find': {
        const filter = (args[0] as Document) ?? {}
        const projection = args[1] as Document | undefined
        const opts = projection ? { projection } : {}
        const docs = await collection.find(filter, { ...opts, maxTimeMS: timeoutMs }).toArray()
        return docsToResultSet(docs)
      }

      case 'findOne': {
        const filter = (args[0] as Document) ?? {}
        const projection = args[1] as Document | undefined
        const opts = projection ? { projection } : {}
        const doc = await collection.findOne(filter, { ...opts, maxTimeMS: timeoutMs })
        return docsToResultSet(doc ? [doc] : [])
      }

      case 'aggregate': {
        const pipeline = (args[0] as Document[]) ?? []
        const docs = await collection.aggregate(pipeline, { maxTimeMS: timeoutMs }).toArray()
        return docsToResultSet(docs)
      }

      case 'countDocuments': {
        const filter = (args[0] as Document) ?? {}
        const count = await collection.countDocuments(filter, { maxTimeMS: timeoutMs })
        return docsToResultSet([{ count }])
      }

      case 'distinct': {
        const field = args[0] as string
        const filter = (args[1] as Document) ?? {}
        const values = await collection.distinct(field, filter)
        return docsToResultSet(values.map((v) => ({ value: v })))
      }

      case 'insertOne': {
        const doc = args[0] as Document
        const result = await collection.insertOne(doc)
        return docsToResultSet([
          { acknowledged: result.acknowledged, insertedId: String(result.insertedId) }
        ])
      }

      case 'insertMany': {
        const docs = args[0] as Document[]
        const result = await collection.insertMany(docs)
        return docsToResultSet([
          { acknowledged: result.acknowledged, insertedCount: result.insertedCount }
        ])
      }

      case 'updateOne': {
        const filter = args[0] as Document
        const update = args[1] as Document
        const opts = (args[2] as Document) ?? {}
        const result = await collection.updateOne(filter, update, opts)
        return docsToResultSet([
          {
            acknowledged: result.acknowledged,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount,
            upsertedId: result.upsertedId ? String(result.upsertedId) : null
          }
        ])
      }

      case 'updateMany': {
        const filter = args[0] as Document
        const update = args[1] as Document
        const opts = (args[2] as Document) ?? {}
        const result = await collection.updateMany(filter, update, opts)
        return docsToResultSet([
          {
            acknowledged: result.acknowledged,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
          }
        ])
      }

      case 'replaceOne': {
        const filter = args[0] as Document
        const replacement = args[1] as Document
        const result = await collection.replaceOne(filter, replacement)
        return docsToResultSet([
          {
            acknowledged: result.acknowledged,
            matchedCount: result.matchedCount,
            modifiedCount: result.modifiedCount
          }
        ])
      }

      case 'deleteOne': {
        const filter = (args[0] as Document) ?? {}
        const result = await collection.deleteOne(filter)
        return docsToResultSet([
          { acknowledged: result.acknowledged, deletedCount: result.deletedCount }
        ])
      }

      case 'deleteMany': {
        const filter = (args[0] as Document) ?? {}
        const result = await collection.deleteMany(filter)
        return docsToResultSet([
          { acknowledged: result.acknowledged, deletedCount: result.deletedCount }
        ])
      }

      case 'createIndex': {
        const keys = args[0] as Document
        const indexOpts = (args[1] as Document) ?? {}
        const name = await collection.createIndex(keys, indexOpts)
        return docsToResultSet([{ createdIndex: name }])
      }

      case 'dropIndex': {
        const indexName = args[0] as string
        await collection.dropIndex(indexName)
        return docsToResultSet([{ ok: 1 }])
      }

      case 'getIndexes':
      case 'indexes': {
        const indexes = await collection.indexes()
        return docsToResultSet(indexes)
      }

      case 'drop': {
        const dropped = await collection.drop()
        return docsToResultSet([{ dropped }])
      }

      default:
        throw new Error(
          `Unsupported collection method: "${method}". ` +
            `Supported: find, findOne, aggregate, countDocuments, distinct, ` +
            `insertOne, insertMany, updateOne, updateMany, replaceOne, deleteOne, deleteMany, ` +
            `createIndex, dropIndex, getIndexes, drop. ` +
            `For other operations use db.runCommand({...}).`
        )
    }
  }

  // ─── Shell command execution ────────────────────────────────────────────────

  async executeMongoShellCommand(
    command: string,
    currentDb: string
  ): Promise<{ status: 'ok' | 'error'; output: string }> {
    const trimmed = command.trim()
    const lower = trimmed.toLowerCase()
    try {
      if (lower === 'show dbs' || lower === 'show databases') {
        const res = await this.requireClient().db('admin').admin().listDatabases()
        const output = res.databases
          .map((d) => `${d.name.padEnd(30)} ${formatShellBytes(d.sizeOnDisk ?? 0)}`)
          .join('\r\n')
        return { status: 'ok', output: output || '(no databases)' }
      }

      if (lower === 'show collections' || lower === 'show tables') {
        const db = this.requireClient().db(currentDb)
        const cols = await db.listCollections().toArray()
        return {
          status: 'ok',
          output: cols.length > 0 ? cols.map((c) => c.name).join('\r\n') : '(no collections)'
        }
      }

      if (lower === 'show users') {
        const db = this.requireClient().db(currentDb)
        const result = await db.command({ usersInfo: 1 })
        return {
          status: 'ok',
          output:
            Array.isArray(result.users) && result.users.length > 0
              ? JSON.stringify(result.users, null, 2)
              : '(no users)'
        }
      }

      // Delegate db.* and bare JSON commands to existing query logic, format as text
      const db = this.requireClient().db(currentDb)
      const resultSet = await this.runMongoQuery(db, trimmed, 30_000)
      return { status: 'ok', output: formatResultSetForShell(resultSet) }
    } catch (err) {
      return { status: 'error', output: err instanceof Error ? err.message : String(err) }
    }
  }
}
