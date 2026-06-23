import type { ConnectionProvider } from './connections.types'

export interface ColumnTypeConfig {
  hasLength: boolean
  hasMaxOption: boolean
  hasPrecisionScale: boolean
  hasIdentity: boolean
}

const NO_EXTRA: ColumnTypeConfig = {
  hasLength: false,
  hasMaxOption: false,
  hasPrecisionScale: false,
  hasIdentity: false
}

export const SQL_SERVER_TYPES: string[] = [
  // Exact numerics
  'tinyint',
  'smallint',
  'int',
  'bigint',
  'bit',
  'decimal',
  'numeric',
  'money',
  'smallmoney',
  // Approximate numerics
  'float',
  'real',
  // Date / time
  'date',
  'time',
  'datetime',
  'datetime2',
  'smalldatetime',
  'datetimeoffset',
  // Character strings
  'char',
  'varchar',
  'text',
  // Unicode strings
  'nchar',
  'nvarchar',
  'ntext',
  // Binary
  'binary',
  'varbinary',
  'image',
  // Other
  'uniqueidentifier',
  'xml',
  'rowversion',
  'timestamp',
  'sql_variant',
  'hierarchyid',
  'geography',
  'geometry'
]

export const SQL_SERVER_TYPE_CONFIGS: Record<string, ColumnTypeConfig> = {
  tinyint: { ...NO_EXTRA, hasIdentity: true },
  smallint: { ...NO_EXTRA, hasIdentity: true },
  int: { ...NO_EXTRA, hasIdentity: true },
  bigint: { ...NO_EXTRA, hasIdentity: true },
  bit: NO_EXTRA,
  decimal: { ...NO_EXTRA, hasPrecisionScale: true, hasIdentity: true },
  numeric: { ...NO_EXTRA, hasPrecisionScale: true, hasIdentity: true },
  money: NO_EXTRA,
  smallmoney: NO_EXTRA,
  float: NO_EXTRA,
  real: NO_EXTRA,
  date: NO_EXTRA,
  time: NO_EXTRA,
  datetime: NO_EXTRA,
  datetime2: NO_EXTRA,
  smalldatetime: NO_EXTRA,
  datetimeoffset: NO_EXTRA,
  char: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  varchar: { ...NO_EXTRA, hasLength: true, hasMaxOption: true },
  text: NO_EXTRA,
  nchar: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  nvarchar: { ...NO_EXTRA, hasLength: true, hasMaxOption: true },
  ntext: NO_EXTRA,
  binary: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  varbinary: { ...NO_EXTRA, hasLength: true, hasMaxOption: true },
  image: NO_EXTRA,
  uniqueidentifier: NO_EXTRA,
  xml: NO_EXTRA,
  rowversion: NO_EXTRA,
  timestamp: NO_EXTRA,
  sql_variant: NO_EXTRA,
  hierarchyid: NO_EXTRA,
  geography: NO_EXTRA,
  geometry: NO_EXTRA
}

export const POSTGRES_TYPES: string[] = [
  // Numeric
  'smallint',
  'integer',
  'bigint',
  'decimal',
  'numeric',
  'real',
  'double precision',
  'smallserial',
  'serial',
  'bigserial',
  // Monetary
  'money',
  // Character
  'char',
  'varchar',
  'text',
  // Binary
  'bytea',
  // Date / time
  'date',
  'time',
  'timetz',
  'timestamp',
  'timestamptz',
  'interval',
  // Boolean
  'boolean',
  // Geometric
  'point',
  'line',
  'lseg',
  'box',
  'path',
  'polygon',
  'circle',
  // Network
  'cidr',
  'inet',
  'macaddr',
  'macaddr8',
  // Bit string
  'bit',
  'bit varying',
  // Text search
  'tsvector',
  'tsquery',
  // UUID
  'uuid',
  // XML
  'xml',
  // JSON
  'json',
  'jsonb',
  // Arrays / range
  'int4range',
  'int8range',
  'numrange',
  'tsrange',
  'tstzrange',
  'daterange',
  // Other
  'oid',
  'pg_lsn'
]

export const POSTGRES_TYPE_CONFIGS: Record<string, ColumnTypeConfig> = {
  smallint: { ...NO_EXTRA, hasIdentity: false },
  integer: { ...NO_EXTRA, hasIdentity: false },
  bigint: { ...NO_EXTRA, hasIdentity: false },
  decimal: { ...NO_EXTRA, hasPrecisionScale: true },
  numeric: { ...NO_EXTRA, hasPrecisionScale: true },
  real: NO_EXTRA,
  'double precision': NO_EXTRA,
  smallserial: NO_EXTRA,
  serial: NO_EXTRA,
  bigserial: NO_EXTRA,
  money: NO_EXTRA,
  char: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  varchar: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  text: NO_EXTRA,
  bytea: NO_EXTRA,
  date: NO_EXTRA,
  time: NO_EXTRA,
  timetz: NO_EXTRA,
  timestamp: NO_EXTRA,
  timestamptz: NO_EXTRA,
  interval: NO_EXTRA,
  boolean: NO_EXTRA,
  point: NO_EXTRA,
  line: NO_EXTRA,
  lseg: NO_EXTRA,
  box: NO_EXTRA,
  path: NO_EXTRA,
  polygon: NO_EXTRA,
  circle: NO_EXTRA,
  cidr: NO_EXTRA,
  inet: NO_EXTRA,
  macaddr: NO_EXTRA,
  macaddr8: NO_EXTRA,
  bit: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  'bit varying': { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  tsvector: NO_EXTRA,
  tsquery: NO_EXTRA,
  uuid: NO_EXTRA,
  xml: NO_EXTRA,
  json: NO_EXTRA,
  jsonb: NO_EXTRA,
  int4range: NO_EXTRA,
  int8range: NO_EXTRA,
  numrange: NO_EXTRA,
  tsrange: NO_EXTRA,
  tstzrange: NO_EXTRA,
  daterange: NO_EXTRA,
  oid: NO_EXTRA,
  pg_lsn: NO_EXTRA
}

export const MYSQL_TYPES: string[] = [
  // Exact numerics
  'tinyint',
  'smallint',
  'mediumint',
  'int',
  'bigint',
  'decimal',
  'numeric',
  'float',
  'double',
  'bit',
  // Boolean
  'boolean',
  // Date / time
  'date',
  'time',
  'datetime',
  'timestamp',
  'year',
  // Character strings
  'char',
  'varchar',
  'tinytext',
  'text',
  'mediumtext',
  'longtext',
  // Binary
  'binary',
  'varbinary',
  'tinyblob',
  'blob',
  'mediumblob',
  'longblob',
  // Other
  'json',
  'enum',
  'set'
]

export const MYSQL_TYPE_CONFIGS: Record<string, ColumnTypeConfig> = {
  tinyint: { ...NO_EXTRA, hasIdentity: true },
  smallint: { ...NO_EXTRA, hasIdentity: true },
  mediumint: { ...NO_EXTRA, hasIdentity: true },
  int: { ...NO_EXTRA, hasIdentity: true },
  bigint: { ...NO_EXTRA, hasIdentity: true },
  decimal: { ...NO_EXTRA, hasPrecisionScale: true },
  numeric: { ...NO_EXTRA, hasPrecisionScale: true },
  float: NO_EXTRA,
  double: NO_EXTRA,
  bit: NO_EXTRA,
  boolean: NO_EXTRA,
  date: NO_EXTRA,
  time: NO_EXTRA,
  datetime: NO_EXTRA,
  timestamp: NO_EXTRA,
  year: NO_EXTRA,
  char: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  varchar: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  tinytext: NO_EXTRA,
  text: NO_EXTRA,
  mediumtext: NO_EXTRA,
  longtext: NO_EXTRA,
  binary: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  varbinary: { ...NO_EXTRA, hasLength: true, hasMaxOption: false },
  tinyblob: NO_EXTRA,
  blob: NO_EXTRA,
  mediumblob: NO_EXTRA,
  longblob: NO_EXTRA,
  json: NO_EXTRA,
  enum: NO_EXTRA,
  set: NO_EXTRA
}

const PROVIDER_TYPES: Partial<Record<ConnectionProvider, string[]>> = {
  sqlserver: SQL_SERVER_TYPES,
  postgres: POSTGRES_TYPES,
  mysql: MYSQL_TYPES,
  sqlite: SQL_SERVER_TYPES
}

const PROVIDER_TYPE_CONFIGS: Partial<Record<ConnectionProvider, Record<string, ColumnTypeConfig>>> = {
  sqlserver: SQL_SERVER_TYPE_CONFIGS,
  postgres: POSTGRES_TYPE_CONFIGS,
  mysql: MYSQL_TYPE_CONFIGS,
  sqlite: SQL_SERVER_TYPE_CONFIGS
}

export function getProviderTypes(provider: ConnectionProvider): string[] {
  return PROVIDER_TYPES[provider] ?? SQL_SERVER_TYPES
}

export function getTypeConfig(provider: ConnectionProvider, typeName: string): ColumnTypeConfig {
  return PROVIDER_TYPE_CONFIGS[provider]?.[typeName] ?? NO_EXTRA
}
