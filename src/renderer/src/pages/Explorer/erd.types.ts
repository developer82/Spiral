export interface ErdColumn {
  name: string
  type: string
  maxLength: number | null
  isNullable: boolean
  isPrimaryKey: boolean
  isForeignKey: boolean
}

export interface ErdTable {
  schema: string
  name: string
  columns: ErdColumn[]
}

export interface ErdRelationship {
  constraintName: string
  fromSchema: string
  fromTable: string
  fromColumn: string
  toSchema: string
  toTable: string
  toColumn: string
}

export interface ErdIndex {
  schema: string
  table: string
  name: string
  typeDesc: string
  isUnique: boolean
  isPrimaryKey: boolean
}

export interface ErdSchema {
  tables: ErdTable[]
  relationships: ErdRelationship[]
  indexes: ErdIndex[]
}

export interface ErdCanvasSerializedState {
  nodes: unknown[]
  edges: unknown[]
  curveType: 'default' | 'smoothstep'
  viewport: { x: number; y: number; zoom: number }
}

export interface ErdFileContent {
  version: 1
  connectionId: string
  connectionName: string
  databaseName: string
  nodes: unknown[]
  edges: unknown[]
  curveType: 'default' | 'smoothstep'
  background: 'none' | 'dots' | 'grid'
  viewport: { x: number; y: number; zoom: number }
  savedAt: string
}
