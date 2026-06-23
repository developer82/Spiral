/**
 * Types and utility functions for the MongoDB document add/edit dialog.
 * Documents are serialized as Extended JSON (EJSON v2 canonical), which uses
 * explicit type wrappers like {"$oid":"..."}, {"$date":"..."}, etc.
 */

// ─── BSON type system ─────────────────────────────────────────────────────────

export type BsonFieldType =
  | 'string'
  | 'boolean'
  | 'null'
  | 'int32'
  | 'int64'
  | 'double'
  | 'decimal128'
  | 'date'
  | 'objectId'
  | 'object'
  | 'array'
  | 'binary'
  | 'regex'
  | 'timestamp'
  | 'minKey'
  | 'maxKey'

export interface BsonTypeOption {
  value: BsonFieldType
  label: string
}

export const BSON_TYPE_OPTIONS: BsonTypeOption[] = [
  { value: 'string',     label: 'String' },
  { value: 'int32',      label: 'Int32' },
  { value: 'int64',      label: 'Int64' },
  { value: 'double',     label: 'Double' },
  { value: 'decimal128', label: 'Decimal128' },
  { value: 'boolean',    label: 'Boolean' },
  { value: 'null',       label: 'Null' },
  { value: 'date',       label: 'Date' },
  { value: 'objectId',   label: 'ObjectId' },
  { value: 'object',     label: 'Object' },
  { value: 'array',      label: 'Array' },
  { value: 'binary',     label: 'Binary' },
  { value: 'regex',      label: 'Regex' },
  { value: 'timestamp',  label: 'Timestamp' },
  { value: 'minKey',     label: 'MinKey' },
  { value: 'maxKey',     label: 'MaxKey' },
]

// ─── Document field model ─────────────────────────────────────────────────────

export interface DocumentField {
  /** Unique React key. */
  id: string
  /** Field name.  For array items this is the ordinal index string shown. */
  name: string
  type: BsonFieldType
  /** String representation of the scalar value (type-specific). */
  value: string
  /**
   * Secondary string value used by multi-component types:
   * - regex: options flags
   * - timestamp: the "i" (increment) component
   * - binary: the subType hex byte (e.g. "00")
   */
  extra?: string
  /** Child fields for 'object' and 'array' types. */
  children?: DocumentField[]
}

// ─── ID generation ────────────────────────────────────────────────────────────

let _idCounter = 0

export function generateFieldId(): string {
  return `mdf_${++_idCounter}_${Math.random().toString(36).slice(2, 7)}`
}

/**
 * Generate a new 24-character hex ObjectId string using the standard format:
 * 4-byte timestamp + 5-byte random + 3-byte incrementing counter.
 */
export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0')
  const random = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('')
  const counter = ((_idCounter++) & 0xffffff).toString(16).padStart(6, '0')
  return (timestamp + random + counter).slice(0, 24)
}

// ─── Field creation helpers ───────────────────────────────────────────────────

export function createDefaultField(type: BsonFieldType, name = ''): DocumentField {
  const id = generateFieldId()
  switch (type) {
    case 'string':     return { id, name, type, value: '' }
    case 'boolean':    return { id, name, type, value: 'false' }
    case 'null':       return { id, name, type, value: '' }
    case 'int32':      return { id, name, type, value: '0' }
    case 'int64':      return { id, name, type, value: '0' }
    case 'double':     return { id, name, type, value: '0' }
    case 'decimal128': return { id, name, type, value: '0' }
    case 'date':       return { id, name, type, value: new Date().toISOString() }
    case 'objectId':   return { id, name, type, value: generateObjectId() }
    case 'object':     return { id, name, type, value: '', children: [] }
    case 'array':      return { id, name, type, value: '', children: [] }
    case 'binary':     return { id, name, type, value: '', extra: '00' }
    case 'regex':      return { id, name, type, value: '', extra: '' }
    case 'timestamp':  return { id, name, type, value: '0', extra: '0' }
    case 'minKey':     return { id, name, type, value: '' }
    case 'maxKey':     return { id, name, type, value: '' }
    default:           return { id, name, type: 'string', value: '' }
  }
}

/**
 * Convert a field to a new type, carrying over the value string where it makes
 * sense (e.g. numeric types are compatible with each other).
 */
export function convertFieldType(field: DocumentField, newType: BsonFieldType): DocumentField {
  const base = createDefaultField(newType, field.name)
  const numericTypes: BsonFieldType[] = ['int32', 'int64', 'double', 'decimal128']
  if (numericTypes.includes(newType) && numericTypes.includes(field.type)) {
    base.value = field.value
  }
  if (newType === 'string' && numericTypes.includes(field.type)) {
    base.value = field.value
  }
  if (newType === 'boolean' && ['string', 'int32'].includes(field.type)) {
    base.value = field.value === '1' || field.value.toLowerCase() === 'true' ? 'true' : 'false'
  }
  return base
}

/** Build the initial field list for a new (add) document: just an _id of type ObjectId. */
export function createInitialAddFields(): DocumentField[] {
  return [
    {
      id: generateFieldId(),
      name: '_id',
      type: 'objectId',
      value: generateObjectId(),
    },
  ]
}

// ─── Reset fields for "add another" document ─────────────────────────────────

export function resetFieldValuesForNewDocument(fields: DocumentField[]): DocumentField[] {
  return fields.map(resetSingleField)
}

function resetSingleField(field: DocumentField): DocumentField {
  const fresh = createDefaultField(field.type, field.name)
  if ((field.type === 'object' || field.type === 'array') && field.children) {
    return { ...fresh, children: field.children.map(resetSingleField) }
  }
  return fresh
}

// ─── Serialization: DocumentField[] → EJSON JSON string ──────────────────────

export function fieldToEjsonValue(field: DocumentField): unknown {
  switch (field.type) {
    case 'string':     return field.value
    case 'boolean':    return field.value === 'true'
    case 'null':       return null
    case 'int32':      return { $numberInt: field.value || '0' }
    case 'int64':      return { $numberLong: field.value || '0' }
    case 'double':     return { $numberDouble: field.value || '0' }
    case 'decimal128': return { $numberDecimal: field.value || '0' }
    case 'date':       return { $date: field.value }
    case 'objectId':   return { $oid: field.value }
    case 'minKey':     return { $minKey: 1 }
    case 'maxKey':     return { $maxKey: 1 }
    case 'binary':     return { $binary: { base64: field.value, subType: field.extra ?? '00' } }
    case 'regex':      return { $regularExpression: { pattern: field.value, options: field.extra ?? '' } }
    case 'timestamp':  return { $timestamp: { t: parseInt(field.value || '0', 10), i: parseInt(field.extra || '0', 10) } }
    case 'object': {
      const obj: Record<string, unknown> = {}
      for (const child of field.children ?? []) {
        obj[child.name] = fieldToEjsonValue(child)
      }
      return obj
    }
    case 'array':
      return (field.children ?? []).map((child) => fieldToEjsonValue(child))
    default:
      return field.value
  }
}

export function fieldsToEjsonString(fields: DocumentField[]): string {
  const obj: Record<string, unknown> = {}
  for (const field of fields) {
    obj[field.name] = fieldToEjsonValue(field)
  }
  return JSON.stringify(obj, null, 2)
}

// ─── Deserialization: EJSON JSON string → DocumentField[] ────────────────────

export function ejsonValueToField(name: string, value: unknown): DocumentField {
  const id = generateFieldId()
  if (value === null)             return { id, name, type: 'null',    value: '' }
  if (typeof value === 'boolean') return { id, name, type: 'boolean', value: String(value) }
  if (typeof value === 'string')  return { id, name, type: 'string',  value }
  if (typeof value === 'number') {
    if (Number.isInteger(value))  return { id, name, type: 'int32',  value: String(value) }
    return { id, name, type: 'double', value: String(value) }
  }
  if (Array.isArray(value)) {
    const children = value.map((v, i) => ejsonValueToField(String(i), v))
    return { id, name, type: 'array', value: '', children }
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if ('$oid' in obj && typeof obj.$oid === 'string')
      return { id, name, type: 'objectId', value: obj.$oid }
    if ('$date' in obj) {
      if (typeof obj.$date === 'string')
        return { id, name, type: 'date', value: obj.$date }
      if (typeof obj.$date === 'object' && obj.$date !== null && '$numberLong' in (obj.$date as object)) {
        const ms = Number((obj.$date as Record<string, unknown>).$numberLong)
        return { id, name, type: 'date', value: new Date(ms).toISOString() }
      }
      return { id, name, type: 'date', value: String(obj.$date) }
    }
    if ('$numberInt' in obj)     return { id, name, type: 'int32',      value: String(obj.$numberInt) }
    if ('$numberLong' in obj)    return { id, name, type: 'int64',      value: String(obj.$numberLong) }
    if ('$numberDouble' in obj)  return { id, name, type: 'double',     value: String(obj.$numberDouble) }
    if ('$numberDecimal' in obj) return { id, name, type: 'decimal128', value: String(obj.$numberDecimal) }
    if ('$minKey' in obj)        return { id, name, type: 'minKey',     value: '' }
    if ('$maxKey' in obj)        return { id, name, type: 'maxKey',     value: '' }
    if ('$binary' in obj) {
      const b = obj.$binary as { base64?: string; subType?: string } | null
      return { id, name, type: 'binary', value: b?.base64 ?? '', extra: b?.subType ?? '00' }
    }
    if ('$regularExpression' in obj) {
      const r = obj.$regularExpression as { pattern?: string; options?: string } | null
      return { id, name, type: 'regex', value: r?.pattern ?? '', extra: r?.options ?? '' }
    }
    if ('$timestamp' in obj) {
      const ts = obj.$timestamp as { t?: number; i?: number } | null
      return { id, name, type: 'timestamp', value: String(ts?.t ?? 0), extra: String(ts?.i ?? 0) }
    }
    // Plain nested object
    const children = Object.entries(obj).map(([k, v]) => ejsonValueToField(k, v))
    return { id, name, type: 'object', value: '', children }
  }
  return { id, name, type: 'string', value: JSON.stringify(value) }
}

export function ejsonStringToFields(ejsonStr: string): DocumentField[] {
  const parsed = JSON.parse(ejsonStr) as Record<string, unknown>
  return Object.entries(parsed).map(([k, v]) => ejsonValueToField(k, v))
}
