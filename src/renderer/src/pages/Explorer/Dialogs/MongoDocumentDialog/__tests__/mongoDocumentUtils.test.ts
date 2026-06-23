import { describe, it, expect } from 'vitest'
import {
  createDefaultField,
  convertFieldType,
  createInitialAddFields,
  ejsonStringToFields,
  ejsonValueToField,
  fieldToEjsonValue,
  fieldsToEjsonString,
  generateObjectId,
  type BsonFieldType,
  type DocumentField,
} from '../mongoDocumentUtils'

// ─── generateObjectId ─────────────────────────────────────────────────────────

describe('generateObjectId', () => {
  it('returns a 24-character hex string', () => {
    const id = generateObjectId()
    expect(id).toHaveLength(24)
    expect(id).toMatch(/^[0-9a-f]{24}$/)
  })

  it('returns unique values on consecutive calls', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateObjectId()))
    expect(ids.size).toBe(50)
  })
})

// ─── createDefaultField ───────────────────────────────────────────────────────

describe('createDefaultField', () => {
  it('creates a string field with empty value', () => {
    const f = createDefaultField('string', 'myField')
    expect(f.name).toBe('myField')
    expect(f.type).toBe('string')
    expect(f.value).toBe('')
  })

  it('creates an objectId field with a 24-char hex value', () => {
    const f = createDefaultField('objectId')
    expect(f.type).toBe('objectId')
    expect(f.value).toMatch(/^[0-9a-f]{24}$/)
  })

  it('creates an int32 field with default value "0"', () => {
    const f = createDefaultField('int32')
    expect(f.value).toBe('0')
  })

  it('creates object/array fields with empty children array', () => {
    const obj = createDefaultField('object')
    const arr = createDefaultField('array')
    expect(obj.children).toEqual([])
    expect(arr.children).toEqual([])
  })

  it('creates a boolean field with default "false"', () => {
    const f = createDefaultField('boolean')
    expect(f.value).toBe('false')
  })

  it('creates a null field with empty value', () => {
    const f = createDefaultField('null')
    expect(f.value).toBe('')
  })

  it('creates a regex field with empty value and extra', () => {
    const f = createDefaultField('regex')
    expect(f.value).toBe('')
    expect(f.extra).toBe('')
  })

  it('creates a timestamp field with value and extra of "0"', () => {
    const f = createDefaultField('timestamp')
    expect(f.value).toBe('0')
    expect(f.extra).toBe('0')
  })
})

// ─── createInitialAddFields ───────────────────────────────────────────────────

describe('createInitialAddFields', () => {
  it('returns a single _id ObjectId field', () => {
    const fields = createInitialAddFields()
    expect(fields).toHaveLength(1)
    expect(fields[0].name).toBe('_id')
    expect(fields[0].type).toBe('objectId')
    expect(fields[0].value).toMatch(/^[0-9a-f]{24}$/)
  })
})

// ─── convertFieldType ─────────────────────────────────────────────────────────

describe('convertFieldType', () => {
  it('preserves numeric value when switching between numeric types', () => {
    const f = createDefaultField('int32', 'n')
    f.value = '42'
    const converted = convertFieldType(f, 'double')
    expect(converted.value).toBe('42')
    expect(converted.type).toBe('double')
  })

  it('carries string value when switching int32 → string', () => {
    const f = createDefaultField('int32', 'n')
    f.value = '7'
    const converted = convertFieldType(f, 'string')
    expect(converted.value).toBe('7')
  })

  it('converts string "true" → boolean "true"', () => {
    const f = createDefaultField('string', 'b')
    f.value = 'true'
    const converted = convertFieldType(f, 'boolean')
    expect(converted.value).toBe('true')
  })

  it('resets value when converting string → objectId (not compatible)', () => {
    const f = createDefaultField('string', 's')
    f.value = 'hello'
    const converted = convertFieldType(f, 'objectId')
    expect(converted.type).toBe('objectId')
    expect(converted.value).toMatch(/^[0-9a-f]{24}$/)
  })
})

// ─── fieldToEjsonValue ────────────────────────────────────────────────────────

describe('fieldToEjsonValue', () => {
  function makeField(type: BsonFieldType, value: string, extra?: string, children?: DocumentField[]): DocumentField {
    return { id: 'test-id', name: 'f', type, value, extra, children }
  }

  it('returns plain string for string type', () => {
    expect(fieldToEjsonValue(makeField('string', 'hello'))).toBe('hello')
  })

  it('returns boolean for boolean type', () => {
    expect(fieldToEjsonValue(makeField('boolean', 'true'))).toBe(true)
    expect(fieldToEjsonValue(makeField('boolean', 'false'))).toBe(false)
  })

  it('returns null for null type', () => {
    expect(fieldToEjsonValue(makeField('null', ''))).toBeNull()
  })

  it('returns $numberInt wrapper for int32', () => {
    expect(fieldToEjsonValue(makeField('int32', '42'))).toEqual({ $numberInt: '42' })
  })

  it('returns $numberLong wrapper for int64', () => {
    expect(fieldToEjsonValue(makeField('int64', '1234567890'))).toEqual({ $numberLong: '1234567890' })
  })

  it('returns $numberDouble wrapper for double', () => {
    expect(fieldToEjsonValue(makeField('double', '3.14'))).toEqual({ $numberDouble: '3.14' })
  })

  it('returns $oid wrapper for objectId', () => {
    expect(fieldToEjsonValue(makeField('objectId', 'aabbccddaabbccddaabbccdd'))).toEqual({
      $oid: 'aabbccddaabbccddaabbccdd'
    })
  })

  it('returns $date wrapper for date', () => {
    const iso = '2024-01-01T00:00:00.000Z'
    expect(fieldToEjsonValue(makeField('date', iso))).toEqual({ $date: iso })
  })

  it('returns $minKey and $maxKey', () => {
    expect(fieldToEjsonValue(makeField('minKey', ''))).toEqual({ $minKey: 1 })
    expect(fieldToEjsonValue(makeField('maxKey', ''))).toEqual({ $maxKey: 1 })
  })

  it('builds an object from children', () => {
    const children: DocumentField[] = [
      { id: 'c1', name: 'a', type: 'string', value: 'x' },
      { id: 'c2', name: 'b', type: 'int32', value: '5' },
    ]
    expect(fieldToEjsonValue(makeField('object', '', undefined, children))).toEqual({
      a: 'x',
      b: { $numberInt: '5' }
    })
  })

  it('builds an array from children', () => {
    const children: DocumentField[] = [
      { id: 'c1', name: '0', type: 'string', value: 'first' },
      { id: 'c2', name: '1', type: 'boolean', value: 'true' },
    ]
    expect(fieldToEjsonValue(makeField('array', '', undefined, children))).toEqual(['first', true])
  })

  it('returns $regularExpression for regex type', () => {
    expect(fieldToEjsonValue(makeField('regex', 'foo', 'i'))).toEqual({
      $regularExpression: { pattern: 'foo', options: 'i' }
    })
  })

  it('returns $timestamp for timestamp type', () => {
    expect(fieldToEjsonValue(makeField('timestamp', '100', '1'))).toEqual({
      $timestamp: { t: 100, i: 1 }
    })
  })

  it('returns $binary for binary type', () => {
    expect(fieldToEjsonValue(makeField('binary', 'dGVzdA==', '00'))).toEqual({
      $binary: { base64: 'dGVzdA==', subType: '00' }
    })
  })
})

// ─── fieldsToEjsonString ──────────────────────────────────────────────────────

describe('fieldsToEjsonString', () => {
  it('serializes a flat document to EJSON JSON string', () => {
    const fields: DocumentField[] = [
      { id: '1', name: '_id', type: 'objectId', value: 'aabbccddaabbccddaabbccdd' },
      { id: '2', name: 'name', type: 'string', value: 'Alice' },
      { id: '3', name: 'age', type: 'int32', value: '30' },
    ]
    const str = fieldsToEjsonString(fields)
    const parsed = JSON.parse(str) as Record<string, unknown>
    expect(parsed._id).toEqual({ $oid: 'aabbccddaabbccddaabbccdd' })
    expect(parsed.name).toBe('Alice')
    expect(parsed.age).toEqual({ $numberInt: '30' })
  })
})

// ─── ejsonValueToField ────────────────────────────────────────────────────────

describe('ejsonValueToField', () => {
  it('converts null to null field', () => {
    const f = ejsonValueToField('x', null)
    expect(f.type).toBe('null')
  })

  it('converts boolean to boolean field', () => {
    expect(ejsonValueToField('b', true).type).toBe('boolean')
    expect(ejsonValueToField('b', true).value).toBe('true')
  })

  it('converts string to string field', () => {
    const f = ejsonValueToField('s', 'hello')
    expect(f.type).toBe('string')
    expect(f.value).toBe('hello')
  })

  it('converts integer to int32 field', () => {
    const f = ejsonValueToField('n', 42)
    expect(f.type).toBe('int32')
    expect(f.value).toBe('42')
  })

  it('converts float to double field', () => {
    const f = ejsonValueToField('n', 3.14)
    expect(f.type).toBe('double')
  })

  it('converts $oid to objectId field', () => {
    const f = ejsonValueToField('id', { $oid: 'aabbccddaabbccddaabbccdd' })
    expect(f.type).toBe('objectId')
    expect(f.value).toBe('aabbccddaabbccddaabbccdd')
  })

  it('converts $date string to date field', () => {
    const iso = '2024-01-01T00:00:00.000Z'
    const f = ejsonValueToField('d', { $date: iso })
    expect(f.type).toBe('date')
    expect(f.value).toBe(iso)
  })

  it('converts $numberInt to int32 field', () => {
    const f = ejsonValueToField('n', { $numberInt: '99' })
    expect(f.type).toBe('int32')
    expect(f.value).toBe('99')
  })

  it('converts $numberLong to int64 field', () => {
    const f = ejsonValueToField('n', { $numberLong: '9007199254740992' })
    expect(f.type).toBe('int64')
  })

  it('converts $numberDouble to double field', () => {
    const f = ejsonValueToField('n', { $numberDouble: '1.5' })
    expect(f.type).toBe('double')
  })

  it('converts $numberDecimal to decimal128 field', () => {
    const f = ejsonValueToField('n', { $numberDecimal: '0.1' })
    expect(f.type).toBe('decimal128')
  })

  it('converts $minKey and $maxKey', () => {
    expect(ejsonValueToField('k', { $minKey: 1 }).type).toBe('minKey')
    expect(ejsonValueToField('k', { $maxKey: 1 }).type).toBe('maxKey')
  })

  it('converts $binary to binary field', () => {
    const f = ejsonValueToField('b', { $binary: { base64: 'abc=', subType: '04' } })
    expect(f.type).toBe('binary')
    expect(f.value).toBe('abc=')
    expect(f.extra).toBe('04')
  })

  it('converts $regularExpression to regex field', () => {
    const f = ejsonValueToField('r', { $regularExpression: { pattern: 'foo', options: 'gi' } })
    expect(f.type).toBe('regex')
    expect(f.value).toBe('foo')
    expect(f.extra).toBe('gi')
  })

  it('converts $timestamp to timestamp field', () => {
    const f = ejsonValueToField('ts', { $timestamp: { t: 5, i: 2 } })
    expect(f.type).toBe('timestamp')
    expect(f.value).toBe('5')
    expect(f.extra).toBe('2')
  })

  it('converts plain array to array field with children', () => {
    const f = ejsonValueToField('arr', ['a', 'b'])
    expect(f.type).toBe('array')
    expect(f.children).toHaveLength(2)
    expect(f.children![0].value).toBe('a')
    expect(f.children![1].value).toBe('b')
  })

  it('converts plain object to object field with children', () => {
    const f = ejsonValueToField('obj', { x: 1, y: 'hello' })
    expect(f.type).toBe('object')
    expect(f.children).toHaveLength(2)
    expect(f.children!.find((c) => c.name === 'x')?.type).toBe('int32')
    expect(f.children!.find((c) => c.name === 'y')?.value).toBe('hello')
  })
})

// ─── ejsonStringToFields ──────────────────────────────────────────────────────

describe('ejsonStringToFields', () => {
  it('round-trips a flat EJSON document', () => {
    const doc = {
      _id: { $oid: 'aabbccddaabbccddaabbccdd' },
      name: 'Alice',
      age: { $numberInt: '30' },
      active: true,
      score: { $numberDouble: '9.5' },
    }
    const fields = ejsonStringToFields(JSON.stringify(doc))
    expect(fields.find((f) => f.name === '_id')?.type).toBe('objectId')
    expect(fields.find((f) => f.name === 'name')?.type).toBe('string')
    expect(fields.find((f) => f.name === 'age')?.type).toBe('int32')
    expect(fields.find((f) => f.name === 'active')?.type).toBe('boolean')
    expect(fields.find((f) => f.name === 'score')?.type).toBe('double')
  })

  it('handles nested objects', () => {
    const doc = { address: { city: 'NYC', zip: '10001' } }
    const fields = ejsonStringToFields(JSON.stringify(doc))
    const addrField = fields.find((f) => f.name === 'address')
    expect(addrField?.type).toBe('object')
    expect(addrField?.children).toHaveLength(2)
  })

  it('handles arrays', () => {
    const doc = { tags: ['a', 'b', 'c'] }
    const fields = ejsonStringToFields(JSON.stringify(doc))
    const tagsField = fields.find((f) => f.name === 'tags')
    expect(tagsField?.type).toBe('array')
    expect(tagsField?.children).toHaveLength(3)
  })

  it('throws on invalid JSON', () => {
    expect(() => ejsonStringToFields('not json')).toThrow()
  })

  it('round-trips fields through fieldsToEjsonString', () => {
    const original = {
      _id: { $oid: 'aabbccddaabbccddaabbccdd' },
      name: 'Test',
      count: { $numberInt: '5' },
    }
    const fields = ejsonStringToFields(JSON.stringify(original))
    const reserialized = fieldsToEjsonString(fields)
    const parsed = JSON.parse(reserialized) as typeof original
    expect(parsed._id).toEqual(original._id)
    expect(parsed.name).toBe(original.name)
    expect(parsed.count).toEqual(original.count)
  })
})
