import { describe, it, expect } from 'vitest'
import { buildJsonRows, buildCsvContent } from '../exportUtils'
import type { QueryResultSet } from '../../connections.types'

// ── buildCsvContent ───────────────────────────────────────────────────────────

describe('buildCsvContent', () => {
  it('produces a header row followed by data rows', () => {
    const rs: QueryResultSet = {
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      rowCount: 2
    }
    const csv = buildCsvContent(rs)
    const lines = csv.split('\n')
    expect(lines[0]).toBe('id,name')
    expect(lines[1]).toBe('1,"Alice"')
    expect(lines[2]).toBe('2,"Bob"')
  })

  it('replaces null/undefined values with empty string', () => {
    const rs: QueryResultSet = {
      columns: ['a', 'b'],
      rows: [{ a: null, b: undefined }],
      rowCount: 1
    }
    const csv = buildCsvContent(rs)
    expect(csv).toContain('""')
  })

  it('JSON-escapes commas inside values', () => {
    const rs: QueryResultSet = {
      columns: ['v'],
      rows: [{ v: 'one,two' }],
      rowCount: 1
    }
    expect(buildCsvContent(rs)).toContain('"one,two"')
  })
})

// ── buildJsonRows – flat output ───────────────────────────────────────────────

describe('buildJsonRows – flat columns', () => {
  it('returns an array of plain row objects', () => {
    const rs: QueryResultSet = {
      columns: ['id', 'name'],
      rows: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
      rowCount: 2
    }
    const rows = buildJsonRows(rs)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toEqual({ id: 1, name: 'Alice' })
    expect(rows[1]).toEqual({ id: 2, name: 'Bob' })
  })

  it('maps null/undefined cell values to null', () => {
    const rs: QueryResultSet = {
      columns: ['a', 'b'],
      rows: [{ a: null, b: undefined }],
      rowCount: 1
    }
    const rows = buildJsonRows(rs)
    expect(rows[0]).toEqual({ a: null, b: null })
  })

  it('preserves numeric, boolean, and string values', () => {
    const rs: QueryResultSet = {
      columns: ['n', 'b', 's'],
      rows: [{ n: 42, b: true, s: 'hello' }],
      rowCount: 1
    }
    const rows = buildJsonRows(rs)
    expect(rows[0]).toEqual({ n: 42, b: true, s: 'hello' })
  })

  it('returns an empty array for an empty result set', () => {
    const rs: QueryResultSet = { columns: ['id'], rows: [], rowCount: 0 }
    expect(buildJsonRows(rs)).toEqual([])
  })
})

// ── buildJsonRows – nested output ─────────────────────────────────────────────

describe('buildJsonRows – dotted column nesting', () => {
  it('nests two-segment qualified labels', () => {
    const rs: QueryResultSet = {
      columns: ['customer.id', 'customer.name'],
      rows: [{ 'customer.id': 1, 'customer.name': 'Alice' }],
      rowCount: 1
    }
    const rows = buildJsonRows(rs)
    expect(rows[0]).toEqual({ customer: { id: 1, name: 'Alice' } })
  })

  it('nests multi-segment paths', () => {
    const rs: QueryResultSet = {
      columns: ['a.b.c'],
      rows: [{ 'a.b.c': 99 }],
      rowCount: 1
    }
    const rows = buildJsonRows(rs)
    expect(rows[0]).toEqual({ a: { b: { c: 99 } } })
  })

  it('combines nested and flat columns in the same row', () => {
    const rs: QueryResultSet = {
      columns: ['id', 'customer.name', 'amount'],
      rows: [{ id: 7, 'customer.name': 'Bob', amount: 50 }],
      rowCount: 1
    }
    const rows = buildJsonRows(rs)
    expect(rows[0]).toEqual({ id: 7, customer: { name: 'Bob' }, amount: 50 })
  })

  it('merges sibling dotted columns under the same parent', () => {
    const rs: QueryResultSet = {
      columns: ['order.id', 'order.total', 'customer.name'],
      rows: [{ 'order.id': 1, 'order.total': 99.9, 'customer.name': 'Alice' }],
      rowCount: 1
    }
    const rows = buildJsonRows(rs)
    expect(rows[0]).toEqual({
      order: { id: 1, total: 99.9 },
      customer: { name: 'Alice' }
    })
  })

  it('falls back to flat key when a segment is occupied by a primitive', () => {
    // flat `customer` column comes first, then `customer.id` tries to nest under it
    const rs: QueryResultSet = {
      columns: ['customer', 'customer.id'],
      rows: [{ customer: 'Alice', 'customer.id': 1 }],
      rowCount: 1
    }
    const rows = buildJsonRows(rs)
    // The flat `customer` primitive should stay; the dotted one falls back to its full key
    expect(rows[0]).toEqual({ customer: 'Alice', 'customer.id': 1 })
  })
})
