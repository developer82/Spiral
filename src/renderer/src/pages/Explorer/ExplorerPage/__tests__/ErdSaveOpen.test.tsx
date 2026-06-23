// @vitest-environment jsdom
import { render, screen, waitFor, cleanup, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ExplorerPage from '../ExplorerPage'
import type { ErdFileContent } from '../../erd.types'

vi.mock('sql-formatter', () => ({
  format: vi.fn((sql: string) => sql)
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../../../contexts/ProfilerContext', () => ({
  useProfilerContext: () => ({ activateSession: vi.fn() })
}))

vi.mock('../../ExecutionPlanCanvas/ExecutionPlanCanvas', () => ({ default: () => null }))
vi.mock('../../ClientStatisticsView/ClientStatisticsView', () => ({ default: () => null }))
vi.mock('../../MonacoEditor/QueryEditor', () => ({ default: () => null }))
vi.mock('../../ErdCanvas/ErdCanvas', () => ({
  default: ({ loadState, saveTrigger, onSaveComplete, initialNodes }: {
    loadState: string
    saveTrigger?: boolean
    onSaveComplete?: (state: unknown) => void
    initialNodes?: unknown[]
  }) => {
    // When saveTrigger fires, emit fake serialized state
    if (saveTrigger && onSaveComplete) {
      onSaveComplete({
        nodes: initialNodes ?? [{ id: 'table-dbo.Orders', type: 'tableNode', position: { x: 10, y: 20 }, data: {} }],
        edges: [],
        curveType: 'smoothstep',
        viewport: { x: 0, y: 0, zoom: 1 }
      })
    }
    if (loadState === 'loading') return <div>Loading…</div>
    if (initialNodes) return <div data-testid="erd-canvas-from-file">ERD from file ({initialNodes.length} nodes)</div>
    return <div data-testid="erd-canvas">ERD Canvas</div>
  }
}))

vi.mock('../../../Settings/useSettings', () => ({
  useSettings: () => ({
    settings: {
      language: 'en',
      theme: 'dark',
      syntaxHighlighting: true,
      showGridLines: false,
      fontScaling: 100,
      queryTimeout: 30,
      showSystemDatabases: false,
      selectTopRowsCount: 1000,
      defaultErdBackground: 'dots',
      autoIncludeExecutionPlan: false,
      autoIncludeClientStatistics: false,
      glassEffectHour: -1
    },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

const MOCK_CONN = {
  id: 'conn-1',
  name: 'Test Server',
  provider: 'sqlserver' as const,
  host: 'localhost',
  port: 1433,
  username: 'sa',
  password: '',
  rememberPassword: false,
  defaultDatabase: 'master'
}

const MOCK_ERD_FILE_CONTENT: ErdFileContent = {
  version: 1,
  connectionId: 'conn-1',
  connectionName: 'Test Server',
  databaseName: 'AdventureWorks',
  nodes: [{ id: 'table-dbo.Orders', type: 'tableNode', position: { x: 10, y: 20 }, data: {} }] as unknown[],
  edges: [],
  curveType: 'smoothstep',
  background: 'dots',
  viewport: { x: -50, y: -100, zoom: 0.8 },
  savedAt: '2026-04-12T10:00:00.000Z'
}

describe('ERD Save and Open', () => {
  beforeEach(() => {
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([MOCK_CONN])
    vi.spyOn(window.api.database, 'connect').mockResolvedValue({ status: 'connected' })
    vi.spyOn(window.api.database, 'getChildren').mockImplementation(async (_connId, nodeId) => {
      if (nodeId === 'databases') {
        return {
          status: 'ok' as const,
          children: [{ id: 'db:AdventureWorks', label: 'AdventureWorks', kind: 'database' as const }]
        }
      }
      return { status: 'ok' as const, children: [] }
    })
    vi.spyOn(window.api.database, 'getErdSchema').mockResolvedValue({
      status: 'ok',
      schema: { tables: [{ schema: 'dbo', name: 'Orders', columns: [] }], relationships: [], indexes: [] }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    cleanup()
  })

  // ── ErdFileContent serialization ─────────────────────────────────────────

  it('serializes ErdFileContent with all required fields', () => {
    const content: ErdFileContent = {
      version: 1,
      connectionId: 'c1',
      connectionName: 'My Server',
      databaseName: 'Northwind',
      nodes: [],
      edges: [],
      curveType: 'smoothstep',
      background: 'grid',
      viewport: { x: 10, y: 20, zoom: 1.5 },
      savedAt: '2026-01-01T00:00:00.000Z'
    }
    const json = JSON.stringify(content)
    const parsed = JSON.parse(json) as ErdFileContent
    expect(parsed.version).toBe(1)
    expect(parsed.connectionId).toBe('c1')
    expect(parsed.databaseName).toBe('Northwind')
    expect(parsed.curveType).toBe('smoothstep')
    expect(parsed.background).toBe('grid')
    expect(parsed.viewport).toEqual({ x: 10, y: 20, zoom: 1.5 })
    expect(parsed.savedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('preserves nodes and edges through serialization round-trip', () => {
    const node = { id: 'table-dbo.Product', type: 'tableNode', position: { x: 100, y: 200 }, data: { schema: 'dbo', name: 'Product', columns: [] } }
    const edge = { id: 'rel-fk1', source: 'table-dbo.OrderItem', target: 'table-dbo.Product', type: 'smoothstep' }
    const content: ErdFileContent = {
      ...MOCK_ERD_FILE_CONTENT,
      nodes: [node],
      edges: [edge]
    }
    const parsed = JSON.parse(JSON.stringify(content)) as ErdFileContent
    expect(parsed.nodes).toHaveLength(1)
    expect(parsed.edges).toHaveLength(1)
    expect((parsed.nodes[0] as typeof node).id).toBe('table-dbo.Product')
    expect((parsed.edges[0] as typeof edge).id).toBe('rel-fk1')
  })

  // ── Save ERD: new file via dialog ─────────────────────────────────────────

  it('opens save-erd dialog when saving an ERD tab without a file path', async () => {
    const user = userEvent.setup()
    const saveErdDialogSpy = vi.spyOn(window.api.file, 'saveErdDialog').mockResolvedValue({
      status: 'ok',
      filePath: 'C:\\diagrams\\orders.erd'
    })
    const addErdFileSpy = vi.spyOn(window.api.connections, 'addErdFile').mockResolvedValue(undefined)

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('Test Server'))

    // Connect and open an ERD tab
    await user.click(screen.getByText('Test Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    // Right-click AdventureWorks → Create ERD
    await act(async () => {
      const dbNode = screen.getByText('AdventureWorks')
      dbNode.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 }))
    })
    await waitFor(() => screen.getByText('explorer.createErd.contextMenuLabel'))
    await user.click(screen.getByText('explorer.createErd.contextMenuLabel'))
    await waitFor(() => screen.getByTestId('erd-canvas'))

    // Wait for ERD tab to be loaded
    const saveBtn = screen.getByTitle('Save (Ctrl+S)')
    await user.click(saveBtn)

    await waitFor(() => {
      expect(saveErdDialogSpy).toHaveBeenCalledTimes(1)
    })
    const savedJson = saveErdDialogSpy.mock.calls[0][0]
    const saved = JSON.parse(savedJson) as ErdFileContent
    expect(saved.version).toBe(1)
    expect(saved.connectionId).toBe('conn-1')
    expect(saved.databaseName).toBe('AdventureWorks')
    expect(saved.background).toBe('dots')
    expect(addErdFileSpy).toHaveBeenCalledWith('conn-1', 'AdventureWorks', 'C:\\diagrams\\orders.erd')
  })

  it('updates tab title to filename without extension after first save', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.file, 'saveErdDialog').mockResolvedValue({
      status: 'ok',
      filePath: 'C:\\diagrams\\my-diagram.erd'
    })
    vi.spyOn(window.api.connections, 'addErdFile').mockResolvedValue(undefined)

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('Test Server'))

    await user.click(screen.getByText('Test Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    await act(async () => {
      screen.getByText('AdventureWorks').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })
      )
    })
    await waitFor(() => screen.getByText('explorer.createErd.contextMenuLabel'))
    await user.click(screen.getByText('explorer.createErd.contextMenuLabel'))
    await waitFor(() => screen.getByTestId('erd-canvas'))

    await user.click(screen.getByTitle('Save (Ctrl+S)'))

    await waitFor(() => {
      expect(screen.getByText('my-diagram')).toBeInTheDocument()
    })
  })

  // ── Open ERD: via Open button when ERD tab is active ──────────────────────

  it('opens ERD file via Open button when an ERD tab is active', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.file, 'openErdDialog').mockResolvedValue({
      status: 'ok',
      filePath: 'C:\\diagrams\\orders.erd',
      content: JSON.stringify(MOCK_ERD_FILE_CONTENT)
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('Test Server'))

    // Create an ERD tab first
    await user.click(screen.getByText('Test Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))

    await act(async () => {
      screen.getByText('AdventureWorks').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })
      )
    })
    await waitFor(() => screen.getByText('explorer.createErd.contextMenuLabel'))
    await user.click(screen.getByText('explorer.createErd.contextMenuLabel'))
    await waitFor(() => screen.getByTestId('erd-canvas'))

    // Click Open with an ERD tab active → should call openErdDialog
    await user.click(screen.getByTitle('Open (Ctrl+O)'))

    await waitFor(() => {
      expect(window.api.file.openErdDialog).toHaveBeenCalledTimes(1)
    })
    // A new tab should have been opened with the file data
    await waitFor(() => {
      expect(screen.getByTestId('erd-canvas-from-file')).toBeInTheDocument()
    })
  })

  it('opens SQL file via Open button when a query tab is active', async () => {
    const user = userEvent.setup()
    const openDialogSpy = vi.spyOn(window.api.file, 'openDialog').mockResolvedValue({
      status: 'ok',
      filePath: 'C:\\queries\\report.sql',
      content: 'SELECT 1'
    })

    render(<ExplorerPage />)
    // No tabs — clicking Open should call the SQL openDialog
    await user.click(screen.getByTitle('Open (Ctrl+O)'))

    await waitFor(() => {
      expect(openDialogSpy).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.getByText('report.sql')).toBeInTheDocument()
    })
  })

  // ── Open ERD from tree ────────────────────────────────────────────────────

  it('opens an ERD tab when clicking a file in the ERD Files folder', async () => {
    const user = userEvent.setup()
    const connWithErd = {
      ...MOCK_CONN,
      erdFiles: [{ databaseName: 'AdventureWorks', filePath: 'C:\\diagrams\\orders.erd' }]
    }
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([connWithErd])
    vi.spyOn(window.api.file, 'read').mockResolvedValue({
      status: 'ok',
      content: JSON.stringify(MOCK_ERD_FILE_CONTENT)
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('Test Server'))

    // Connect and expand the database tree
    await user.click(screen.getByText('Test Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.click(screen.getByText('AdventureWorks'))

    // ERD Files folder should appear
    await waitFor(() => {
      expect(screen.getByText('explorer.erdFilesFolder')).toBeInTheDocument()
    })

    // Expand ERD Files folder
    await user.click(screen.getByText('explorer.erdFilesFolder'))

    // "orders" file should appear (filename without .erd extension)
    await waitFor(() => {
      expect(screen.getByText('orders')).toBeInTheDocument()
    })

    // Click it to open
    await user.click(screen.getByText('orders'))

    await waitFor(() => {
      expect(window.api.file.read).toHaveBeenCalledWith('C:\\diagrams\\orders.erd')
    })
    await waitFor(() => {
      expect(screen.getByTestId('erd-canvas-from-file')).toBeInTheDocument()
    })
  })

  it('switches to existing tab instead of opening a duplicate when ERD file is already open', async () => {
    const user = userEvent.setup()
    const connWithErd = {
      ...MOCK_CONN,
      erdFiles: [{ databaseName: 'AdventureWorks', filePath: 'C:\\diagrams\\orders.erd' }]
    }
    vi.spyOn(window.api.connections, 'getAll').mockResolvedValue([connWithErd])
    const readSpy = vi.spyOn(window.api.file, 'read').mockResolvedValue({
      status: 'ok',
      content: JSON.stringify(MOCK_ERD_FILE_CONTENT)
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('Test Server'))
    await user.click(screen.getByText('Test Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.click(screen.getByText('AdventureWorks'))

    await waitFor(() => screen.getByText('explorer.erdFilesFolder'))
    await user.click(screen.getByText('explorer.erdFilesFolder'))
    await waitFor(() => screen.getByText('orders'))

    // First click — opens tab
    await user.click(screen.getByText('orders'))
    await waitFor(() => screen.getByTestId('erd-canvas-from-file'))
    expect(readSpy).toHaveBeenCalledTimes(1)

    // Second click on the tree node — should reuse existing tab, not call read again
    // After the tab opens, there are two "orders" elements: the tree node (first in DOM)
    // and the tab title. Pick the first one (tree node in the sidebar).
    const treeNode = screen.getAllByText('orders')[0]
    await user.click(treeNode)
    expect(readSpy).toHaveBeenCalledTimes(1)
  })

  // ── Remove ERD file from tree ─────────────────────────────────────────────

  it('removes an ERD file from the list via context menu', async () => {
    const user = userEvent.setup()
    const connWithErd = {
      ...MOCK_CONN,
      erdFiles: [{ databaseName: 'AdventureWorks', filePath: 'C:\\diagrams\\orders.erd' }]
    }
    vi.spyOn(window.api.connections, 'getAll')
      .mockResolvedValueOnce([connWithErd])
      .mockResolvedValue([{ ...MOCK_CONN, erdFiles: [] }])
    vi.spyOn(window.api.connections, 'removeErdFile').mockResolvedValue(undefined)
    vi.spyOn(window.api.file, 'read').mockResolvedValue({
      status: 'ok',
      content: JSON.stringify(MOCK_ERD_FILE_CONTENT)
    })

    render(<ExplorerPage />)
    await waitFor(() => screen.getByText('Test Server'))
    await user.click(screen.getByText('Test Server'))
    await waitFor(() => screen.getByText('explorer.databases'))
    await user.click(screen.getByText('explorer.databases'))
    await waitFor(() => screen.getByText('AdventureWorks'))
    await user.click(screen.getByText('AdventureWorks'))
    await waitFor(() => screen.getByText('explorer.erdFilesFolder'))
    await user.click(screen.getByText('explorer.erdFilesFolder'))
    await waitFor(() => screen.getByText('orders'))

    // Right-click the ERD file entry
    await act(async () => {
      screen.getByText('orders').dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, clientX: 100, clientY: 100 })
      )
    })

    await waitFor(() => {
      expect(screen.getByText('explorer.erdFile.remove')).toBeInTheDocument()
    })
    await user.click(screen.getByText('explorer.erdFile.remove'))

    await waitFor(() => {
      expect(window.api.connections.removeErdFile).toHaveBeenCalledWith('conn-1', 'C:\\diagrams\\orders.erd')
    })
  })
})
