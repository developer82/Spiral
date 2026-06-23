export type TrackedEventType =
  | 'sql-statement'
  | 'blocked-query'
  | 'session-login'
  | 'session-logout'
  | 'error'

export interface ProfilerEvent {
  id: string
  timestamp: string // ISO string
  type: TrackedEventType
  sessionId: number
  sqlText?: string
  durationMs?: number
  cpuTime?: number
  reads?: number
  writes?: number
  rowCount?: number
  waitType?: string
  waitTimeMs?: number
  loginName?: string
  hostName?: string
  programName?: string
  blockingSessionId?: number
  status?: string
  command?: string
}

export interface ProfilerSessionConfig {
  connectionId: string
  connectionName: string
  databaseName: string
  trackedEvents: TrackedEventType[]
  intervalMs: number
}
