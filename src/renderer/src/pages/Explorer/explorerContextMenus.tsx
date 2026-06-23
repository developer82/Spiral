/**
 * explorerContextMenus — pure functions that build context-menu item arrays
 * for each node type in the Explorer tree.
 *
 * Each function receives the React-JSX icons, translation function, and
 * the action callbacks it needs, then returns MenuItem[] ready to be passed
 * to <Menu />.
 */
import {
  Plus,
  FilePlus,
  RefreshCw,
  TableProperties,
  DatabaseZap,
  Trash2,
  Pencil,
  Plug,
  PlugZap,
  Network,
  Activity,
  List,
  Key,
  Lock,
  Bell,
  ListOrdered,
  Eye,
  Code,
  Tag,
  ScrollText,
  GitMerge,
  ShieldCheck
} from 'lucide-react'
import type { MenuItem } from '../../components/Menu/Menu'
import type { ConnectionRecord } from './connections.types'

type TFunc = (key: string, opts?: object | string) => string

// ─── Connection ──────────────────────────────────────────────────────────────

export function buildConnectionContextMenuItems(
  _conn: ConnectionRecord,
  runtimeStatus: string,
  t: TFunc,
  onEdit: () => void,
  onConnect: () => void,
  onDisconnect: () => void,
  onDelete: () => void
): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'edit', label: t('explorer.contextMenu.edit'), icon: <Pencil size={13} />, onClick: onEdit }
  ]
  if (runtimeStatus === 'connected') {
    items.push({ id: 'disconnect', label: t('explorer.contextMenu.disconnect'), icon: <PlugZap size={13} />, onClick: onDisconnect })
  } else if (runtimeStatus === 'disconnected' || runtimeStatus === 'error') {
    items.push({ id: 'connect', label: t('explorer.contextMenu.connect'), icon: <Plug size={13} />, onClick: onConnect })
  }
  items.push({ id: 'sep', separator: true })
  items.push({ id: 'delete', label: t('explorer.contextMenu.delete'), icon: <Trash2 size={13} />, onClick: onDelete })
  return items
}

// ─── Databases folder ────────────────────────────────────────────────────────

export function buildDatabasesFolderMenuItems(
  t: TFunc,
  onRefresh: () => void,
  onCreateDatabase: () => void
): MenuItem[] {
  return [
    { id: 'refresh-databases', label: t('explorer.createDatabase.refreshContextMenuLabel'), icon: <RefreshCw size={13} />, onClick: onRefresh },
    { id: 'create-database', label: t('explorer.createDatabase.contextMenuLabel'), icon: <DatabaseZap size={13} />, onClick: onCreateDatabase }
  ]
}

// ─── Database node ───────────────────────────────────────────────────────────

export function buildDatabaseMenuItems(
  t: TFunc,
  hasProfiler: boolean,
  onNewQuery: () => void,
  onCreateErd: () => void,
  onProfile: () => void,
  onDropDatabase: () => void
): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'new-query', label: t('explorer.newQuery'), icon: <FilePlus size={13} />, onClick: onNewQuery },
    { id: 'create-erd', label: t('explorer.createErd.contextMenuLabel'), icon: <Network size={13} />, onClick: onCreateErd }
  ]
  if (hasProfiler) {
    items.push({ id: 'profile', label: t('explorer.profile'), icon: <Activity size={13} />, onClick: onProfile })
  }
  items.push(
    { id: 'sep-danger', separator: true },
    { id: 'delete-database', label: t('explorer.dropDatabase.contextMenuLabel'), icon: <Trash2 size={13} />, onClick: onDropDatabase }
  )
  return items
}

// ─── Tables folder ───────────────────────────────────────────────────────────

export function buildTablesFolderMenuItems(
  t: TFunc,
  hasCreateTable: boolean,
  onNewQuery: () => void,
  onRefresh: () => void,
  onCreateTable: () => void
): MenuItem[] {
  return [
    { id: 'new-query', label: t('explorer.newQuery'), icon: <FilePlus size={13} />, onClick: onNewQuery },
    { id: 'sep', separator: true },
    { id: 'refresh-tables', label: t('explorer.createTable.refreshContextMenuLabel'), icon: <RefreshCw size={13} />, onClick: onRefresh },
    ...(hasCreateTable ? [{
      id: 'create-table',
      label: t('explorer.createTable.contextMenuLabel'),
      icon: <TableProperties size={13} />,
      onClick: onCreateTable
    }] : [])
  ]
}

// ─── Table node ──────────────────────────────────────────────────────────────

interface ScriptCallbacks {
  onScriptCreate: () => void
  onScriptAlter: () => void
  onScriptDrop: () => void
}

export function buildTableMenuItems(
  t: TFunc,
  selectTopRowsCount: number,
  onNewQuery: () => void,
  onRefresh: () => void,
  onSelectTopRows: () => void,
  scripts: ScriptCallbacks,
  onEditTable: () => void,
  onDropTable: () => void
): MenuItem[] {
  return [
    { id: 'new-query', label: t('explorer.newQuery'), icon: <FilePlus size={13} />, onClick: onNewQuery },
    { id: 'sep', separator: true },
    { id: 'refresh-table', label: t('explorer.createTable.refreshContextMenuLabel'), icon: <RefreshCw size={13} />, onClick: onRefresh },
    { id: 'sep-2', separator: true },
    { id: 'select-top-rows', label: t('explorer.selectTopRows', { count: selectTopRowsCount }), icon: <List size={13} />, onClick: onSelectTopRows },
    {
      id: 'create-script',
      label: 'Script...',
      icon: <ScrollText size={13} />,
      items: [
        { id: 'create-script-create', label: 'Create', onClick: scripts.onScriptCreate },
        { id: 'create-script-update', label: 'Update', onClick: scripts.onScriptAlter },
        { id: 'create-script-drop', label: 'Drop', onClick: scripts.onScriptDrop }
      ]
    },
    { id: 'edit-table', label: t('explorer.editTable.contextMenuLabel'), icon: <Pencil size={13} />, onClick: onEditTable },
    { id: 'sep-3', separator: true },
    { id: 'delete-table', label: t('explorer.dropTable.contextMenuLabel'), icon: <Trash2 size={13} />, onClick: onDropTable }
  ]
}

// ─── Table sub-folder ────────────────────────────────────────────────────────

export function buildTableSubFolderMenuItems(
  t: TFunc,
  nodeKind: string,
  onRefresh: () => void,
  onEditTable: () => void,
  onAddForeignKey?: () => void,
  onAddConstraint?: () => void,
  onCreateTrigger?: () => void,
  onCreateIndex?: () => void
): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'refresh', label: t('explorer.createTable.refreshContextMenuLabel'), icon: <RefreshCw size={13} />, onClick: onRefresh },
    { id: 'edit-table', label: t('explorer.editTable.contextMenuLabel'), icon: <Pencil size={13} />, onClick: onEditTable }
  ]
  if (nodeKind === 'table-keys-folder' && onAddForeignKey) {
    items.push(
      { id: 'sep-fk', separator: true },
      { id: 'add-foreign-key', label: t('explorer.foreignKeys.addContextMenuLabel', 'Add Foreign Key'), icon: <Key size={13} />, onClick: onAddForeignKey }
    )
  }
  if (nodeKind === 'table-constraints-folder' && onAddConstraint) {
    items.push(
      { id: 'sep-cc', separator: true },
      { id: 'add-constraint', label: t('explorer.checkConstraints.addContextMenuLabel', 'Add Constraint'), icon: <Lock size={13} />, onClick: onAddConstraint }
    )
  }
  if (nodeKind === 'table-triggers-folder' && onCreateTrigger) {
    items.push(
      { id: 'sep-tr', separator: true },
      { id: 'create-trigger', label: t('explorer.manageTriggers.createContextMenuLabel'), icon: <Bell size={13} />, onClick: onCreateTrigger }
    )
  }
  if (nodeKind === 'table-indexes-folder' && onCreateIndex) {
    items.push(
      { id: 'sep-idx', separator: true },
      { id: 'create-index', label: t('explorer.manageIndexes.createContextMenuLabel'), icon: <ListOrdered size={13} />, onClick: onCreateIndex }
    )
  }
  return items
}

// ─── Index node ──────────────────────────────────────────────────────────────

export function buildIndexMenuItems(
  t: TFunc,
  capabilities: { hasIndexRebuild?: boolean; hasIndexReorganize?: boolean; hasIndexDisable?: boolean },
  onEdit: () => void,
  onRebuild?: () => void,
  onReorganize?: () => void,
  onDisable?: () => void
): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'edit-index', label: t('explorer.manageIndexes.editContextMenuLabel'), icon: <ListOrdered size={13} />, onClick: onEdit },
    { id: 'sep-idx-ops', separator: true }
  ]
  if (capabilities.hasIndexRebuild && onRebuild) {
    items.push({ id: 'rebuild-index', label: t('explorer.manageIndexes.rebuild'), icon: <ListOrdered size={13} />, onClick: onRebuild })
  }
  if (capabilities.hasIndexReorganize && onReorganize) {
    items.push({ id: 'reorganize-index', label: t('explorer.manageIndexes.reorganize'), icon: <ListOrdered size={13} />, onClick: onReorganize })
  }
  if (capabilities.hasIndexDisable && onDisable) {
    items.push({ id: 'disable-index', label: t('explorer.manageIndexes.disable'), icon: <ListOrdered size={13} />, onClick: onDisable })
  }
  return items
}

// ─── Views folder ────────────────────────────────────────────────────────────

export function buildViewsFolderMenuItems(
  t: TFunc,
  onRefresh: () => void,
  onCreateView: () => void
): MenuItem[] {
  return [
    { id: 'refresh-views', label: t('explorer.manageViews.refreshContextMenuLabel'), icon: <RefreshCw size={13} />, onClick: onRefresh },
    { id: 'create-view', label: t('explorer.manageViews.createContextMenuLabel'), icon: <Eye size={13} />, onClick: onCreateView }
  ]
}

// ─── View node ───────────────────────────────────────────────────────────────

export function buildViewMenuItems(
  t: TFunc,
  scripts: ScriptCallbacks,
  onEdit: () => void
): MenuItem[] {
  return [
    { id: 'edit-view', label: t('explorer.manageViews.editContextMenuLabel'), icon: <Eye size={13} />, onClick: onEdit },
    { id: 'sep-view-script', separator: true },
    {
      id: 'view-script',
      label: 'Script...',
      icon: <ScrollText size={13} />,
      items: [
        { id: 'view-script-create', label: 'Create', onClick: scripts.onScriptCreate },
        { id: 'view-script-update', label: 'Update', onClick: scripts.onScriptAlter },
        { id: 'view-script-drop', label: 'Delete', onClick: scripts.onScriptDrop }
      ]
    }
  ]
}

// ─── Stored procedures folder ────────────────────────────────────────────────

export function buildStoredProceduresFolderMenuItems(
  t: TFunc,
  onRefresh: () => void,
  onCreateSP: () => void
): MenuItem[] {
  return [
    { id: 'refresh-stored-procedures', label: t('explorer.manageStoredProcedures.refreshContextMenuLabel'), icon: <RefreshCw size={13} />, onClick: onRefresh },
    { id: 'create-stored-procedure', label: t('explorer.manageStoredProcedures.createContextMenuLabel'), icon: <Code size={13} />, onClick: onCreateSP }
  ]
}

// ─── Stored procedure node ───────────────────────────────────────────────────

export function buildStoredProcedureMenuItems(
  t: TFunc,
  scripts: ScriptCallbacks,
  onEdit: () => void
): MenuItem[] {
  return [
    { id: 'edit-stored-procedure', label: t('explorer.manageStoredProcedures.editContextMenuLabel'), icon: <Code size={13} />, onClick: onEdit },
    { id: 'sep-sp-script', separator: true },
    {
      id: 'sp-script',
      label: 'Script...',
      icon: <ScrollText size={13} />,
      items: [
        { id: 'sp-script-create', label: 'Create', onClick: scripts.onScriptCreate },
        { id: 'sp-script-update', label: 'Update', onClick: scripts.onScriptAlter },
        { id: 'sp-script-drop', label: 'Delete', onClick: scripts.onScriptDrop }
      ]
    }
  ]
}

// ─── Type folders & nodes ────────────────────────────────────────────────────

export function buildTypeFolderMenuItems(
  _t: TFunc,
  refreshLabel: string,
  createLabel: string,
  onRefresh: () => void,
  onCreate: () => void
): MenuItem[] {
  return [
    { id: 'refresh-types', label: refreshLabel, icon: <RefreshCw size={13} />, onClick: onRefresh },
    { id: 'create-type', label: createLabel, icon: <Tag size={13} />, onClick: onCreate }
  ]
}

export function buildTypeNodeMenuItems(
  editLabel: string,
  onEdit: () => void
): MenuItem[] {
  return [{ id: 'edit-type', label: editLabel, icon: <Tag size={13} />, onClick: onEdit }]
}

// ─── Key / Constraint / Trigger node ────────────────────────────────────────

export function buildKeyNodeMenuItems(
  t: TFunc,
  onEdit: () => void
): MenuItem[] {
  return [{ id: 'edit-foreign-key', label: t('explorer.foreignKeys.editContextMenuLabel', 'Edit Foreign Key'), icon: <Key size={13} />, onClick: onEdit }]
}

export function buildConstraintNodeMenuItems(
  t: TFunc,
  onEdit: () => void
): MenuItem[] {
  return [{ id: 'edit-constraint', label: t('explorer.checkConstraints.editContextMenuLabel', 'Edit Constraint'), icon: <Lock size={13} />, onClick: onEdit }]
}

export function buildTriggerNodeMenuItems(
  t: TFunc,
  onEdit: () => void
): MenuItem[] {
  return [{ id: 'edit-trigger', label: t('explorer.manageTriggers.editContextMenuLabel'), icon: <Bell size={13} />, onClick: onEdit }]
}

// ─── MongoDB collection node ─────────────────────────────────────────────────

export function buildCollectionContextMenuItems(
  onAddDocument: () => void,
  onRename: () => void,
  onDrop: () => void
): MenuItem[] {
  return [
    { id: 'add-document', label: 'Add Document', icon: <Plus size={13} />, onClick: onAddDocument },
    { id: 'sep-crud', separator: true },
    { id: 'rename-collection', label: 'Rename Collection', icon: <Pencil size={13} />, onClick: onRename },
    { id: 'sep-danger', separator: true },
    { id: 'drop-collection', label: 'Drop Collection', icon: <Trash2 size={13} />, onClick: onDrop }
  ]
}

// ─── MongoDB Indexes folder ───────────────────────────────────────────────────

export function buildMongoIndexesFolderContextMenuItems(
  t: TFunc,
  onCreateIndex: () => void,
  onRefresh: () => void
): MenuItem[] {
  return [
    { id: 'create-mongo-index', label: t('explorer.manageMongoIndexes.createContextMenuLabel'), icon: <ListOrdered size={13} />, onClick: onCreateIndex },
    { id: 'sep-refresh', separator: true },
    { id: 'refresh-mongo-indexes', label: t('explorer.manageMongoIndexes.refreshContextMenuLabel'), icon: <RefreshCw size={13} />, onClick: onRefresh }
  ]
}

// ─── MongoDB Index node ───────────────────────────────────────────────────────

export function buildMongoIndexNodeContextMenuItems(
  t: TFunc,
  onEdit: () => void,
  onDrop: () => void,
  isIdIndex: boolean
): MenuItem[] {
  const items: MenuItem[] = [
    { id: 'edit-mongo-index', label: t('explorer.manageMongoIndexes.editContextMenuLabel'), icon: <ListOrdered size={13} />, onClick: onEdit }
  ]
  if (!isIdIndex) {
    items.push(
      { id: 'sep-danger', separator: true },
      { id: 'drop-mongo-index', label: t('explorer.manageMongoIndexes.dropContextMenuLabel'), icon: <Trash2 size={13} />, onClick: onDrop }
    )
  }
  return items
}

// ─── MongoDB Aggregations folder ──────────────────────────────────────────────

export function buildMongoAggregationsFolderContextMenuItems(
  onCreateAggregation: () => void,
  onRefresh: () => void
): MenuItem[] {
  return [
    { id: 'create-mongo-aggregation', label: 'Create Aggregation', icon: <GitMerge size={13} />, onClick: onCreateAggregation },
    { id: 'sep-refresh', separator: true },
    { id: 'refresh-mongo-aggregations', label: 'Refresh', icon: <RefreshCw size={13} />, onClick: onRefresh }
  ]
}

// ─── MongoDB Aggregation node ─────────────────────────────────────────────────

export function buildMongoAggregationNodeContextMenuItems(
  onEdit: () => void,
  onDelete: () => void
): MenuItem[] {
  return [
    { id: 'edit-mongo-aggregation', label: 'Edit Aggregation', icon: <GitMerge size={13} />, onClick: onEdit },
    { id: 'sep-danger', separator: true },
    { id: 'delete-mongo-aggregation', label: 'Delete Aggregation', icon: <Trash2 size={13} />, onClick: onDelete }
  ]
}

// ─── MongoDB Validation node ──────────────────────────────────────────────────

export function buildMongoValidationContextMenuItems(
  onEdit: () => void
): MenuItem[] {
  return [
    { id: 'edit-mongo-validation', label: 'Edit Validation Rules', icon: <ShieldCheck size={13} />, onClick: onEdit }
  ]
}
