import { render, screen, waitFor, cleanup, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MockInstance } from 'vitest'
import ExplorerPage, { getNodeDragText, detectDdlFolderTypes } from '../ExplorerPage'

vi.mock('sql-formatter', () => ({
  format: vi.fn((sql: string) => sql)
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../ExecutionPlanCanvas/ExecutionPlanCanvas', () => ({
  default: () => null
}))

vi.mock('../../ClientStatisticsView/ClientStatisticsView', () => ({
  default: () => null
}))

vi.mock('../../../../contexts/ProfilerContext', () => ({
  useProfilerContext: () => ({
    activateSession: vi.fn(),
    tabs: [],
    activeTabId: null,
    setActiveTabId: vi.fn(),
    pauseTab: vi.fn(),
    resumeTab: vi.fn(),
    stopTab: vi.fn(),
    closeTab: vi.fn(),
    registerNavigate: vi.fn()
  })
}))

const DEFAULT_MOCK_SETTINGS = {
  language: 'en',
  theme: 'dark',
  syntaxHighlighting: true,
  showGridLines: false,
  fontScaling: 100,
  queryTimeout: 30,
  showSystemDatabases: false,
  selectTopRowsCount: 1000,
  autoIncludeExecutionPlan: false,
  autoIncludeClientStatistics: false,
  glassEffectHour: -1
}

// mutable so individual tests can override specific fields
let currentMockSettings = { ...DEFAULT_MOCK_SETTINGS }

vi.mock('../../../Settings/useSettings', () => ({
  useSettings: () => ({
    settings: currentMockSettings,
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

beforeEach(() => {
  currentMockSettings = { ...DEFAULT_MOCK_SETTINGS }
})

const MOCK_CONNECTION = {
  id: 'conn-1',
  name: 'My SQL Server',
  provider: 'sqlserver' as const,
  host: 'localhost',
  port: 1433,
  username: 'sa',
  password: '',
  rememberPassword: false,
  defaultDatabase: 'master'
}

const MOCK_DATABASE_NODES = [
  { id: 'db:AdventureWorks', label: 'AdventureWorks', kind: 'database' as const },
  { id: 'db:master', label: 'master', kind: 'database' as const }
]

const MOCK_CATEGORY_NODES = [
  { id: 'db:AdventureWorks:tables', label: 'Tables', kind: 'tables-folder' as const },
  { id: 'db:AdventureWorks:views', label: 'Views', kind: 'views-folder' as const },
  {
    id: 'db:AdventureWorks:stored-procedures',
    label: 'Stored Procedures',
    kind: 'stored-procedures-folder' as const
  },
  { id: 'db:AdventureWorks:functions', label: 'Functions', kind: 'functions-folder' as const },
  { id: 'db:AdventureWorks:types', label: 'Types', kind: 'types-folder' as const }
]

const MOCK_TABLE_NODES = [
  {
    id: 'db:AdventureWorks:tables:dbo.Product',
    label: 'dbo.Product',
    kind: 'table' as const
  },
  {
    id: 'db:AdventureWorks:tables:dbo.SalesOrder',
    label: 'dbo.SalesOrder',
    kind: 'table' as const
  }
]

const MOCK_TABLE_CATEGORY_NODES = [
  {
    id: 'db:AdventureWorks:tables:dbo.Product:columns',
    label: 'Columns',
    kind: 'table-columns-folder' as const
  },
  {
    id: 'db:AdventureWorks:tables:dbo.Product:keys',
    label: 'Keys',
    kind: 'table-keys-folder' as const
  },
  {
    id: 'db:AdventureWorks:tables:dbo.Product:constraints',
    label: 'Constraints',
    kind: 'table-constraints-folder' as const
  },
  {
    id: 'db:AdventureWorks:tables:dbo.Product:triggers',
    label: 'Triggers',
    kind: 'table-triggers-folder' as const
  },
  {
    id: 'db:AdventureWorks:tables:dbo.Product:indexes',
    label: 'Indexes',
    kind: 'table-indexes-folder' as const
  },
  {
    id: 'db:AdventureWorks:tables:dbo.Product:statistics',
    label: 'Statistics',
    kind: 'table-statistics-folder' as const
  }
]

const MOCK_COLUMN_NODES = [
  {
    id: 'db:AdventureWorks:tables:dbo.Product:columns:ProductID',
    label: 'ProductID (PK, int, not null)',
    kind: 'column-pk' as const
  },
  {
    id: 'db:AdventureWorks:tables:dbo.Product:columns:Name',
    label: 'Name (nvarchar, null)',
    kind: 'column' as const
  }
]

describe('ExplorerPage', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({ status: 'ok', children: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  // ── Static rendering ──────────────────────────────────────────────────────

  it('renders the New Connection button', () => {
    render(<ExplorerPage />)
    expect(screen.getByText('explorer.newConnection')).toBeInTheDocument()
  })

  it('shows the empty state when no connections exist', async () => {
    render(<ExplorerPage />)
    await waitFor(() => {
      expect(screen.getByText('explorer.emptyState')).toBeInTheDocument()
    })
  })

  it('renders a saved connection name in the tree', async () => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    render(<ExplorerPage />)
    await waitFor(() => {
      expect(screen.getByText('My SQL Server')).toBeInTheDocument()
    })
  })

  // ── Connection-level expand / connect ─────────────────────────────────────

  it('shows Connecting row immediately on first expand', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockReturnValue(new Promise(() => {}))

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))

    expect(screen.getByText('explorer.connecting')).toBeInTheDocument()
  })

  it('shows the Databases folder after successful connection', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))

    await waitFor(() => {
      expect(screen.getByText('explorer.databases')).toBeInTheDocument()
    })
  })

  it('does not show Connecting row after successful connection', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))

    await waitFor(() => {
      expect(screen.queryByText('explorer.connecting')).not.toBeInTheDocument()
    })
  })

  it('shows error row when connection fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({
      status: 'error',
      message: 'Login failed for user'
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))

    await waitFor(() => {
      expect(screen.getByText('Login failed for user')).toBeInTheDocument()
    })
  })

  it('shows fallback error text when connection error message is empty', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({
      status: 'error',
      message: ''
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))

    await waitFor(() => {
      expect(screen.getByText('explorer.connectionError')).toBeInTheDocument()
    })
  })

  it('does not call connect again when collapsing and re-expanding a connected node', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const connectSpy = vi
      .spyOn(window.api.database, 'connect')
      .mockResolvedValue({ status: 'connected' })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    // Collapse
    await user.click(screen.getByText('My SQL Server'))

    // Re-expand
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    expect(connectSpy).toHaveBeenCalledTimes(1)
  })

  it('retries connection when the error row is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const connectSpy = vi
      .spyOn(window.api.database, 'connect')
      .mockResolvedValueOnce({ status: 'error', message: 'Timeout' })
      .mockResolvedValueOnce({ status: 'connected' })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('Timeout'))

    await user.click(screen.getByText('Timeout'))

    await waitFor(() => {
      expect(screen.getByText('explorer.databases')).toBeInTheDocument()
    })
    expect(connectSpy).toHaveBeenCalledTimes(2)
  })

  it('calls window.api.database.connect with the correct connection id', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const connectSpy = vi
      .spyOn(window.api.database, 'connect')
      .mockResolvedValue({ status: 'connected' })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))

    await waitFor(() => expect(connectSpy).toHaveBeenCalledWith('conn-1'))
  })

  // ── Databases folder expansion ─────────────────────────────────────────────

  it('shows loading spinner when Databases folder is expanding', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'getChildren').mockReturnValue(new Promise(() => {}))

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))

    expect(screen.getByText('explorer.loading')).toBeInTheDocument()
  })

  it('calls getChildren with correct args when Databases folder is expanded', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const getChildrenSpy = vi
      .spyOn(window.api.database, 'getChildren')
      .mockResolvedValue({ status: 'ok', children: [] })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))

    await waitFor(() => expect(getChildrenSpy).toHaveBeenCalledWith('conn-1', 'databases'))
  })

  it('renders returned database names under the Databases folder', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({
      status: 'ok',
      children: MOCK_DATABASE_NODES
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))

    await waitFor(() => {
      expect(screen.getByText('AdventureWorks')).toBeInTheDocument()
      expect(screen.getByText('master')).toBeInTheDocument()
    })
  })

  it('shows no-items message when Databases folder is empty', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({ status: 'ok', children: [] })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))

    await waitFor(() => {
      expect(screen.getByText('explorer.noItems')).toBeInTheDocument()
    })
  })

  it('shows error row with the server message when Databases load fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({
      status: 'error',
      message: 'Permission denied'
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument()
    })
  })

  it('does not re-fetch databases when Databases folder is collapsed then re-expanded', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const getChildrenSpy = vi
      .spyOn(window.api.database, 'getChildren')
      .mockResolvedValue({ status: 'ok', children: MOCK_DATABASE_NODES })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    // Collapse Databases
    await user.click(screen.getByText('explorer.databases'))
    // Re-expand
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    expect(getChildrenSpy).toHaveBeenCalledTimes(1)
  })

  // ── Database node expansion ───────────────────────────────────────────────

  it('renders category folders when a database node is expanded', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    await user.click(screen.getByText('AdventureWorks'))

    await waitFor(() => {
      expect(screen.getByText('explorer.tables')).toBeInTheDocument()
      expect(screen.getByText('explorer.views')).toBeInTheDocument()
      expect(screen.getByText('explorer.storedProcedures')).toBeInTheDocument()
      expect(screen.getByText('explorer.functions')).toBeInTheDocument()
      expect(screen.getByText('explorer.types')).toBeInTheDocument()
    })
  })

  it('calls getChildren with the database node id when a database is expanded', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const getChildrenSpy = vi
      .spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    await user.click(screen.getByText('AdventureWorks'))

    await waitFor(() =>
      expect(getChildrenSpy).toHaveBeenCalledWith('conn-1', 'db:AdventureWorks')
    )
  })

  // ── Category expansion ────────────────────────────────────────────────────

  it('calls getChildren with the tables node id when Tables is expanded', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const getChildrenSpy = vi
      .spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_NODES })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    await user.click(screen.getByText('AdventureWorks'))
    await waitFor(() => screen.getByText('explorer.tables'))

    await user.click(screen.getByText('explorer.tables'))

    await waitFor(() =>
      expect(getChildrenSpy).toHaveBeenCalledWith(
        'conn-1',
        'db:AdventureWorks:tables'
      )
    )
  })

  it('renders table leaf nodes after Tables category is expanded', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_NODES })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    await user.click(screen.getByText('AdventureWorks'))
    await waitFor(() => screen.getByText('explorer.tables'))

    await user.click(screen.getByText('explorer.tables'))

    await waitFor(() => {
      expect(screen.getByText('dbo.Product')).toBeInTheDocument()
      expect(screen.getByText('dbo.SalesOrder')).toBeInTheDocument()
    })
  })

  // ── Error handling inside child nodes ─────────────────────────────────────

  it('retries node load when a child error row is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    const getChildrenSpy = vi
      .spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'error', message: 'Network error' })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('Network error'))

    await user.click(screen.getByText('Network error'))

    await waitFor(() => {
      expect(screen.getByText('AdventureWorks')).toBeInTheDocument()
    })
    expect(getChildrenSpy).toHaveBeenCalledTimes(2)
  })
})

// ── Context menu ──────────────────────────────────────────────────────────────

describe('ExplorerPage – context menu', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({ status: 'ok', children: [] })
    vi.spyOn(window.api.database, 'disconnect').mockResolvedValue(undefined)
    vi.spyOn(window.api.connections, 'update').mockImplementation(async (r) => r as typeof MOCK_CONNECTION)
    vi.spyOn(window.api.connections, 'delete').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  // helpers
  async function rightClickConnection(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.pointer({ target: screen.getByText('My SQL Server'), keys: '[MouseRight]' })
  }

  async function clickMenuItem(label: string): Promise<void> {
    await waitFor(() => screen.getByText(label))
    await act(async () => {
      screen.getByText(label).click()
    })
  }

  // ── Right-click invocation ────────────────────────────────────────────────

  it('right-clicking a connection row shows custom context menu', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await rightClickConnection(user)

    expect(screen.getByText('explorer.contextMenu.edit')).toBeInTheDocument()
    expect(screen.getByText('explorer.contextMenu.connect')).toBeInTheDocument()
    expect(screen.getByText('explorer.contextMenu.delete')).toBeInTheDocument()
  })

  it('right-clicking a connected connection shows disconnect instead of connect', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await rightClickConnection(user)

    expect(screen.getByText('explorer.contextMenu.disconnect')).toBeInTheDocument()
    expect(screen.queryByText('explorer.contextMenu.connect')).not.toBeInTheDocument()
  })

  // ── Connect action ────────────────────────────────────────────────────────

  it('connect action via menu connects and expands the connection', async () => {
    const user = userEvent.setup()
    const connectSpy = vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })

    render(<ExplorerPage />)
    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.connect')

    await waitFor(() => {
      expect(screen.getByText('explorer.databases')).toBeInTheDocument()
    })
    expect(connectSpy).toHaveBeenCalledWith('conn-1')
  })

  // ── Disconnect action ─────────────────────────────────────────────────────

  it('disconnect action calls the disconnect API and collapses the connection', async () => {
    const user = userEvent.setup()
    const disconnectSpy = vi.spyOn(window.api.database, 'disconnect').mockResolvedValue(undefined)

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.disconnect')

    await waitFor(() => {
      expect(screen.queryByText('explorer.databases')).not.toBeInTheDocument()
    })
    expect(disconnectSpy).toHaveBeenCalledWith('conn-1')
  })

  it('disconnect action resets connection status to disconnected', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'disconnect').mockResolvedValue(undefined)

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.disconnect')

    await waitFor(() => {
      expect(screen.getByLabelText('explorer.statusLabel.disconnected')).toBeInTheDocument()
    })
  })

  // ── Edit action ───────────────────────────────────────────────────────────

  it('edit action on a disconnected connection opens the dialog prefilled', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.edit')

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByDisplayValue('My SQL Server')).toBeInTheDocument()
      expect(screen.getByDisplayValue('localhost')).toBeInTheDocument()
    })
  })

  it('edit action on a connected connection asks for confirmation before opening dialog', async () => {
    const user = userEvent.setup()

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.edit')

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.contextMenu.confirmDisconnectForEditTitle' })).toBeInTheDocument()
    })

    await user.click(screen.getByText('explorer.contextMenu.confirmDisconnectForEditConfirm'))

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.dialog.editTitle' })).toBeInTheDocument()
    })
  })

  it('edit action on a connected connection aborts if confirmation is declined', async () => {
    const user = userEvent.setup()

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.edit')

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.contextMenu.confirmDisconnectForEditTitle' })).toBeInTheDocument()
    })

    await user.click(screen.getByText('confirmDialog.cancel'))

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('saving the edit dialog updates the connection name in the tree', async () => {
    const updatedConn = { ...MOCK_CONNECTION, name: 'Updated Server' }
    vi.spyOn(window.api.connections, 'update').mockResolvedValue(updatedConn)

    const user = userEvent.setup()
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.edit')

    await waitFor(() => screen.getByRole('dialog'))
    expect(window.api.connections.update).toBeDefined()
  })

  // ── Delete action ─────────────────────────────────────────────────────────

  it('delete action on a disconnected connection asks for confirmation', async () => {
    const user = userEvent.setup()

    render(<ExplorerPage />)
    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.delete')

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.contextMenu.deleteConnectionTitle' })).toBeInTheDocument()
    })
    expect(screen.getByText('explorer.contextMenu.confirmDelete')).toBeInTheDocument()
  })

  it('delete action removes the connection from the tree when confirmed', async () => {
    const user = userEvent.setup()

    render(<ExplorerPage />)
    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.delete')

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(screen.queryByText('My SQL Server')).not.toBeInTheDocument()
    })
    expect(window.api.connections.delete).toHaveBeenCalledWith('conn-1')
  })

  it('delete action on a connected connection shows the connected-specific confirmation', async () => {
    const user = userEvent.setup()

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.disconnect')

    // After disconnect, re-open context menu and try delete
    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.delete')

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.contextMenu.deleteConnectionTitle' })).toBeInTheDocument()
    })
  })

  it('delete action on a connected connection disconnects before deleting when confirmed', async () => {
    const user = userEvent.setup()
    const disconnectSpy = vi.spyOn(window.api.database, 'disconnect').mockResolvedValue(undefined)

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.disconnect')

    await waitFor(() => {
      expect(disconnectSpy).toHaveBeenCalledWith('conn-1')
    })
  })

  it('delete action does not call delete API when confirmation is declined', async () => {
    const user = userEvent.setup()

    render(<ExplorerPage />)
    await rightClickConnection(user)
    await clickMenuItem('explorer.contextMenu.delete')

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.cancel'))

    expect(window.api.connections.delete).not.toHaveBeenCalled()
    expect(screen.getByText('My SQL Server')).toBeInTheDocument()
  })
})

// ── Query tabs ────────────────────────────────────────────────────────────────

describe('ExplorerPage – query tabs', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })



  it('renders no tabs initially', () => {
    render(<ExplorerPage />)
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('clicking New Query adds a tab titled "Unnamed"', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(1)
    expect(tabs[0]).toHaveTextContent('Unnamed')
  })

  it('clicking New Query multiple times creates one tab per click', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('New Query'))

    expect(screen.getAllByRole('tab')).toHaveLength(3)
  })

  it('the newly created tab becomes the active tab', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))

    const tab = screen.getByRole('tab')
    expect(tab).toHaveAttribute('aria-selected', 'true')
  })

  it('clicking an inactive tab makes it active', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('New Query'))

    const [firstTab, secondTab] = screen.getAllByRole('tab')

    // Second tab should be active after second New Query click
    expect(secondTab).toHaveAttribute('aria-selected', 'true')
    expect(firstTab).toHaveAttribute('aria-selected', 'false')

    // Click first tab to make it active
    await user.click(firstTab)

    expect(firstTab).toHaveAttribute('aria-selected', 'true')
    expect(secondTab).toHaveAttribute('aria-selected', 'false')
  })
})

// ── Format button ─────────────────────────────────────────────────────────────

describe('ExplorerPage – Format button', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('Format button is not rendered when there are no tabs', () => {
    render(<ExplorerPage />)
    expect(screen.queryByTitle('Format')).not.toBeInTheDocument()
  })

  it('Format button is rendered when a tab is active', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))

    expect(screen.getByTitle('Format')).toBeInTheDocument()
  })

  it('clicking Format calls sql-formatter with the active tab content', async () => {
    const { format } = await import('sql-formatter')
    const formatMock = vi.mocked(format)
    formatMock.mockClear()

    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))

    expect(formatMock).toHaveBeenCalledWith('', expect.objectContaining({ language: 'sql' }))
  })

  it('clicking Format marks the active tab as dirty', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))
    expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument()

    await user.click(screen.getByTitle('Format'))

    expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument()
  })

  it('clicking Format on the second tab only formats the active tab', async () => {
    const { format } = await import('sql-formatter')
    const formatMock = vi.mocked(format)
    formatMock.mockClear()

    const user = userEvent.setup()
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('New Query'))

    const [firstTab] = screen.getAllByRole('tab')
    await user.click(firstTab)

    await user.click(screen.getByTitle('Format'))

    expect(formatMock).toHaveBeenCalledTimes(1)
    expect(firstTab).toHaveAttribute('aria-selected', 'true')
  })
})

// ── Execute Query ─────────────────────────────────────────────────────────────

describe('ExplorerPage – execute query', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({ status: 'ok', children: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function setupConnectedTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByTitle('New Query'))
  }

  it('shows error when Execute Query is clicked with no connection selected', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([])
    render(<ExplorerPage />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText(/no connection selected/i)).toBeInTheDocument()
    })
  })

  it('calls executeQuery with the active connection id and query content', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 10
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith('conn-1', '', false, false, undefined)
    })
  })

  it('renders a single result set in the Results tab', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        {
          columns: ['id', 'name'],
          rows: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' }
          ],
          rowCount: 2
        }
      ],
      messages: [],
      durationMs: 42
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText('id')).toBeInTheDocument()
      expect(screen.getByText('name')).toBeInTheDocument()
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
    })
  })

  it('shows badge with row count and duration for a single result set', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [{ columns: ['id'], rows: [{ id: 1 }], rowCount: 1 }],
      messages: [],
      durationMs: 55
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText(/1 row · 55ms/)).toBeInTheDocument()
    })
  })

  it('shows badge with result set count and total rows for multiple result sets', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        { columns: ['id'], rows: [{ id: 1 }, { id: 2 }], rowCount: 2 },
        { columns: ['val'], rows: [{ val: 'x' }], rowCount: 1 }
      ],
      messages: [],
      durationMs: 30
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText(/2 result sets · 3 rows · 30ms/)).toBeInTheDocument()
    })
  })

  it('renders multiple result sets stacked with "Result N" sub-headers', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        { columns: ['a'], rows: [{ a: 1 }], rowCount: 1 },
        { columns: ['b'], rows: [{ b: 2 }], rowCount: 1 }
      ],
      messages: [],
      durationMs: 20
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText(/Result 1/)).toBeInTheDocument()
      expect(screen.getByText(/Result 2/)).toBeInTheDocument()
      expect(screen.getByText('a')).toBeInTheDocument()
      expect(screen.getByText('b')).toBeInTheDocument()
    })
  })

  it('renders messages in the Messages tab', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [
        { type: 'info', text: 'Hello from PRINT' },
        { type: 'info', text: '(5 rows affected)' }
      ],
      durationMs: 10
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => screen.getByText('Messages'))
    await user.click(screen.getByText('Messages'))

    await waitFor(() => {
      expect(screen.getByText('Hello from PRINT')).toBeInTheDocument()
      expect(screen.getByText('(5 rows affected)')).toBeInTheDocument()
    })
  })

  it('switching to Messages tab hides the result set grids', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [{ columns: ['x'], rows: [{ x: 99 }], rowCount: 1 }],
      messages: [{ type: 'info', text: 'done' }],
      durationMs: 5
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => screen.getByText('x'))

    await user.click(screen.getByText('Messages'))

    await waitFor(() => {
      expect(screen.queryByText('x')).not.toBeInTheDocument()
      expect(screen.getByText('done')).toBeInTheDocument()
    })
  })

  it('shows "No messages" when Messages tab is active and there are no messages', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 0
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => screen.getByText('Messages'))
    await user.click(screen.getByText('Messages'))

    await waitFor(() => {
      expect(screen.getByText('No messages.')).toBeInTheDocument()
    })
  })

  it('shows error state when executeQuery returns an error result', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Syntax error near SELECT'
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText('Syntax error near SELECT')).toBeInTheDocument()
    })
  })

  it('shows NULL for null/undefined cell values', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        {
          columns: ['id', 'note'],
          rows: [{ id: 1, note: null }],
          rowCount: 1
        }
      ],
      messages: [],
      durationMs: 10
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText('NULL')).toBeInTheDocument()
    })
  })

  it('shows "Query executed successfully. No rows returned." when result set has no columns', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [{ columns: [], rows: [], rowCount: 0 }],
      messages: [],
      durationMs: 10
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByText('Query executed successfully. No rows returned.')).toBeInTheDocument()
    })
  })

  it('tab counts in the tab bar reflect number of result sets and messages', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        { columns: ['id'], rows: [{ id: 1 }], rowCount: 1 },
        { columns: ['val'], rows: [{ val: 'x' }], rowCount: 1 }
      ],
      messages: [{ type: 'info', text: '(1 row affected)' }, { type: 'info', text: '(1 row affected)' }],
      durationMs: 10
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      const badges = screen.getAllByText('2')
      expect(badges.length).toBeGreaterThanOrEqual(2)
    })
  })

  it('passes withPlan=true when autoIncludeExecutionPlan setting is enabled', async () => {
    const user = userEvent.setup()
    currentMockSettings = { ...DEFAULT_MOCK_SETTINGS, autoIncludeExecutionPlan: true }

    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 10,
      executionPlanXml: '<ShowPlanXML/>'
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith('conn-1', '', true, false, undefined)
    })
  })

  it('stays on Results tab when autoIncludeExecutionPlan is enabled and plan data is returned', async () => {
    const user = userEvent.setup()
    currentMockSettings = { ...DEFAULT_MOCK_SETTINGS, autoIncludeExecutionPlan: true }

    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 10,
      executionPlanXml: '<ShowPlanXML/>'
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      const resultsTab = screen.queryAllByText('Results')
        .find((el) => el.classList.contains('query-results__tab'))
      expect(resultsTab).toBeDefined()
      expect(resultsTab).toHaveClass('query-results__tab--active')
    })
  })

  it('shows Statistics toolbar button when a query tab is active', async () => {
    const user = userEvent.setup()
    await setupConnectedTab(user)

    expect(screen.getByTitle('Client Statistics')).toBeInTheDocument()
  })

  it('clicking Statistics button calls executeQuery with withStatistics=true', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 15,
      clientStatistics: {
        totalExecutionTimeMs: 15,
        rowsReturned: 0,
        resultSetsCount: 0,
        bytesSentToServer: 0
      }
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Client Statistics'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith('conn-1', '', false, true, undefined)
    })
  })

  it('stays on Results tab after Statistics button is clicked', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 15,
      clientStatistics: {
        totalExecutionTimeMs: 15,
        rowsReturned: 0,
        resultSetsCount: 0,
        bytesSentToServer: 0
      }
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Client Statistics'))

    await waitFor(() => {
      const resultsTab = screen.queryAllByText('Results')
        .find((el) => el.classList.contains('query-results__tab'))
      expect(resultsTab).toBeDefined()
      expect(resultsTab).toHaveClass('query-results__tab--active')
    })
  })

  it('passes withStatistics=true when autoIncludeClientStatistics setting is enabled', async () => {
    const user = userEvent.setup()
    currentMockSettings = { ...DEFAULT_MOCK_SETTINGS, autoIncludeClientStatistics: true }

    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 10,
      clientStatistics: {
        totalExecutionTimeMs: 10,
        rowsReturned: 0,
        resultSetsCount: 0,
        bytesSentToServer: 0
      }
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith('conn-1', '', false, true, undefined)
    })
  })

  it('stays on Results tab when autoIncludeClientStatistics is enabled', async () => {
    const user = userEvent.setup()
    currentMockSettings = { ...DEFAULT_MOCK_SETTINGS, autoIncludeClientStatistics: true }

    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 10,
      clientStatistics: {
        totalExecutionTimeMs: 10,
        rowsReturned: 0,
        resultSetsCount: 0,
        bytesSentToServer: 0
      }
    })

    await setupConnectedTab(user)
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      const resultsTab = screen.queryAllByText('Results')
        .find((el) => el.classList.contains('query-results__tab'))
      expect(resultsTab).toBeDefined()
      expect(resultsTab).toHaveClass('query-results__tab--active')
    })
  })
})

// -- Table node expansion ------------------------------------------------------

describe('ExplorerPage � table node expansion', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({ status: 'ok', children: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  /** Navigate down to the Tables folder and click on dbo.Product. */
  async function expandToTable(
    user: ReturnType<typeof userEvent.setup>,
    getChildrenSpy: MockInstance<typeof window.api.database.getChildren>
  ): Promise<void> {
    getChildrenSpy
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_NODES })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.click(screen.getByText('AdventureWorks'))
    await waitFor(() => screen.getByText('explorer.tables'))
    await user.click(screen.getByText('explorer.tables'))
    await waitFor(() => screen.getByText('dbo.Product'))
  }

  it('clicking a table node expands it and shows 6 sub-folder categories', async () => {
    const user = userEvent.setup()
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren')
    await expandToTable(user, getChildrenSpy)

    getChildrenSpy.mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_CATEGORY_NODES })
    await user.click(screen.getByText('dbo.Product'))

    await waitFor(() => {
      expect(screen.getByText('explorer.columns')).toBeInTheDocument()
      expect(screen.getByText('explorer.keys')).toBeInTheDocument()
      expect(screen.getByText('explorer.constraints')).toBeInTheDocument()
      expect(screen.getByText('explorer.triggers')).toBeInTheDocument()
      expect(screen.getByText('explorer.indexes')).toBeInTheDocument()
      expect(screen.getByText('explorer.statistics')).toBeInTheDocument()
    })
  })

  it('calls getChildren with the correct table node id when a table is expanded', async () => {
    const user = userEvent.setup()
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren')
    await expandToTable(user, getChildrenSpy)

    getChildrenSpy.mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_CATEGORY_NODES })
    await user.click(screen.getByText('dbo.Product'))

    await waitFor(() =>
      expect(getChildrenSpy).toHaveBeenCalledWith(
        'conn-1',
        'db:AdventureWorks:tables:dbo.Product'
      )
    )
  })

  it('clicking the Columns folder calls getChildren with the columns node id', async () => {
    const user = userEvent.setup()
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren')
    await expandToTable(user, getChildrenSpy)

    getChildrenSpy
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_COLUMN_NODES })

    await user.click(screen.getByText('dbo.Product'))
    await waitFor(() => screen.getByText('explorer.columns'))

    await user.click(screen.getByText('explorer.columns'))

    await waitFor(() =>
      expect(getChildrenSpy).toHaveBeenCalledWith(
        'conn-1',
        'db:AdventureWorks:tables:dbo.Product:columns'
      )
    )
  })

  it('renders column leaf nodes after the Columns folder is expanded', async () => {
    const user = userEvent.setup()
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren')
    await expandToTable(user, getChildrenSpy)

    getChildrenSpy
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_COLUMN_NODES })

    await user.click(screen.getByText('dbo.Product'))
    await waitFor(() => screen.getByText('explorer.columns'))
    await user.click(screen.getByText('explorer.columns'))

    await waitFor(() => {
      expect(screen.getByText('ProductID (PK, int, not null)')).toBeInTheDocument()
      expect(screen.getByText('Name (nvarchar, null)')).toBeInTheDocument()
    })
  })

  it('shows "no items" row when a sub-folder returns an empty list', async () => {
    const user = userEvent.setup()
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren')
    await expandToTable(user, getChildrenSpy)

    getChildrenSpy
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: [] })

    await user.click(screen.getByText('dbo.Product'))
    await waitFor(() => screen.getByText('explorer.triggers'))
    await user.click(screen.getByText('explorer.triggers'))

    await waitFor(() =>
      expect(screen.getByText('explorer.noItems')).toBeInTheDocument()
    )
  })

  it('collapsing a table node hides its sub-folder categories', async () => {
    const user = userEvent.setup()
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren')
    await expandToTable(user, getChildrenSpy)

    getChildrenSpy.mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_CATEGORY_NODES })

    await user.click(screen.getByText('dbo.Product'))
    await waitFor(() => screen.getByText('explorer.columns'))

    // Click again to collapse
    await user.click(screen.getByText('dbo.Product'))

    await waitFor(() =>
      expect(screen.queryByText('explorer.columns')).not.toBeInTheDocument()
    )
  })
})

// ── getNodeDragText ───────────────────────────────────────────────────────────

describe('getNodeDragText', () => {
  it('formats a database node as [name]', () => {
    expect(getNodeDragText({ id: 'db:AdventureWorks', label: 'AdventureWorks', kind: 'database' }))
      .toBe('[AdventureWorks]')
  })

  it('formats a table node as [schema].[table]', () => {
    expect(getNodeDragText({ id: 'db:AdventureWorks:tables:dbo.Product', label: 'dbo.Product', kind: 'table' }))
      .toBe('[dbo].[Product]')
  })

  it('formats a table node without a schema dot as [name]', () => {
    expect(getNodeDragText({ id: 'db:AdventureWorks:tables:Product', label: 'Product', kind: 'table' }))
      .toBe('[Product]')
  })

  it('formats a column node by stripping the type suffix', () => {
    expect(getNodeDragText({ id: '...', label: 'ProductID (PK, int, not null)', kind: 'column-pk' }))
      .toBe('[ProductID]')
  })

  it('formats a non-PK column node by stripping the type suffix', () => {
    expect(getNodeDragText({ id: '...', label: 'Name (nvarchar, null)', kind: 'column' }))
      .toBe('[Name]')
  })

  it('formats a column with a multi-word type suffix correctly', () => {
    expect(getNodeDragText({ id: '...', label: 'Description (nvarchar, not null)', kind: 'column' }))
      .toBe('[Description]')
  })

  it('formats a column name that has no type suffix', () => {
    expect(getNodeDragText({ id: '...', label: 'ProductID', kind: 'column' }))
      .toBe('[ProductID]')
  })

  it('formats a view node using only the name part after the last dot', () => {
    expect(getNodeDragText({ id: '...', label: 'dbo.ProductSummary', kind: 'view' }))
      .toBe('[ProductSummary]')
  })

  it('formats a view node without a schema dot as [name]', () => {
    expect(getNodeDragText({ id: '...', label: 'ProductSummary', kind: 'view' }))
      .toBe('[ProductSummary]')
  })

  it('formats a stored-procedure node using only the name part', () => {
    expect(getNodeDragText({ id: '...', label: 'dbo.uspGetBillOfMaterials', kind: 'stored-procedure' }))
      .toBe('[uspGetBillOfMaterials]')
  })

  it('formats a function node using only the name part', () => {
    expect(getNodeDragText({ id: '...', label: 'dbo.ufnGetSalesOrderStatusText', kind: 'function' }))
      .toBe('[ufnGetSalesOrderStatusText]')
  })

  it('returns null for non-draggable folder kinds', () => {
    expect(getNodeDragText({ id: 'databases', label: 'Databases', kind: 'databases-folder' })).toBeNull()
    expect(getNodeDragText({ id: '...', label: 'Tables', kind: 'tables-folder' })).toBeNull()
    expect(getNodeDragText({ id: '...', label: 'Views', kind: 'views-folder' })).toBeNull()
    expect(getNodeDragText({ id: '...', label: 'Columns', kind: 'table-columns-folder' })).toBeNull()
  })
})

// ── Tree drag integration ─────────────────────────────────────────────────────

describe('ExplorerPage – tree drag', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })
      .mockResolvedValue({ status: 'ok', children: MOCK_TABLE_NODES })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function expandToTables(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.click(screen.getByText('AdventureWorks'))
    await waitFor(() => screen.getByText('explorer.tables'))
    await user.click(screen.getByText('explorer.tables'))
    await waitFor(() => screen.getByText('dbo.Product'))
  }

  it('table node has draggable attribute set', async () => {
    const user = userEvent.setup()
    await expandToTables(user)

    const tableEl = screen.getByText('dbo.Product').closest('[draggable]')
    expect(tableEl).toHaveAttribute('draggable', 'true')
  })

  it('dragging a table node sets text/plain to [schema].[table]', async () => {
    const user = userEvent.setup()
    await expandToTables(user)

    const tableEl = screen.getByText('dbo.Product').closest('[draggable="true"]')!
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(tableEl, { dataTransfer: dt })

    expect(dt.setData).toHaveBeenCalledWith('text/plain', '[dbo].[Product]')
  })

  it('database node has draggable attribute set', async () => {
    const user = userEvent.setup()
    await expandToTables(user)

    const dbEl = screen.getByText('AdventureWorks').closest('[draggable]')
    expect(dbEl).toHaveAttribute('draggable', 'true')
  })

  it('dragging a database node sets text/plain to [db]', async () => {
    const user = userEvent.setup()
    await expandToTables(user)

    const dbEl = screen.getByText('AdventureWorks').closest('[draggable="true"]')!
    const dt = { setData: vi.fn(), effectAllowed: '' }
    fireEvent.dragStart(dbEl, { dataTransfer: dt })

    expect(dt.setData).toHaveBeenCalledWith('text/plain', '[AdventureWorks]')
  })

  it('folder nodes are not draggable', async () => {
    const user = userEvent.setup()
    await expandToTables(user)

    const tablesFolder = screen.getByText('explorer.tables').closest('div')!
    expect(tablesFolder).not.toHaveAttribute('draggable', 'true')
  })
})

// ── Select Top Rows context menu ──────────────────────────────────────────────

describe('ExplorerPage – Select Top Rows', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_NODES })
    vi.spyOn(window.api.database, 'scriptSelectTopRows').mockResolvedValue({
      status: 'ok',
      script: 'SELECT TOP 1000 * FROM [AdventureWorks].[dbo].[Product]'
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function expandToTablesAndRightClickProduct(
    user: ReturnType<typeof userEvent.setup>
  ): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.click(screen.getByText('AdventureWorks'))
    await waitFor(() => screen.getByText('explorer.tables'))
    await user.click(screen.getByText('explorer.tables'))
    await waitFor(() => screen.getByText('dbo.Product'))
    await user.pointer({ target: screen.getByText('dbo.Product'), keys: '[MouseRight]' })
  }

  it('right-clicking a table node shows "Select Top X Rows" in the context menu', async () => {
    const user = userEvent.setup()
    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => {
      expect(screen.getByText(/explorer\.selectTopRows/i)).toBeInTheDocument()
    })
  })

  it('right-clicking a table node shows the Edit Table item alongside Select Top Rows', async () => {
    const user = userEvent.setup()
    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => {
      expect(screen.getByText('explorer.editTable.contextMenuLabel')).toBeInTheDocument()
    })
  })

  it('clicking Select Top Rows creates a new tab with the correct SQL query', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText(/explorer\.selectTopRows/i))
    await act(async () => {
      screen.getByText(/explorer\.selectTopRows/i).click()
    })

    await waitFor(() => {
      const tabs = screen.getAllByRole('tab')
      const topRowsTab = tabs.find((t) => t.textContent?.includes('Product'))
      expect(topRowsTab).toBeInTheDocument()
    })
  })

  it('clicking Select Top Rows immediately calls executeQuery with the correct SQL', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText(/explorer\.selectTopRows/i))
    await act(async () => {
      screen.getByText(/explorer\.selectTopRows/i).click()
    })

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        'conn-1',
        'SELECT TOP 1000 * FROM [AdventureWorks].[dbo].[Product]'
      )
    })
  })

  it('clicking Select Top Rows shows query results in the new tab', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        { columns: ['id', 'name'], rows: [{ id: 1, name: 'Widget' }], rowCount: 1 }
      ],
      messages: [],
      durationMs: 12
    })

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText(/explorer\.selectTopRows/i))
    await act(async () => {
      screen.getByText(/explorer\.selectTopRows/i).click()
    })

    await waitFor(() => {
      expect(screen.getByText('Widget')).toBeInTheDocument()
    })
  })

  it('clicking Select Top Rows shows error state when executeQuery fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Object does not exist'
    })

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText(/explorer\.selectTopRows/i))
    await act(async () => {
      screen.getByText(/explorer\.selectTopRows/i).click()
    })

    await waitFor(() => {
      expect(screen.getByText('Object does not exist')).toBeInTheDocument()
    })
  })

  // ── Eager loading indicator ───────────────────────────────────────────────

  it('shows eager loading spinner when onEagerLoadStatus fires loading', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])

    let triggerStatus!: (payload: { connectionId: string; status: 'loading' | 'complete' | 'error' }) => void
    vi.spyOn(window.api.database, 'onEagerLoadStatus').mockImplementation((cb) => {
      triggerStatus = cb
      return () => {}
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    act(() => {
      triggerStatus({ connectionId: 'conn-1', status: 'loading' })
    })

    await waitFor(() => {
      expect(screen.getByLabelText('explorer.eagerLoading')).toBeInTheDocument()
    })
  })

  it('hides eager loading spinner when status changes to complete', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])

    let triggerStatus!: (payload: { connectionId: string; status: 'loading' | 'complete' | 'error' }) => void
    vi.spyOn(window.api.database, 'onEagerLoadStatus').mockImplementation((cb) => {
      triggerStatus = cb
      return () => {}
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    act(() => {
      triggerStatus({ connectionId: 'conn-1', status: 'loading' })
    })
    await waitFor(() => {
      expect(screen.getByLabelText('explorer.eagerLoading')).toBeInTheDocument()
    })

    act(() => {
      triggerStatus({ connectionId: 'conn-1', status: 'complete' })
    })
    await waitFor(() => {
      expect(screen.queryByLabelText('explorer.eagerLoading')).not.toBeInTheDocument()
    })
  })

  it('does not show eager loading spinner for a different connection id', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])

    let triggerStatus!: (payload: { connectionId: string; status: 'loading' | 'complete' | 'error' }) => void
    vi.spyOn(window.api.database, 'onEagerLoadStatus').mockImplementation((cb) => {
      triggerStatus = cb
      return () => {}
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))

    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))

    act(() => {
      triggerStatus({ connectionId: 'conn-other', status: 'loading' })
    })

    // No spinner for conn-1
    expect(screen.queryByLabelText('explorer.eagerLoading')).not.toBeInTheDocument()
  })
})

// ── Drop Table context menu ───────────────────────────────────────────────────

describe('ExplorerPage – Drop Table', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_CATEGORY_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_TABLE_NODES })
    vi.spyOn(window.api.database, 'scriptTableDrop').mockResolvedValue({
      status: 'ok',
      script: 'DROP TABLE [AdventureWorks].[dbo].[Product]'
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function expandToTablesAndRightClickProduct(
    user: ReturnType<typeof userEvent.setup>
  ): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.click(screen.getByText('AdventureWorks'))
    await waitFor(() => screen.getByText('explorer.tables'))
    await user.click(screen.getByText('explorer.tables'))
    await waitFor(() => screen.getByText('dbo.Product'))
    await user.pointer({ target: screen.getByText('dbo.Product'), keys: '[MouseRight]' })
  }

  it('right-clicking a table node shows the Delete item in the context menu', async () => {
    const user = userEvent.setup()
    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => {
      expect(screen.getByText('explorer.dropTable.contextMenuLabel')).toBeInTheDocument()
    })
  })

  it('clicking Delete prompts for confirmation', async () => {
    const user = userEvent.setup()

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText('explorer.dropTable.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropTable.contextMenuLabel').click()
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.dropTable.confirmTitle' })).toBeInTheDocument()
    })
    expect(screen.getByText('explorer.dropTable.confirmMessage')).toBeInTheDocument()
  })

  it('does not execute query when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery')

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText('explorer.dropTable.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropTable.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.cancel'))

    expect(executeSpy).not.toHaveBeenCalledWith(
      'conn-1',
      expect.stringContaining('DROP TABLE')
    )
  })

  it('executes DROP TABLE with the correct SQL when confirmed', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText('explorer.dropTable.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropTable.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        'conn-1',
        'DROP TABLE [AdventureWorks].[dbo].[Product]'
      )
    })
  })

  it('refreshes the tables folder after successful drop', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    // Use mockResolvedValueOnce to chain the refresh response after the 3 tree-nav calls
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren').mockResolvedValueOnce(
      { status: 'ok', children: MOCK_DATABASE_NODES }
    ).mockResolvedValueOnce(
      { status: 'ok', children: MOCK_CATEGORY_NODES }
    ).mockResolvedValueOnce(
      { status: 'ok', children: MOCK_TABLE_NODES }
    ).mockResolvedValueOnce(
      { status: 'ok', children: [] }
    )

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText('explorer.dropTable.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropTable.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(getChildrenSpy).toHaveBeenCalledWith(
        'conn-1',
        'db:AdventureWorks:tables'
      )
    })
  })

  it('shows an alert when DROP TABLE fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Cannot drop table: foreign key constraint'
    })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText('explorer.dropTable.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropTable.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Cannot drop table: foreign key constraint')
    })
  })

  it('invalidates the eager cache before refreshing the tables list', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText('explorer.dropTable.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropTable.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith('conn-1', 'db:AdventureWorks:tables')
    })
  })

  it('does not invalidate cache when DROP TABLE fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Permission denied'
    })
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)

    await expandToTablesAndRightClickProduct(user)

    await waitFor(() => screen.getByText('explorer.dropTable.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropTable.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalled()
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

// ── Drop Database context menu ─────────────────────────────────────────────────

describe('ExplorerPage – Drop Database', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
    vi.spyOn(window.api.database, 'scriptDropDatabase').mockResolvedValue({
      status: 'ok',
      script: 'DROP DATABASE [AdventureWorks]'
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function expandDatabasesAndRightClickAdventureWorks(
    user: ReturnType<typeof userEvent.setup>
  ): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.pointer({ target: screen.getByText('AdventureWorks'), keys: '[MouseRight]' })
  }

  it('right-clicking a database node shows the Delete item in the context menu', async () => {
    const user = userEvent.setup()
    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => {
      expect(screen.getByText('explorer.dropDatabase.contextMenuLabel')).toBeInTheDocument()
    })
  })

  it('clicking Delete prompts for confirmation', async () => {
    const user = userEvent.setup()

    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => screen.getByText('explorer.dropDatabase.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropDatabase.contextMenuLabel').click()
    })

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.dropDatabase.confirmTitle' })).toBeInTheDocument()
    })
    expect(screen.getByText('explorer.dropDatabase.confirmMessage')).toBeInTheDocument()
  })

  it('does not execute query when confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery')

    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => screen.getByText('explorer.dropDatabase.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropDatabase.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.cancel'))

    expect(executeSpy).not.toHaveBeenCalledWith(
      'conn-1',
      expect.stringContaining('DROP DATABASE')
    )
  })

  it('executes DROP DATABASE with the correct SQL when confirmed', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => screen.getByText('explorer.dropDatabase.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropDatabase.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        'conn-1',
        'DROP DATABASE [AdventureWorks]'
      )
    })
  })

  it('refreshes the databases folder after successful drop', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren')
      .mockResolvedValueOnce({ status: 'ok', children: MOCK_DATABASE_NODES })
      .mockResolvedValueOnce({ status: 'ok', children: [] })

    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => screen.getByText('explorer.dropDatabase.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropDatabase.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(getChildrenSpy).toHaveBeenCalledWith('conn-1', 'databases')
    })
  })

  it('shows an alert when DROP DATABASE fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Cannot drop database: active connections exist'
    })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => screen.getByText('explorer.dropDatabase.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropDatabase.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Cannot drop database: active connections exist')
    })
  })

  it('invalidates the eager cache before refreshing the databases list', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)

    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => screen.getByText('explorer.dropDatabase.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropDatabase.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith('conn-1', 'databases')
    })
  })

  it('does not invalidate cache when DROP DATABASE fails', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Permission denied'
    })
    vi.spyOn(window, 'alert').mockImplementation(() => {})
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)

    await expandDatabasesAndRightClickAdventureWorks(user)

    await waitFor(() => screen.getByText('explorer.dropDatabase.contextMenuLabel'))
    await act(async () => {
      screen.getByText('explorer.dropDatabase.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalled()
    })
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})

// ── detectDdlFolderTypes ──────────────────────────────────────────────────────

describe('detectDdlFolderTypes', () => {
  it('returns empty array for a SELECT query', () => {
    expect(detectDdlFolderTypes('SELECT * FROM dbo.Product')).toEqual([])
  })

  it('detects CREATE TABLE', () => {
    expect(detectDdlFolderTypes('CREATE TABLE dbo.Test (id INT)')).toEqual(['tables'])
  })

  it('detects DROP TABLE', () => {
    expect(detectDdlFolderTypes('DROP TABLE dbo.Test')).toEqual(['tables'])
  })

  it('detects ALTER TABLE', () => {
    expect(detectDdlFolderTypes('ALTER TABLE dbo.Test ADD col INT')).toEqual(['tables'])
  })

  it('detects CREATE VIEW', () => {
    expect(detectDdlFolderTypes('CREATE VIEW dbo.MyView AS SELECT 1')).toEqual(['views'])
  })

  it('detects DROP VIEW', () => {
    expect(detectDdlFolderTypes('DROP VIEW dbo.MyView')).toEqual(['views'])
  })

  it('detects ALTER VIEW', () => {
    expect(detectDdlFolderTypes('ALTER VIEW dbo.MyView AS SELECT 2')).toEqual(['views'])
  })

  it('detects CREATE PROCEDURE', () => {
    expect(detectDdlFolderTypes('CREATE PROCEDURE dbo.MyProc AS BEGIN END')).toEqual(['stored-procedures'])
  })

  it('detects DROP PROCEDURE', () => {
    expect(detectDdlFolderTypes('DROP PROCEDURE dbo.MyProc')).toEqual(['stored-procedures'])
  })

  it('detects ALTER PROCEDURE', () => {
    expect(detectDdlFolderTypes('ALTER PROCEDURE dbo.MyProc AS BEGIN END')).toEqual(['stored-procedures'])
  })

  it('detects CREATE PROC (abbreviated)', () => {
    expect(detectDdlFolderTypes('CREATE PROC dbo.MyProc AS BEGIN END')).toEqual(['stored-procedures'])
  })

  it('detects DROP PROC (abbreviated)', () => {
    expect(detectDdlFolderTypes('DROP PROC dbo.MyProc')).toEqual(['stored-procedures'])
  })

  it('detects CREATE FUNCTION', () => {
    expect(detectDdlFolderTypes('CREATE FUNCTION dbo.MyFn() RETURNS INT AS BEGIN RETURN 1 END')).toEqual(['functions'])
  })

  it('detects DROP FUNCTION', () => {
    expect(detectDdlFolderTypes('DROP FUNCTION dbo.MyFn')).toEqual(['functions'])
  })

  it('detects ALTER FUNCTION', () => {
    expect(detectDdlFolderTypes('ALTER FUNCTION dbo.MyFn() RETURNS INT AS BEGIN RETURN 2 END')).toEqual(['functions'])
  })

  it('detects CREATE TYPE', () => {
    expect(detectDdlFolderTypes('CREATE TYPE dbo.MyType FROM INT')).toEqual(['types'])
  })

  it('detects DROP TYPE', () => {
    expect(detectDdlFolderTypes('DROP TYPE dbo.MyType')).toEqual(['types'])
  })

  it('is case-insensitive', () => {
    expect(detectDdlFolderTypes('create table dbo.T1 (id int)')).toEqual(['tables'])
    expect(detectDdlFolderTypes('Create View dbo.V1 AS SELECT 1')).toEqual(['views'])
  })

  it('deduplicates when multiple statements reference the same folder type', () => {
    const sql = 'CREATE TABLE dbo.A (id INT);\nDROP TABLE dbo.B'
    expect(detectDdlFolderTypes(sql)).toEqual(['tables'])
  })

  it('returns multiple folder types for a batch with mixed DDL', () => {
    const sql = 'CREATE TABLE dbo.T (id INT);\nCREATE VIEW dbo.V AS SELECT 1;\nDROP PROCEDURE dbo.P'
    const result = detectDdlFolderTypes(sql)
    expect(result).toContain('tables')
    expect(result).toContain('views')
    expect(result).toContain('stored-procedures')
    expect(result).toHaveLength(3)
  })

  it('does not match on partial word boundaries', () => {
    expect(detectDdlFolderTypes('SELECT * FROM tableName')).toEqual([])
    expect(detectDdlFolderTypes('-- this creates a view of the data')).toEqual([])
  })
})

// ── Export JSON ───────────────────────────────────────────────────────────────

describe('ExplorerPage – Export JSON', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({ status: 'ok', children: [] })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders an Export JSON button when result set has columns', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [{ columns: ['id', 'name'], rows: [{ id: 1, name: 'Alice' }], rowCount: 1 }],
      messages: [],
      durationMs: 10
    })
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(screen.getByTitle('Export JSON')).toBeInTheDocument()
    })
  })

  it('does not render Export JSON when the result set has no columns', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [{ columns: [], rows: [], rowCount: 0 }],
      messages: [],
      durationMs: 5
    })
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => screen.getByText(/0 rows/))
    expect(screen.queryByTitle('Export JSON')).not.toBeInTheDocument()
  })

  it('calls window.api.file.saveDialog with JSON content and .json options on click', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [{ columns: ['id', 'name'], rows: [{ id: 1, name: 'Alice' }], rowCount: 1 }],
      messages: [],
      durationMs: 10
    })
    const saveDialogSpy = vi
      .spyOn(window.api.file, 'saveDialog')
      .mockResolvedValue({ status: 'cancelled' })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => screen.getByTitle('Export JSON'))
    await user.click(screen.getByTitle('Export JSON'))

    await waitFor(() => {
      expect(saveDialogSpy).toHaveBeenCalledTimes(1)
    })

    const [content, options] = saveDialogSpy.mock.calls[0] as [string, { defaultPath: string; filters: { name: string; extensions: string[] }[] }]
    const parsed = JSON.parse(content)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed[0]).toEqual({ id: 1, name: 'Alice' })
    expect(options.defaultPath).toMatch(/\.json$/)
    expect(options.filters?.some((f) => f.extensions.includes('json'))).toBe(true)
  })

  it('uses a numbered suffix in the filename when there are multiple result sets', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        { columns: ['a'], rows: [{ a: 1 }], rowCount: 1 },
        { columns: ['b'], rows: [{ b: 2 }], rowCount: 1 }
      ],
      messages: [],
      durationMs: 10
    })
    const saveDialogSpy = vi
      .spyOn(window.api.file, 'saveDialog')
      .mockResolvedValue({ status: 'cancelled' })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My SQL Server'))
    await user.click(screen.getByText('My SQL Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Execute Query'))

    const exportJsonButtons = await waitFor(() => screen.getAllByTitle('Export JSON'))
    await user.click(exportJsonButtons[1])

    await waitFor(() => {
      expect(saveDialogSpy).toHaveBeenCalledTimes(1)
    })

    const [, options] = saveDialogSpy.mock.calls[0] as [string, { defaultPath: string }]
    expect(options.defaultPath).toBe('query-results-2.json')
  })
})

// ── Close All Tabs ────────────────────────────────────────────────────────────

describe('ExplorerPage – Close All Tabs', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  function dispatchCloseAll(): void {
    window.dispatchEvent(new CustomEvent('menu:file-action', { detail: 'window:close-all-tabs' }))
  }

  it('closes all clean tabs immediately without showing a dialog', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage isActive />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('New Query'))
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    act(() => dispatchCloseAll())

    await waitFor(() => {
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does nothing when there are no open tabs', () => {
    render(<ExplorerPage isActive />)

    act(() => dispatchCloseAll())

    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows UnsavedChangesDialog for the first dirty tab and removes clean tabs', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage isActive />)

    // Tab 1 — dirty
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))

    // Tab 2 — clean
    await user.click(screen.getByTitle('New Query'))

    expect(screen.getAllByRole('tab')).toHaveLength(2)

    act(() => dispatchCloseAll())

    // The clean tab (tab 2) should be gone; dialog shown for dirty tab 1
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' })).toBeInTheDocument()
    })
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  it('clicking Cancel on the dialog keeps the remaining dirty tab open', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage isActive />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))

    act(() => dispatchCloseAll())

    await waitFor(() => screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' }))

    await user.click(screen.getByText('explorer.unsavedChanges.cancelButton'))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })

  it('clicking Discard closes the dirty tab', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage isActive />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))

    act(() => dispatchCloseAll())

    await waitFor(() => screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' }))

    await user.click(screen.getByText('explorer.unsavedChanges.discardButton'))

    await waitFor(() => {
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows dialogs for each dirty tab in sequence when Discard is clicked', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage isActive />)

    // Two dirty tabs
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))

    act(() => dispatchCloseAll())

    // First dialog appears
    await waitFor(() => screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' }))
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    await user.click(screen.getByText('explorer.unsavedChanges.discardButton'))

    // Second dialog appears for the remaining dirty tab
    await waitFor(() => screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' }))
    expect(screen.getAllByRole('tab')).toHaveLength(1)

    await user.click(screen.getByText('explorer.unsavedChanges.discardButton'))

    // All tabs closed
    await waitFor(() => {
      expect(screen.queryByRole('tab')).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('Cancel on the first of two dirty tabs leaves both tabs open', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage isActive />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))

    act(() => dispatchCloseAll())

    await waitFor(() => screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' }))

    await user.click(screen.getByText('explorer.unsavedChanges.cancelButton'))

    // Queue aborted — second tab remains open, no dialog
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getAllByRole('tab')).toHaveLength(2)
  })

  it('clicking Save advances to the next dirty tab in the queue', async () => {
    vi.spyOn(window.api.file, 'saveDialog').mockResolvedValue({ status: 'ok', filePath: 'test.sql' })

    const user = userEvent.setup()
    render(<ExplorerPage isActive />)

    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))
    await user.click(screen.getByTitle('New Query'))
    await user.click(screen.getByTitle('Format'))

    act(() => dispatchCloseAll())

    await waitFor(() => screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' }))
    expect(screen.getAllByRole('tab')).toHaveLength(2)

    await user.click(screen.getByText('explorer.unsavedChanges.saveButton'))

    // After saving the first tab, the second dirty tab's dialog should appear
    await waitFor(() => screen.getByRole('dialog', { name: 'explorer.unsavedChanges.dialogTitle' }))
    expect(screen.getAllByRole('tab')).toHaveLength(1)
  })
})

// ── Redis keyspace context menu ───────────────────────────────────────────────

const MOCK_REDIS_CONNECTION = {
  id: 'conn-redis',
  name: 'My Redis',
  provider: 'redis' as const,
  host: 'localhost',
  port: 6379,
  username: '',
  password: '',
  rememberPassword: false,
  defaultDatabase: ''
}

const MOCK_REDIS_KEYSPACE_NODES = [
  { id: 'redis-db:0', label: '0', kind: 'redis-keyspace' as const },
  { id: 'redis-db:1', label: '1', kind: 'redis-keyspace' as const }
]

const MOCK_REDIS_LEAF_NODES = [
  { id: 'redis-key:0:user:42', label: 'user:42', kind: 'redis-key' as const },
  { id: 'redis-prefix:0:user', label: 'user', kind: 'redis-key-prefix' as const },
  { id: 'redis-key:0:bare', label: 'bare', kind: 'redis-key' as const }
]

describe('ExplorerPage – Redis keyspace context menu', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_REDIS_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({
      status: 'ok',
      children: MOCK_REDIS_KEYSPACE_NODES
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function expandToKeyspacesAndRightClick(
    user: ReturnType<typeof userEvent.setup>
  ): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My Redis'))
    await user.click(screen.getByText('My Redis'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('0'))
    await user.pointer({ target: screen.getByText('0'), keys: '[MouseRight]' })
  }

  it('right-clicking a Redis keyspace node shows the Refresh option', async () => {
    const user = userEvent.setup()
    await expandToKeyspacesAndRightClick(user)

    await waitFor(() => {
      expect(screen.getByText('explorer.redisKeyspace.refreshContextMenuLabel')).toBeInTheDocument()
    })
  })

  it('right-clicking a Redis keyspace node shows the Explore Data option', async () => {
    const user = userEvent.setup()
    await expandToKeyspacesAndRightClick(user)

    await waitFor(() => {
      expect(screen.getByText('explorer.redisKeyspace.exploreDataContextMenuLabel')).toBeInTheDocument()
    })
  })

  it('clicking Explore Data opens a redis-db-explorer tab', async () => {
    const user = userEvent.setup()
    await expandToKeyspacesAndRightClick(user)
    await waitFor(() => screen.getByText('explorer.redisKeyspace.exploreDataContextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.redisKeyspace.exploreDataContextMenuLabel').click()
    })

    await waitFor(() => {
      expect(screen.getByText('My Redis — DB 0 — Explorer')).toBeInTheDocument()
    })
  })

  it('double-clicking a Redis keyspace node opens a redis-db-explorer tab', async () => {
    const user = userEvent.setup()
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My Redis'))
    await user.click(screen.getByText('My Redis'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('0'))
    await user.dblClick(screen.getByText('0'))

    await waitFor(() => {
      expect(screen.getByText('My Redis — DB 0 — Explorer')).toBeInTheDocument()
    })
  })

  it('clicking Refresh calls invalidateCache and reloads the keyspace children', async () => {
    const user = userEvent.setup()
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)
    const getChildrenSpy = vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({
      status: 'ok',
      children: MOCK_REDIS_KEYSPACE_NODES
    })

    await expandToKeyspacesAndRightClick(user)
    await waitFor(() => screen.getByText('explorer.redisKeyspace.refreshContextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.redisKeyspace.refreshContextMenuLabel').click()
    })

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith('conn-redis', 'redis-db:0')
    })
    expect(getChildrenSpy).toHaveBeenCalledWith('conn-redis', 'redis-db:0')
  })

  // ── Background Auto Refresh ───────────────────────────────────────────────

  describe('Background Auto Refresh', () => {
    it('updates tree nodes silently when background refresh fires for a loaded node', async () => {
      const user = userEvent.setup()
      const autoRefreshConn = { ...MOCK_CONNECTION, backgroundAutoRefresh: true }
      vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([autoRefreshConn])
      vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
      vi.spyOn(window.api.database, 'getChildren').mockImplementation((_connId, nodeId) => {
        if (nodeId === 'databases') return Promise.resolve({ status: 'ok', children: MOCK_DATABASE_NODES })
        if (nodeId === 'db:AdventureWorks') return Promise.resolve({ status: 'ok', children: MOCK_CATEGORY_NODES })
        if (nodeId === 'db:AdventureWorks:tables') return Promise.resolve({ status: 'ok', children: MOCK_TABLE_NODES })
        return Promise.resolve({ status: 'ok', children: [] })
      })

      let refreshCb: (payload: { connectionId: string; updates: Array<{ nodeId: string; children: typeof MOCK_TABLE_NODES }> }) => void = () => {}
      vi.spyOn(window.api.database, 'onBackgroundRefresh').mockImplementation((cb) => {
        refreshCb = cb as typeof refreshCb
        return () => {}
      })

      render(<ExplorerPage />)
      await waitFor(() => screen.getByText('My SQL Server'))

      await user.click(screen.getByText('My SQL Server'))
      await waitFor(() => screen.getByText('explorer.databases'))

      await user.click(screen.getByText('explorer.databases'))
      await waitFor(() => screen.getByText('AdventureWorks'))

      await user.click(screen.getByText('AdventureWorks'))
      await waitFor(() => screen.getByText('explorer.tables'))

      await user.click(screen.getByText('explorer.tables'))
      await waitFor(() => screen.getByText('dbo.Product'))

      // Background refresh fires with new table list (dbo.SalesOrder replaced by dbo.NewTable)
      const updatedTables = [
        { id: 'db:AdventureWorks:tables:dbo.Product', label: 'dbo.Product', kind: 'table' as const },
        { id: 'db:AdventureWorks:tables:dbo.NewTable', label: 'dbo.NewTable', kind: 'table' as const }
      ]
      await act(async () => {
        refreshCb({ connectionId: 'conn-1', updates: [{ nodeId: 'db:AdventureWorks:tables', children: updatedTables }] })
      })

      expect(screen.getByText('dbo.NewTable')).toBeInTheDocument()
      expect(screen.getByText('dbo.Product')).toBeInTheDocument()
      // Removed table should no longer appear
      expect(screen.queryByText('dbo.SalesOrder')).not.toBeInTheDocument()
      // No loading spinner should be visible
      expect(screen.queryByText('explorer.loading')).not.toBeInTheDocument()
    })

    it('ignores background refresh for a node that is not loaded', async () => {
      const user = userEvent.setup()
      const autoRefreshConn = { ...MOCK_CONNECTION, backgroundAutoRefresh: true }
      vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([autoRefreshConn])
      vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
      vi.spyOn(window.api.database, 'getChildren').mockImplementation((_connId, nodeId) => {
        if (nodeId === 'databases') return Promise.resolve({ status: 'ok', children: MOCK_DATABASE_NODES })
        return Promise.resolve({ status: 'ok', children: [] })
      })

      let refreshCb: (payload: { connectionId: string; updates: Array<{ nodeId: string; children: typeof MOCK_TABLE_NODES }> }) => void = () => {}
      vi.spyOn(window.api.database, 'onBackgroundRefresh').mockImplementation((cb) => {
        refreshCb = cb as typeof refreshCb
        return () => {}
      })

      render(<ExplorerPage />)
      await waitFor(() => screen.getByText('My SQL Server'))

      await user.click(screen.getByText('My SQL Server'))
      await waitFor(() => screen.getByText('explorer.databases'))

      // Do NOT expand further — db:AdventureWorks:tables is not loaded
      await act(async () => {
        refreshCb({ connectionId: 'conn-1', updates: [{ nodeId: 'db:AdventureWorks:tables', children: MOCK_TABLE_NODES }] })
      })

      // Tables should not be visible because the node was never expanded/loaded
      expect(screen.queryByText('dbo.Product')).not.toBeInTheDocument()
    })

    it('calls syncWatchState when an auto-refresh connection is connected with loaded nodes', async () => {
      const user = userEvent.setup()
      const autoRefreshConn = { ...MOCK_CONNECTION, backgroundAutoRefresh: true }
      vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([autoRefreshConn])
      vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
      vi.spyOn(window.api.database, 'getChildren').mockResolvedValue({ status: 'ok', children: MOCK_DATABASE_NODES })
      const syncSpy = vi.spyOn(window.api.database, 'syncWatchState').mockResolvedValue()

      render(<ExplorerPage />)
      await waitFor(() => screen.getByText('My SQL Server'))

      await user.click(screen.getByText('My SQL Server'))
      await waitFor(() => screen.getByText('explorer.databases'))

      // Expand databases to make the 'databases' node loaded
      await user.click(screen.getByText('explorer.databases'))
      await waitFor(() => screen.getByText('AdventureWorks'))

      // Wait for the debounced sync (300ms)
      await waitFor(
        () => {
          expect(syncSpy).toHaveBeenCalledWith(
            'conn-1',
            true,
            expect.any(Boolean),
            expect.arrayContaining(['databases']),
            false
          )
        },
        { timeout: 1000 }
      )
    })
  })
})

// ── Redis key and prefix context menus removed ────────────────────────────────
// Key and prefix tree nodes are no longer shown in the Explorer tree.
// Key management is now done via the "Explore Data" tab (RedisDbExplorerTab).

// eslint-disable-next-line @typescript-eslint/no-unused-vars
describe.skip('ExplorerPage – Redis key context menu', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_REDIS_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockImplementation((_connId, nodeId) => {
      if (nodeId === 'redis-db:0') {
        return Promise.resolve({ status: 'ok', children: MOCK_REDIS_LEAF_NODES })
      }
      return Promise.resolve({ status: 'ok', children: MOCK_REDIS_KEYSPACE_NODES })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function expandToKeyAndRightClick(
    user: ReturnType<typeof userEvent.setup>,
    keyLabel: string
  ): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My Redis'))
    await user.click(screen.getByText('My Redis'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('0'))
    await user.click(screen.getByText('0'))
    await waitFor(() => screen.getByText(keyLabel))
    await user.pointer({ target: screen.getByText(keyLabel), keys: '[MouseRight]' })
  }

  it('right-clicking a redis-key node shows the Delete option', async () => {
    const user = userEvent.setup()
    await expandToKeyAndRightClick(user, 'user:42')
    await waitFor(() => {
      expect(screen.getByText('explorer.deleteRedisKey.contextMenuLabel')).toBeInTheDocument()
    })
  })

  it('does not call API when user cancels the delete confirmation', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(window.api.database, 'deleteRedisKey').mockResolvedValue({ status: 'ok', deletedCount: 1 })

    await expandToKeyAndRightClick(user, 'user:42')
    await waitFor(() => screen.getByText('explorer.deleteRedisKey.contextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.deleteRedisKey.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.cancel'))

    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('calls deleteRedisKey, invalidates keyspace and prefix cache when confirmed', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(window.api.database, 'deleteRedisKey').mockResolvedValue({ status: 'ok', deletedCount: 1 })
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)

    await expandToKeyAndRightClick(user, 'user:42')
    await waitFor(() => screen.getByText('explorer.deleteRedisKey.contextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.deleteRedisKey.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('conn-redis', '0', 'user:42')
    })
    expect(invalidateSpy).toHaveBeenCalledWith('conn-redis', 'redis-db:0')
    // user:42 has a prefix "user", so the prefix node cache should also be invalidated
    expect(invalidateSpy).toHaveBeenCalledWith('conn-redis', 'redis-prefix:0:user')
  })

  it('calls deleteRedisKey without prefix invalidation for a bare key (no colon)', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(window.api.database, 'deleteRedisKey').mockResolvedValue({ status: 'ok', deletedCount: 1 })
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)

    await expandToKeyAndRightClick(user, 'bare')
    await waitFor(() => screen.getByText('explorer.deleteRedisKey.contextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.deleteRedisKey.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('conn-redis', '0', 'bare')
    })
    // Only keyspace invalidation; no prefix
    expect(invalidateSpy).toHaveBeenCalledWith('conn-redis', 'redis-db:0')
    expect(invalidateSpy).not.toHaveBeenCalledWith('conn-redis', expect.stringContaining('redis-prefix'))
  })

  it('shows alert when deleteRedisKey returns an error', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'deleteRedisKey').mockResolvedValue({ status: 'error', message: 'READONLY' })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    await expandToKeyAndRightClick(user, 'user:42')
    await waitFor(() => screen.getByText('explorer.deleteRedisKey.contextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.deleteRedisKey.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('READONLY')
    })
  })
})

// ── Redis prefix context menu ─────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
describe.skip('ExplorerPage – Redis prefix context menu', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_REDIS_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockImplementation((_connId, nodeId) => {
      if (nodeId === 'redis-db:0') {
        return Promise.resolve({ status: 'ok', children: MOCK_REDIS_LEAF_NODES })
      }
      return Promise.resolve({ status: 'ok', children: MOCK_REDIS_KEYSPACE_NODES })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  async function expandToPrefixAndRightClick(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My Redis'))
    await user.click(screen.getByText('My Redis'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('0'))
    await user.click(screen.getByText('0'))
    await waitFor(() => screen.getByText('user'))
    await user.pointer({ target: screen.getAllByText('user')[0], keys: '[MouseRight]' })
  }

  it('right-clicking a redis-key-prefix node shows the Delete option', async () => {
    const user = userEvent.setup()
    await expandToPrefixAndRightClick(user)
    await waitFor(() => {
      expect(screen.getByText('explorer.deleteRedisPrefix.contextMenuLabel')).toBeInTheDocument()
    })
  })

  it('does not call API when user cancels the delete confirmation', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(window.api.database, 'deleteRedisPrefix').mockResolvedValue({ status: 'ok', deletedCount: 3 })

    await expandToPrefixAndRightClick(user)
    await waitFor(() => screen.getByText('explorer.deleteRedisPrefix.contextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.deleteRedisPrefix.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.cancel'))

    expect(deleteSpy).not.toHaveBeenCalled()
  })

  it('calls deleteRedisPrefix and invalidates keyspace cache when confirmed', async () => {
    const user = userEvent.setup()
    const deleteSpy = vi.spyOn(window.api.database, 'deleteRedisPrefix').mockResolvedValue({ status: 'ok', deletedCount: 3 })
    const invalidateSpy = vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue(undefined)

    await expandToPrefixAndRightClick(user)
    await waitFor(() => screen.getByText('explorer.deleteRedisPrefix.contextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.deleteRedisPrefix.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('conn-redis', '0', 'user')
    })
    expect(invalidateSpy).toHaveBeenCalledWith('conn-redis', 'redis-db:0')
  })

  it('shows alert when deleteRedisPrefix returns an error', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'deleteRedisPrefix').mockResolvedValue({ status: 'error', message: 'ERR_PREFIX' })
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})

    await expandToPrefixAndRightClick(user)
    await waitFor(() => screen.getByText('explorer.deleteRedisPrefix.contextMenuLabel'))

    await act(async () => {
      screen.getByText('explorer.deleteRedisPrefix.contextMenuLabel').click()
    })

    await waitFor(() => screen.getByRole('dialog'))
    await user.click(screen.getByText('confirmDialog.delete'))

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('ERR_PREFIX')
    })
  })
})

// ── MongoDB query results (JsonViewer integration) ─────────────────────────────

describe('ExplorerPage – MongoDB query results', () => {
  const MOCK_MONGODB_CONNECTION = {
    id: 'conn-mongo',
    name: 'My MongoDB',
    provider: 'mongodb' as const,
    host: 'localhost',
    port: 27017,
    username: '',
    password: '',
    rememberPassword: false,
    defaultDatabase: ''
  }

  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_MONGODB_CONNECTION])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockImplementation((_connId, nodeId) => {
      if (nodeId === 'databases') {
        return Promise.resolve({
          status: 'ok',
          children: [{ id: 'mongodb-db:testdb', label: 'testdb', kind: 'database' as const }]
        })
      }
      if (nodeId === 'mongodb-db:testdb') {
        return Promise.resolve({
          status: 'ok',
          children: [{ id: 'mongodb-collection:testdb:users', label: 'users', kind: 'mongodb-collection' as const }]
        })
      }
      return Promise.resolve({ status: 'ok', children: [] })
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  it('renders MongoDB documents via JsonViewer when executeQuery returns rawDocuments', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [
        {
          columns: [],
          rows: [],
          rowCount: 1,
          rawDocuments: ['{"_id":"abc123","name":"Alice"}']
        }
      ],
      messages: [],
      durationMs: 10
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('My MongoDB'))
    await user.click(screen.getByText('My MongoDB'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('testdb'))
    await user.click(screen.getByText('testdb'))
    await waitFor(() => screen.getByText('users'))
    await user.dblClick(screen.getByText('users'))
    await waitFor(() => screen.getByTitle('Execute Query'))
    await user.click(screen.getByTitle('Execute Query'))

    await waitFor(() => {
      expect(document.querySelector('.json-viewer')).toBeInTheDocument()
    })
  })
})
