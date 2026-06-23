/**
 * Shared types and constants for the Explorer page and its sub-components.
 * Extracted from ExplorerPage.tsx to enable reuse across hooks and components.
 */
import {
  Database,
  Table2,
  Eye,
  Code,
  Zap,
  Tag,
  List,
  Key,
  Lock,
  Bell,
  Layers,
  BarChart2,
  Shield,
  Users,
  UserCheck,
  Boxes,
  User,
  Box,
  Server,
  Folder,
  Hash,
  FileText,
  GitMerge,
  CheckCircle
} from 'lucide-react'
import type { ExplorerNode, ExplorerNodeKind, QueryResultSet, QueryMessage } from './connections.types'
import type { SortIndicator } from './QueryEditor/sortIndicators'
import type { ClientStatistics } from './ClientStatisticsView/ClientStatisticsView'
import type { ErdBackground } from './ErdCanvas/ErdCanvas'
import type { ErdSchema } from './erd.types'
import type { Node, Edge } from '@xyflow/react'

// ─── Tab Types ──────────────────────────────────────────────────────────────

export interface QueryTab {
  id: string
  kind: 'query'
  title: string
  filePath?: string
  content: string
  isDirty: boolean
  connectionId?: string
  databaseName?: string
  mongoCollection?: string
}

export interface ErdTab {
  id: string
  kind: 'erd'
  title: string
  connectionId: string
  databaseName: string
  loadState: 'loading' | 'loaded' | 'error'
  schema?: ErdSchema
  error?: string
  background: ErdBackground
  filePath?: string
  initialNodes?: Node[]
  initialEdges?: Edge[]
  initialCurveType?: 'default' | 'smoothstep'
  initialViewport?: { x: number; y: number; zoom: number }
}

export interface DashboardTab {
  id: string
  kind: 'dashboard'
  dashboardKind: 'redis'
  title: string
  connectionId: string
}

export interface MongoShellTab {
  id: string
  kind: 'mongo-shell'
  title: string
  connectionId: string
  databaseName?: string
}

export interface RedisShellTab {
  id: string
  kind: 'redis-shell'
  title: string
  connectionId: string
  initialDbIndex?: string
}

export interface RedisDbExplorerTab {
  id: string
  kind: 'redis-db-explorer'
  title: string
  connectionId: string
  dbIndex: number
}

export type Tab = QueryTab | ErdTab | DashboardTab | MongoShellTab | RedisShellTab | RedisDbExplorerTab

// ─── Query State Types ───────────────────────────────────────────────────────

export type TabQueryState =
  | { status: 'idle' }
  | { status: 'running' }
  | {
      status: 'ok'
      resultSets: QueryResultSet[]
      messages: QueryMessage[]
      durationMs: number
      executionPlanXml?: string
      clientStatistics?: ClientStatistics
      sortIndicators?: Record<string, SortIndicator>
      filteredColumns?: Set<string>
    }
  | { status: 'error'; message: string }

export type ResultsView = 'results' | 'messages' | 'execution-plan' | 'client-statistics'

// ─── Layout Constants ────────────────────────────────────────────────────────

export const MIN_PANEL_WIDTH = 180
export const MAX_PANEL_WIDTH = 480

// ─── Tree Constants ──────────────────────────────────────────────────────────

/** Kinds that have children and can be expanded. */
export const EXPANDABLE_KINDS = new Set<ExplorerNodeKind>([
  'databases-folder',
  'database',
  'tables-folder',
  'views-folder',
  'stored-procedures-folder',
  'functions-folder',
  'types-folder',
  'type-data-types-folder',
  'type-tables-folder',
  'type-memory-optimized-tables-folder',
  'type-enums-folder',
  'type-composites-folder',
  'table',
  'table-columns-folder',
  'table-keys-folder',
  'table-constraints-folder',
  'table-triggers-folder',
  'table-indexes-folder',
  'table-statistics-folder',
  'security-folder',
  'security-users-folder',
  'security-roles-folder',
  'security-schemas-folder',
  // Redis
  'redis-keyspaces-folder',
  // MongoDB
  'mongodb-collection',
  'mongodb-collection-indexes',
  'mongodb-collection-aggregations'
])

export const NODE_ICONS: Record<ExplorerNodeKind, React.FC<React.SVGProps<SVGSVGElement>>> = {
  'databases-folder': Database as React.FC<React.SVGProps<SVGSVGElement>>,
  database: Database as React.FC<React.SVGProps<SVGSVGElement>>,
  'tables-folder': Table2 as React.FC<React.SVGProps<SVGSVGElement>>,
  table: Table2 as React.FC<React.SVGProps<SVGSVGElement>>,
  'views-folder': Eye as React.FC<React.SVGProps<SVGSVGElement>>,
  view: Eye as React.FC<React.SVGProps<SVGSVGElement>>,
  'stored-procedures-folder': Code as React.FC<React.SVGProps<SVGSVGElement>>,
  'stored-procedure': Code as React.FC<React.SVGProps<SVGSVGElement>>,
  'functions-folder': Zap as React.FC<React.SVGProps<SVGSVGElement>>,
  function: Zap as React.FC<React.SVGProps<SVGSVGElement>>,
  'types-folder': Tag as React.FC<React.SVGProps<SVGSVGElement>>,
  'type-data-types-folder': Tag as React.FC<React.SVGProps<SVGSVGElement>>,
  'type-tables-folder': Tag as React.FC<React.SVGProps<SVGSVGElement>>,
  'type-memory-optimized-tables-folder': Tag as React.FC<React.SVGProps<SVGSVGElement>>,
  type: Tag as React.FC<React.SVGProps<SVGSVGElement>>,
  'table-columns-folder': List as React.FC<React.SVGProps<SVGSVGElement>>,
  column: List as React.FC<React.SVGProps<SVGSVGElement>>,
  'column-pk': Key as React.FC<React.SVGProps<SVGSVGElement>>,
  'table-keys-folder': Key as React.FC<React.SVGProps<SVGSVGElement>>,
  key: Key as React.FC<React.SVGProps<SVGSVGElement>>,
  'table-constraints-folder': Lock as React.FC<React.SVGProps<SVGSVGElement>>,
  constraint: Lock as React.FC<React.SVGProps<SVGSVGElement>>,
  'table-triggers-folder': Bell as React.FC<React.SVGProps<SVGSVGElement>>,
  trigger: Bell as React.FC<React.SVGProps<SVGSVGElement>>,
  'table-indexes-folder': Layers as React.FC<React.SVGProps<SVGSVGElement>>,
  index: Layers as React.FC<React.SVGProps<SVGSVGElement>>,
  'table-statistics-folder': BarChart2 as React.FC<React.SVGProps<SVGSVGElement>>,
  statistic: BarChart2 as React.FC<React.SVGProps<SVGSVGElement>>,
  'type-enums-folder': Tag as React.FC<React.SVGProps<SVGSVGElement>>,
  'type-composites-folder': Tag as React.FC<React.SVGProps<SVGSVGElement>>,
  'security-folder': Shield as React.FC<React.SVGProps<SVGSVGElement>>,
  'security-users-folder': Users as React.FC<React.SVGProps<SVGSVGElement>>,
  'security-roles-folder': UserCheck as React.FC<React.SVGProps<SVGSVGElement>>,
  'security-schemas-folder': Boxes as React.FC<React.SVGProps<SVGSVGElement>>,
  'security-user': User as React.FC<React.SVGProps<SVGSVGElement>>,
  'security-role': UserCheck as React.FC<React.SVGProps<SVGSVGElement>>,
  'security-schema': Box as React.FC<React.SVGProps<SVGSVGElement>>,
  // Redis node icons
  'redis-keyspaces-folder': Server as React.FC<React.SVGProps<SVGSVGElement>>,
  'redis-keyspace': Database as React.FC<React.SVGProps<SVGSVGElement>>,
  'redis-key-prefix': Folder as React.FC<React.SVGProps<SVGSVGElement>>,
  'redis-key': Hash as React.FC<React.SVGProps<SVGSVGElement>>,
  // MongoDB node icons
  'mongodb-collections-folder': Folder as React.FC<React.SVGProps<SVGSVGElement>>,
  'mongodb-collection': Table2 as React.FC<React.SVGProps<SVGSVGElement>>,
  'mongodb-collection-documents': FileText as React.FC<React.SVGProps<SVGSVGElement>>,
  'mongodb-collection-indexes': Layers as React.FC<React.SVGProps<SVGSVGElement>>,
  'mongodb-collection-aggregations': GitMerge as React.FC<React.SVGProps<SVGSVGElement>>,
  'mongodb-collection-validation': CheckCircle as React.FC<React.SVGProps<SVGSVGElement>>,
  'mongodb-index': Layers as React.FC<React.SVGProps<SVGSVGElement>>,
  'mongodb-aggregation': GitMerge as React.FC<React.SVGProps<SVGSVGElement>>
}

/**
 * For folder/category nodes the label is derived from the i18n system rather
 * than the node's own label field (which is an implementation detail).
 */
export const FOLDER_I18N_KEYS: Partial<Record<ExplorerNodeKind, string>> = {
  'databases-folder': 'explorer.databases',
  'tables-folder': 'explorer.tables',
  'views-folder': 'explorer.views',
  'stored-procedures-folder': 'explorer.storedProcedures',
  'functions-folder': 'explorer.functions',
  'types-folder': 'explorer.types',
  'type-data-types-folder': 'explorer.typeDataTypes',
  'type-tables-folder': 'explorer.typeTables',
  'type-memory-optimized-tables-folder': 'explorer.typeMemoryOptimizedTables',
  'table-columns-folder': 'explorer.columns',
  'table-keys-folder': 'explorer.keys',
  'table-constraints-folder': 'explorer.constraints',
  'table-triggers-folder': 'explorer.triggers',
  'table-indexes-folder': 'explorer.indexes',
  'table-statistics-folder': 'explorer.statistics',
  'type-enums-folder': 'explorer.typeEnums',
  'type-composites-folder': 'explorer.typeComposites',
  'security-folder': 'explorer.security',
  'security-users-folder': 'explorer.securityUsers',
  'security-roles-folder': 'explorer.securityRoles',
  'security-schemas-folder': 'explorer.securitySchemas',
  // Redis
  'redis-keyspaces-folder': 'explorer.redisKeyspaces'
}

/** Static root node shown as the single child of every connected connection. */
export const DATABASES_NODE: ExplorerNode = { id: 'databases', label: 'Databases', kind: 'databases-folder' }

/** Static Security node shown at the connection level alongside Databases. */
export const SECURITY_NODE: ExplorerNode = { id: 'security', label: 'Security', kind: 'security-folder' }
