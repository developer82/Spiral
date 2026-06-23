import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ManageTableTypesDialog from '../ManageTableTypesDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// ── base props ────────────────────────────────────────────────────────────────

const baseProps = {
  connectionId: 'conn-1',
  databaseName: 'TestDB',
  onClose: vi.fn(),
  onSuccess: vi.fn()
}

// ── helpers ───────────────────────────────────────────────────────────────────

function mockGetTableTypes(types: Array<{ schemaName: string; typeName: string }>): void {
  vi.spyOn(window.api.database, 'getTableTypes' as keyof typeof window.api.database).mockResolvedValue({
    status: 'ok',
    tableTypes: types
  } as never)
}

function mockGetTableType(schemaName: string, typeName: string): void {
  vi.spyOn(window.api.database, 'getTableType' as keyof typeof window.api.database).mockResolvedValue({
    status: 'ok',
    tableType: {
      schemaName,
      typeName,
      columns: [
        { name: 'Id', type: 'int', maxLength: null, precision: 10, scale: 0, isNullable: false },
        { name: 'Name', type: 'nvarchar', maxLength: 200, precision: null, scale: null, isNullable: true }
      ]
    }
  } as never)
}

function mockExecuteQuery(): void {
  vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
    status: 'ok',
    resultSets: [{ rows: [{ name: 'dbo' }], columns: [], rowCount: 1 }],
    messages: [],
    durationMs: 0
  })
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ManageTableTypesDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExecuteQuery()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the dialog title', async () => {
    mockGetTableTypes([])

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.dialogTitle')).toBeInTheDocument()
    })
  })

  it('shows empty state when no table types exist', async () => {
    mockGetTableTypes([])

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.noItems')).toBeInTheDocument()
    })
  })

  it('lists existing table types', async () => {
    mockGetTableTypes([
      { schemaName: 'dbo', typeName: 'CustomerType' },
      { schemaName: 'sales', typeName: 'OrderType' }
    ])

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('dbo.CustomerType')).toBeInTheDocument()
      expect(screen.getByText('sales.OrderType')).toBeInTheDocument()
    })
  })

  it('shows select-or-add message before any selection', async () => {
    mockGetTableTypes([{ schemaName: 'dbo', typeName: 'MyType' }])

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.selectOrAdd')).toBeInTheDocument()
    })
  })

  it('loads and shows columns when a table type is selected', async () => {
    mockGetTableTypes([{ schemaName: 'dbo', typeName: 'CustomerType' }])
    mockGetTableType('dbo', 'CustomerType')

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('dbo.CustomerType')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('dbo.CustomerType'))

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name').length).toBeGreaterThan(0)
    })
  })

  it('opens in "add new" mode when openOnNew=true', async () => {
    mockGetTableTypes([])

    render(<ManageTableTypesDialog {...baseProps} openOnNew={true} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.newItem')).toBeInTheDocument()
    })

    // The Create button should be visible
    expect(screen.getByText('explorer.manageTableTypes.saveButton')).toBeInTheDocument()
  })

  it('shows validation error when saving with no name', async () => {
    mockGetTableTypes([])

    render(<ManageTableTypesDialog {...baseProps} openOnNew={true} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.saveButton')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('explorer.manageTableTypes.saveButton'))

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.validation.nameRequired')).toBeInTheDocument()
    })
  })

  it('calls saveTableType and onSuccess when saving a valid new type', async () => {
    mockGetTableTypes([])
    vi.spyOn(window.api.database, 'saveTableType' as keyof typeof window.api.database).mockResolvedValue({
      status: 'ok'
    } as never)
    vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue()

    render(<ManageTableTypesDialog {...baseProps} openOnNew={true} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.saveButton')).toBeInTheDocument()
    })

    // Fill in the name
    const nameInput = screen.getByPlaceholderText('explorer.manageTableTypes.namePlaceholder')
    await userEvent.type(nameInput, 'NewTableType')

    await userEvent.click(screen.getByText('explorer.manageTableTypes.saveButton'))

    await waitFor(() => {
      expect(baseProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error when saveTableType returns error status', async () => {
    mockGetTableTypes([])
    vi.spyOn(window.api.database, 'saveTableType' as keyof typeof window.api.database).mockResolvedValue({
      status: 'error',
      message: 'Type already exists'
    } as never)

    render(<ManageTableTypesDialog {...baseProps} openOnNew={true} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.saveButton')).toBeInTheDocument()
    })

    const nameInput = screen.getByPlaceholderText('explorer.manageTableTypes.namePlaceholder')
    await userEvent.type(nameInput, 'ExistingType')

    await userEvent.click(screen.getByText('explorer.manageTableTypes.saveButton'))

    await waitFor(() => {
      expect(screen.getByText('Type already exists')).toBeInTheDocument()
    })
  })

  it('calls deleteTableType and onSuccess when deleting a selected type', async () => {
    mockGetTableTypes([{ schemaName: 'dbo', typeName: 'ToDelete' }])
    mockGetTableType('dbo', 'ToDelete')
    vi.spyOn(window.api.database, 'deleteTableType' as keyof typeof window.api.database).mockResolvedValue({
      status: 'ok'
    } as never)
    vi.spyOn(window.api.database, 'invalidateCache').mockResolvedValue()

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('dbo.ToDelete')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('dbo.ToDelete'))

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.deleteButton')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByText('explorer.manageTableTypes.deleteButton'))

    await waitFor(() => {
      expect(baseProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('calls onClose when X button is clicked', async () => {
    mockGetTableTypes([])

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.dialogTitle')).toBeInTheDocument()
    })

    await userEvent.click(screen.getByRole('button', { name: 'common.close' }))

    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when Escape is pressed', async () => {
    mockGetTableTypes([])

    render(<ManageTableTypesDialog {...baseProps} />)

    await waitFor(() => {
      expect(screen.getByText('explorer.manageTableTypes.dialogTitle')).toBeInTheDocument()
    })

    await userEvent.keyboard('{Escape}')

    expect(baseProps.onClose).toHaveBeenCalled()
  })
})
