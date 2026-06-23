// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ExecutionPlanCanvas from '../ExecutionPlanCanvas'

// ── Mock @xyflow/react ────────────────────────────────────────────────────────

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({
    nodes,
    children
  }: {
    nodes?: { id: string; data: { planNode: { physicalOp: string } } }[]
    children?: React.ReactNode
  }) => (
    <div data-testid="react-flow">
      {nodes?.map((n) => (
        <div key={n.id} data-testid={`plan-node-${n.id}`} data-op={n.data?.planNode?.physicalOp}>
          {n.data?.planNode?.physicalOp}
        </div>
      ))}
      {children}
    </div>
  ),
  ReactFlowProvider: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="react-flow-provider">{children}</div>
  ),
  Background: () => <div data-testid="ep-background" />,
  MiniMap: () => <div data-testid="ep-minimap" />,
  Handle: () => null,
  Position: { Left: 'left', Right: 'right' },
  useNodesState: vi.fn((initial: unknown[]) => [initial, vi.fn(), vi.fn()]),
  useEdgesState: vi.fn((initial: unknown[]) => [initial, vi.fn(), vi.fn()]),
  useReactFlow: () => ({ fitView: vi.fn() })
}))

// ── Mock @dagrejs/dagre ───────────────────────────────────────────────────────

vi.mock('@dagrejs/dagre', () => {
  const nodePositions: Map<string, { x: number; y: number; width: number; height: number }> =
    new Map()
  return {
    default: {
      graphlib: {
        Graph: class {
          setGraph = vi.fn()
          setDefaultEdgeLabel = vi.fn()
          setNode = vi.fn((id: string, data: { width: number; height: number }) => {
            nodePositions.set(id, { x: 50, y: 50, width: data.width, height: data.height })
          })
          setEdge = vi.fn()
          node = (id: string) => nodePositions.get(id) ?? { x: 50, y: 50 }
        }
      },
      layout: vi.fn()
    }
  }
})

// ── Fixtures ─────────────────────────────────────────────────────────────────

const SHOWPLAN_NS = 'http://schemas.microsoft.com/sqlserver/2004/07/showplan'

function makeSimplePlanXml(physicalOp = 'Clustered Index Scan', estimateRows = 100): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ShowPlanXML xmlns="${SHOWPLAN_NS}" Version="1.5" Build="15.0.0">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple>
          <QueryPlan>
            <RelOp NodeId="0"
                   PhysicalOp="${physicalOp}"
                   LogicalOp="${physicalOp}"
                   EstimateRows="${estimateRows}"
                   EstimateCPU="0.0001"
                   EstimateIO="0.003"
                   EstimatedTotalSubtreeCost="0.0031"
                   Parallel="0">
              <OutputList />
              <Object Table="[dbo].[Users]" Index="[PK_Users]" />
            </RelOp>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>`
}

function makeNestedPlanXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ShowPlanXML xmlns="${SHOWPLAN_NS}" Version="1.5" Build="15.0.0">
  <BatchSequence>
    <Batch>
      <Statements>
        <StmtSimple>
          <QueryPlan>
            <RelOp NodeId="0"
                   PhysicalOp="Nested Loops"
                   LogicalOp="Inner Join"
                   EstimateRows="50"
                   EstimateCPU="0.0005"
                   EstimateIO="0"
                   EstimatedTotalSubtreeCost="0.01"
                   Parallel="0">
              <NestedLoops>
                <RelOp NodeId="1"
                       PhysicalOp="Clustered Index Scan"
                       LogicalOp="Clustered Index Scan"
                       EstimateRows="100"
                       EstimateCPU="0.003"
                       EstimateIO="0.003"
                       EstimatedTotalSubtreeCost="0.006"
                       Parallel="0">
                  <OutputList />
                </RelOp>
                <RelOp NodeId="2"
                       PhysicalOp="Index Seek"
                       LogicalOp="Index Seek"
                       EstimateRows="1"
                       EstimateCPU="0.0001"
                       EstimateIO="0.003"
                       EstimatedTotalSubtreeCost="0.0031"
                       Parallel="0">
                  <OutputList />
                </RelOp>
              </NestedLoops>
            </RelOp>
          </QueryPlan>
        </StmtSimple>
      </Statements>
    </Batch>
  </BatchSequence>
</ShowPlanXML>`
}

function makeMultiStatementPlanXml(): string {
  const base = makeSimplePlanXml('Clustered Index Scan', 100)
  const second = makeSimplePlanXml('Index Seek', 10)
  // Two separate ShowPlanXML blocks joined by newline (as produced by SET STATISTICS XML ON)
  return `${base}\n${second}`
}

// ── Tests ─────────────────────────────────────────────────────────────────────

afterEach(cleanup)

describe('ExecutionPlanCanvas', () => {
  // ── Rendering ───────────────────────────────────────────────────────────────

  it('renders the ReactFlow canvas for a valid plan', () => {
    render(<ExecutionPlanCanvas planXml={makeSimplePlanXml()} />)
    expect(screen.getByTestId('react-flow')).toBeInTheDocument()
  })

  it('renders a plan node for the root operator', () => {
    render(<ExecutionPlanCanvas planXml={makeSimplePlanXml('Clustered Index Scan')} />)
    expect(screen.getByText('Clustered Index Scan')).toBeInTheDocument()
  })

  it('renders a MiniMap', () => {
    render(<ExecutionPlanCanvas planXml={makeSimplePlanXml()} />)
    expect(screen.getByTestId('ep-minimap')).toBeInTheDocument()
  })

  it('renders a Background', () => {
    render(<ExecutionPlanCanvas planXml={makeSimplePlanXml()} />)
    expect(screen.getByTestId('ep-background')).toBeInTheDocument()
  })

  // ── Nested operators ────────────────────────────────────────────────────────

  it('renders all operators in a nested plan (parent and children)', () => {
    render(<ExecutionPlanCanvas planXml={makeNestedPlanXml()} />)
    expect(screen.getByText('Nested Loops')).toBeInTheDocument()
    expect(screen.getByText('Clustered Index Scan')).toBeInTheDocument()
    expect(screen.getByText('Index Seek')).toBeInTheDocument()
  })

  // ── Multi-statement plans ────────────────────────────────────────────────────

  it('shows a statement selector when the plan has multiple statements', () => {
    render(<ExecutionPlanCanvas planXml={makeMultiStatementPlanXml()} />)
    expect(screen.getByText('Statement 1')).toBeInTheDocument()
    expect(screen.getByText('Statement 2')).toBeInTheDocument()
  })

  it('switching between statements updates the visible plan', () => {
    render(<ExecutionPlanCanvas planXml={makeMultiStatementPlanXml()} />)
    const stmt2Btn = screen.getByText('Statement 2')
    fireEvent.click(stmt2Btn)
    // After switching, statement 2's operator should still be present
    expect(screen.getByTestId('react-flow')).toBeInTheDocument()
  })

  it('does not show a statement selector for a single-statement plan', () => {
    render(<ExecutionPlanCanvas planXml={makeSimplePlanXml()} />)
    expect(screen.queryByText('Statement 1')).not.toBeInTheDocument()
  })

  // ── Error / empty states ────────────────────────────────────────────────────

  it('shows an error state for malformed XML', () => {
    render(<ExecutionPlanCanvas planXml="<not valid xml <<< !!!" />)
    expect(screen.getByText(/could not parse execution plan xml/i)).toBeInTheDocument()
  })

  it('shows an error state for empty string', () => {
    render(<ExecutionPlanCanvas planXml="" />)
    expect(screen.getByText(/could not parse execution plan xml/i)).toBeInTheDocument()
  })

  it('shows an error state for XML without a QueryPlan element', () => {
    render(<ExecutionPlanCanvas planXml="<root><something /></root>" />)
    expect(screen.getByText(/could not parse execution plan xml/i)).toBeInTheDocument()
  })
})
