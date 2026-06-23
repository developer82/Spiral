import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ProfilerTabView from '../ProfilerTabView'
import type { ProfilerTab } from '../../../contexts/ProfilerContext'
import type { ProfilerEvent } from '../../../../../preload/index.d'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

function makeTab(overrides: Partial<ProfilerTab> = {}): ProfilerTab {
  return {
    id: 'profiler-session-1',
    profilingSessionId: 'session-1',
    connectionId: 'conn-1',
    connectionName: 'My Server',
    databaseName: 'AdventureWorks',
    trackedEvents: ['sql-statement', 'blocked-query', 'session-login', 'session-logout', 'error'],
    state: 'running',
    events: [],
    ...overrides
  }
}

function makeSqlEvent(overrides: Partial<ProfilerEvent> = {}): ProfilerEvent {
  return {
    id: 'evt-1',
    timestamp: new Date().toISOString(),
    type: 'sql-statement',
    sessionId: 42,
    sqlText: 'SELECT * FROM dbo.Orders',
    cpuTime: 15,
    reads: 100,
    writes: 0,
    rowCount: 10,
    loginName: 'sa',
    hostName: 'DEV-PC',
    ...overrides
  }
}

describe('ProfilerTabView', () => {
  const mockPause = vi.fn()
  const mockResume = vi.fn()
  const mockStop = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Toolbar ────────────────────────────────────────────────────────────────

  it('shows Pause and Stop buttons when state is running', () => {
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'running' })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    expect(screen.getByTitle('profiler.toolbar.pause')).toBeInTheDocument()
    expect(screen.getByTitle('profiler.toolbar.stop')).toBeInTheDocument()
    expect(screen.queryByTitle('profiler.toolbar.resume')).not.toBeInTheDocument()
  })

  it('shows Resume and Stop buttons when state is paused', () => {
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'paused' })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    expect(screen.getByTitle('profiler.toolbar.resume')).toBeInTheDocument()
    expect(screen.getByTitle('profiler.toolbar.stop')).toBeInTheDocument()
    expect(screen.queryByTitle('profiler.toolbar.pause')).not.toBeInTheDocument()
  })

  it('shows stopped badge when state is stopped', () => {
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'stopped' })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    expect(screen.getByText('profiler.tab.stopped')).toBeInTheDocument()
    expect(screen.queryByTitle('profiler.toolbar.stop')).not.toBeInTheDocument()
  })

  it('calls onPause when Pause is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'running' })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    await user.click(screen.getByTitle('profiler.toolbar.pause'))
    expect(mockPause).toHaveBeenCalledOnce()
  })

  it('calls onResume when Resume is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'paused' })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    await user.click(screen.getByTitle('profiler.toolbar.resume'))
    expect(mockResume).toHaveBeenCalledOnce()
  })

  it('calls onStop when Stop is clicked', async () => {
    const user = userEvent.setup()
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'running' })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    await user.click(screen.getByTitle('profiler.toolbar.stop'))
    expect(mockStop).toHaveBeenCalledOnce()
  })

  // ── Event table ────────────────────────────────────────────────────────────

  it('renders a row for each event', () => {
    const events = [
      makeSqlEvent({ id: 'e1', sqlText: 'SELECT 1' }),
      makeSqlEvent({ id: 'e2', sqlText: 'SELECT 2', type: 'blocked-query' })
    ]
    render(
      <ProfilerTabView
        tab={makeTab({ events })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    // Each row should have a row number column
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('shows waiting message when running with no events', () => {
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'running', events: [] })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    expect(screen.getByText('profiler.table.waitingForEvents')).toBeInTheDocument()
  })

  it('shows no-events message when stopped with no events', () => {
    render(
      <ProfilerTabView
        tab={makeTab({ state: 'stopped', events: [] })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    expect(screen.getByText('profiler.table.noEvents')).toBeInTheDocument()
  })

  // ── SQL viewer ────────────────────────────────────────────────────────────

  it('shows select-event placeholder when no event is selected', () => {
    const events = [makeSqlEvent()]
    render(
      <ProfilerTabView
        tab={makeTab({ events })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    expect(screen.getByText('profiler.sqlViewer.selectEvent')).toBeInTheDocument()
  })

  it('shows event count in toolbar', () => {
    const events = [makeSqlEvent({ id: 'e1' }), makeSqlEvent({ id: 'e2' })]
    render(
      <ProfilerTabView
        tab={makeTab({ events })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    expect(screen.getByText(/^2 profiler\.toolbar\.events$/)).toBeInTheDocument()
  })

  // ── Filtering ─────────────────────────────────────────────────────────────

  it('filters events by SQL text', async () => {
    const user = userEvent.setup()
    const events = [
      makeSqlEvent({ id: 'e1', sqlText: 'SELECT * FROM Orders' }),
      makeSqlEvent({ id: 'e2', sqlText: 'INSERT INTO Products' })
    ]
    render(
      <ProfilerTabView
        tab={makeTab({ events })}
        onPause={mockPause}
        onResume={mockResume}
        onStop={mockStop}
      />
    )
    const filter = screen.getByPlaceholderText('profiler.toolbar.filterPlaceholder')
    await user.type(filter, 'orders')
    // Row 2 (INSERT) should be gone, row 1 (SELECT) stays
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.queryByText('2')).not.toBeInTheDocument()
  })
})
