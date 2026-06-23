// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ─── Hoisted mock objects (must be initialized before vi.mock factories) ──────

const {
  mockAdminInstance,
  mockCursor,
  mockCollection,
  mockDb,
  mockMongoClientInstance,
  mockSshClient,
  mockTunnelServer
} = vi.hoisted(() => {
  const mockAdminInstance = {
    listDatabases: vi.fn().mockResolvedValue({
      databases: [
        { name: 'admin', sizeOnDisk: 0, empty: false },
        { name: 'mydb', sizeOnDisk: 0, empty: false }
      ]
    }),
    command: vi.fn().mockResolvedValue({ ok: 1 })
  }

  const mockCursor = {
    toArray: vi.fn().mockResolvedValue([{ name: 'users' }, { name: 'posts' }])
  }

  const mockCollection = {
    find: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    findOne: vi.fn().mockResolvedValue(null),
    aggregate: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }),
    countDocuments: vi.fn().mockResolvedValue(0),
    estimatedDocumentCount: vi.fn().mockResolvedValue(42),
    distinct: vi.fn().mockResolvedValue([]),
    insertOne: vi.fn().mockResolvedValue({ insertedId: 'abc123' }),
    insertMany: vi.fn().mockResolvedValue({ insertedCount: 2 }),
    updateOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    updateMany: vi.fn().mockResolvedValue({ matchedCount: 3, modifiedCount: 3 }),
    replaceOne: vi.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1 }),
    deleteOne: vi.fn().mockResolvedValue({ deletedCount: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ deletedCount: 5 }),
    createIndex: vi.fn().mockResolvedValue('age_1'),
    dropIndex: vi.fn().mockResolvedValue({ ok: 1 }),
    indexes: vi.fn().mockResolvedValue([{ name: '_id_', key: { _id: 1 } }]),
    drop: vi.fn().mockResolvedValue(true)
  }

  const mockDb = {
    admin: vi.fn(() => mockAdminInstance),
    listCollections: vi.fn(() => mockCursor),
    collection: vi.fn(() => mockCollection),
    createCollection: vi.fn().mockResolvedValue({}),
    command: vi.fn().mockResolvedValue({ ok: 1 })
  }

  const mockMongoClientInstance = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    db: vi.fn(() => mockDb)
  }

  const mockSshClient = { end: vi.fn() }
  const mockTunnelServer = { close: vi.fn() }

  return { mockAdminInstance, mockCursor, mockCollection, mockDb, mockMongoClientInstance, mockSshClient, mockTunnelServer }
})

vi.mock('mongodb', () => {
  const MongoClientMock = vi.fn(() => mockMongoClientInstance)
  return { MongoClient: MongoClientMock }
})

vi.mock('../sshTunnel', () => ({
  createSshTunnel: vi.fn().mockResolvedValue({
    host: '127.0.0.1',
    port: 54321,
    server: mockTunnelServer,
    sshClient: mockSshClient
  })
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

import type { ConnectionRecord } from '../../../store'

function makeRecord(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'test-id',
    name: 'Test MongoDB',
    provider: 'mongodb',
    host: 'localhost',
    port: 27017,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: 'mydb',
    ...overrides
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

import { MongoDbProvider } from '../MongoDbProvider'

describe('MongoDbProvider', () => {
  let provider: MongoDbProvider

  beforeEach(() => {
    provider = new MongoDbProvider()
    vi.clearAllMocks()

    // Restore default mock implementations
    mockMongoClientInstance.connect.mockResolvedValue(undefined)
    mockMongoClientInstance.close.mockResolvedValue(undefined)
    mockMongoClientInstance.db.mockReturnValue(mockDb)
    mockAdminInstance.listDatabases.mockResolvedValue({
      databases: [
        { name: 'admin', sizeOnDisk: 0, empty: false },
        { name: 'mydb', sizeOnDisk: 0, empty: false }
      ]
    })
    mockCursor.toArray.mockResolvedValue([{ name: 'users' }, { name: 'posts' }])
    mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
    mockCollection.findOne.mockResolvedValue(null)
    mockCollection.aggregate.mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) })
    mockCollection.countDocuments.mockResolvedValue(0)
    mockCollection.distinct.mockResolvedValue([])
    mockCollection.insertOne.mockResolvedValue({ insertedId: 'abc123' })
    mockCollection.insertMany.mockResolvedValue({ insertedCount: 2 })
    mockCollection.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
    mockCollection.updateMany.mockResolvedValue({ matchedCount: 3, modifiedCount: 3 })
    mockCollection.replaceOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 })
    mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 })
    mockCollection.deleteMany.mockResolvedValue({ deletedCount: 5 })
    mockCollection.createIndex.mockResolvedValue('age_1')
    mockCollection.dropIndex.mockResolvedValue({ ok: 1 })
    mockCollection.indexes.mockResolvedValue([{ name: '_id_', key: { _id: 1 } }])
    mockCollection.drop.mockResolvedValue(true)
    mockDb.command.mockResolvedValue({ ok: 1 })
    mockDb.listCollections.mockReturnValue(mockCursor)
    mockDb.collection.mockReturnValue(mockCollection)
    mockDb.admin.mockReturnValue(mockAdminInstance)
  })

  afterEach(async () => {
    await provider.disconnect()
  })

  // ── connect ──────────────────────────────────────────────────────────────────

  describe('connect', () => {
    it('connects using host and port in structured mode', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(makeRecord())
      expect(MongoClient).toHaveBeenCalledWith(
        'mongodb://localhost:27017/mydb',
        expect.objectContaining({ connectTimeoutMS: 15_000 })
      )
      expect(mockMongoClientInstance.connect).toHaveBeenCalled()
    })

    it('uses mongodbUri directly when provided', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(makeRecord({ mongodbUri: 'mongodb+srv://user:pass@cluster.example.com/mydb' }))
      expect(MongoClient).toHaveBeenCalledWith(
        'mongodb+srv://user:pass@cluster.example.com/mydb',
        expect.any(Object)
      )
    })

    it('includes auth credentials in structured mode', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(makeRecord({ username: 'admin', password: 'secret' }))
      expect(MongoClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ auth: { username: 'admin', password: 'secret' } })
      )
    })

    it('omits auth for MONGODB-X509 mechanism', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(
        makeRecord({
          username: 'CN=client',
          mongodbAuthMechanism: 'MONGODB-X509'
        })
      )
      const opts = (MongoClient as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]
      expect(opts.auth).toBeUndefined()
    })

    it('sets authMechanism when provided', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(makeRecord({ mongodbAuthMechanism: 'SCRAM-SHA-1' }))
      expect(MongoClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ authMechanism: 'SCRAM-SHA-1' })
      )
    })

    it('sets authSource when provided', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(makeRecord({ mongodbAuthSource: '$external' }))
      expect(MongoClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ authSource: '$external' })
      )
    })

    it('sets replicaSet when provided', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(makeRecord({ mongodbReplicaSet: 'rs0' }))
      expect(MongoClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ replicaSet: 'rs0' })
      )
    })

    it('enables TLS and sets CA file', async () => {
      const { MongoClient } = await import('mongodb')
      await provider.connect(
        makeRecord({ tlsEnabled: true, tlsCAFile: '/etc/ssl/ca.pem' })
      )
      expect(MongoClient).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ tls: true, tlsCAFile: '/etc/ssl/ca.pem' })
      )
    })

    it('connects via SSH tunnel when sshEnabled is true', async () => {
      const { createSshTunnel } = await import('../sshTunnel')
      await provider.connect(
        makeRecord({
          sshEnabled: true,
          sshHost: 'bastion.example.com',
          sshPort: 22,
          sshUsername: 'ec2-user',
          sshAuthMode: 'password',
          sshPassword: 'pass'
        })
      )
      expect(createSshTunnel).toHaveBeenCalled()
      const { MongoClient } = await import('mongodb')
      expect(MongoClient).toHaveBeenCalledWith(
        'mongodb://127.0.0.1:54321/mydb',
        expect.objectContaining({ directConnection: true })
      )
    })
  })

  // ── disconnect ───────────────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('closes the client on disconnect', async () => {
      await provider.connect(makeRecord())
      await provider.disconnect()
      expect(mockMongoClientInstance.close).toHaveBeenCalled()
    })

    it('tears down SSH tunnel and client on disconnect', async () => {
      await provider.connect(
        makeRecord({
          sshEnabled: true,
          sshHost: 'bastion.example.com',
          sshUsername: 'ec2-user',
          sshAuthMode: 'password'
        })
      )
      await provider.disconnect()
      expect(mockTunnelServer.close).toHaveBeenCalled()
      expect(mockSshClient.end).toHaveBeenCalled()
    })

    it('is safe to call when not connected', async () => {
      await provider.disconnect()
    })
  })

  // ── listDatabases ────────────────────────────────────────────────────────────

  describe('listDatabases', () => {
    it('returns database nodes from admin.listDatabases', async () => {
      await provider.connect(makeRecord())
      const nodes = await provider.listDatabases(false)
      expect(nodes).toHaveLength(2)
      expect(nodes[0]).toEqual({ id: 'mongodb-db:admin', label: 'admin', kind: 'database' })
      expect(nodes[1]).toEqual({ id: 'mongodb-db:mydb', label: 'mydb', kind: 'database' })
    })
  })

  // ── listCategories ───────────────────────────────────────────────────────────

  describe('listCategories', () => {
    it('returns a Collections folder node', () => {
      const nodes = provider.listCategories('mydb')
      expect(nodes).toHaveLength(1)
      expect(nodes[0]).toEqual({
        id: 'mongodb-collections:mydb',
        label: 'Collections',
        kind: 'mongodb-collections-folder'
      })
    })
  })

  // ── listTables ───────────────────────────────────────────────────────────────

  describe('listTables', () => {
    it('returns collection nodes for a database', async () => {
      await provider.connect(makeRecord())
      const nodes = await provider.listTables('mydb')
      expect(nodes).toHaveLength(2)
      expect(nodes[0]).toEqual({
        id: 'mongodb-collection:mydb:users',
        label: 'users',
        kind: 'mongodb-collection'
      })
      expect(nodes[1]).toEqual({
        id: 'mongodb-collection:mydb:posts',
        label: 'posts',
        kind: 'mongodb-collection'
      })
    })
  })

  // ── listCollectionChildren ───────────────────────────────────────────────────

  describe('listCollectionChildren', () => {
    it('returns 4 sub-nodes with document count in Documents label', async () => {
      await provider.connect(makeRecord())
      mockCollection.estimatedDocumentCount.mockResolvedValue(123)
      const nodes = await provider.listCollectionChildren!('mydb', 'users')
      expect(nodes).toHaveLength(4)
      expect(nodes[0]).toEqual({
        id: 'mongodb-collection-documents:mydb:users',
        label: 'Documents (123)',
        kind: 'mongodb-collection-documents'
      })
      expect(nodes[1]).toEqual({
        id: 'mongodb-collection-indexes:mydb:users',
        label: 'Indexes',
        kind: 'mongodb-collection-indexes'
      })
      expect(nodes[2]).toEqual({
        id: 'mongodb-collection-aggregations:mydb:users',
        label: 'Aggregations',
        kind: 'mongodb-collection-aggregations'
      })
      expect(nodes[3]).toEqual({
        id: 'mongodb-collection-validation:mydb:users',
        label: 'Validation',
        kind: 'mongodb-collection-validation'
      })
    })

    it('falls back to "Documents" label when count fetch fails', async () => {
      await provider.connect(makeRecord())
      mockCollection.estimatedDocumentCount.mockRejectedValue(new Error('not supported'))
      const nodes = await provider.listCollectionChildren!('mydb', 'users')
      expect(nodes[0].label).toBe('Documents')
    })
  })

  // ── executeQuery ─────────────────────────────────────────────────────────────

  describe('executeQuery', () => {
    beforeEach(async () => {
      await provider.connect(makeRecord())
    })

    it('executes a JSON command document', async () => {
      mockDb.command.mockResolvedValue({ ok: 1, n: 5 })
      const result = await provider.executeQuery('{ "ping": 1 }')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].rows[0]).toEqual({ ok: 1, n: 5 })
      }
    })

    it('executes db.collection.find() shell command', async () => {
      const docs = [
        { _id: '1', name: 'Alice', age: 30 },
        { _id: '2', name: 'Bob', age: 25 }
      ]
      mockCollection.find.mockReturnValue({ toArray: vi.fn().mockResolvedValue(docs) })
      const result = await provider.executeQuery('db.users.find({})')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].rows).toHaveLength(2)
        expect(result.resultSets[0].columns).toContain('name')
      }
    })

    it('executes db.collection.countDocuments()', async () => {
      mockCollection.countDocuments.mockResolvedValue(42)
      const result = await provider.executeQuery('db.users.countDocuments({})')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].rows[0]).toEqual({ count: 42 })
      }
    })

    it('executes db.collection.insertOne()', async () => {
      mockCollection.insertOne.mockResolvedValue({ insertedId: 'abc' })
      const result = await provider.executeQuery('db.users.insertOne({name: "Charlie"})')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].rows[0]).toMatchObject({ insertedId: 'abc' })
      }
    })

    it('executes db.collection.deleteOne()', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 })
      const result = await provider.executeQuery('db.users.deleteOne({_id: "1"})')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].rows[0]).toMatchObject({ deletedCount: 1 })
      }
    })

    it('executes db.runCommand()', async () => {
      mockDb.command.mockResolvedValue({ ok: 1, version: '6.0' })
      const result = await provider.executeQuery('db.runCommand({buildInfo: 1})')
      expect(result.status).toBe('ok')
      if (result.status === 'ok') {
        expect(result.resultSets[0].rows[0]).toMatchObject({ ok: 1 })
      }
    })

    it('returns an error result on driver error', async () => {
      mockDb.command.mockRejectedValue(new Error('Authentication failed'))
      const result = await provider.executeQuery('{ "ping": 1 }')
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.message).toContain('Authentication failed')
      }
    })

    it('returns error result when not connected', async () => {
      const disconnectedProvider = new MongoDbProvider()
      const result = await disconnectedProvider.executeQuery('db.users.find({})')
      expect(result.status).toBe('error')
      if (result.status === 'error') {
        expect(result.message).toContain('Not connected')
      }
    })
  })

  // ── createDatabase ────────────────────────────────────────────────────────────

  describe('createDatabase', () => {
    beforeEach(async () => {
      await provider.connect(makeRecord())
    })

    it('creates an _init_ collection to materialise the new database', async () => {
      const result = await provider.createDatabase('newdb')
      expect(result).toEqual({ status: 'ok' })
      expect(mockMongoClientInstance.db).toHaveBeenCalledWith('newdb')
      expect(mockDb.createCollection).toHaveBeenCalledWith('_init_')
    })

    it('returns error when createCollection rejects', async () => {
      mockDb.createCollection.mockRejectedValueOnce(new Error('collection already exists'))
      const result = await provider.createDatabase('newdb')
      expect(result).toEqual({ status: 'error', message: 'collection already exists' })
    })
  })

  // ── getCapabilities ──────────────────────────────────────────────────────────

  describe('getCapabilities', () => {
    it('disables SQL-only capabilities', () => {
      const caps = provider.getCapabilities()
      expect(caps.hasStoredProcedures).toBe(false)
      expect(caps.hasFunctions).toBe(false)
      expect(caps.hasUserDefinedTypes).toBe(false)
      expect(caps.hasProfiler).toBe(false)
    })

    it('enables supported capabilities', () => {
      const caps = provider.getCapabilities()
      expect(caps.hasCreateDatabase).toBe(true)
      expect(caps.hasCreateTable).toBe(true)
    })

    it('reports no execution plan support', () => {
      const caps = provider.getCapabilities()
      expect(caps.executionPlan.kind).toBe('none')
    })
  })

  // ── unsupported stubs ────────────────────────────────────────────────────────

  describe('unsupported stubs', () => {
    it('getTableSchema returns NOT_SUPPORTED', async () => {
      const result = await provider.getTableSchema('db', 'schema', 'table')
      expect(result).toMatchObject({ status: 'error', message: expect.stringContaining('Not supported') })
    })

    it('getErdSchema returns NOT_SUPPORTED', async () => {
      const result = await provider.getErdSchema('db')
      expect(result).toMatchObject({ status: 'error' })
    })

    it('listViews returns empty array', async () => {
      const result = await provider.listViews('db')
      expect(result).toEqual([])
    })

    it('listStoredProcedures returns empty array', async () => {
      const result = await provider.listStoredProcedures('db')
      expect(result).toEqual([])
    })
  })

  // ── insertMongoDocument ───────────────────────────────────────────────────

  describe('insertMongoDocument', () => {
    beforeEach(async () => {
      await provider.connect(makeRecord())
    })

    it('inserts a plain document and returns the insertedId', async () => {
      const ejson = JSON.stringify({ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Alice' })
      const result = await provider.insertMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'ok', insertedId: 'abc123' })
      expect(mockCollection.insertOne).toHaveBeenCalledOnce()
      const [doc] = mockCollection.insertOne.mock.calls[0] as [Record<string, unknown>]
      expect(doc.name).toBe('Alice')
    })

    it('returns error when insertOne rejects', async () => {
      mockCollection.insertOne.mockRejectedValueOnce(new Error('duplicate key'))
      const ejson = JSON.stringify({ name: 'Bob' })
      const result = await provider.insertMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'error', message: 'duplicate key' })
    })

    it('returns error for malformed EJSON', async () => {
      const result = await provider.insertMongoDocument('testdb', 'users', 'not-json')
      expect(result.status).toBe('error')
    })

    it('serialises $numberInt values to plain JS integers', async () => {
      const ejson = JSON.stringify({ count: { $numberInt: '42' } })
      await provider.insertMongoDocument('testdb', 'users', ejson)
      const [doc] = mockCollection.insertOne.mock.calls[0] as [Record<string, unknown>]
      expect(doc.count).toBe(42)
    })

    it('serialises $date values to Date objects', async () => {
      const iso = '2024-01-15T10:00:00.000Z'
      const ejson = JSON.stringify({ createdAt: { $date: iso } })
      await provider.insertMongoDocument('testdb', 'users', ejson)
      const [doc] = mockCollection.insertOne.mock.calls[0] as [Record<string, unknown>]
      expect(doc.createdAt).toBeInstanceOf(Date)
      expect((doc.createdAt as Date).toISOString()).toBe(iso)
    })
  })

  // ── replaceMongoDocument ──────────────────────────────────────────────────

  describe('replaceMongoDocument', () => {
    beforeEach(async () => {
      await provider.connect(makeRecord())
    })

    it('replaces a document by _id and returns ok', async () => {
      const ejson = JSON.stringify({ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Updated' })
      const result = await provider.replaceMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'ok' })
      expect(mockCollection.replaceOne).toHaveBeenCalledOnce()
    })

    it('returns error when document has no _id', async () => {
      const ejson = JSON.stringify({ name: 'No ID' })
      const result = await provider.replaceMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'error', message: 'Document must contain an _id field' })
    })

    it('returns error when no document matched', async () => {
      mockCollection.replaceOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 })
      const ejson = JSON.stringify({ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Ghost' })
      const result = await provider.replaceMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'error', message: expect.stringContaining('not found') })
    })

    it('returns error when replaceOne rejects', async () => {
      mockCollection.replaceOne.mockRejectedValueOnce(new Error('write concern error'))
      const ejson = JSON.stringify({ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Fail' })
      const result = await provider.replaceMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'error', message: 'write concern error' })
    })
  })

  // ── deleteMongoDocument ───────────────────────────────────────────────────

  describe('deleteMongoDocument', () => {
    beforeEach(async () => {
      await provider.connect(makeRecord())
    })

    it('deletes a document by _id and returns ok', async () => {
      mockCollection.deleteOne.mockResolvedValue({ deletedCount: 1 })
      const ejson = JSON.stringify({ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Alice' })
      const result = await provider.deleteMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'ok' })
      expect(mockCollection.deleteOne).toHaveBeenCalledOnce()
    })

    it('returns error when document has no _id', async () => {
      const ejson = JSON.stringify({ name: 'No ID' })
      const result = await provider.deleteMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'error', message: 'Document must contain an _id field' })
    })

    it('returns error when no document matched', async () => {
      mockCollection.deleteOne.mockResolvedValueOnce({ deletedCount: 0 })
      const ejson = JSON.stringify({ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Ghost' })
      const result = await provider.deleteMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'error', message: expect.stringContaining('already been deleted') })
    })

    it('returns error when deleteOne rejects', async () => {
      mockCollection.deleteOne.mockRejectedValueOnce(new Error('write concern error'))
      const ejson = JSON.stringify({ _id: { $oid: '507f1f77bcf86cd799439011' }, name: 'Fail' })
      const result = await provider.deleteMongoDocument('testdb', 'users', ejson)
      expect(result).toEqual({ status: 'error', message: 'write concern error' })
    })

    it('returns error for malformed EJSON', async () => {
      const result = await provider.deleteMongoDocument('testdb', 'users', 'not-json')
      expect(result.status).toBe('error')
    })
  })

  // ── rawDocuments EJSON serialization ─────────────────────────────────────

  describe('rawDocuments EJSON serialization', () => {
    beforeEach(async () => {
      await provider.connect(makeRecord())
    })

    it('serializes ObjectId-like values as $oid strings', async () => {
      const mockObjectId = {
        constructor: { name: 'ObjectId' },
        toHexString: () => '507f1f77bcf86cd799439011'
      }
      const docs = [{ _id: mockObjectId, name: 'test' }]
      mockCollection.find.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(docs) })
      const result = await provider.executeQuery('db.col.find({})')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      const raw = result.resultSets[0]?.rawDocuments?.[0]
      expect(raw).toBeDefined()
      const parsed = JSON.parse(raw!) as Record<string, unknown>
      expect(parsed._id).toEqual({ $oid: '507f1f77bcf86cd799439011' })
    })

    it('serializes Date values as $date strings', async () => {
      const date = new Date('2024-06-15T12:00:00.000Z')
      const docs = [{ createdAt: date }]
      mockCollection.find.mockReturnValueOnce({ toArray: vi.fn().mockResolvedValue(docs) })
      const result = await provider.executeQuery('db.col.find({})')
      expect(result.status).toBe('ok')
      if (result.status !== 'ok') return
      const raw = result.resultSets[0]?.rawDocuments?.[0]
      const parsed = JSON.parse(raw!) as Record<string, unknown>
      expect(parsed.createdAt).toEqual({ $date: '2024-06-15T12:00:00.000Z' })
    })
  })
})
