import { describe, it, expect } from 'vitest'
import { deriveCardinality, formatCardinality, isJunctionTable, MANY } from '../deriveCardinality'
import type { ErdColumn, ErdSchema, ErdTable } from '../../erd.types'

function col(name: string, overrides: Partial<ErdColumn> = {}): ErdColumn {
  return {
    name,
    type: 'int',
    maxLength: null,
    isNullable: false,
    isPrimaryKey: false,
    isForeignKey: false,
    ...overrides
  }
}

function table(name: string, columns: ErdColumn[], schema = 'dbo'): ErdTable {
  return { schema, name, columns }
}

function schemaOf(tables: ErdTable[], relationships: ErdSchema['relationships']): ErdSchema {
  return { tables, relationships, indexes: [] }
}

describe('formatCardinality', () => {
  it('formats a mandatory one-to-many as ∞:1', () => {
    expect(formatCardinality({ childUnique: false, childNullable: false })).toBe(`${MANY}:1`)
  })

  it('formats a unique FK as one-to-one 1:1', () => {
    expect(formatCardinality({ childUnique: true, childNullable: false })).toBe('1:1')
  })

  it('prefixes an optional (nullable) FK with 0..', () => {
    expect(formatCardinality({ childUnique: false, childNullable: true })).toBe(`0..${MANY}:1`)
    expect(formatCardinality({ childUnique: true, childNullable: true })).toBe('0..1:1')
  })
})

describe('isJunctionTable', () => {
  it('detects a table whose PK is exactly two FK columns', () => {
    const t = table('user_role', [
      col('user_id', { isPrimaryKey: true, isForeignKey: true }),
      col('role_id', { isPrimaryKey: true, isForeignKey: true })
    ])
    expect(isJunctionTable(t)).toBe(true)
  })

  it('rejects a table with a non-FK primary key column', () => {
    const t = table('membership', [
      col('id', { isPrimaryKey: true }),
      col('user_id', { isPrimaryKey: true, isForeignKey: true }),
      col('role_id', { isPrimaryKey: true, isForeignKey: true })
    ])
    expect(isJunctionTable(t)).toBe(false)
  })

  it('rejects a table with a single-column PK', () => {
    const t = table('users', [col('id', { isPrimaryKey: true })])
    expect(isJunctionTable(t)).toBe(false)
  })
})

describe('deriveCardinality', () => {
  it('classifies a plain non-null FK as one-to-many (∞:1)', () => {
    const tables = [
      table('users', [col('id', { isPrimaryKey: true })]),
      table('orders', [col('id', { isPrimaryKey: true }), col('user_id', { isForeignKey: true })])
    ]
    const rels = [
      {
        constraintName: 'fk_orders_user',
        fromSchema: 'dbo',
        fromTable: 'orders',
        fromColumn: 'user_id',
        toSchema: 'dbo',
        toTable: 'users',
        toColumn: 'id'
      }
    ]
    const result = deriveCardinality(schemaOf(tables, rels))
    expect(result.get('fk_orders_user')).toBe(`${MANY}:1`)
  })

  it('classifies a FK that is also the PK as one-to-one (1:1)', () => {
    const tables = [
      table('users', [col('id', { isPrimaryKey: true })]),
      table('user_profile', [col('user_id', { isPrimaryKey: true, isForeignKey: true })])
    ]
    const rels = [
      {
        constraintName: 'fk_profile_user',
        fromSchema: 'dbo',
        fromTable: 'user_profile',
        fromColumn: 'user_id',
        toSchema: 'dbo',
        toTable: 'users',
        toColumn: 'id'
      }
    ]
    const result = deriveCardinality(schemaOf(tables, rels))
    expect(result.get('fk_profile_user')).toBe('1:1')
  })

  it('marks a nullable FK as optional (0..∞:1)', () => {
    const tables = [
      table('users', [col('id', { isPrimaryKey: true })]),
      table('orders', [
        col('id', { isPrimaryKey: true }),
        col('user_id', { isForeignKey: true, isNullable: true })
      ])
    ]
    const rels = [
      {
        constraintName: 'fk_orders_user',
        fromSchema: 'dbo',
        fromTable: 'orders',
        fromColumn: 'user_id',
        toSchema: 'dbo',
        toTable: 'users',
        toColumn: 'id'
      }
    ]
    const result = deriveCardinality(schemaOf(tables, rels))
    expect(result.get('fk_orders_user')).toBe(`0..${MANY}:1`)
  })

  it('tags both FK edges of a junction table as many-to-many (∞:∞)', () => {
    const tables = [
      table('users', [col('id', { isPrimaryKey: true })]),
      table('roles', [col('id', { isPrimaryKey: true })]),
      table('user_role', [
        col('user_id', { isPrimaryKey: true, isForeignKey: true }),
        col('role_id', { isPrimaryKey: true, isForeignKey: true })
      ])
    ]
    const rels = [
      {
        constraintName: 'fk_ur_user',
        fromSchema: 'dbo',
        fromTable: 'user_role',
        fromColumn: 'user_id',
        toSchema: 'dbo',
        toTable: 'users',
        toColumn: 'id'
      },
      {
        constraintName: 'fk_ur_role',
        fromSchema: 'dbo',
        fromTable: 'user_role',
        fromColumn: 'role_id',
        toSchema: 'dbo',
        toTable: 'roles',
        toColumn: 'id'
      }
    ]
    const result = deriveCardinality(schemaOf(tables, rels))
    expect(result.get('fk_ur_user')).toBe(`${MANY}:${MANY}`)
    expect(result.get('fk_ur_role')).toBe(`${MANY}:${MANY}`)
  })

  it('falls back to ∞:1 when the FK column metadata is missing', () => {
    const tables = [table('users', [col('id', { isPrimaryKey: true })])]
    const rels = [
      {
        constraintName: 'fk_orphan',
        fromSchema: 'dbo',
        fromTable: 'orders',
        fromColumn: 'user_id',
        toSchema: 'dbo',
        toTable: 'users',
        toColumn: 'id'
      }
    ]
    const result = deriveCardinality(schemaOf(tables, rels))
    expect(result.get('fk_orphan')).toBe(`${MANY}:1`)
  })
})
