import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { databaseManager } from '../database/DatabaseManager'

export type TrackedEventType =
  | 'sql-statement'
  | 'blocked-query'
  | 'session-login'
  | 'session-logout'
  | 'error'

export interface ProfilerEvent {
  id: string
  timestamp: string
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

interface RawRequest {
  session_id: number
  start_time_iso: string
  status: string
  command: string
  wait_type: string
  wait_time: number
  blocking_session_id: number
  cpu_time: number
  reads: number
  writes: number
  row_count: number
  login_name: string
  host_name: string
  program_name: string
  sql_text: string
}

interface RawSession {
  session_id: number
  login_name: string
  host_name: string
  program_name: string
  login_time_iso: string
}

interface RawCompletedStatement {
  last_execution_time_iso: string
  elapsed_ms: number
  cpu_ms: number
  logical_reads: number
  logical_writes: number
  plan_handle_hex: string
  stmt_start: number
  stmt_end: number
  sql_text: string
}

interface RawServerTime {
  server_now: string
}

/** SQL Server error numbers that indicate a missing permission. */
const PERMISSION_ERROR_NUMBERS = new Set([229, 230, 297, 300])

function isPermissionError(err: unknown): boolean {
  if (err instanceof Error) {
    const mssqlErr = err as { number?: number }
    if (mssqlErr.number !== undefined && PERMISSION_ERROR_NUMBERS.has(mssqlErr.number)) return true
    if (err.message.toLowerCase().includes('permission')) return true
  }
  return false
}

class ProfilerSession {
  readonly id: string
  private readonly config: ProfilerSessionConfig
  private readonly webContents: WebContents
  private readonly onFatalError: (sessionId: string) => void
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private paused = false

  /** key = `${session_id}:${start_time_iso}` → event id emitted */
  private readonly activeRequests = new Map<string, { eventId: string; startTime: Date }>()
  /** Set of session_ids currently known */
  private knownSessionIds = new Set<number>()
  private initialized = false
  /** Server-side time cursor for query-stats polling (format 126, no TZ) */
  private lastQueryStatsMaxTime: string | null = null
  /** Keys seen via query-stats to deduplicate within the stats poll */
  private readonly seenCompletedKeys = new Set<string>()

  constructor(
    config: ProfilerSessionConfig,
    webContents: WebContents,
    onFatalError: (sessionId: string) => void
  ) {
    this.id = randomUUID()
    this.config = config
    this.webContents = webContents
    this.onFatalError = onFatalError
  }

  private handleFatalError(message: string): void {
    this.stop()
    if (!this.webContents.isDestroyed()) {
      this.webContents.send('profiler:error', { sessionId: this.id, message })
    }
    this.onFatalError(this.id)
  }

  /** Validate and sanitize database name to prevent SQL injection. */
  private sanitizeDatabaseName(name: string): string {
    if (/['"[\];]/.test(name)) {
      throw new Error(`Invalid database name for profiling: "${name}"`)
    }
    return name
  }

  async start(): Promise<void> {
    // Seed the stats time cursor from the server so we use server-local time
    // and avoid any client/server timezone mismatch.
    try {
      const rows = await databaseManager.executeMonitoringQuery<RawServerTime>(
        this.config.connectionId,
        `/* spiral_monitor */ SELECT CONVERT(varchar(30), GETDATE(), 126) AS server_now`
      )
      if (rows.length > 0) this.lastQueryStatsMaxTime = rows[0].server_now
    } catch {
      // If seed fails, fall back to a small lookback window on the first poll
    }
    this.intervalHandle = setInterval(() => void this.poll(), this.config.intervalMs)
    void this.poll()
  }

  pause(): void {
    this.paused = true
  }

  resume(): void {
    this.paused = false
  }

  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private emit(event: ProfilerEvent): void {
    if (!this.webContents.isDestroyed()) {
      this.webContents.send('profiler:event', { sessionId: this.id, event })
    }
  }

  private emitUpdate(eventId: string, updates: Partial<ProfilerEvent>): void {
    if (!this.webContents.isDestroyed()) {
      this.webContents.send('profiler:event-update', { sessionId: this.id, eventId, updates })
    }
  }

  private async poll(): Promise<void> {
    if (this.paused) return

    const db = this.sanitizeDatabaseName(this.config.databaseName)

    await Promise.allSettled([
      this.pollRequests(db),
      this.pollCompletedStatements(db),
      this.pollSessions(db)
    ])
  }

  private async pollRequests(db: string): Promise<void> {
    if (!this.config.trackedEvents.includes('sql-statement') &&
        !this.config.trackedEvents.includes('blocked-query') &&
        !this.config.trackedEvents.includes('error')) {
      return
    }

    let rows: RawRequest[]
    try {
      rows = await databaseManager.executeMonitoringQuery<RawRequest>(
        this.config.connectionId,
        `/* spiral_monitor */
         SELECT
           r.session_id,
           CONVERT(varchar(30), r.start_time, 126) AS start_time_iso,
           r.status,
           r.command,
           ISNULL(r.wait_type, '') AS wait_type,
           r.wait_time,
           ISNULL(r.blocking_session_id, 0) AS blocking_session_id,
           r.cpu_time,
           r.reads,
           r.writes,
           r.row_count,
           ISNULL(s.login_name, '') AS login_name,
           ISNULL(s.host_name, '') AS host_name,
           ISNULL(s.program_name, '') AS program_name,
           ISNULL(SUBSTRING(t.text, 1, 4000), '') AS sql_text
         FROM sys.dm_exec_requests r
         INNER JOIN sys.dm_exec_sessions s ON r.session_id = s.session_id
         OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) t
         WHERE r.session_id <> @@SPID
           AND r.database_id = DB_ID(N'${db}')
           AND s.is_user_process = 1
           AND (t.text IS NULL OR t.text NOT LIKE N'%spiral_monitor%')`
      )
    } catch (err) {
      if (isPermissionError(err)) {
        this.handleFatalError((err as Error).message)
      } else {
        console.error('[Profiler] pollRequests error:', err)
      }
      return
    }

    const now = new Date()
    const currentKeys = new Set<string>()

    for (const row of rows) {
      const key = `${row.session_id}:${row.start_time_iso}`
      currentKeys.add(key)

      if (this.activeRequests.has(key)) continue

      // Determine event type
      let type: TrackedEventType
      if (row.blocking_session_id > 0) {
        type = 'blocked-query'
      } else if (row.command === 'ROLLBACK') {
        type = 'error'
      } else {
        type = 'sql-statement'
      }

      if (!this.config.trackedEvents.includes(type)) continue

      const eventId = randomUUID()
      this.activeRequests.set(key, { eventId, startTime: new Date(row.start_time_iso) })

      this.emit({
        id: eventId,
        timestamp: row.start_time_iso,
        type,
        sessionId: row.session_id,
        sqlText: row.sql_text,
        cpuTime: row.cpu_time,
        reads: row.reads,
        writes: row.writes,
        rowCount: row.row_count,
        waitType: row.wait_type || undefined,
        waitTimeMs: row.wait_time || undefined,
        loginName: row.login_name || undefined,
        hostName: row.host_name || undefined,
        programName: row.program_name || undefined,
        blockingSessionId: row.blocking_session_id > 0 ? row.blocking_session_id : undefined,
        status: row.status,
        command: row.command
      })
    }

    // Requests that have disappeared have completed — emit final update
    for (const [key, { eventId, startTime }] of this.activeRequests) {
      if (!currentKeys.has(key)) {
        this.activeRequests.delete(key)
        const durationMs = now.getTime() - startTime.getTime()
        this.emitUpdate(eventId, { durationMs, status: 'completed' })
      }
    }

    this.initialized = true
  }

  /**
   * Poll sys.dm_exec_query_stats for statements that completed since the last
   * cursor time.  This captures fast queries (< polling interval) that never
   * appear in sys.dm_exec_requests.
   */
  private async pollCompletedStatements(db: string): Promise<void> {
    if (!this.config.trackedEvents.includes('sql-statement') &&
        !this.config.trackedEvents.includes('blocked-query') &&
        !this.config.trackedEvents.includes('error')) {
      return
    }

    // Time filter: use cursor if set, otherwise fall back to a 2-interval lookback
    const timeFilter = this.lastQueryStatsMaxTime
      ? `qs.last_execution_time > CONVERT(datetime, '${this.lastQueryStatsMaxTime}', 126)`
      : `qs.last_execution_time >= DATEADD(millisecond, -${this.config.intervalMs * 2}, GETDATE())`

    let rows: RawCompletedStatement[]
    try {
      rows = await databaseManager.executeMonitoringQuery<RawCompletedStatement>(
        this.config.connectionId,
        `/* spiral_monitor */
         SELECT
           CONVERT(varchar(30), qs.last_execution_time, 126) AS last_execution_time_iso,
           qs.last_elapsed_time / 1000 AS elapsed_ms,
           qs.last_worker_time / 1000 AS cpu_ms,
           qs.last_logical_reads AS logical_reads,
           qs.last_logical_writes AS logical_writes,
           0 AS row_count,
           CONVERT(varchar(128), qs.plan_handle, 1) AS plan_handle_hex,
           qs.statement_start_offset AS stmt_start,
           qs.statement_end_offset AS stmt_end,
           ISNULL(SUBSTRING(qt.text,
             (qs.statement_start_offset / 2) + 1,
             ((CASE qs.statement_end_offset
                 WHEN -1 THEN DATALENGTH(qt.text)
                 ELSE qs.statement_end_offset
               END - qs.statement_start_offset) / 2) + 1
           ), '') AS sql_text
         FROM sys.dm_exec_query_stats qs
         OUTER APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
         WHERE ${timeFilter}
           AND (qt.dbid IS NULL OR qt.dbid = DB_ID(N'${db}') OR DB_NAME(qt.dbid) = N'${db}')
           AND (qt.text IS NULL OR qt.text NOT LIKE N'%spiral_monitor%')
         ORDER BY qs.last_execution_time ASC`
      )
    } catch (err) {
      if (isPermissionError(err)) {
        this.handleFatalError((err as Error).message)
      } else {
        console.error('[Profiler] pollCompletedStatements error:', err)
      }
      return
    }

    let maxTime = this.lastQueryStatsMaxTime

    for (const row of rows) {
      // Advance the cursor
      if (maxTime === null || row.last_execution_time_iso > maxTime) {
        maxTime = row.last_execution_time_iso
      }

      const key = `${row.plan_handle_hex}:${row.stmt_start}:${row.last_execution_time_iso}`
      if (this.seenCompletedKeys.has(key)) continue
      this.seenCompletedKeys.add(key)

      const sqlText = row.sql_text?.trim()
      if (!sqlText) continue

      this.emit({
        id: randomUUID(),
        timestamp: row.last_execution_time_iso,
        type: 'sql-statement',
        sessionId: 0,
        sqlText,
        durationMs: row.elapsed_ms,
        cpuTime: row.cpu_ms,
        reads: row.logical_reads,
        writes: row.logical_writes
      })
    }

    // Prune seenCompletedKeys to avoid unbounded memory growth
    if (this.seenCompletedKeys.size > 10000) {
      const keys = [...this.seenCompletedKeys]
      keys.slice(0, keys.length - 5000).forEach((k) => this.seenCompletedKeys.delete(k))
    }

    if (maxTime !== null) this.lastQueryStatsMaxTime = maxTime
  }

  private async pollSessions(db: string): Promise<void> {
    if (!this.config.trackedEvents.includes('session-login') &&
        !this.config.trackedEvents.includes('session-logout')) {
      return
    }

    let rows: RawSession[]
    try {
      rows = await databaseManager.executeMonitoringQuery<RawSession>(
        this.config.connectionId,
        `/* spiral_monitor */
         SELECT
           session_id,
           ISNULL(login_name, '') AS login_name,
           ISNULL(host_name, '') AS host_name,
           ISNULL(program_name, '') AS program_name,
           CONVERT(varchar(30), login_time, 126) AS login_time_iso
         FROM sys.dm_exec_sessions
         WHERE is_user_process = 1
           AND database_id = DB_ID(N'${db}')`
      )
    } catch (err) {
      console.error('[Profiler] pollSessions error:', err)
      return
    }

    const currentIds = new Set(rows.map((r) => r.session_id))

    if (!this.initialized) {
      // First poll — just seed the baseline, don't emit logins for existing sessions
      this.knownSessionIds = currentIds
      return
    }

    if (this.config.trackedEvents.includes('session-login')) {
      for (const row of rows) {
        if (!this.knownSessionIds.has(row.session_id)) {
          this.emit({
            id: randomUUID(),
            timestamp: row.login_time_iso,
            type: 'session-login',
            sessionId: row.session_id,
            loginName: row.login_name || undefined,
            hostName: row.host_name || undefined,
            programName: row.program_name || undefined
          })
        }
      }
    }

    if (this.config.trackedEvents.includes('session-logout')) {
      for (const id of this.knownSessionIds) {
        if (!currentIds.has(id)) {
          this.emit({
            id: randomUUID(),
            timestamp: new Date().toISOString(),
            type: 'session-logout',
            sessionId: id
          })
        }
      }
    }

    this.knownSessionIds = currentIds
  }
}

class ProfilerManager {
  private readonly sessions = new Map<string, ProfilerSession>()

  async startSession(config: ProfilerSessionConfig, webContents: WebContents): Promise<string> {
    const session = new ProfilerSession(config, webContents, (id) => {
      this.sessions.delete(id)
    })
    this.sessions.set(session.id, session)
    await session.start()
    return session.id
  }

  stopSession(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    session.stop()
    this.sessions.delete(sessionId)
  }

  pauseSession(sessionId: string): void {
    this.sessions.get(sessionId)?.pause()
  }

  resumeSession(sessionId: string): void {
    this.sessions.get(sessionId)?.resume()
  }
}

export const profilerManager = new ProfilerManager()
