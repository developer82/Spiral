// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { AiService } from '../ai/AiService'
import type { DatabaseManager } from '../database/DatabaseManager'
import type { ErdSchema } from '../database/types'

function makeDbManager(schema: ErdSchema | null, error?: string): DatabaseManager {
  return {
    getErdSchema: vi.fn().mockResolvedValue(
      schema
        ? { status: 'ok', schema }
        : { status: 'error', message: error ?? 'DB error' }
    )
  } as unknown as DatabaseManager
}

function makeSchema(overrides?: Partial<ErdSchema>): ErdSchema {
  return {
    tables: [
      {
        schema: 'public',
        name: 'users',
        columns: [
          { name: 'id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false },
          { name: 'email', type: 'varchar', maxLength: 255, isNullable: false, isPrimaryKey: false, isForeignKey: false }
        ]
      },
      {
        schema: 'public',
        name: 'orders',
        columns: [
          { name: 'id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false },
          { name: 'user_id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: false, isForeignKey: true }
        ]
      }
    ],
    relationships: [
      {
        constraintName: 'fk_orders_users',
        fromSchema: 'public',
        fromTable: 'orders',
        fromColumn: 'user_id',
        toSchema: 'public',
        toTable: 'users',
        toColumn: 'id'
      }
    ],
    indexes: [],
    ...overrides
  }
}

describe('AiService', () => {
  describe('extractSchemaContext', () => {
    it('returns stub DDL for non-SQL providers (mongodb)', async () => {
      const dbManager = makeDbManager(null)
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'mongodb')

      expect(ctx.ddl).toContain('Non-relational')
      expect(ctx.tableCount).toBe(0)
      expect(dbManager.getErdSchema).not.toHaveBeenCalled()
    })

    it('returns stub DDL for redis provider', async () => {
      const dbManager = makeDbManager(null)
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'redis')

      expect(ctx.ddl).toContain('Non-relational')
      expect(dbManager.getErdSchema).not.toHaveBeenCalled()
    })

    it('generates PostgreSQL DDL with schema prefix', async () => {
      const dbManager = makeDbManager(makeSchema())
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'postgres')

      expect(ctx.ddl).toContain('CREATE TABLE "public"."users"')
      expect(ctx.ddl).toContain('"id" int PRIMARY KEY')
      expect(ctx.ddl).toContain('"email" varchar(255) NOT NULL')
      expect(ctx.tableCount).toBe(2)
    })

    it('generates MySQL DDL with backtick quoting and no schema prefix', async () => {
      const dbManager = makeDbManager(makeSchema())
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'mysql')

      expect(ctx.ddl).toContain('CREATE TABLE `users`')
      expect(ctx.ddl).not.toContain('`public`')
    })

    it('generates SQL Server DDL with bracket quoting', async () => {
      const dbManager = makeDbManager(makeSchema())
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'sqlserver')

      expect(ctx.ddl).toContain('CREATE TABLE [public].[users]')
      expect(ctx.ddl).toContain('[id] int PRIMARY KEY')
    })

    it('includes FK comment for relationships', async () => {
      const dbManager = makeDbManager(makeSchema())
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'postgres')

      expect(ctx.ddl).toContain('-- FK:')
      expect(ctx.ddl).toContain('"orders"."user_id" REFERENCES')
    })

    it('truncates to MAX_TABLES (25) for large schemas', async () => {
      const manyTables = Array.from({ length: 30 }, (_, i) => ({
        schema: 'public',
        name: `table_${i}`,
        columns: [{ name: 'id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false }]
      }))
      const dbManager = makeDbManager(makeSchema({ tables: manyTables, relationships: [] }))
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'postgres')

      expect(ctx.tableCount).toBe(30)
      const tableMatches = [...ctx.ddl.matchAll(/CREATE TABLE/g)]
      expect(tableMatches.length).toBe(25)
      expect(ctx.ddl).toContain('Schema truncated: showing 25 of 30 tables')
    })

    it('handles getErdSchema error gracefully', async () => {
      const dbManager = makeDbManager(null, 'Connection refused')
      const service = new AiService(dbManager)
      const ctx = await service.extractSchemaContext('conn-1', 'mydb', 'postgres')

      expect(ctx.ddl).toContain('Could not load schema')
      expect(ctx.tableCount).toBe(0)
    })
  })

  describe('buildPrompt', () => {
    it('starts with conversation history comment when history provided', () => {
      const service = new AiService({} as DatabaseManager)
      const schema = { databaseName: 'mydb', provider: 'postgres', ddl: 'CREATE TABLE users (id int);', tableCount: 1 }
      const history = [
        { role: 'user' as const, content: 'hello' },
        { role: 'assistant' as const, content: 'hi there' }
      ]
      const prompt = service.buildPrompt('get all users', schema, history)

      expect(prompt).toContain('-- Previous conversation context:')
      expect(prompt).toContain('-- User: hello')
      expect(prompt).toContain('-- Assistant: hi there')
    })

    it('contains ### Task section', () => {
      const service = new AiService({} as DatabaseManager)
      const schema = { databaseName: 'mydb', provider: 'postgres', ddl: 'CREATE TABLE users (id int);', tableCount: 1 }
      const prompt = service.buildPrompt('get all users', schema, [])

      expect(prompt).toContain('### Task')
      expect(prompt).toContain('`get all users`')
    })

    it('contains ### Database Schema section with DDL', () => {
      const service = new AiService({} as DatabaseManager)
      const schema = { databaseName: 'mydb', provider: 'postgres', ddl: 'CREATE TABLE users (id int);', tableCount: 1 }
      const prompt = service.buildPrompt('get all users', schema, [])

      expect(prompt).toContain('### Database Schema')
      expect(prompt).toContain('CREATE TABLE users')
    })

    it('contains ### Answer section', () => {
      const service = new AiService({} as DatabaseManager)
      const schema = { databaseName: 'mydb', provider: 'postgres', ddl: 'CREATE TABLE users (id int);', tableCount: 1 }
      const prompt = service.buildPrompt('get all users', schema, [])

      expect(prompt).toContain('### Answer')
    })

    it('limits history to last 6 turns', () => {
      const service = new AiService({} as DatabaseManager)
      const schema = { databaseName: 'mydb', provider: 'postgres', ddl: '', tableCount: 0 }
      const history = Array.from({ length: 10 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
        content: `message ${i}`
      }))
      const prompt = service.buildPrompt('question', schema, history)

      // Only last 6 messages should appear
      expect(prompt).toContain('message 9')
      expect(prompt).toContain('message 4')
      expect(prompt).not.toContain('message 3')
    })

    it('omits history comment when history is empty', () => {
      const service = new AiService({} as DatabaseManager)
      const schema = { databaseName: 'mydb', provider: 'postgres', ddl: '', tableCount: 0 }
      const prompt = service.buildPrompt('question', schema, [])

      expect(prompt).not.toContain('Previous conversation context')
    })
  })

  describe('abortCompletion', () => {
    it('does not throw when session does not exist', () => {
      const service = new AiService({} as DatabaseManager)
      expect(() => service.abortCompletion('nonexistent')).not.toThrow()
    })
  })

  describe('dispose', () => {
    it('resolves without error when nothing is initialized', async () => {
      const service = new AiService({} as DatabaseManager)
      await expect(service.dispose()).resolves.toBeUndefined()
    })
  })
})
