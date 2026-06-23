export const CONNECTIONS_UPDATED_EVENT = 'connections:updated'

export function dispatchConnectionsUpdated(): void {
  window.dispatchEvent(new CustomEvent(CONNECTIONS_UPDATED_EVENT))
}

export const EXPLORER_OPEN_SCRIPT_EVENT = 'explorer:open-script'

export interface ExplorerOpenScriptDetail {
  title: string
  content: string
  connectionId: string
  databaseName: string
}

export function dispatchExplorerOpenScript(detail: ExplorerOpenScriptDetail): void {
  window.dispatchEvent(new CustomEvent(EXPLORER_OPEN_SCRIPT_EVENT, { detail }))
}

export const COMPARISONS_UPDATED_EVENT = 'comparisons:updated'

export function dispatchComparisonsUpdated(): void {
  window.dispatchEvent(new CustomEvent(COMPARISONS_UPDATED_EVENT))
}

export const EXPLORER_REFRESH_DATABASE_EVENT = 'explorer:refresh-database'

export interface ExplorerRefreshDatabaseDetail {
  connectionId: string
  databaseName: string
}

export function dispatchExplorerRefreshDatabase(detail: ExplorerRefreshDatabaseDetail): void {
  window.dispatchEvent(new CustomEvent(EXPLORER_REFRESH_DATABASE_EVENT, { detail }))
}
