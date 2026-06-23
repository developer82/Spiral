// @vitest-environment jsdom
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import RecordDialog from '../RecordDialog'
import type { TableColumnMeta } from '../../../../../../../preload/index.d'

function makeColumn(overrides: Partial<TableColumnMeta> = {}): TableColumnMeta {
  return {
    name: 'Id',
    type: 'int',
    maxLength: null,
    precision: null,
    scale: null,
    isNullable: false,
    defaultValue: null,
    isIdentity: false,
    identitySeed: null,
    identityIncrement: null,
    isPrimaryKey: false,
    ...overrides
  }
}

const defaultProps = {
  connectionId: 'conn-1',
  databaseName: 'TestDB',
  provider: 'sqlserver',
  sourceTable: { schema: 'dbo', table: 'Users' },
  pkColumns: ['Id'],
  onClose: vi.fn(),
  onSuccess: vi.fn()
}

const baseSchema: TableColumnMeta[] = [
  makeColumn({ name: 'Id', type: 'int', isPrimaryKey: true, isIdentity: true }),
  makeColumn({ name: 'Name', type: 'varchar', maxLength: 100 }),
  makeColumn({ name: 'Age', type: 'int', isNullable: true }),
  makeColumn({ name: 'Active', type: 'bit' }),
  makeColumn({ name: 'BirthDate', type: 'date', isNullable: true })
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
    status: 'ok',
    columns: baseSchema
  })
  vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
    status: 'ok',
    resultSets: [],
    messages: [],
    durationMs: 5
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RecordDialog – add mode', () => {
  it('loads schema and renders fields', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('BirthDate')).toBeInTheDocument()
  })

  it('renders identity column as disabled with (auto) placeholder in add mode', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => {
      expect(screen.getByText('Id')).toBeInTheDocument()
    })

    const identityInput = screen.getByDisplayValue('(auto)')
    expect(identityInput).toBeDisabled()
  })

  it('renders boolean column as checkbox', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => {
      const checkbox = document.querySelector('#rdf-Active') as HTMLInputElement
      expect(checkbox).toBeTruthy()
      expect(checkbox.type).toBe('checkbox')
    })
  })

  it('renders date column as date input', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => {
      const dateInput = document.querySelector('#rdf-BirthDate') as HTMLInputElement
      expect(dateInput).toBeTruthy()
      expect(dateInput.type).toBe('date')
    })
  })

  it('shows "Add" as the submit button label', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
    })
  })

  it('calls executeQuery with INSERT SQL on submit', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument()
    })

    // Fill in Name
    const nameInput = document.querySelector('#rdf-Name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alice' } })

    // Fill in Age (nullable, leave empty = NULL is fine)

    // Submit
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(window.api.database.executeQuery).toHaveBeenCalledWith(
        'conn-1',
        expect.stringContaining('INSERT INTO [dbo].[Users]'),
        false,
        false,
        'TestDB'
      )
    })
  })

  it('calls onSuccess after successful submit', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => screen.getByText('Name'))

    const nameInput = document.querySelector('#rdf-Name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error message when executeQuery returns error status', async () => {
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Constraint violation: unique key'
    })

    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => screen.getByText('Name'))

    const nameInput = document.querySelector('#rdf-Name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(screen.getByText('Constraint violation: unique key')).toBeInTheDocument()
    })

    // onSuccess should NOT have been called
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('shows schema error when getTableSchema fails', async () => {
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'error',
      message: 'Table not found'
    })

    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => {
      expect(screen.getByText('Table not found')).toBeInTheDocument()
    })
  })
})

describe('RecordDialog – edit mode', () => {
  const existingRow: Record<string, unknown> = {
    Id: 42,
    Name: 'Bob',
    Age: 25,
    Active: true,
    BirthDate: '1999-01-15T00:00:00.000Z'
  }

  it('pre-populates fields from the row prop', async () => {
    render(<RecordDialog {...defaultProps} mode="edit" row={existingRow} />)

    await waitFor(() => {
      const nameInput = document.querySelector('#rdf-Name') as HTMLInputElement
      expect(nameInput.value).toBe('Bob')
    })
  })

  it('renders PK column as disabled in edit mode', async () => {
    render(<RecordDialog {...defaultProps} mode="edit" row={existingRow} />)

    await waitFor(() => {
      const idInput = document.querySelector('#rdf-Id') as HTMLInputElement
      expect(idInput).toBeDisabled()
    })
  })

  it('shows "Save" as the submit button label', async () => {
    render(<RecordDialog {...defaultProps} mode="edit" row={existingRow} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    })
  })

  it('calls executeQuery with UPDATE SQL on submit', async () => {
    render(<RecordDialog {...defaultProps} mode="edit" row={existingRow} />)

    await waitFor(() => screen.getByText('Name'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.database.executeQuery).toHaveBeenCalledWith(
        'conn-1',
        expect.stringContaining('UPDATE [dbo].[Users]'),
        false,
        false,
        'TestDB'
      )
    })
  })

  it('prepends USE statement for sqlserver provider', async () => {
    render(<RecordDialog {...defaultProps} mode="edit" row={existingRow} provider="sqlserver" />)

    await waitFor(() => screen.getByText('Name'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(window.api.database.executeQuery).toHaveBeenCalledWith(
        'conn-1',
        expect.stringContaining('USE [TestDB]'),
        false,
        false,
        'TestDB'
      )
    })
  })

  it('does NOT prepend USE statement for postgres provider', async () => {
    render(<RecordDialog {...defaultProps} mode="edit" row={existingRow} provider="postgres" />)

    await waitFor(() => screen.getByText('Name'))

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      const call = vi.mocked(window.api.database.executeQuery).mock.calls[0]
      expect(call[1]).not.toContain('USE [TestDB]')
    })
  })
})

describe('RecordDialog – Escape to close', () => {
  it('calls onClose when Escape is pressed', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => screen.getByText('Name'))

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})

describe('RecordDialog – Add another record', () => {
  it('renders "Add another record" checkbox in add mode', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => screen.getByText('Name'))

    expect(screen.getByLabelText('Add another record')).toBeInTheDocument()
  })

  it('does not render "Add another record" checkbox in edit mode', async () => {
    render(<RecordDialog {...defaultProps} mode="edit" row={{ Id: 1, Name: 'Bob', Age: null, Active: false, BirthDate: null }} />)

    await waitFor(() => screen.getByText('Name'))

    expect(screen.queryByLabelText('Add another record')).not.toBeInTheDocument()
  })

  it('calls onAddAnotherSuccess instead of onSuccess when "Add another" is checked', async () => {
    const onAddAnotherSuccess = vi.fn()
    render(<RecordDialog {...defaultProps} mode="add" onAddAnotherSuccess={onAddAnotherSuccess} />)

    await waitFor(() => screen.getByText('Name'))

    // Check "Add another record"
    fireEvent.click(screen.getByLabelText('Add another record'))

    const nameInput = document.querySelector('#rdf-Name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(onAddAnotherSuccess).toHaveBeenCalled()
    })

    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('resets the form after "Add another" submit', async () => {
    const onAddAnotherSuccess = vi.fn()
    render(<RecordDialog {...defaultProps} mode="add" onAddAnotherSuccess={onAddAnotherSuccess} />)

    await waitFor(() => screen.getByText('Name'))

    fireEvent.click(screen.getByLabelText('Add another record'))

    const nameInput = document.querySelector('#rdf-Name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(onAddAnotherSuccess).toHaveBeenCalled()
    })

    // The form should be reset — Name field should be empty again
    await waitFor(() => {
      const resetInput = document.querySelector('#rdf-Name') as HTMLInputElement
      expect(resetInput.value).toBe('')
    })
  })

  it('calls onSuccess (and closes) when "Add another" is unchecked', async () => {
    render(<RecordDialog {...defaultProps} mode="add" />)

    await waitFor(() => screen.getByText('Name'))

    const nameInput = document.querySelector('#rdf-Name') as HTMLInputElement
    fireEvent.change(nameInput, { target: { value: 'Alice' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => {
      expect(defaultProps.onSuccess).toHaveBeenCalled()
    })
  })
})
