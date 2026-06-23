import type { ErdColumn, ErdRelationship } from '../erd.types'

export interface SelectedTable {
  schema: string
  name: string
  /** Auto-assigned single-letter alias, e.g. "t1", "t2" */
  alias: string
  columns: ErdColumn[]
}

export type SortType = 'UNSORTED' | 'ASC' | 'DESC'

export interface ColumnConfig {
  tableSchema: string
  tableName: string
  tableAlias: string
  columnName: string
  /** User-defined output alias */
  alias: string
  /** Whether the column appears in SELECT */
  output: boolean
  sortType: SortType
  /** Position in ORDER BY clause (1-based). 0 means not set. */
  sortOrder: number
  /** Optional WHERE filter expression fragment, e.g. "> 10" */
  filter: string
}

export interface QueryEditorState {
  selectedTables: SelectedTable[]
  columnConfigs: ColumnConfig[]
  sqlQuery: string
  /** False when SQL was manually edited to something parseSQL() cannot fully round-trip */
  isSyncedWithUI: boolean
}

export type { ErdRelationship }
