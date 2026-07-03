/**
 * DialogManager — centralises all conditional dialog rendering for ExplorerPage.
 * Keeps the main ExplorerPage JSX clean by grouping every dialog import here.
 */
import type React from 'react'
import { Trash2 } from 'lucide-react'
import type { ConnectionRecord } from '../connections.types'
import type { Tab } from '../explorer.types'
import type { TrackedEventType } from '../../Profiler/profiler.types'

import NewConnectionDialog from '../Dialogs/NewConnectionDialog/NewConnectionDialog'
import DuplicateConnectionDialog from '../Dialogs/DuplicateConnectionDialog/DuplicateConnectionDialog'
import EnterPasswordDialog from '../Dialogs/EnterPasswordDialog/EnterPasswordDialog'
import CreateDatabaseDialog from '../Dialogs/CreateDatabaseDialog/CreateDatabaseDialog'
import BackupDatabaseDialog from '../Dialogs/BackupDatabaseDialog/BackupDatabaseDialog'
import RestoreDatabaseDialog from '../Dialogs/RestoreDatabaseDialog/RestoreDatabaseDialog'
import BackupMySqlDatabaseDialog from '../Dialogs/BackupMySqlDatabaseDialog/BackupMySqlDatabaseDialog'
import RestoreMySqlDatabaseDialog from '../Dialogs/RestoreMySqlDatabaseDialog/RestoreMySqlDatabaseDialog'
import BackupPostgresDatabaseDialog from '../Dialogs/BackupPostgresDatabaseDialog/BackupPostgresDatabaseDialog'
import RestorePostgresDatabaseDialog from '../Dialogs/RestorePostgresDatabaseDialog/RestorePostgresDatabaseDialog'
import BackupSqliteDatabaseDialog from '../Dialogs/BackupSqliteDatabaseDialog/BackupSqliteDatabaseDialog'
import RestoreSqliteDatabaseDialog from '../Dialogs/RestoreSqliteDatabaseDialog/RestoreSqliteDatabaseDialog'
import BackupRedisDatabaseDialog from '../Dialogs/BackupRedisDatabaseDialog/BackupRedisDatabaseDialog'
import RestoreRedisDatabaseDialog from '../Dialogs/RestoreRedisDatabaseDialog/RestoreRedisDatabaseDialog'
import BackupMongoDatabaseDialog from '../Dialogs/BackupMongoDatabaseDialog/BackupMongoDatabaseDialog'
import RestoreMongoDatabaseDialog from '../Dialogs/RestoreMongoDatabaseDialog/RestoreMongoDatabaseDialog'
import CreateCollectionDialog from '../Dialogs/CreateCollectionDialog/CreateCollectionDialog'
import MongoDocumentDialog from '../Dialogs/MongoDocumentDialog/MongoDocumentDialog'
import RenameCollectionDialog from '../Dialogs/RenameCollectionDialog/RenameCollectionDialog'
import CreateTableDialog from '../Dialogs/CreateTableDialog/CreateTableDialog'
import ManageForeignKeysDialog from '../Dialogs/ManageForeignKeysDialog/ManageForeignKeysDialog'
import ManageConstraintsDialog from '../Dialogs/ManageConstraintsDialog/ManageConstraintsDialog'
import ManageTriggersDialog from '../Dialogs/ManageTriggersDialog/ManageTriggersDialog'
import ManageIndexesDialog from '../Dialogs/ManageIndexesDialog/ManageIndexesDialog'
import ManageMongoIndexesDialog from '../Dialogs/ManageMongoIndexesDialog/ManageMongoIndexesDialog'
import ManageMongoAggregationsDialog from '../Dialogs/ManageMongoAggregationsDialog/ManageMongoAggregationsDialog'
import CollectionValidationDialog from '../Dialogs/CollectionValidationDialog/CollectionValidationDialog'
import ManageViewsDialog from '../Dialogs/ManageViewsDialog/ManageViewsDialog'
import ManageStoredProceduresDialog from '../Dialogs/ManageStoredProceduresDialog/ManageStoredProceduresDialog'
import ManageDataTypesDialog from '../Dialogs/ManageDataTypesDialog/ManageDataTypesDialog'
import ManageTableTypesDialog from '../Dialogs/ManageTableTypesDialog/ManageTableTypesDialog'
import ManageMemoryOptimizedTableTypesDialog from '../Dialogs/ManageMemoryOptimizedTableTypesDialog/ManageMemoryOptimizedTableTypesDialog'
import ManageServerUsersDialog from '../Dialogs/ManageServerUsersDialog/ManageServerUsersDialog'
import ManageServerRolesDialog from '../Dialogs/ManageServerRolesDialog/ManageServerRolesDialog'
import ManageDatabaseUsersDialog from '../Dialogs/ManageDatabaseUsersDialog/ManageDatabaseUsersDialog'
import ManageMySqlUsersDialog from '../Dialogs/ManageMySqlUsersDialog/ManageMySqlUsersDialog'
import ManageMySqlDatabaseUsersDialog from '../Dialogs/ManageMySqlDatabaseUsersDialog/ManageMySqlDatabaseUsersDialog'
import ManageRedisAclUsersDialog from '../Dialogs/ManageRedisAclUsersDialog/ManageRedisAclUsersDialog'
import ManageMongoUsersDialog from '../Dialogs/ManageMongoUsersDialog/ManageMongoUsersDialog'
import UnsavedChangesDialog from '../Dialogs/UnsavedChangesDialog/UnsavedChangesDialog'
import ConfirmDeleteDialog from '../Dialogs/ConfirmDeleteDialog/ConfirmDeleteDialog'
import ConfirmDialog from '../../../components/ConfirmDialog/ConfirmDialog'
import RecordDialog from '../Dialogs/RecordDialog/RecordDialog'
import ErdExportDialog from '../Dialogs/ErdExportDialog/ErdExportDialog'
import type { ErdExportOptions } from '../Dialogs/ErdExportDialog/ErdExportDialog'
import StartProfilingDialog from '../../Profiler/StartProfilingDialog'
import { useProfilerContext } from '../../../contexts/ProfilerContext'

interface DialogManagerProps {
  // NewConnectionDialog
  isDialogOpen: boolean
  editingConnection: ConnectionRecord | null
  dialogInitialTab: 'details' | 'connectionString' | 'options' | 'users'
  onSaveConnection: (record: Omit<ConnectionRecord, 'id'>) => Promise<void>
  onUpdateConnection: (record: Omit<ConnectionRecord, 'id'>) => Promise<void>
  onCloseDialog: () => void

  // DuplicateConnectionDialog
  duplicateConnectionDialog: ConnectionRecord | null
  onDuplicateConnectionSubmit: (newName: string) => Promise<void>
  onCloseDuplicateConnection: () => void

  // EnterPasswordDialog
  passwordPromptConnection: ConnectionRecord | null
  passwordPromptUsername?: string
  passwordPromptError?: string
  onPasswordPromptConnect: (username: string, password: string, remember: boolean) => Promise<void>
  onPasswordPromptCancel: () => void

  // UnsavedChangesDialog
  unsavedCloseDialog: { tabId: string } | null
  tabs: Tab[]
  onSaveAndClose: (tabId: string) => Promise<void>
  onDiscardAndClose: (tabId: string) => void
  onCancelClose: () => void

  // ConfirmDeleteDialog
  deleteConfirmState: {
    tabId: string
    rsIndex: number
    connectionId: string
    databaseName: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    selectedRows: Record<string, unknown>[]
  } | null
  isDeleting: boolean
  onConfirmDelete: () => void
  onCloseDeleteDialog: () => void

  // RecordDialog
  recordDialogState: {
    mode: 'add' | 'edit'
    connectionId: string
    databaseName: string | undefined
    provider: string
    sourceTable: { schema: string; table: string }
    pkColumns: string[]
    row?: Record<string, unknown>
  } | null
  activeTabId: string | null
  onCloseRecordDialog: () => void
  onRecordSuccess: () => void
  onRecordAddAnother: () => void

  // CreateDatabaseDialog
  createDbDialog: { connectionId: string } | null
  onCreateDatabaseSubmit: (name: string) => Promise<void>
  onCloseCreateDb: () => void

  // Backup / Restore
  backupDialog: { connectionId: string; databaseName: string } | null
  onCloseBackup: () => void
  restoreDialog: { connectionId: string; databaseName: string } | null
  onCloseRestore: () => void
  mySqlBackupDialog: { connectionId: string; databaseName: string } | null
  onCloseMySqlBackup: () => void
  mySqlRestoreDialog: { connectionId: string; databaseName: string } | null
  onCloseMySqlRestore: () => void
  postgresBackupDialog: { connectionId: string; databaseName: string } | null
  onClosePostgresBackup: () => void
  postgresRestoreDialog: { connectionId: string; databaseName: string } | null
  onClosePostgresRestore: () => void
  sqliteBackupDialog: { connectionId: string; databaseName: string } | null
  onCloseSqliteBackup: () => void
  sqliteRestoreDialog: { connectionId: string; databaseName: string } | null
  onCloseSqliteRestore: () => void
  redisBackupDialog: {
    connectionId: string
    scope: { kind: 'database'; databaseIndex: number } | { kind: 'all' }
  } | null
  onCloseRedisBackup: () => void
  redisRestoreDialog: {
    connectionId: string
    scope: { kind: 'database'; databaseIndex: number } | { kind: 'all' }
  } | null
  onCloseRedisRestore: () => void
  mongoBackupDialog: { connectionId: string; databaseName: string } | null
  onCloseMongoBackup: () => void
  mongoRestoreDialog: { connectionId: string; databaseName: string } | null
  onCloseMongoRestore: () => void

  // CreateCollectionDialog
  createCollectionDialog: {
    connectionId: string
    databaseName: string
  } | null
  onCreateCollectionSubmit: (name: string) => Promise<void>
  onCloseCreateCollection: () => void
  // MongoDocumentDialog
  mongoDocumentDialogState: {
    mode: 'add' | 'edit'
    connectionId: string
    databaseName: string
    collectionName: string
    documentJson?: string
  } | null
  onCloseMongoDocumentDialog: () => void
  onMongoDocumentSuccess: () => void
  onMongoDocumentSuccessKeepOpen: () => void

  // DeleteMongoDocumentDialog
  deleteMongoDocumentState: {
    connectionId: string
    databaseName: string
    collectionName: string
    documentJson: string
  } | null
  isDeletingMongoDocument: boolean
  onCloseDeleteMongoDocument: () => void
  onConfirmDeleteMongoDocument: () => Promise<void>

  // RenameCollectionDialog
  renameCollectionDialog: {
    connectionId: string
    databaseName: string
    collectionName: string
  } | null
  onRenameCollectionSubmit: (newName: string) => Promise<void>
  onCloseRenameCollection: () => void

  // CreateTableDialog
  createTableDialog: {
    connectionId: string
    databaseName: string
    provider: ConnectionRecord['provider']
    editTable?: { schema: string; tableName: string }
  } | null
  onCloseCreateTable: () => void
  onCreateTableSuccess: () => void

  // ManageForeignKeysDialog
  manageForeignKeysDialog: {
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialFkName?: string
  } | null
  onCloseForeignKeys: () => void
  onForeignKeysSuccess: () => void

  // ManageConstraintsDialog
  manageConstraintsDialog: {
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialConstraintName?: string
    openAddNew?: boolean
  } | null
  onCloseConstraints: () => void
  onConstraintsSuccess: () => void

  // ManageTriggersDialog
  manageTriggersDialog: {
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialTriggerName?: string
    openOnNew?: boolean
  } | null
  onCloseTriggers: () => void
  onTriggersSuccess: () => void

  // ManageIndexesDialog
  manageIndexesDialog: {
    connectionId: string
    databaseName: string
    schema: string
    tableName: string
    initialIndexName?: string
    openOnNew?: boolean
  } | null
  onCloseIndexes: () => void
  onIndexesSuccess: () => void

  // ManageMongoIndexesDialog
  manageMongoIndexesDialog: {
    connectionId: string
    databaseName: string
    collectionName: string
    initialIndexName?: string
    openOnNew?: boolean
  } | null
  onCloseMongoIndexes: () => void
  onMongoIndexesSuccess: () => void

  // ManageMongoAggregationsDialog
  manageMongoAggregationsDialog: {
    connectionId: string
    databaseName: string
    collectionName: string
    initialAggregationId?: string
    openOnNew?: boolean
  } | null
  onCloseMongoAggregations: () => void
  onMongoAggregationsSuccess: () => void

  // CollectionValidationDialog
  collectionValidationDialog: {
    connectionId: string
    databaseName: string
    collectionName: string
  } | null
  onCloseCollectionValidation: () => void

  // ErdExportDialog
  isExportDialogOpen: boolean
  activeTab: Tab | undefined
  onConfirmExport: (opts: ErdExportOptions) => void
  onCancelExport: () => void

  // StartProfilingDialog
  profilerDialog: {
    connectionId: string
    connectionName: string
    databaseName: string
  } | null
  onCloseProfiler: () => void

  // ManageViewsDialog
  manageViewsDialog: {
    connectionId: string
    databaseName: string
    initialViewName?: string
    openOnNew?: boolean
  } | null
  onCloseViews: () => void
  onViewsSuccess: () => void

  // ManageStoredProceduresDialog
  manageStoredProceduresDialog: {
    connectionId: string
    databaseName: string
    initialProcedureName?: string
    openOnNew?: boolean
  } | null
  onCloseStoredProcedures: () => void
  onStoredProceduresSuccess: () => void

  // ManageDataTypesDialog
  manageDataTypesDialog: {
    connectionId: string
    databaseName: string
    initialTypeName?: string
    openOnNew?: boolean
  } | null
  onCloseDataTypes: () => void
  onDataTypesSuccess: () => void

  // ManageTableTypesDialog
  manageTableTypesDialog: {
    connectionId: string
    databaseName: string
    initialTypeName?: string
    openOnNew?: boolean
  } | null
  onCloseTableTypes: () => void
  onTableTypesSuccess: () => void

  // ManageMemoryOptimizedTableTypesDialog
  manageMemoryOptimizedTableTypesDialog: {
    connectionId: string
    databaseName: string
    initialTypeName?: string
    openOnNew?: boolean
  } | null
  onCloseMemoryOptimizedTableTypes: () => void
  onMemoryOptimizedTableTypesSuccess: () => void

  // ManageServerUsersDialog
  manageServerUsersDialog: {
    connectionId: string
    initialLoginName?: string
    openOnNew?: boolean
  } | null
  onCloseServerUsers: () => void
  onServerUsersSuccess: () => void

  // ManageServerRolesDialog
  manageServerRolesDialog: {
    connectionId: string
    initialRoleName?: string
    openOnNew?: boolean
  } | null
  onCloseServerRoles: () => void
  onServerRolesSuccess: () => void

  // ManageDatabaseUsersDialog
  manageDatabaseUsersDialog: {
    connectionId: string
    databaseName: string
    initialUserName?: string
    openOnNew?: boolean
  } | null
  onCloseDatabaseUsers: () => void
  onDatabaseUsersSuccess: () => void

  // ManageMySqlUsersDialog
  manageMySqlUsersDialog: {
    connectionId: string
    initialUserKey?: string
    openOnNew?: boolean
  } | null
  onCloseMySqlUsers: () => void
  onMySqlUsersSuccess: () => void

  // ManageMySqlDatabaseUsersDialog
  manageMySqlDatabaseUsersDialog: {
    connectionId: string
    databaseName: string
    initialUserKey?: string
  } | null
  onCloseMySqlDatabaseUsers: () => void
  onMySqlDatabaseUsersSuccess: () => void

  // ManageRedisAclUsersDialog
  manageRedisAclUsersDialog: {
    connectionId: string
    initialUsername?: string
    openOnNew?: boolean
  } | null
  onCloseRedisAclUsers: () => void
  onRedisAclUsersSuccess: () => void

  // ManageMongoUsersDialog
  manageMongoUsersDialog: {
    connectionId: string
    initialUsername?: string
    openOnNew?: boolean
  } | null
  onCloseMongoUsers: () => void
  onMongoUsersSuccess: () => void
}

export default function DialogManager({
  isDialogOpen,
  editingConnection,
  dialogInitialTab,
  onSaveConnection,
  onUpdateConnection,
  onCloseDialog,
  duplicateConnectionDialog,
  onDuplicateConnectionSubmit,
  onCloseDuplicateConnection,
  passwordPromptConnection,
  passwordPromptUsername,
  passwordPromptError,
  onPasswordPromptConnect,
  onPasswordPromptCancel,
  unsavedCloseDialog,
  tabs,
  onSaveAndClose,
  onDiscardAndClose,
  onCancelClose,
  deleteConfirmState,
  isDeleting,
  onConfirmDelete,
  onCloseDeleteDialog,
  recordDialogState,
  onCloseRecordDialog,
  onRecordSuccess,
  onRecordAddAnother,
  createDbDialog,
  onCreateDatabaseSubmit,
  onCloseCreateDb,
  backupDialog,
  onCloseBackup,
  restoreDialog,
  onCloseRestore,
  mySqlBackupDialog,
  onCloseMySqlBackup,
  mySqlRestoreDialog,
  onCloseMySqlRestore,
  postgresBackupDialog,
  onClosePostgresBackup,
  postgresRestoreDialog,
  onClosePostgresRestore,
  sqliteBackupDialog,
  onCloseSqliteBackup,
  sqliteRestoreDialog,
  onCloseSqliteRestore,
  redisBackupDialog,
  onCloseRedisBackup,
  redisRestoreDialog,
  onCloseRedisRestore,
  mongoBackupDialog,
  onCloseMongoBackup,
  mongoRestoreDialog,
  onCloseMongoRestore,
  createCollectionDialog,
  onCreateCollectionSubmit,
  onCloseCreateCollection,
  mongoDocumentDialogState,
  onCloseMongoDocumentDialog,
  onMongoDocumentSuccess,
  onMongoDocumentSuccessKeepOpen,
  deleteMongoDocumentState,
  isDeletingMongoDocument,
  onCloseDeleteMongoDocument,
  onConfirmDeleteMongoDocument,
  renameCollectionDialog,
  onRenameCollectionSubmit,
  onCloseRenameCollection,
  createTableDialog,
  onCloseCreateTable,
  onCreateTableSuccess,
  manageForeignKeysDialog,
  onCloseForeignKeys,
  onForeignKeysSuccess,
  manageConstraintsDialog,
  onCloseConstraints,
  onConstraintsSuccess,
  manageTriggersDialog,
  onCloseTriggers,
  onTriggersSuccess,
  manageIndexesDialog,
  onCloseIndexes,
  onIndexesSuccess,
  manageMongoIndexesDialog,
  onCloseMongoIndexes,
  onMongoIndexesSuccess,
  manageMongoAggregationsDialog,
  onCloseMongoAggregations,
  onMongoAggregationsSuccess,
  collectionValidationDialog,
  onCloseCollectionValidation,
  isExportDialogOpen,
  activeTab,
  onConfirmExport,
  onCancelExport,
  profilerDialog,
  onCloseProfiler,
  manageViewsDialog,
  onCloseViews,
  onViewsSuccess,
  manageStoredProceduresDialog,
  onCloseStoredProcedures,
  onStoredProceduresSuccess,
  manageDataTypesDialog,
  onCloseDataTypes,
  onDataTypesSuccess,
  manageTableTypesDialog,
  onCloseTableTypes,
  onTableTypesSuccess,
  manageMemoryOptimizedTableTypesDialog,
  onCloseMemoryOptimizedTableTypes,
  onMemoryOptimizedTableTypesSuccess,
  manageServerUsersDialog,
  onCloseServerUsers,
  onServerUsersSuccess,
  manageServerRolesDialog,
  onCloseServerRoles,
  onServerRolesSuccess,
  manageDatabaseUsersDialog,
  onCloseDatabaseUsers,
  onDatabaseUsersSuccess,
  manageMySqlUsersDialog,
  onCloseMySqlUsers,
  onMySqlUsersSuccess,
  manageMySqlDatabaseUsersDialog,
  onCloseMySqlDatabaseUsers,
  onMySqlDatabaseUsersSuccess,
  manageRedisAclUsersDialog,
  onCloseRedisAclUsers,
  onRedisAclUsersSuccess,
  manageMongoUsersDialog,
  onCloseMongoUsers,
  onMongoUsersSuccess
}: DialogManagerProps): React.JSX.Element {
  const { activateSession } = useProfilerContext()

  return (
    <>
      {isDialogOpen && (
        <NewConnectionDialog
          onSave={editingConnection ? onUpdateConnection : onSaveConnection}
          onCancel={onCloseDialog}
          initialValues={editingConnection ?? undefined}
          initialTab={dialogInitialTab}
        />
      )}

      {duplicateConnectionDialog && (
        <DuplicateConnectionDialog
          initialName={`${duplicateConnectionDialog.name} - Copy`}
          onSubmit={onDuplicateConnectionSubmit}
          onClose={onCloseDuplicateConnection}
        />
      )}

      {passwordPromptConnection && (
        <EnterPasswordDialog
          connection={passwordPromptConnection}
          initialUsername={passwordPromptUsername}
          initialError={passwordPromptError}
          onConnect={onPasswordPromptConnect}
          onCancel={onPasswordPromptCancel}
        />
      )}

      {unsavedCloseDialog && (() => {
        const tab = tabs.find((t) => t.id === unsavedCloseDialog.tabId)
        const fileName = tab?.title ?? 'Untitled'
        return (
          <UnsavedChangesDialog
            fileName={fileName}
            onSave={() => { void onSaveAndClose(unsavedCloseDialog.tabId) }}
            onDiscard={() => onDiscardAndClose(unsavedCloseDialog.tabId)}
            onCancel={onCancelClose}
          />
        )
      })()}

      {deleteConfirmState && (
        <ConfirmDeleteDialog
          rowCount={deleteConfirmState.selectedRows.length}
          tableName={`[${deleteConfirmState.sourceTable.schema}].[${deleteConfirmState.sourceTable.table}]`}
          isDeleting={isDeleting}
          onConfirm={onConfirmDelete}
          onClose={onCloseDeleteDialog}
        />
      )}

      {recordDialogState && (
        <RecordDialog
          mode={recordDialogState.mode}
          connectionId={recordDialogState.connectionId}
          databaseName={recordDialogState.databaseName}
          provider={recordDialogState.provider}
          sourceTable={recordDialogState.sourceTable}
          pkColumns={recordDialogState.pkColumns}
          row={recordDialogState.row}
          onClose={onCloseRecordDialog}
          onSuccess={onRecordSuccess}
          onAddAnotherSuccess={onRecordAddAnother}
        />
      )}

      {createDbDialog && (
        <CreateDatabaseDialog
          onSubmit={onCreateDatabaseSubmit}
          onClose={onCloseCreateDb}
        />
      )}

      {backupDialog && (
        <BackupDatabaseDialog
          connectionId={backupDialog.connectionId}
          databaseName={backupDialog.databaseName}
          onClose={onCloseBackup}
        />
      )}

      {restoreDialog && (
        <RestoreDatabaseDialog
          connectionId={restoreDialog.connectionId}
          databaseName={restoreDialog.databaseName}
          onClose={onCloseRestore}
        />
      )}

      {mySqlBackupDialog && (
        <BackupMySqlDatabaseDialog
          connectionId={mySqlBackupDialog.connectionId}
          databaseName={mySqlBackupDialog.databaseName}
          onClose={onCloseMySqlBackup}
        />
      )}

      {mySqlRestoreDialog && (
        <RestoreMySqlDatabaseDialog
          connectionId={mySqlRestoreDialog.connectionId}
          databaseName={mySqlRestoreDialog.databaseName}
          onClose={onCloseMySqlRestore}
        />
      )}

      {postgresBackupDialog && (
        <BackupPostgresDatabaseDialog
          connectionId={postgresBackupDialog.connectionId}
          databaseName={postgresBackupDialog.databaseName}
          onClose={onClosePostgresBackup}
        />
      )}

      {postgresRestoreDialog && (
        <RestorePostgresDatabaseDialog
          connectionId={postgresRestoreDialog.connectionId}
          databaseName={postgresRestoreDialog.databaseName}
          onClose={onClosePostgresRestore}
        />
      )}

      {sqliteBackupDialog && (
        <BackupSqliteDatabaseDialog
          connectionId={sqliteBackupDialog.connectionId}
          databaseName={sqliteBackupDialog.databaseName}
          onClose={onCloseSqliteBackup}
        />
      )}

      {sqliteRestoreDialog && (
        <RestoreSqliteDatabaseDialog
          connectionId={sqliteRestoreDialog.connectionId}
          databaseName={sqliteRestoreDialog.databaseName}
          onClose={onCloseSqliteRestore}
        />
      )}

      {redisBackupDialog && (
        <BackupRedisDatabaseDialog
          connectionId={redisBackupDialog.connectionId}
          scope={redisBackupDialog.scope}
          onClose={onCloseRedisBackup}
        />
      )}

      {redisRestoreDialog && (
        <RestoreRedisDatabaseDialog
          connectionId={redisRestoreDialog.connectionId}
          scope={redisRestoreDialog.scope}
          onClose={onCloseRedisRestore}
        />
      )}

      {mongoBackupDialog && (
        <BackupMongoDatabaseDialog
          connectionId={mongoBackupDialog.connectionId}
          databaseName={mongoBackupDialog.databaseName}
          onClose={onCloseMongoBackup}
        />
      )}

      {mongoRestoreDialog && (
        <RestoreMongoDatabaseDialog
          connectionId={mongoRestoreDialog.connectionId}
          databaseName={mongoRestoreDialog.databaseName}
          onClose={onCloseMongoRestore}
        />
      )}

      {createCollectionDialog && (
        <CreateCollectionDialog
          onSubmit={onCreateCollectionSubmit}
          onClose={onCloseCreateCollection}
        />
      )}

      {renameCollectionDialog && (
        <RenameCollectionDialog
          currentName={renameCollectionDialog.collectionName}
          onSubmit={onRenameCollectionSubmit}
          onClose={onCloseRenameCollection}
        />
      )}

      {createTableDialog && (
        <CreateTableDialog
          connectionId={createTableDialog.connectionId}
          databaseName={createTableDialog.databaseName}
          provider={createTableDialog.provider}
          editTable={createTableDialog.editTable}
          onClose={onCloseCreateTable}
          onSuccess={onCreateTableSuccess}
        />
      )}

      {manageForeignKeysDialog && (
        <ManageForeignKeysDialog
          connectionId={manageForeignKeysDialog.connectionId}
          databaseName={manageForeignKeysDialog.databaseName}
          schema={manageForeignKeysDialog.schema}
          tableName={manageForeignKeysDialog.tableName}
          initialFkName={manageForeignKeysDialog.initialFkName}
          onClose={onCloseForeignKeys}
          onSuccess={onForeignKeysSuccess}
        />
      )}

      {manageConstraintsDialog && (
        <ManageConstraintsDialog
          connectionId={manageConstraintsDialog.connectionId}
          databaseName={manageConstraintsDialog.databaseName}
          schema={manageConstraintsDialog.schema}
          tableName={manageConstraintsDialog.tableName}
          initialConstraintName={manageConstraintsDialog.initialConstraintName}
          openAddNew={manageConstraintsDialog.openAddNew}
          onClose={onCloseConstraints}
          onSuccess={onConstraintsSuccess}
        />
      )}

      {manageTriggersDialog && (
        <ManageTriggersDialog
          connectionId={manageTriggersDialog.connectionId}
          databaseName={manageTriggersDialog.databaseName}
          schema={manageTriggersDialog.schema}
          tableName={manageTriggersDialog.tableName}
          initialTriggerName={manageTriggersDialog.initialTriggerName}
          openOnNew={manageTriggersDialog.openOnNew}
          onClose={onCloseTriggers}
          onSuccess={onTriggersSuccess}
        />
      )}

      {manageIndexesDialog && (
        <ManageIndexesDialog
          connectionId={manageIndexesDialog.connectionId}
          databaseName={manageIndexesDialog.databaseName}
          schema={manageIndexesDialog.schema}
          tableName={manageIndexesDialog.tableName}
          initialIndexName={manageIndexesDialog.initialIndexName}
          openOnNew={manageIndexesDialog.openOnNew}
          onClose={onCloseIndexes}
          onSuccess={onIndexesSuccess}
        />
      )}

      {manageMongoIndexesDialog && (
        <ManageMongoIndexesDialog
          connectionId={manageMongoIndexesDialog.connectionId}
          databaseName={manageMongoIndexesDialog.databaseName}
          collectionName={manageMongoIndexesDialog.collectionName}
          initialIndexName={manageMongoIndexesDialog.initialIndexName}
          openOnNew={manageMongoIndexesDialog.openOnNew}
          onClose={onCloseMongoIndexes}
          onSuccess={onMongoIndexesSuccess}
        />
      )}

      {isExportDialogOpen && activeTab?.kind === 'erd' && (
        <ErdExportDialog
          open={isExportDialogOpen}
          databaseName={activeTab.databaseName}
          currentGrid={activeTab.background}
          onConfirm={onConfirmExport}
          onCancel={onCancelExport}
        />
      )}

      {profilerDialog && (
        <StartProfilingDialog
          connectionName={profilerDialog.connectionName}
          databaseName={profilerDialog.databaseName}
          onStart={(trackedEvents: TrackedEventType[]) => {
            void activateSession({
              connectionId: profilerDialog.connectionId,
              connectionName: profilerDialog.connectionName,
              databaseName: profilerDialog.databaseName,
              trackedEvents,
              intervalMs: 500
            })
            onCloseProfiler()
          }}
          onClose={onCloseProfiler}
        />
      )}

      {manageViewsDialog && (
        <ManageViewsDialog
          connectionId={manageViewsDialog.connectionId}
          databaseName={manageViewsDialog.databaseName}
          initialViewName={manageViewsDialog.initialViewName}
          openOnNew={manageViewsDialog.openOnNew}
          onClose={onCloseViews}
          onSuccess={onViewsSuccess}
        />
      )}

      {manageStoredProceduresDialog && (
        <ManageStoredProceduresDialog
          connectionId={manageStoredProceduresDialog.connectionId}
          databaseName={manageStoredProceduresDialog.databaseName}
          initialProcedureName={manageStoredProceduresDialog.initialProcedureName}
          openOnNew={manageStoredProceduresDialog.openOnNew}
          onClose={onCloseStoredProcedures}
          onSuccess={onStoredProceduresSuccess}
        />
      )}

      {manageDataTypesDialog && (
        <ManageDataTypesDialog
          connectionId={manageDataTypesDialog.connectionId}
          databaseName={manageDataTypesDialog.databaseName}
          initialTypeName={manageDataTypesDialog.initialTypeName}
          openOnNew={manageDataTypesDialog.openOnNew}
          onClose={onCloseDataTypes}
          onSuccess={onDataTypesSuccess}
        />
      )}

      {manageTableTypesDialog && (
        <ManageTableTypesDialog
          connectionId={manageTableTypesDialog.connectionId}
          databaseName={manageTableTypesDialog.databaseName}
          initialTypeName={manageTableTypesDialog.initialTypeName}
          openOnNew={manageTableTypesDialog.openOnNew}
          onClose={onCloseTableTypes}
          onSuccess={onTableTypesSuccess}
        />
      )}

      {manageMemoryOptimizedTableTypesDialog && (
        <ManageMemoryOptimizedTableTypesDialog
          connectionId={manageMemoryOptimizedTableTypesDialog.connectionId}
          databaseName={manageMemoryOptimizedTableTypesDialog.databaseName}
          initialTypeName={manageMemoryOptimizedTableTypesDialog.initialTypeName}
          openOnNew={manageMemoryOptimizedTableTypesDialog.openOnNew}
          onClose={onCloseMemoryOptimizedTableTypes}
          onSuccess={onMemoryOptimizedTableTypesSuccess}
        />
      )}

      {mongoDocumentDialogState && (
        <MongoDocumentDialog
          mode={mongoDocumentDialogState.mode}
          connectionId={mongoDocumentDialogState.connectionId}
          databaseName={mongoDocumentDialogState.databaseName}
          collectionName={mongoDocumentDialogState.collectionName}
          documentJson={mongoDocumentDialogState.documentJson}
          onClose={onCloseMongoDocumentDialog}
          onSuccess={onMongoDocumentSuccess}
          onSuccessKeepOpen={onMongoDocumentSuccessKeepOpen}
        />
      )}

      {manageMongoAggregationsDialog && (
        <ManageMongoAggregationsDialog
          connectionId={manageMongoAggregationsDialog.connectionId}
          databaseName={manageMongoAggregationsDialog.databaseName}
          collectionName={manageMongoAggregationsDialog.collectionName}
          initialAggregationId={manageMongoAggregationsDialog.initialAggregationId}
          openOnNew={manageMongoAggregationsDialog.openOnNew}
          onClose={onCloseMongoAggregations}
          onSuccess={onMongoAggregationsSuccess}
        />
      )}

      {collectionValidationDialog && (
        <CollectionValidationDialog
          connectionId={collectionValidationDialog.connectionId}
          databaseName={collectionValidationDialog.databaseName}
          collectionName={collectionValidationDialog.collectionName}
          onClose={onCloseCollectionValidation}
        />
      )}

      {manageServerUsersDialog && (
        <ManageServerUsersDialog
          connectionId={manageServerUsersDialog.connectionId}
          initialLoginName={manageServerUsersDialog.initialLoginName}
          openOnNew={manageServerUsersDialog.openOnNew}
          onClose={onCloseServerUsers}
          onSuccess={onServerUsersSuccess}
        />
      )}

      {manageServerRolesDialog && (
        <ManageServerRolesDialog
          connectionId={manageServerRolesDialog.connectionId}
          initialRoleName={manageServerRolesDialog.initialRoleName}
          openOnNew={manageServerRolesDialog.openOnNew}
          onClose={onCloseServerRoles}
          onSuccess={onServerRolesSuccess}
        />
      )}

      {manageDatabaseUsersDialog && (
        <ManageDatabaseUsersDialog
          connectionId={manageDatabaseUsersDialog.connectionId}
          databaseName={manageDatabaseUsersDialog.databaseName}
          initialUserName={manageDatabaseUsersDialog.initialUserName}
          openOnNew={manageDatabaseUsersDialog.openOnNew}
          onClose={onCloseDatabaseUsers}
          onSuccess={onDatabaseUsersSuccess}
        />
      )}

      {manageMySqlUsersDialog && (
        <ManageMySqlUsersDialog
          connectionId={manageMySqlUsersDialog.connectionId}
          initialUserKey={manageMySqlUsersDialog.initialUserKey}
          openOnNew={manageMySqlUsersDialog.openOnNew}
          onClose={onCloseMySqlUsers}
          onSuccess={onMySqlUsersSuccess}
        />
      )}

      {manageMySqlDatabaseUsersDialog && (
        <ManageMySqlDatabaseUsersDialog
          connectionId={manageMySqlDatabaseUsersDialog.connectionId}
          databaseName={manageMySqlDatabaseUsersDialog.databaseName}
          initialUserKey={manageMySqlDatabaseUsersDialog.initialUserKey}
          onClose={onCloseMySqlDatabaseUsers}
          onSuccess={onMySqlDatabaseUsersSuccess}
        />
      )}

      {manageRedisAclUsersDialog && (
        <ManageRedisAclUsersDialog
          connectionId={manageRedisAclUsersDialog.connectionId}
          initialUsername={manageRedisAclUsersDialog.initialUsername}
          openOnNew={manageRedisAclUsersDialog.openOnNew}
          onClose={onCloseRedisAclUsers}
          onSuccess={onRedisAclUsersSuccess}
        />
      )}

      {manageMongoUsersDialog && (
        <ManageMongoUsersDialog
          connectionId={manageMongoUsersDialog.connectionId}
          initialUsername={manageMongoUsersDialog.initialUsername}
          openOnNew={manageMongoUsersDialog.openOnNew}
          onClose={onCloseMongoUsers}
          onSuccess={onMongoUsersSuccess}
        />
      )}

      {deleteMongoDocumentState && (
        <ConfirmDialog
          title={`Delete Document — ${deleteMongoDocumentState.collectionName}`}
          message="Delete this document permanently? This action cannot be undone."
          icon={<Trash2 size={16} />}
          iconColor="var(--color-danger, #ff6b6b)"
          variant="danger"
          confirmLabel={isDeletingMongoDocument ? 'Deleting…' : 'Delete Document'}
          onConfirm={() => { void onConfirmDeleteMongoDocument() }}
          onClose={onCloseDeleteMongoDocument}
        />
      )}
    </>
  )
}
