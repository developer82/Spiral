import { useState, useRef, useCallback, useEffect } from 'react'
import { Pause, Play, Square } from 'lucide-react'
import MonacoEditor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { useTranslation } from 'react-i18next'
import type { ProfilerTab } from '../../contexts/ProfilerContext'
import './ProfilerTabView.css'

interface ProfilerTabViewProps {
  tab: ProfilerTab
  onPause: () => void
  onResume: () => void
  onStop: () => void
}

const DARK_THEME = 'spiral-dark'
const LIGHT_THEME = 'spiral-light'

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#1e1e1e',
      'editorGutter.background': '#141414'
    }
  })
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#ffffff',
      'editorGutter.background': '#e8e8e8'
    }
  })
}

function resolveMonacoTheme(): string {
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-theme') === 'light'
      ? LIGHT_THEME
      : DARK_THEME
  }
  return DARK_THEME
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString()
  } catch {
    return iso
  }
}

function formatMs(ms: number | undefined): string {
  if (ms === undefined) return ''
  return ms.toLocaleString()
}

const MIN_VIEWER_HEIGHT = 100
const MAX_VIEWER_HEIGHT_RATIO = 0.7

function ProfilerTabView({ tab, onPause, onResume, onStop }: ProfilerTabViewProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [viewerHeight, setViewerHeight] = useState(200)
  const tableRef = useRef<HTMLDivElement>(null)
  const isResizingRef = useRef(false)
  const lastYRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)

  const selectedEvent = tab.events.find((e) => e.id === selectedEventId) ?? null

  const filteredEvents = filter.trim()
    ? tab.events.filter((ev) =>
        ev.sqlText?.toLowerCase().includes(filter.toLowerCase()) ||
        ev.loginName?.toLowerCase().includes(filter.toLowerCase()) ||
        ev.hostName?.toLowerCase().includes(filter.toLowerCase())
      )
    : tab.events

  // Auto-scroll table to bottom when new events arrive and no event is selected
  useEffect(() => {
    if (!selectedEventId && tableRef.current) {
      tableRef.current.scrollTop = tableRef.current.scrollHeight
    }
  }, [tab.events.length, selectedEventId])

  // Update Monaco content when selected event changes
  useEffect(() => {
    if (editorRef.current) {
      const model = editorRef.current.getModel()
      if (model) {
        model.setValue(selectedEvent?.sqlText ?? '')
      }
    }
  }, [selectedEvent?.sqlText])

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    lastYRef.current = e.clientY

    function onMouseMove(ev: MouseEvent): void {
      if (!isResizingRef.current) return
      const delta = lastYRef.current - ev.clientY
      lastYRef.current = ev.clientY
      setViewerHeight((prev) => {
        const containerH = containerRef.current?.clientHeight ?? 600
        const maxH = containerH * MAX_VIEWER_HEIGHT_RATIO
        return Math.max(MIN_VIEWER_HEIGHT, Math.min(maxH, prev + delta))
      })
    }

    function onMouseUp(): void {
      isResizingRef.current = false
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }, [])

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor
  }

  function getEventTypeClass(type: string): string {
    switch (type) {
      case 'blocked-query': return 'profiler-row--blocked'
      case 'error': return 'profiler-row--error'
      case 'session-login':
      case 'session-logout': return 'profiler-row--session'
      default: return ''
    }
  }

  return (
    <div className="profiler-tab-view" ref={containerRef}>
      {/* Toolbar */}
      <div className="profiler-toolbar">
        <div className="profiler-toolbar__controls">
          {tab.state === 'running' && (
            <button
              className="profiler-toolbar__btn"
              onClick={onPause}
              title={t('profiler.toolbar.pause')}
            >
              <Pause size={14} />
              <span>{t('profiler.toolbar.pause')}</span>
            </button>
          )}
          {tab.state === 'paused' && (
            <button
              className="profiler-toolbar__btn profiler-toolbar__btn--resume"
              onClick={onResume}
              title={t('profiler.toolbar.resume')}
            >
              <Play size={14} />
              <span>{t('profiler.toolbar.resume')}</span>
            </button>
          )}
          {tab.state !== 'stopped' && (
            <button
              className="profiler-toolbar__btn profiler-toolbar__btn--stop"
              onClick={onStop}
              title={t('profiler.toolbar.stop')}
            >
              <Square size={14} />
              <span>{t('profiler.toolbar.stop')}</span>
            </button>
          )}
          {tab.state === 'stopped' && (
            <span className="profiler-toolbar__stopped-badge">
              {t('profiler.tab.stopped')}
            </span>
          )}
        </div>

        <div className="profiler-toolbar__right">
          <span className="profiler-toolbar__count">
            {tab.events.length} {t('profiler.toolbar.events')}
          </span>
          <input
            type="text"
            className="profiler-toolbar__filter"
            placeholder={t('profiler.toolbar.filterPlaceholder')}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </div>

      {/* Permission / fatal error banner */}
      {tab.error && (
        <div className="profiler-error-banner" role="alert">
          <span className="profiler-error-banner__icon">⚠</span>
          <span className="profiler-error-banner__title">{t('profiler.error.title')}</span>
          <span className="profiler-error-banner__message">{t('profiler.error.permissionDenied')}</span>
        </div>
      )}

      {/* Events table */}
      <div className="profiler-table-wrap" ref={tableRef}>
        <table className="profiler-table">
          <thead>
            <tr>
              <th>#</th>
              <th>{t('profiler.table.time')}</th>
              <th>{t('profiler.table.type')}</th>
              <th>SPID</th>
              <th>{t('profiler.table.duration')}</th>
              <th>{t('profiler.table.cpu')}</th>
              <th>{t('profiler.table.reads')}</th>
              <th>{t('profiler.table.writes')}</th>
              <th>{t('profiler.table.rows')}</th>
              <th>{t('profiler.table.login')}</th>
              <th>{t('profiler.table.host')}</th>
              <th>{t('profiler.table.waitType')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((event, idx) => (
              <tr
                key={event.id}
                className={`profiler-table__row ${getEventTypeClass(event.type)}${selectedEventId === event.id ? ' profiler-table__row--selected' : ''}`}
                onClick={() => setSelectedEventId(event.id === selectedEventId ? null : event.id)}
              >
                <td className="profiler-table__num">{idx + 1}</td>
                <td className="profiler-table__time">{formatTimestamp(event.timestamp)}</td>
                <td className="profiler-table__type">
                  <span className={`profiler-type-badge profiler-type-badge--${event.type}`}>
                    {t(`profiler.eventTypes.${event.type.replace(/-([a-z])/g, (_: string, c: string) => c.toUpperCase())}`)}
                  </span>
                </td>
                <td>{event.sessionId}</td>
                <td className="profiler-table__num">{formatMs(event.durationMs)}</td>
                <td className="profiler-table__num">{formatMs(event.cpuTime)}</td>
                <td className="profiler-table__num">{formatMs(event.reads)}</td>
                <td className="profiler-table__num">{formatMs(event.writes)}</td>
                <td className="profiler-table__num">{formatMs(event.rowCount)}</td>
                <td>{event.loginName ?? ''}</td>
                <td>{event.hostName ?? ''}</td>
                <td>{event.waitType ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredEvents.length === 0 && (
          <div className="profiler-table__empty">
            {tab.state === 'running'
              ? t('profiler.table.waitingForEvents')
              : t('profiler.table.noEvents')}
          </div>
        )}
      </div>

      {/* Resize handle for SQL viewer */}
      <div
        className="profiler-viewer__resize-handle"
        onMouseDown={handleResizeMouseDown}
      />

      {/* SQL Viewer */}
      <div className="profiler-viewer" style={{ height: `${viewerHeight}px` }}>
        {selectedEvent ? (
          <MonacoEditor
            language="sql"
            value={selectedEvent.sqlText ?? ''}
            theme={resolveMonacoTheme()}
            beforeMount={handleBeforeMount}
            onMount={handleEditorMount}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              fontSize: 13,
              lineNumbers: 'on',
              wordWrap: 'on',
              automaticLayout: true,
              contextmenu: false,
              scrollbar: { vertical: 'auto', horizontal: 'auto' }
            }}
          />
        ) : (
          <div className="profiler-viewer__placeholder">
            {tab.events.length === 0
              ? t('profiler.sqlViewer.selectEvent')
              : t('profiler.sqlViewer.selectEvent')}
          </div>
        )}
      </div>
    </div>
  )
}

export default ProfilerTabView
