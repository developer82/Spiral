// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import AddTablesDialog from '../AddTablesDialog'
import type { ErdTable } from '../../../erd.types'

const makeTables = (): ErdTable[] => [
  {
    schema: 'dbo',
    name: 'Users',
    columns: [{ name: 'id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false }]
  },
  {
    schema: 'dbo',
    name: 'Orders',
    columns: [
      { name: 'id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false },
      { name: 'userId', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: false, isForeignKey: true }
    ]
  },
  {
    schema: 'auth',
    name: 'Roles',
    columns: [{ name: 'id', type: 'int', maxLength: null, isNullable: false, isPrimaryKey: true, isForeignKey: false }]
  }
]

describe('AddTablesDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders the dialog with all provided tables', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Add Tables' })).toBeInTheDocument()
    expect(screen.getByText('Users')).toBeInTheDocument()
    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.getByText('Roles')).toBeInTheDocument()
  })

  it('renders Add Tables button as disabled when no table is selected', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const addBtn = screen.getByRole('button', { name: /^Add Tables?$/ })
    expect(addBtn).toBeDisabled()
  })

  it('enables the Add button when a table is selected and shows count in label', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const checkbox = screen.getByLabelText('dbo.Users')
    fireEvent.click(checkbox)
    // Button now shows count
    const addBtn = screen.getByRole('button', { name: /Add 1 Table/ })
    expect(addBtn).toBeEnabled()
  })

  it('calls onAdd with the selected tables when Add is clicked', () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    const tables = makeTables()
    render(<AddTablesDialog tables={tables} onAdd={onAdd} onClose={onClose} />)

    fireEvent.click(screen.getByLabelText('dbo.Users'))
    fireEvent.click(screen.getByLabelText('dbo.Orders'))
    fireEvent.click(screen.getByRole('button', { name: /Add 2/ }))

    expect(onAdd).toHaveBeenCalledOnce()
    const calledWith: ErdTable[] = onAdd.mock.calls[0][0]
    expect(calledWith).toHaveLength(2)
    expect(calledWith.map((t) => t.name).sort()).toEqual(['Orders', 'Users'])
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the X button is clicked', () => {
    const onClose = vi.fn()
    render(<AddTablesDialog tables={makeTables()} onAdd={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn()
    render(<AddTablesDialog tables={makeTables()} onAdd={vi.fn()} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('filters tables based on search query (table name)', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const searchInput = screen.getByLabelText('Filter tables')
    fireEvent.change(searchInput, { target: { value: 'ord' } })

    expect(screen.getByText('Orders')).toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Roles')).not.toBeInTheDocument()
  })

  it('filters tables based on search query (schema name)', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const searchInput = screen.getByLabelText('Filter tables')
    fireEvent.change(searchInput, { target: { value: 'auth' } })

    expect(screen.getByText('Roles')).toBeInTheDocument()
    expect(screen.queryByText('Users')).not.toBeInTheDocument()
    expect(screen.queryByText('Orders')).not.toBeInTheDocument()
  })

  it('shows empty state message when search has no matches', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.change(screen.getByLabelText('Filter tables'), { target: { value: 'xyz_no_match' } })
    expect(screen.getByText('No tables match your search')).toBeInTheDocument()
  })

  it('select all checkbox selects all visible filtered tables', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const selectAllCheckbox = screen.getByLabelText('Select all filtered tables')
    fireEvent.click(selectAllCheckbox)

    // All individual checkboxes should now be checked
    const userCheckbox = screen.getByLabelText('dbo.Users') as HTMLInputElement
    const ordersCheckbox = screen.getByLabelText('dbo.Orders') as HTMLInputElement
    const rolesCheckbox = screen.getByLabelText('auth.Roles') as HTMLInputElement
    expect(userCheckbox.checked).toBe(true)
    expect(ordersCheckbox.checked).toBe(true)
    expect(rolesCheckbox.checked).toBe(true)
  })

  it('select all deselects all when all are already selected', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const selectAllCheckbox = screen.getByLabelText('Select all filtered tables')
    // Select all, then deselect all
    fireEvent.click(selectAllCheckbox)
    fireEvent.click(selectAllCheckbox)

    const userCheckbox = screen.getByLabelText('dbo.Users') as HTMLInputElement
    expect(userCheckbox.checked).toBe(false)
  })

  it('shows selected count in footer when tables are selected', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('dbo.Users'))
    fireEvent.click(screen.getByLabelText('dbo.Orders'))

    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('does not show footer count when nothing is selected', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument()
  })

  it('deselects a previously selected table when clicked again', () => {
    render(
      <AddTablesDialog
        tables={makeTables()}
        onAdd={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const checkbox = screen.getByLabelText('dbo.Users') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })
})
