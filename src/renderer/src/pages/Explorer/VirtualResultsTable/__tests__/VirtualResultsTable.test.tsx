// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import VirtualResultsTable from '../VirtualResultsTable'
import type { SortIndicator } from '../../QueryEditor/sortIndicators'

const defaultProps = {
  sortIndicatorsMap: {} as Record<string, SortIndicator>,
  sortedCount: 0,
  uppercaseHeaders: false,
  useInteractiveTables: false
}

afterEach(() => {
  cleanup()
})

describe('VirtualResultsTable – boolean pill rendering', () => {
  describe('when useInteractiveTables is false', () => {
    it('renders boolean true as plain text "true"', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          columns={['active']}
          rows={[{ active: true }]}
        />
      )

      expect(screen.getByText('true')).toBeInTheDocument()
      expect(screen.queryByRole('generic', { name: /ACTIVE/i })).toBeNull()
      expect(document.querySelector('.query-results__bool-pill')).toBeNull()
    })

    it('renders boolean false as plain text "false"', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          columns={['active']}
          rows={[{ active: false }]}
        />
      )

      expect(screen.getByText('false')).toBeInTheDocument()
      expect(document.querySelector('.query-results__bool-pill')).toBeNull()
    })
  })

  describe('when useInteractiveTables is true', () => {
    it('renders boolean true as a pill with --true class', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['flag']}
          rows={[{ flag: true }]}
        />
      )

      const pill = document.querySelector('.query-results__bool-pill')
      expect(pill).not.toBeNull()
      expect(pill).toHaveClass('query-results__bool-pill--true')
      expect(pill).not.toHaveClass('query-results__bool-pill--false')
    })

    it('renders boolean false as a pill with --false class', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['flag']}
          rows={[{ flag: false }]}
        />
      )

      const pill = document.querySelector('.query-results__bool-pill')
      expect(pill).not.toBeNull()
      expect(pill).toHaveClass('query-results__bool-pill--false')
      expect(pill).not.toHaveClass('query-results__bool-pill--true')
    })

    it('shows TRUE for an unknown column (true)', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['some_flag']}
          rows={[{ some_flag: true }]}
        />
      )

      expect(screen.getByText('TRUE')).toBeInTheDocument()
    })

    it('shows FALSE for an unknown column (false)', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['some_flag']}
          rows={[{ some_flag: false }]}
        />
      )

      expect(screen.getByText('FALSE')).toBeInTheDocument()
    })

    it('resolves Enabled column → ENABLED / DISABLED', () => {
      const { rerender } = render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['Enabled']}
          rows={[{ Enabled: true }]}
        />
      )

      expect(screen.getByText('ENABLED')).toBeInTheDocument()

      rerender(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['Enabled']}
          rows={[{ Enabled: false }]}
        />
      )

      expect(screen.getByText('DISABLED')).toBeInTheDocument()
    })

    it('resolves Status column → SUCCESS / FAILED', () => {
      const { rerender } = render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['Status']}
          rows={[{ Status: true }]}
        />
      )

      expect(screen.getByText('SUCCESS')).toBeInTheDocument()

      rerender(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['Status']}
          rows={[{ Status: false }]}
        />
      )

      expect(screen.getByText('FAILED')).toBeInTheDocument()
    })

    it('resolves IS_ACTIVE column (strips IS_ prefix) → ACTIVE / INACTIVE', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['IS_ACTIVE']}
          rows={[{ IS_ACTIVE: false }]}
        />
      )

      expect(screen.getByText('INACTIVE')).toBeInTheDocument()
    })

    it('resolves a partial match column → correct labels', () => {
      // 'user_active_flag' contains 'active' (6 chars), no longer keyword matches
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['user_active_flag']}
          rows={[{ user_active_flag: true }]}
        />
      )

      expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    })
  })

  describe('null / non-boolean values are unaffected', () => {
    it('renders null boolean as NULL, not a pill', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['active']}
          rows={[{ active: null }]}
        />
      )

      expect(screen.getByText('NULL')).toBeInTheDocument()
      expect(document.querySelector('.query-results__bool-pill')).toBeNull()
    })

    it('renders string "true" as plain text, not a pill', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['active']}
          rows={[{ active: 'true' }]}
        />
      )

      expect(screen.getByText('true')).toBeInTheDocument()
      expect(document.querySelector('.query-results__bool-pill')).toBeNull()
    })

    it('renders numeric 1 as plain text, not a pill', () => {
      render(
        <VirtualResultsTable
          {...defaultProps}
          useInteractiveTables
          columns={['active']}
          rows={[{ active: 1 }]}
        />
      )

      // Row number "1" and data value "1" both exist — verify neither is a pill
      const ones = screen.getAllByText('1')
      expect(ones.length).toBeGreaterThan(0)
      expect(document.querySelector('.query-results__bool-pill')).toBeNull()
    })
  })
})

// ── Interactive column header sorting ─────────────────────────────────────────

describe('VirtualResultsTable – column header sort interaction', () => {
  it('calls onColumnSort with the column name when a header is clicked and useInteractiveTables is true', () => {
    const onColumnSort = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        columns={['Name', 'Age']}
        rows={[]}
        useInteractiveTables
        onColumnSort={onColumnSort}
      />
    )

    fireEvent.click(screen.getByText('Name'))
    expect(onColumnSort).toHaveBeenCalledOnce()
    expect(onColumnSort).toHaveBeenCalledWith('Name')
  })

  it('does NOT call onColumnSort when useInteractiveTables is false', () => {
    const onColumnSort = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        columns={['Name']}
        rows={[]}
        useInteractiveTables={false}
        onColumnSort={onColumnSort}
      />
    )

    fireEvent.click(screen.getByText('Name'))
    expect(onColumnSort).not.toHaveBeenCalled()
  })

  it('does NOT call onColumnSort when onColumnSort prop is not provided', () => {
    // should not throw
    render(
      <VirtualResultsTable
        {...defaultProps}
        columns={['Name']}
        rows={[]}
        useInteractiveTables
      />
    )

    expect(() => fireEvent.click(screen.getByText('Name'))).not.toThrow()
  })

  it('applies query-results__th--sortable class when useInteractiveTables and onColumnSort are set', () => {
    const onColumnSort = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        columns={['Name']}
        rows={[]}
        useInteractiveTables
        onColumnSort={onColumnSort}
      />
    )

    const th = screen.getByText('Name').closest('th')
    expect(th).toHaveClass('query-results__th--sortable')
  })

  it('does NOT apply query-results__th--sortable when useInteractiveTables is false', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        columns={['Name']}
        rows={[]}
        useInteractiveTables={false}
      />
    )

    const th = screen.getByText('Name').closest('th')
    expect(th).not.toHaveClass('query-results__th--sortable')
  })
})

describe('VirtualResultsTable – column header Remove Sort context menu', () => {
  it('calls onColumnContextMenu with column name and position when right-clicking a sorted column header', () => {
    const sortIndicatorsMap: Record<string, SortIndicator> = {
      Name: { sortType: 'ASC', sortOrder: 1 }
    }
    const onColumnSort = vi.fn()
    const onColumnContextMenu = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        columns={['Name']}
        rows={[]}
        sortIndicatorsMap={sortIndicatorsMap}
        sortedCount={1}
        useInteractiveTables
        onColumnSort={onColumnSort}
        onColumnContextMenu={onColumnContextMenu}
      />
    )

    const th = screen.getByText('Name').closest('th')!
    fireEvent.contextMenu(th)
    expect(onColumnContextMenu).toHaveBeenCalledOnce()
    expect(onColumnContextMenu.mock.calls[0][0]).toBe('Name')
    expect(onColumnContextMenu.mock.calls[0][1]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
  })

  it('does not call onColumnContextMenu on right-click when column is not sorted', () => {
    const onColumnSort = vi.fn()
    const onColumnContextMenu = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        columns={['Name']}
        rows={[]}
        sortIndicatorsMap={{}} 
        sortedCount={0}
        useInteractiveTables
        onColumnSort={onColumnSort}
        onColumnContextMenu={onColumnContextMenu}
      />
    )

    const th = screen.getByText('Name').closest('th')!
    fireEvent.contextMenu(th)
    expect(onColumnContextMenu).not.toHaveBeenCalled()
})
})

// ── Row selection checkboxes ─────────────────────────────────────────────────

describe('VirtualResultsTable – row selection checkboxes', () => {
  const rows = [
    { id: 1, name: 'Alice' },
    { id: 2, name: 'Bob' },
    { id: 3, name: 'Carol' }
  ]

  it('does not render checkboxes when selectedRowIndices is undefined', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
      />
    )

    expect(document.querySelectorAll('.query-results__row-checkbox')).toHaveLength(0)
    expect(document.querySelectorAll('.query-results__td--checkbox')).toHaveLength(0)
  })

  it('renders a header select-all checkbox and per-row checkboxes when selectedRowIndices is provided', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
        selectedRowIndices={new Set()}
        onRowSelect={vi.fn()}
        onSelectAll={vi.fn()}
      />
    )

    // 1 header checkbox + 3 row checkboxes
    const checkboxes = document.querySelectorAll('.query-results__row-checkbox')
    expect(checkboxes).toHaveLength(4)
  })

  it('checks the per-row checkbox for selected row indices', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
        selectedRowIndices={new Set([1])}
        onRowSelect={vi.fn()}
        onSelectAll={vi.fn()}
      />
    )

    const rowCheckboxes = document.querySelectorAll<HTMLInputElement>('.query-results__td--checkbox input')
    expect(rowCheckboxes[0].checked).toBe(false)
    expect(rowCheckboxes[1].checked).toBe(true)
    expect(rowCheckboxes[2].checked).toBe(false)
  })

  it('calls onRowSelect with correct index and value when a row checkbox is changed', () => {
    const onRowSelect = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
        selectedRowIndices={new Set()}
        onRowSelect={onRowSelect}
        onSelectAll={vi.fn()}
      />
    )

    const rowCheckboxes = document.querySelectorAll<HTMLInputElement>('.query-results__td--checkbox input')
    fireEvent.click(rowCheckboxes[2])
    expect(onRowSelect).toHaveBeenCalledOnce()
    expect(onRowSelect).toHaveBeenCalledWith(2, true)
  })

  it('calls onSelectAll(true) when header checkbox is clicked with nothing selected', () => {
    const onSelectAll = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
        selectedRowIndices={new Set()}
        onRowSelect={vi.fn()}
        onSelectAll={onSelectAll}
      />
    )

    const headerCheckbox = document.querySelector<HTMLInputElement>('.query-results__th--checkbox input')!
    fireEvent.click(headerCheckbox)
    expect(onSelectAll).toHaveBeenCalledOnce()
    expect(onSelectAll).toHaveBeenCalledWith(true)
  })

  it('shows the header checkbox as checked when all rows are selected', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
        selectedRowIndices={new Set([0, 1, 2])}
        onRowSelect={vi.fn()}
        onSelectAll={vi.fn()}
      />
    )

    const headerCheckbox = document.querySelector<HTMLInputElement>('.query-results__th--checkbox input')!
    expect(headerCheckbox.checked).toBe(true)
  })

  it('shows the header checkbox as unchecked when no rows are selected', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
        selectedRowIndices={new Set()}
        onRowSelect={vi.fn()}
        onSelectAll={vi.fn()}
      />
    )

    const headerCheckbox = document.querySelector<HTMLInputElement>('.query-results__th--checkbox input')!
    expect(headerCheckbox.checked).toBe(false)
  })

  it('adds query-results__tr--selected class to selected rows', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['id', 'name']}
        rows={rows}
        selectedRowIndices={new Set([0, 2])}
        onRowSelect={vi.fn()}
        onSelectAll={vi.fn()}
      />
    )

    const tableRows = document.querySelectorAll<HTMLTableRowElement>('tbody tr:not([aria-hidden])')
    expect(tableRows[0]).toHaveClass('query-results__tr--selected')
    expect(tableRows[1]).not.toHaveClass('query-results__tr--selected')
    expect(tableRows[2]).toHaveClass('query-results__tr--selected')
  })
})

// ── Interactive boolean cell toggling ────────────────────────────────────────

describe('VirtualResultsTable – interactive boolean cell click', () => {
  const boolMeta = [{ isPrimaryKey: false, isForeignKey: false, isNullable: false, isBoolean: true }]
  const nullableBoolMeta = [{ isPrimaryKey: false, isForeignKey: false, isNullable: true, isBoolean: true }]

  it('wraps the bool pill in a button when onBooleanCellClick is provided', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: true }]}
        columnKeyMeta={boolMeta}
        onBooleanCellClick={vi.fn()}
      />
    )

    expect(document.querySelector('.query-results__bool-pill-btn')).not.toBeNull()
  })

  it('does NOT wrap the pill in a button when onBooleanCellClick is not provided', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: true }]}
        columnKeyMeta={boolMeta}
      />
    )

    expect(document.querySelector('.query-results__bool-pill-btn')).toBeNull()
  })

  it('calls onBooleanCellClick with columnName, row, and rowIndex when pill button is clicked', () => {
    const onBooleanCellClick = vi.fn()
    const row = { active: true }
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[row]}
        columnKeyMeta={boolMeta}
        onBooleanCellClick={onBooleanCellClick}
      />
    )

    fireEvent.click(document.querySelector('.query-results__bool-pill-btn')!)
    expect(onBooleanCellClick).toHaveBeenCalledOnce()
    expect(onBooleanCellClick).toHaveBeenCalledWith('active', row, 0)
  })

  it('wraps a null cell in a button for a boolean column when onBooleanCellClick is provided', () => {
    const onBooleanCellClick = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: null }]}
        columnKeyMeta={boolMeta}
        onBooleanCellClick={onBooleanCellClick}
      />
    )

    const btn = document.querySelector('.query-results__bool-pill-btn')
    expect(btn).not.toBeNull()
    expect(btn).toHaveTextContent('NULL')

    fireEvent.click(btn!)
    expect(onBooleanCellClick).toHaveBeenCalledOnce()
    expect(onBooleanCellClick.mock.calls[0][0]).toBe('active')
  })

  it('applies query-results__bool-pill--loading class when loadingBoolCell matches', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: true }]}
        columnKeyMeta={boolMeta}
        onBooleanCellClick={vi.fn()}
        loadingBoolCell={{ colName: 'active', rowIndex: 0 }}
      />
    )

    expect(document.querySelector('.query-results__bool-pill--loading')).not.toBeNull()
  })

  it('does NOT apply query-results__bool-pill--loading when loadingBoolCell does not match', () => {
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: true }]}
        columnKeyMeta={boolMeta}
        onBooleanCellClick={vi.fn()}
        loadingBoolCell={{ colName: 'active', rowIndex: 1 }}
      />
    )

    expect(document.querySelector('.query-results__bool-pill--loading')).toBeNull()
  })

  it('calls onBooleanCellRightClick on right-click for a nullable boolean pill', () => {
    const onBooleanCellRightClick = vi.fn()
    const row = { active: true }
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[row]}
        columnKeyMeta={nullableBoolMeta}
        onBooleanCellClick={vi.fn()}
        onBooleanCellRightClick={onBooleanCellRightClick}
      />
    )

    const btn = document.querySelector('.query-results__bool-pill-btn')!
    fireEvent.contextMenu(btn)
    expect(onBooleanCellRightClick).toHaveBeenCalledOnce()
    expect(onBooleanCellRightClick.mock.calls[0][0]).toBe('active')
    expect(onBooleanCellRightClick.mock.calls[0][1]).toBe(row)
    expect(onBooleanCellRightClick.mock.calls[0][2]).toBe(0)
    expect(onBooleanCellRightClick.mock.calls[0][3]).toMatchObject({ x: expect.any(Number), y: expect.any(Number) })
  })

  it('does NOT call onBooleanCellRightClick for a non-nullable boolean pill', () => {
    const onBooleanCellRightClick = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: true }]}
        columnKeyMeta={boolMeta}
        onBooleanCellClick={vi.fn()}
        onBooleanCellRightClick={onBooleanCellRightClick}
      />
    )

    fireEvent.contextMenu(document.querySelector('.query-results__bool-pill-btn')!)
    expect(onBooleanCellRightClick).not.toHaveBeenCalled()
  })

  it('does NOT call onBooleanCellRightClick on right-click of a null cell (even nullable)', () => {
    const onBooleanCellRightClick = vi.fn()
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: null }]}
        columnKeyMeta={nullableBoolMeta}
        onBooleanCellClick={vi.fn()}
        onBooleanCellRightClick={onBooleanCellRightClick}
      />
    )

    fireEvent.contextMenu(document.querySelector('.query-results__bool-pill-btn')!)
    expect(onBooleanCellRightClick).not.toHaveBeenCalled()
  })

  it('does NOT make pills interactive when isBoolean is false in colMeta', () => {
    const nonBoolMeta = [{ isPrimaryKey: false, isForeignKey: false, isNullable: false, isBoolean: false }]
    render(
      <VirtualResultsTable
        {...defaultProps}
        useInteractiveTables
        columns={['active']}
        rows={[{ active: true }]}
        columnKeyMeta={nonBoolMeta}
        onBooleanCellClick={vi.fn()}
      />
    )

    // No button wrapping — the pill is still rendered but not interactive
    expect(document.querySelector('.query-results__bool-pill-btn')).toBeNull()
    expect(document.querySelector('.query-results__bool-pill')).not.toBeNull()
  })
})
