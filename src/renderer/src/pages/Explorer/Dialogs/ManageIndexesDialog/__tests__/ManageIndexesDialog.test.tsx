import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ManageIndexesDialog from '../ManageIndexesDialog'
import type { IndexDefinition } from '../../../../../../../preload/index.d'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, _opts?: unknown) => key })
}))

// ── shared props ──────────────────────────────────────────────────────────────

const baseProps = {
  connectionId: 'conn-1',
  databaseName: 'MyDB',
  schema: 'dbo',
  tableName: 'Orders',
  onClose: vi.fn(),
  onSuccess: vi.fn()
}

const sampleIndex: IndexDefinition = {
  name: 'idx_Orders_CustomerId',
  schemaName: 'dbo',
  tableName: 'Orders',
  type: 'NONCLUSTERED',
  isUnique: false,
  isPrimaryKey: false,
  isDisabled: false,
  columns: [
    { columnName: 'CustomerId', keyOrdinal: 0, isDescendingKey: false, isIncludedColumn: false }
  ],
  filterExpression: undefined,
  fillFactor: undefined,
  description: 'Index on CustomerId'
}

const pkIndex: IndexDefinition = {
  name: 'PK_Orders',
  schemaName: 'dbo',
  tableName: 'Orders',
  type: 'CLUSTERED',
  isUnique: true,
  isPrimaryKey: true,
  isDisabled: false,
  columns: [
    { columnName: 'OrderId', keyOrdinal: 0, isDescendingKey: false, isIncludedColumn: false }
  ]
}

const clusteredIndex: IndexDefinition = {
  name: 'CX_Orders_OrderDate',
  schemaName: 'dbo',
  tableName: 'Orders',
  type: 'CLUSTERED',
  isUnique: false,
  isPrimaryKey: false,
  isDisabled: false,
  columns: [
    { columnName: 'OrderDate', keyOrdinal: 0, isDescendingKey: false, isIncludedColumn: false }
  ]
}

// ── helpers ───────────────────────────────────────────────────────────────────

function mockGetIndexes(indexes: IndexDefinition[]): void {
  vi.spyOn(window.api.database, 'getIndexes').mockResolvedValue({
    status: 'ok',
    indexes
  })
}

function mockGetTableSchema(columns: string[] = ['OrderId', 'CustomerId', 'OrderDate']): void {
  vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
    status: 'ok',
    columns: columns.map((name) => ({
      name,
      type: 'int',
      maxLength: null,
      precision: null,
      scale: null,
      isNullable: false,
      defaultValue: null,
      isIdentity: false,
      identitySeed: null,
      identityIncrement: null,
      isPrimaryKey: false
    }))
  })
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('ManageIndexesDialog — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('renders the dialog title', async () => {
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.dialogTitle')).toBeInTheDocument()
    )
  })

  it('renders the indexes list header', async () => {
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.listHeader')).toBeInTheDocument()
    )
  })

  it('shows empty state when no indexes exist', async () => {
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.noIndexes')).toBeInTheDocument()
    )
  })

  it('renders existing index name in the list', async () => {
    mockGetIndexes([sampleIndex])
    render(<ManageIndexesDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('idx_Orders_CustomerId')).toBeInTheDocument()
    )
  })

  it('renders the add index button', async () => {
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.addButton')).toBeInTheDocument()
    )
  })

  it('shows "select or add" empty state in editor panel before selection', async () => {
    mockGetIndexes([sampleIndex])
    render(<ManageIndexesDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.selectOrAdd')).toBeInTheDocument()
    )
  })

  it('calls getIndexes and getTableSchema on mount', async () => {
    const getIndexesSpy = vi.spyOn(window.api.database, 'getIndexes').mockResolvedValue({
      status: 'ok',
      indexes: []
    })
    const getSchemaSpy = vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: []
    })
    render(<ManageIndexesDialog {...baseProps} />)
    await waitFor(() => {
      expect(getIndexesSpy).toHaveBeenCalledWith('conn-1', 'MyDB', 'dbo', 'Orders')
      expect(getSchemaSpy).toHaveBeenCalledWith('conn-1', 'MyDB', 'dbo', 'Orders')
    })
  })
})

// ── Selecting an index ────────────────────────────────────────────────────────

describe('ManageIndexesDialog — select existing index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('shows editor fields when an index is selected', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    expect(screen.getByText('explorer.manageIndexes.nameLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageIndexes.typeLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageIndexes.columnsLabel')).toBeInTheDocument()
  })

  it('shows delete button when a non-PK index is selected', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    expect(screen.getByText('explorer.manageIndexes.deleteButton')).toBeInTheDocument()
  })

  it('populates the name input with the index name when selected', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    const nameInput = screen.getByDisplayValue('idx_Orders_CustomerId')
    expect(nameInput).toBeInTheDocument()
  })

  it('shows rebuild, reorganize and disable buttons for non-PK index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    expect(screen.getByText('explorer.manageIndexes.rebuild')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageIndexes.reorganize')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageIndexes.disable')).toBeInTheDocument()
  })
})

// ── Primary key index ─────────────────────────────────────────────────────────

describe('ManageIndexesDialog — primary key index', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('shows primary key note for PK index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([pkIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('PK_Orders'))
    await user.click(screen.getByText('PK_Orders'))

    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.primaryKeyNote')).toBeInTheDocument()
    )
  })

  it('does not show delete button for PK index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([pkIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('PK_Orders'))
    await user.click(screen.getByText('PK_Orders'))

    await waitFor(() =>
      expect(screen.queryByText('explorer.manageIndexes.deleteButton')).not.toBeInTheDocument()
    )
  })

  it('does not show save button for PK index (read-only)', async () => {
    const user = userEvent.setup()
    mockGetIndexes([pkIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('PK_Orders'))
    await user.click(screen.getByText('PK_Orders'))

    await waitFor(() =>
      expect(screen.queryByText('explorer.manageIndexes.saveButton')).not.toBeInTheDocument()
    )
  })

  it('disables CLUSTERED type when table already has a PK index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([pkIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    // Enter add-new mode
    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    // CLUSTERED radio should be disabled since table has a PK (which is clustered)
    await waitFor(() => {
      const radios = screen.getAllByRole('radio')
      const clusteredRadio = radios.find((r) => (r as HTMLInputElement).value === 'CLUSTERED')
      expect(clusteredRadio).toBeDisabled()
    })
  })
})

// ── Add new index ─────────────────────────────────────────────────────────────

describe('ManageIndexesDialog — add new', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('shows editor fields when "Add Index" is clicked', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    expect(screen.getByText('explorer.manageIndexes.nameLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageIndexes.saveButton')).toBeInTheDocument()
  })

  it('does not show delete button for a new index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    expect(screen.queryByText('explorer.manageIndexes.deleteButton')).not.toBeInTheDocument()
  })

  it('shows (new) placeholder in list when adding', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    expect(screen.getByText('explorer.manageIndexes.newIndex')).toBeInTheDocument()
  })

  it('opens in add-new mode when openOnNew is true', async () => {
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} openOnNew />)

    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.saveButton')).toBeInTheDocument()
    )
  })

  it('pre-selects initialIndexName when provided', async () => {
    mockGetIndexes([sampleIndex])
    render(<ManageIndexesDialog {...baseProps} initialIndexName="idx_Orders_CustomerId" />)

    await waitFor(() =>
      expect(screen.getByDisplayValue('idx_Orders_CustomerId')).toBeInTheDocument()
    )
  })
})

// ── Validation ────────────────────────────────────────────────────────────────

describe('ManageIndexesDialog — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('shows name required error when saving without a name', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    const nameInput = screen.getByPlaceholderText('explorer.manageIndexes.namePlaceholder')
    await user.clear(nameInput)
    await user.click(screen.getByText('explorer.manageIndexes.saveButton'))

    expect(screen.getByText('explorer.manageIndexes.validation.nameRequired')).toBeInTheDocument()
  })

  it('shows columns required error when no key columns are selected', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    // Type a name but leave column empty
    const nameInput = screen.getByPlaceholderText('explorer.manageIndexes.namePlaceholder')
    await user.type(nameInput, 'idx_Test')

    await user.click(screen.getByText('explorer.manageIndexes.saveButton'))

    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageIndexes.validation.columnsRequired')
      ).toBeInTheDocument()
    )
  })
})

// ── Save ──────────────────────────────────────────────────────────────────────

describe('ManageIndexesDialog — save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('calls saveIndex and onSuccess on valid save', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    const saveSpy = vi.spyOn(window.api.database, 'saveIndex').mockResolvedValue({ status: 'ok' })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    const nameInput = screen.getByPlaceholderText('explorer.manageIndexes.namePlaceholder')
    await user.type(nameInput, 'idx_NewIndex')

    // Select a column from the dropdown
    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'CustomerId')

    await user.click(screen.getByText('explorer.manageIndexes.saveButton'))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'conn-1',
        'MyDB',
        expect.objectContaining({ name: 'idx_NewIndex' }),
        undefined
      )
      expect(baseProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('shows server error message when saveIndex fails', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    vi.spyOn(window.api.database, 'saveIndex').mockResolvedValue({
      status: 'error',
      message: 'Index already exists'
    })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    const nameInput = screen.getByPlaceholderText('explorer.manageIndexes.namePlaceholder')
    await user.type(nameInput, 'idx_Dup')

    const selects = screen.getAllByRole('combobox')
    await user.selectOptions(selects[0], 'CustomerId')

    await user.click(screen.getByText('explorer.manageIndexes.saveButton'))

    await waitFor(() => {
      expect(screen.getByText('Index already exists')).toBeInTheDocument()
    })
    expect(baseProps.onSuccess).not.toHaveBeenCalled()
  })

  it('passes originalIndexName when editing an existing index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    const saveSpy = vi.spyOn(window.api.database, 'saveIndex').mockResolvedValue({ status: 'ok' })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.saveButton'))
    await user.click(screen.getByText('explorer.manageIndexes.saveButton'))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'conn-1',
        'MyDB',
        expect.any(Object),
        'idx_Orders_CustomerId'
      )
    })
  })
})

// ── Delete ────────────────────────────────────────────────────────────────────

describe('ManageIndexesDialog — delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('calls deleteIndex and onSuccess when delete is clicked', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    const deleteSpy = vi
      .spyOn(window.api.database, 'deleteIndex')
      .mockResolvedValue({ status: 'ok' })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.deleteButton'))
    await user.click(screen.getByText('explorer.manageIndexes.deleteButton'))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith(
        'conn-1',
        'MyDB',
        'idx_Orders_CustomerId',
        'dbo',
        'Orders'
      )
      expect(baseProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('shows server error message when deleteIndex fails', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    vi.spyOn(window.api.database, 'deleteIndex').mockResolvedValue({
      status: 'error',
      message: 'Cannot drop index'
    })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.deleteButton'))
    await user.click(screen.getByText('explorer.manageIndexes.deleteButton'))

    await waitFor(() => {
      expect(screen.getByText('Cannot drop index')).toBeInTheDocument()
    })
    expect(baseProps.onSuccess).not.toHaveBeenCalled()
  })
})

// ── Rebuild / Reorganize / Disable ────────────────────────────────────────────

describe('ManageIndexesDialog — maintenance operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('calls rebuildIndex when Rebuild is clicked', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    const rebuildSpy = vi
      .spyOn(window.api.database, 'rebuildIndex')
      .mockResolvedValue({ status: 'ok' })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.rebuild'))
    await user.click(screen.getByText('explorer.manageIndexes.rebuild'))

    await waitFor(() => {
      expect(rebuildSpy).toHaveBeenCalledWith(
        'conn-1',
        'MyDB',
        'idx_Orders_CustomerId',
        'dbo',
        'Orders'
      )
    })
  })

  it('shows rebuild success message', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    vi.spyOn(window.api.database, 'rebuildIndex').mockResolvedValue({ status: 'ok' })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.rebuild'))
    await user.click(screen.getByText('explorer.manageIndexes.rebuild'))

    await waitFor(() =>
      expect(screen.getByText('explorer.manageIndexes.rebuildSuccess')).toBeInTheDocument()
    )
  })

  it('calls reorganizeIndex when Reorganize is clicked', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    const reorganizeSpy = vi
      .spyOn(window.api.database, 'reorganizeIndex')
      .mockResolvedValue({ status: 'ok' })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.reorganize'))
    await user.click(screen.getByText('explorer.manageIndexes.reorganize'))

    await waitFor(() => {
      expect(reorganizeSpy).toHaveBeenCalledWith(
        'conn-1',
        'MyDB',
        'idx_Orders_CustomerId',
        'dbo',
        'Orders'
      )
    })
  })

  it('calls disableIndex when Disable is clicked and calls onSuccess', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    const disableSpy = vi
      .spyOn(window.api.database, 'disableIndex')
      .mockResolvedValue({ status: 'ok' })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.disable'))
    await user.click(screen.getByText('explorer.manageIndexes.disable'))

    await waitFor(() => {
      expect(disableSpy).toHaveBeenCalledWith(
        'conn-1',
        'MyDB',
        'idx_Orders_CustomerId',
        'dbo',
        'Orders'
      )
      expect(baseProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('shows error when rebuildIndex fails', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex])
    vi.spyOn(window.api.database, 'rebuildIndex').mockResolvedValue({
      status: 'error',
      message: 'Cannot rebuild index'
    })
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('idx_Orders_CustomerId'))
    await user.click(screen.getByText('idx_Orders_CustomerId'))

    await waitFor(() => screen.getByText('explorer.manageIndexes.rebuild'))
    await user.click(screen.getByText('explorer.manageIndexes.rebuild'))

    await waitFor(() =>
      expect(screen.getByText('Cannot rebuild index')).toBeInTheDocument()
    )
  })
})

// ── Clustered index logic ─────────────────────────────────────────────────────

describe('ManageIndexesDialog — clustered index logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('does not disable CLUSTERED when table has no clustered index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([sampleIndex]) // only a NONCLUSTERED index
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    await waitFor(() => {
      const radios = screen.getAllByRole('radio')
      const clusteredRadio = radios.find((r) => (r as HTMLInputElement).value === 'CLUSTERED')
      expect(clusteredRadio).not.toBeDisabled()
    })
  })

  it('disables CLUSTERED when table already has a non-PK clustered index', async () => {
    const user = userEvent.setup()
    mockGetIndexes([clusteredIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageIndexes.addButton'))
    await user.click(screen.getByText('explorer.manageIndexes.addButton'))

    await waitFor(() => {
      const radios = screen.getAllByRole('radio')
      const clusteredRadio = radios.find((r) => (r as HTMLInputElement).value === 'CLUSTERED')
      expect(clusteredRadio).toBeDisabled()
    })
  })

  it('does not disable CLUSTERED when editing the existing clustered index itself', async () => {
    const user = userEvent.setup()
    mockGetIndexes([clusteredIndex])
    render(<ManageIndexesDialog {...baseProps} />)

    await waitFor(() => screen.getByText('CX_Orders_OrderDate'))
    await user.click(screen.getByText('CX_Orders_OrderDate'))

    await waitFor(() => {
      const radios = screen.getAllByRole('radio')
      const clusteredRadio = radios.find((r) => (r as HTMLInputElement).value === 'CLUSTERED')
      expect(clusteredRadio).not.toBeDisabled()
    })
  })
})

// ── Close ─────────────────────────────────────────────────────────────────────

describe('ManageIndexesDialog — close', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTableSchema()
  })

  afterEach(() => cleanup())

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup()
    mockGetIndexes([])
    const onClose = vi.fn()
    render(<ManageIndexesDialog {...baseProps} onClose={onClose} />)

    await waitFor(() => screen.getByRole('button', { name: 'common.close' }))
    await user.click(screen.getByRole('button', { name: 'common.close' }))

    expect(onClose).toHaveBeenCalled()
  })
})
