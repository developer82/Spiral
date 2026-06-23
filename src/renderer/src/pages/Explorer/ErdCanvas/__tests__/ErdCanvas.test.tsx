// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { useEdgesState, useNodesState } from '@xyflow/react'
import ErdCanvas from '../ErdCanvas'
import type { ErdSchema } from '../../erd.types'
import type { ErdExportOptions } from '../../Dialogs/ErdExportDialog/ErdExportDialog'
import { SettingsProvider } from '../../../../contexts/SettingsContext'

// ── Mock html-to-image ────────────────────────────────────────────────────────
vi.mock('html-to-image', () => ({
  toPng: vi.fn().mockResolvedValue('data:image/png;base64,test')
}))

// ── Mock @xyflow/react ────────────────────────────────────────────────────────
// Use JSX (transformed by esbuild at build time) — do NOT use require() inside
// vi.mock factories; ESM environments don't have require available.

// Stores the latest onNodeContextMenu / deleteKeyCode / onPaneClick props for use in tests
let capturedOnNodeContextMenu: ((e: React.MouseEvent, node: unknown) => void) | null = null
let capturedDeleteKeyCode: string | null = null
let capturedOnPaneClick: (() => void) | null = null

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    children,
    onNodeContextMenu,
    deleteKeyCode,
    onPaneClick
  }: {
    children?: React.ReactNode
    onNodeContextMenu?: (e: React.MouseEvent, node: unknown) => void
    deleteKeyCode?: string
    onPaneClick?: () => void
  }) => {
    capturedOnNodeContextMenu = onNodeContextMenu ?? null
    capturedDeleteKeyCode = deleteKeyCode ?? null
    capturedOnPaneClick = onPaneClick ?? null
    return <div data-testid="react-flow">{children}</div>
  },
  ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-provider">{children}</div>
  ),
  Background: ({ variant }: { variant?: string }) => <div data-testid={`erd-background-${variant ?? 'default'}`} />,
  BackgroundVariant: { Dots: 'dots', Lines: 'lines' },
  Controls: () => null,
  MiniMap: () => <div data-testid="minimap" />,
  Panel: ({ children, position }: { children?: React.ReactNode; position?: string }) => (
    <div data-testid={`panel-${position}`}>{children}</div>
  ),
  addEdge: vi.fn((edge: unknown, edges: unknown[]) => [...edges, edge]),
  useNodesState: vi.fn((initial: unknown[]) => [initial, vi.fn(), vi.fn()]),
  useEdgesState: vi.fn((initial: unknown[]) => [initial, vi.fn(), vi.fn()]),
  useReactFlow: () => ({ updateNodeData: vi.fn(), getNodes: vi.fn().mockReturnValue([]), screenToFlowPosition: vi.fn().mockReturnValue({ x: 0, y: 0 }), getViewport: vi.fn().mockReturnValue({ x: 0, y: 0, zoom: 1 }), setViewport: vi.fn() }),
  getNodesBounds: vi.fn().mockReturnValue({ x: 0, y: 0, width: 800, height: 600 }),
  MarkerType: { ArrowClosed: 'arrowclosed' },
  Position: { Left: 'left', Right: 'right' },
  Handle: () => null
}))

// ── Test schema fixture ───────────────────────────────────────────────────────

const mockSchema: ErdSchema = {
  tables: [
    {
      schema: 'dbo',
      name: 'Users',
      columns: [
        { name: 'Id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false },
        { name: 'Email', type: 'varchar', maxLength: 255, isNullable: false, isPrimaryKey: false, isForeignKey: false }
      ]
    },
    {
      schema: 'dbo',
      name: 'Orders',
      columns: [
        { name: 'Id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false },
        { name: 'UserId', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: false, isForeignKey: true }
      ]
    }
  ],
  relationships: [
    {
      constraintName: 'FK_Orders_Users',
      fromSchema: 'dbo', fromTable: 'Orders', fromColumn: 'UserId',
      toSchema: 'dbo',   toTable: 'Users',   toColumn: 'Id'
    }
  ],
  indexes: [
    { schema: 'dbo', table: 'Users', name: 'PK_Users', typeDesc: 'CLUSTERED', isUnique: true, isPrimaryKey: true }
  ]
}

// ── Tests ─────────────────────────────────────────────────────────────────────

function renderErd(ui: React.ReactElement): ReturnType<typeof render> {
  return render(ui, { wrapper: SettingsProvider })
}

describe('ErdCanvas', () => {
  afterEach(() => {
    cleanup()
    capturedOnNodeContextMenu = null
    capturedDeleteKeyCode = null
    capturedOnPaneClick = null
  })

  it('renders loading spinner when loadState is loading', () => {
    renderErd(<ErdCanvas loadState="loading" databaseName="TestDb" />)
    expect(screen.getByText(/analyzing database schema/i)).toBeInTheDocument()
  })

  it('renders error message when loadState is error', () => {
    renderErd(<ErdCanvas loadState="error" error="Connection failed" databaseName="TestDb" />)
    expect(screen.getByText('Connection failed')).toBeInTheDocument()
  })

  it('renders fallback error text when no error prop given', () => {
    renderErd(<ErdCanvas loadState="error" databaseName="TestDb" />)
    expect(screen.getByText(/failed to load erd schema/i)).toBeInTheDocument()
  })

  it('renders ReactFlowProvider when loadState is loaded', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    expect(screen.getByTestId('react-flow-provider')).toBeInTheDocument()
  })

  it('renders the ReactFlow canvas', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    expect(screen.getByTestId('react-flow')).toBeInTheDocument()
  })

  it('renders the minimap', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
  })

  it('renders the bottom-center panel with stats figures', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    expect(panel).toBeInTheDocument()
    // 2 tables
    expect(panel).toHaveTextContent('2')
    // 4 total columns
    expect(panel).toHaveTextContent('4')
    // 1 relationship
    expect(panel).toHaveTextContent('1')
    // 1 index
    expect(panel).toHaveTextContent('1')
  })

  it('renders text and heading buttons in the dock toolbar', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    expect(panel.querySelector('[title="Add Text"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Add Heading 1"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Add Heading 2"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Add Heading 3"]')).toBeInTheDocument()
  })

  it('renders the curved/straight toggle buttons in the top-left panel', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-top-left')
    expect(panel.querySelector('[title="Curved connections"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Straight connections"]')).toBeInTheDocument()
  })

  it('renders nothing when loadState is loaded but schema is missing', () => {
    const { container } = renderErd(<ErdCanvas loadState="loaded" databaseName="TestDb" />)
    expect(container.firstChild).toBeNull()
  })

  it('format buttons are not shown when no text node is selected', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    expect(panel.querySelector('[title="Bold"]')).not.toBeInTheDocument()
    expect(panel.querySelector('[title="Italic"]')).not.toBeInTheDocument()
    expect(panel.querySelector('[title="Underline"]')).not.toBeInTheDocument()
    expect(panel.querySelector('[title="Strikethrough"]')).not.toBeInTheDocument()
  })

  it('clicking Add Text button does not throw', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    const addTextBtn = panel.querySelector('[title="Add Text"]') as HTMLElement
    expect(() => fireEvent.click(addTextBtn)).not.toThrow()
  })

  // ── Background tests ──────────────────────────────────────────────────────

  it('renders dots background by default', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    expect(screen.getByTestId('erd-background-dots')).toBeInTheDocument()
  })

  it('renders dots background when background="dots"', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" background="dots" onBackgroundChange={vi.fn()} />)
    expect(screen.getByTestId('erd-background-dots')).toBeInTheDocument()
    expect(screen.queryByTestId('erd-background-lines')).not.toBeInTheDocument()
  })

  it('renders lines background when background="grid"', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" background="grid" onBackgroundChange={vi.fn()} />)
    expect(screen.getByTestId('erd-background-lines')).toBeInTheDocument()
    expect(screen.queryByTestId('erd-background-dots')).not.toBeInTheDocument()
  })

  it('renders no background when background="none"', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" background="none" onBackgroundChange={vi.fn()} />)
    expect(screen.queryByTestId('erd-background-dots')).not.toBeInTheDocument()
    expect(screen.queryByTestId('erd-background-lines')).not.toBeInTheDocument()
  })

  it('renders background toolbar buttons in the top-left panel', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" background="dots" onBackgroundChange={vi.fn()} />)
    const panel = screen.getByTestId('panel-top-left')
    expect(panel.querySelector('[title="No background"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Dot grid background"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Line grid background"]')).toBeInTheDocument()
  })

  it('marks active background button as active', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" background="grid" onBackgroundChange={vi.fn()} />)
    const panel = screen.getByTestId('panel-top-left')
    const gridBtn = panel.querySelector('[title="Line grid background"]') as HTMLElement
    expect(gridBtn.className).toContain('erd-canvas__toolbar-btn--active')
    const dotsBtn = panel.querySelector('[title="Dot grid background"]') as HTMLElement
    expect(dotsBtn.className).not.toContain('erd-canvas__toolbar-btn--active')
  })

  it('calls onBackgroundChange with correct value when background button clicked', () => {
    const onBackgroundChange = vi.fn()
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" background="dots" onBackgroundChange={onBackgroundChange} />)
    const panel = screen.getByTestId('panel-top-left')
    const noneBtn = panel.querySelector('[title="No background"]') as HTMLElement
    fireEvent.click(noneBtn)
    expect(onBackgroundChange).toHaveBeenCalledWith('none')
  })

  // ── Edge style controls ───────────────────────────────────────────────────

  it('edge style controls are not shown when no edge is selected', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    expect(panel.querySelector('[title="Edge color"]')).not.toBeInTheDocument()
    expect(panel.querySelector('[title="Solid line"]')).not.toBeInTheDocument()
    expect(panel.querySelector('[title="Dashed line"]')).not.toBeInTheDocument()
  })

  it('edge style controls are shown when an edge is selected', () => {
    vi.mocked(useEdgesState).mockReturnValueOnce([
      [{ id: 'rel-FK_Orders_Users', source: 'table-dbo.Orders', target: 'table-dbo.Users', selected: true, style: { stroke: '#8892aa', strokeWidth: 1.5 } }],
      vi.fn(),
      vi.fn()
    ] as unknown as ReturnType<typeof useEdgesState>)
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    expect(panel.querySelector('[title="Edge color"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Solid line"]')).toBeInTheDocument()
    expect(panel.querySelector('[title="Dashed line"]')).toBeInTheDocument()
  })

  it('solid line button has active class when edge is not dashed', () => {
    vi.mocked(useEdgesState).mockReturnValueOnce([
      [{ id: 'rel-1', source: 's', target: 't', selected: true, style: { stroke: '#8892aa', strokeWidth: 1.5 } }],
      vi.fn(),
      vi.fn()
    ] as unknown as ReturnType<typeof useEdgesState>)
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    const solidBtn = panel.querySelector('[title="Solid line"]') as HTMLElement
    expect(solidBtn.className).toContain('erd-canvas__dock-btn--active')
    const dashedBtn = panel.querySelector('[title="Dashed line"]') as HTMLElement
    expect(dashedBtn.className).not.toContain('erd-canvas__dock-btn--active')
  })

  it('dashed line button has active class when edge has dasharray', () => {
    vi.mocked(useEdgesState).mockReturnValueOnce([
      [{ id: 'rel-1', source: 's', target: 't', selected: true, style: { stroke: '#d575ff', strokeWidth: 1.5, strokeDasharray: '5 5' } }],
      vi.fn(),
      vi.fn()
    ] as unknown as ReturnType<typeof useEdgesState>)
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    const dashedBtn = panel.querySelector('[title="Dashed line"]') as HTMLElement
    expect(dashedBtn.className).toContain('erd-canvas__dock-btn--active')
    const solidBtn = panel.querySelector('[title="Solid line"]') as HTMLElement
    expect(solidBtn.className).not.toContain('erd-canvas__dock-btn--active')
  })

  it('clicking the edge color button toggles the color picker', () => {
    vi.mocked(useEdgesState).mockReturnValue([
      [{ id: 'rel-1', source: 's', target: 't', selected: true, style: { stroke: '#8892aa' } }],
      vi.fn(),
      vi.fn()
    ] as unknown as ReturnType<typeof useEdgesState>)
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    // Picker is initially hidden
    expect(panel.querySelector('.erd-canvas__edge-color-picker')).not.toBeInTheDocument()
    // Click color button to open picker
    const colorBtn = panel.querySelector('[title="Edge color"]') as HTMLElement
    fireEvent.click(colorBtn)
    expect(panel.querySelector('.erd-canvas__edge-color-picker')).toBeInTheDocument()
    // Click again to close
    fireEvent.click(colorBtn)
    expect(panel.querySelector('.erd-canvas__edge-color-picker')).not.toBeInTheDocument()
    vi.mocked(useEdgesState).mockImplementation(((initial: unknown[]) => [initial, vi.fn(), vi.fn()]) as never)
  })

  it('clicking a color swatch closes the picker', () => {
    vi.mocked(useEdgesState).mockReturnValue([
      [{ id: 'rel-1', source: 's', target: 't', selected: true, style: { stroke: '#8892aa' } }],
      vi.fn(),
      vi.fn()
    ] as unknown as ReturnType<typeof useEdgesState>)
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    const colorBtn = panel.querySelector('[title="Edge color"]') as HTMLElement
    fireEvent.click(colorBtn)
    const swatches = panel.querySelectorAll('.erd-canvas__edge-color-swatch')
    expect(swatches.length).toBeGreaterThan(0)
    fireEvent.click(swatches[0])
    expect(panel.querySelector('.erd-canvas__edge-color-picker')).not.toBeInTheDocument()
    vi.mocked(useEdgesState).mockImplementation(((initial: unknown[]) => [initial, vi.fn(), vi.fn()]) as never)
  })

  it('text color button is not shown when no text node is selected', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    expect(panel.querySelector('[title="Text color"]')).not.toBeInTheDocument()
  })

  it('text color button is shown and opens picker when a text node is selected', () => {
    vi.mocked(useNodesState).mockReturnValue([
      [
        {
          id: 'text-1',
          type: 'textNode',
          position: { x: 0, y: 0 },
          selected: true,
          data: { text: 'Hello', headingLevel: 'p', bold: false, italic: false, underline: false, strike: false }
        }
      ],
      vi.fn(),
      vi.fn()
    ] as unknown as ReturnType<typeof useNodesState>)
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    const colorBtn = panel.querySelector('[title="Text color"]') as HTMLButtonElement | null
    expect(colorBtn).toBeInTheDocument()
    expect(colorBtn?.disabled).toBe(false)
    // Picker hidden initially
    expect(panel.querySelector('.erd-canvas__edge-color-picker')).not.toBeInTheDocument()
    fireEvent.click(colorBtn!)
    expect(panel.querySelector('.erd-canvas__edge-color-picker')).toBeInTheDocument()
    vi.mocked(useNodesState).mockImplementation(((initial: unknown[]) => [initial, vi.fn(), vi.fn()]) as never)
  })

  it('clicking a text color swatch closes the text color picker', () => {
    vi.mocked(useNodesState).mockReturnValue([
      [
        {
          id: 'text-1',
          type: 'textNode',
          position: { x: 0, y: 0 },
          selected: true,
          data: { text: 'Hello', headingLevel: 'p', bold: false, italic: false, underline: false, strike: false }
        }
      ],
      vi.fn(),
      vi.fn()
    ] as unknown as ReturnType<typeof useNodesState>)
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const panel = screen.getByTestId('panel-bottom-center')
    const colorBtn = panel.querySelector('[title="Text color"]') as HTMLElement
    fireEvent.click(colorBtn)
    const picker = panel.querySelector('.erd-canvas__edge-color-picker') as HTMLElement
    expect(picker).toBeInTheDocument()
    const swatches = picker.querySelectorAll('.erd-canvas__edge-color-swatch')
    expect(swatches.length).toBeGreaterThan(0)
    fireEvent.click(swatches[0])
    expect(panel.querySelector('.erd-canvas__edge-color-picker')).not.toBeInTheDocument()
    vi.mocked(useNodesState).mockImplementation(((initial: unknown[]) => [initial, vi.fn(), vi.fn()]) as never)
  })

  // ── Export trigger tests ──────────────────────────────────────────────────

  it('does not call onExportComplete when exportTrigger is null', () => {
    const onExportComplete = vi.fn()
    renderErd(
      <ErdCanvas
        loadState="loaded"
        schema={mockSchema}
        databaseName="TestDb"
        exportTrigger={null}
        onExportComplete={onExportComplete}
      />
    )
    expect(onExportComplete).not.toHaveBeenCalled()
  })

  it('calls onExportComplete after a valid exportTrigger fires', async () => {
    const onExportComplete = vi.fn()
    const trigger: ErdExportOptions = {
      backgroundColor: '#ffffff',
      transparent: false,
      grid: 'none',
      includeStats: false
    }

    // Step 1: render with no trigger so the first effect pass does nothing
    const { rerender } = renderErd(
      <ErdCanvas
        loadState="loaded"
        schema={mockSchema}
        databaseName="TestDb"
        exportTrigger={null}
        onExportComplete={onExportComplete}
      />
    )

    // Step 2: inject a .react-flow__viewport element so the export logic can find it
    const rfDiv = screen.getByTestId('react-flow')
    const viewportEl = document.createElement('div')
    viewportEl.className = 'react-flow__viewport'
    rfDiv.appendChild(viewportEl)

    // Step 3: mock canvas, Image and URL APIs for jsdom compatibility
    // URL.createObjectURL / revokeObjectURL are not implemented in jsdom —
    // assign stubs directly to prevent them from throwing.
    const origCreateObjectURL = (URL as typeof URL & { createObjectURL?: unknown }).createObjectURL
    const origRevokeObjectURL = (URL as typeof URL & { revokeObjectURL?: unknown }).revokeObjectURL
    URL.createObjectURL = vi.fn().mockReturnValue('blob:test') as typeof URL.createObjectURL
    URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL

    const originalCreateElement = document.createElement.bind(document)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(document, 'createElement').mockImplementation((tag: string): any => {
      if (tag === 'canvas') {
        const canvas = originalCreateElement('canvas')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(canvas as any).getContext = () => ({
          scale: vi.fn(),
          fillRect: vi.fn(),
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
          save: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          stroke: vi.fn(),
          drawImage: vi.fn(),
          textBaseline: '',
          font: '',
          fillText: vi.fn()
        })
        canvas.toBlob = (cb: BlobCallback) => cb(new Blob([''], { type: 'image/png' }))
        return canvas
      }
      if (tag === 'a') {
        const a = originalCreateElement('a')
        a.click = vi.fn()
        return a
      }
      return originalCreateElement(tag)
    })

    const OriginalImage = globalThis.Image
    class MockImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_: string) { setTimeout(() => this.onload?.(), 0) }
    }
    globalThis.Image = MockImage as unknown as typeof Image

    // Step 4: rerender with the trigger; the useEffect will now find the viewport element
    rerender(
      <ErdCanvas
        loadState="loaded"
        schema={mockSchema}
        databaseName="TestDb"
        exportTrigger={trigger}
        onExportComplete={onExportComplete}
      />
    )

    // Step 5: wait for async export to complete
    await vi.waitFor(() => expect(onExportComplete).toHaveBeenCalledOnce(), { timeout: 3000 })

    globalThis.Image = OriginalImage
    vi.mocked(document.createElement).mockRestore()
    ;(URL as typeof URL & { createObjectURL?: unknown }).createObjectURL = origCreateObjectURL
    ;(URL as typeof URL & { revokeObjectURL?: unknown }).revokeObjectURL = origRevokeObjectURL
  })

  // ── Node deletion tests ───────────────────────────────────────────────────

  it('passes deleteKeyCode="Delete" to ReactFlow', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    expect(capturedDeleteKeyCode).toBe('Delete')
  })

  it('passes onNodeContextMenu to ReactFlow', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    expect(capturedOnNodeContextMenu).toBeTypeOf('function')
  })

  it('right-clicking a tableNode opens the context menu with Remove item', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const fakeEvent = { preventDefault: vi.fn(), clientX: 200, clientY: 300 } as unknown as React.MouseEvent
    const tableNode = { id: 'table-dbo.Users', type: 'tableNode' }
    act(() => { capturedOnNodeContextMenu!(fakeEvent, tableNode) })
    expect(fakeEvent.preventDefault).toHaveBeenCalled()
    expect(screen.getByText('Remove')).toBeInTheDocument()
  })

  it('right-clicking a non-tableNode does not open the context menu', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    const fakeEvent = { preventDefault: vi.fn(), clientX: 200, clientY: 300 } as unknown as React.MouseEvent
    const textNode = { id: 'text-1', type: 'textNode' }
    act(() => { capturedOnNodeContextMenu!(fakeEvent, textNode) })
    expect(fakeEvent.preventDefault).not.toHaveBeenCalled()
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('clicking Remove in context menu calls setNodes to filter the node', () => {
    const setNodesMock = vi.fn()
    vi.mocked(useNodesState).mockReturnValue([
      [
        { id: 'table-dbo.Users', type: 'tableNode', position: { x: 0, y: 0 }, data: {} },
        { id: 'table-dbo.Orders', type: 'tableNode', position: { x: 200, y: 0 }, data: {} }
      ],
      setNodesMock,
      vi.fn()
    ] as unknown as ReturnType<typeof useNodesState>)

    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)

    // Open context menu for the Users table node
    const fakeEvent = { preventDefault: vi.fn(), clientX: 200, clientY: 300 } as unknown as React.MouseEvent
    act(() => { capturedOnNodeContextMenu!(fakeEvent, { id: 'table-dbo.Users', type: 'tableNode' }) })

    const removeBtn = screen.getByText('Remove')
    fireEvent.click(removeBtn)

    // setNodes should have been called with a filter function that removes the node
    const filterCalls = setNodesMock.mock.calls.filter((c) => typeof c[0] === 'function')
    expect(filterCalls.length).toBeGreaterThan(0)
    const filterFn = filterCalls[filterCalls.length - 1][0]
    const result = filterFn([
      { id: 'table-dbo.Users', type: 'tableNode' },
      { id: 'table-dbo.Orders', type: 'tableNode' }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('table-dbo.Orders')
    vi.mocked(useNodesState).mockImplementation(((initial: unknown[]) => [initial, vi.fn(), vi.fn()]) as never)
  })

  it('clicking Remove in context menu calls setEdges to filter connected edges', () => {
    const setEdgesMock = vi.fn()
    vi.mocked(useEdgesState).mockReturnValue([
      [
        { id: 'rel-FK_Orders_Users', source: 'table-dbo.Orders', target: 'table-dbo.Users' },
        { id: 'rel-unrelated', source: 'table-dbo.Other', target: 'table-dbo.Thing' }
      ],
      setEdgesMock,
      vi.fn()
    ] as unknown as ReturnType<typeof useEdgesState>)

    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)

    const fakeEvent = { preventDefault: vi.fn(), clientX: 200, clientY: 300 } as unknown as React.MouseEvent
    act(() => { capturedOnNodeContextMenu!(fakeEvent, { id: 'table-dbo.Users', type: 'tableNode' }) })

    fireEvent.click(screen.getByText('Remove'))

    const filterCalls = setEdgesMock.mock.calls.filter((c) => typeof c[0] === 'function')
    expect(filterCalls.length).toBeGreaterThan(0)
    const filterFn = filterCalls[filterCalls.length - 1][0]
    const result = filterFn([
      { id: 'rel-FK_Orders_Users', source: 'table-dbo.Orders', target: 'table-dbo.Users' },
      { id: 'rel-unrelated', source: 'table-dbo.Other', target: 'table-dbo.Thing' }
    ])
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('rel-unrelated')
    vi.mocked(useEdgesState).mockImplementation(((initial: unknown[]) => [initial, vi.fn(), vi.fn()]) as never)
  })

  it('context menu closes after clicking Remove', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)

    const fakeEvent = { preventDefault: vi.fn(), clientX: 200, clientY: 300 } as unknown as React.MouseEvent
    act(() => { capturedOnNodeContextMenu!(fakeEvent, { id: 'table-dbo.Users', type: 'tableNode' }) })

    expect(screen.getByText('Remove')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Remove'))
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('clicking the canvas pane closes the context menu', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)

    const fakeEvent = { preventDefault: vi.fn(), clientX: 200, clientY: 300 } as unknown as React.MouseEvent
    act(() => { capturedOnNodeContextMenu!(fakeEvent, { id: 'table-dbo.Users', type: 'tableNode' }) })
    expect(screen.getByText('Remove')).toBeInTheDocument()

    act(() => { capturedOnPaneClick!() })
    expect(screen.queryByText('Remove')).not.toBeInTheDocument()
  })

  it('passes onPaneClick to ReactFlow', () => {
    renderErd(<ErdCanvas loadState="loaded" schema={mockSchema} databaseName="TestDb" />)
    expect(capturedOnPaneClick).toBeTypeOf('function')
  })
})
