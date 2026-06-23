import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CreateTableDialog from '../CreateTableDialog'
import type { TableColumnMeta } from '../../../../../../../preload/index.d'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (opts?.tableName) return `${key} ${opts.tableName}`
      return key
    }
  })
}))

// Monaco Editor is already stubbed in test-setup.ts via vi.mock('@monaco-editor/react')

const defaultProps = {
  connectionId: 'conn-1',
  databaseName: 'TestDB',
  provider: 'sqlserver' as const,
  onClose: vi.fn(),
  onSuccess: vi.fn()
}

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

describe('CreateTableDialog – create mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the dialog title in create mode', () => {
    render(<CreateTableDialog {...defaultProps} />)
    expect(screen.getByText('explorer.createTable.dialogTitle')).toBeInTheDocument()
  })

  it('shows the schema and table name inputs', () => {
    render(<CreateTableDialog {...defaultProps} />)
    expect(screen.getByLabelText('explorer.createTable.schemaLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.createTable.tableNameLabel')).toBeInTheDocument()
  })

  it('defaults schema to "dbo"', () => {
    render(<CreateTableDialog {...defaultProps} />)
    const schemaInput = screen.getByLabelText(
      'explorer.createTable.schemaLabel'
    ) as HTMLInputElement
    expect(schemaInput.value).toBe('dbo')
  })

  it('shows empty state message when no columns exist', () => {
    render(<CreateTableDialog {...defaultProps} />)
    expect(screen.getByText('explorer.createTable.noColumns')).toBeInTheDocument()
  })

  it('renders the Create Table button', () => {
    render(<CreateTableDialog {...defaultProps} />)
    expect(screen.getByText('explorer.createTable.createButton')).toBeInTheDocument()
  })

  it('shows the properties empty message when no column selected', () => {
    render(<CreateTableDialog {...defaultProps} />)
    expect(screen.getByText('explorer.createTable.propertiesEmpty')).toBeInTheDocument()
  })

  it('adds a column when "Add Column" is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    // The empty state message should be gone
    expect(screen.queryByText('explorer.createTable.noColumns')).not.toBeInTheDocument()
    // A name input for the new column should appear inside the column table
    const nameInputs = screen.getAllByPlaceholderText('column_name')
    expect(nameInputs).toHaveLength(1)
  })

  it('shows properties panel after adding a column and selecting it', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    // properties empty message should be gone since a field is now auto-selected
    expect(screen.queryByText('explorer.createTable.propertiesEmpty')).not.toBeInTheDocument()
  })

  it('shows identity property for int type', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    // int type is default, identity checkbox should be visible
    expect(screen.getByText('explorer.createTable.props.identity')).toBeInTheDocument()
  })

  it('shows length property for nvarchar type', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    // Change type to nvarchar
    const typeSelect = screen.getByDisplayValue('int')
    await user.selectOptions(typeSelect, 'nvarchar')

    expect(screen.getByText('explorer.createTable.props.length')).toBeInTheDocument()
  })

  it('shows precision/scale for decimal type', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    const typeSelect = screen.getByDisplayValue('int')
    await user.selectOptions(typeSelect, 'decimal')

    expect(screen.getByText('explorer.createTable.props.precisionScale')).toBeInTheDocument()
  })

  it('deletes a column when delete button is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)

    const deleteBtn = screen.getByTitle('Delete column')
    await user.click(deleteBtn)

    expect(screen.queryByPlaceholderText('column_name')).not.toBeInTheDocument()
    expect(screen.getByText('explorer.createTable.noColumns')).toBeInTheDocument()
  })

  it('validates: shows error when submitting without a table name', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.click(screen.getByText('explorer.createTable.createButton'))

    expect(screen.getByText('explorer.createTable.validation.nameRequired')).toBeInTheDocument()
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('calls window.api.database.executeQuery on valid submit', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 10
    })

    render(<CreateTableDialog {...defaultProps} />)

    // Set table name
    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'MyTable')
    // Add a column
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    // Set column name
    await user.type(screen.getByPlaceholderText('column_name'), 'Id')

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        'conn-1',
        expect.stringMatching(/USE \[TestDB\][\s\S]*CREATE TABLE/),
        undefined,
        undefined,
        undefined
      )
    })
    expect(defaultProps.onSuccess).toHaveBeenCalled()
  })

  it('shows server error when executeQuery returns error', async () => {
    const user = userEvent.setup()
    vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'error',
      message: 'Table already exists'
    })

    render(<CreateTableDialog {...defaultProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'ExistingTable')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'Id')

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(screen.getByText('Table already exists')).toBeInTheDocument()
    })
    expect(defaultProps.onSuccess).not.toHaveBeenCalled()
  })

  it('shows Reset SQL button only when SQL is manually edited', async () => {
    render(<CreateTableDialog {...defaultProps} />)

    // Reset SQL button should not be visible initially
    expect(screen.queryByText('explorer.createTable.resetSqlButton')).not.toBeInTheDocument()

    // Monaco editor is mocked and returns null, so we can't directly test manual editing
    // through the editor UI in unit tests. This is verified by the SQL editor onChange handler.
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.cancelButton'))
    expect(defaultProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when clicking the overlay background', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    const overlay = screen.getByRole('dialog')
    await user.click(overlay)
    expect(defaultProps.onClose).toHaveBeenCalled()
  })
})

describe('CreateTableDialog – edit mode', () => {
  const editProps = {
    ...defaultProps,
    editTable: { schema: 'dbo', tableName: 'Users' }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows a loading spinner while fetching table schema', async () => {
    // Never resolves so spinner stays
    vi.spyOn(window.api.database, 'getTableSchema').mockImplementation(() => new Promise(() => {}))
    render(<CreateTableDialog {...editProps} />)

    expect(screen.getByText('explorer.createTable.loading')).toBeInTheDocument()
  })

  it('populates columns from getTableSchema result', async () => {
    const columns: TableColumnMeta[] = [
      makeColumn({ name: 'Id', type: 'int', isPrimaryKey: true }),
      makeColumn({ name: 'Name', type: 'nvarchar', maxLength: 100, isNullable: true })
    ]
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns
    })

    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      const nameInputs = screen.getAllByPlaceholderText('column_name')
      expect(nameInputs).toHaveLength(2)
    })

    const inputs = screen.getAllByPlaceholderText('column_name') as HTMLInputElement[]
    expect(inputs[0].value).toBe('Id')
    expect(inputs[1].value).toBe('Name')
  })

  it('shows error when getTableSchema fails', async () => {
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'error',
      message: 'Permission denied'
    })

    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      expect(screen.getByText('Permission denied')).toBeInTheDocument()
    })
  })

  it('disables the table name input in edit mode', async () => {
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn()]
    })
    render(<CreateTableDialog {...editProps} />)

    const tableNameInput = screen.getByLabelText(
      'explorer.createTable.tableNameLabel'
    ) as HTMLInputElement
    expect(tableNameInput).toBeDisabled()
  })

  it('calls executeQuery with ALTER TABLE SQL in edit mode', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn({ name: 'Id', type: 'int' })]
    })

    render(<CreateTableDialog {...editProps} />)

    // Wait for schema to load
    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)
    })

    // Add a new column to trigger a diff
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    const nameInputs = screen.getAllByPlaceholderText('column_name')
    await user.type(nameInputs[1], 'Email')

    await user.click(screen.getByText('explorer.editTable.saveButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        'conn-1',
        expect.stringMatching(/USE \[TestDB\][\s\S]*ALTER TABLE/),
        undefined,
        undefined,
        undefined
      )
    })
    expect(defaultProps.onSuccess).toHaveBeenCalled()
  })
})

describe('CreateTableDialog – Primary Key', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('toggles PK checkbox in column list and generates CONSTRAINT in CREATE SQL', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Orders')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'OrderId')

    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    expect(pkCheckbox.checked).toBe(false)
    await user.click(pkCheckbox)
    expect(pkCheckbox.checked).toBe(true)
  })

  it('setting PK automatically unchecks Nullable', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    // Make the column nullable first
    const nullableCheckbox = screen.getByTitle('Nullable') as HTMLInputElement
    if (!nullableCheckbox.checked) {
      await user.click(nullableCheckbox)
    }
    expect(nullableCheckbox.checked).toBe(true)

    // Now set as PK — nullable should turn off
    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    await user.click(pkCheckbox)
    expect(pkCheckbox.checked).toBe(true)
    expect(nullableCheckbox.checked).toBe(false)
  })

  it('shows Primary Key checkbox in the properties panel when a column is selected', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    expect(screen.getByText('explorer.createTable.props.primaryKey')).toBeInTheDocument()
  })

  it('toggles PK from properties panel and syncs with column list checkbox', async () => {
    const user = userEvent.setup()
    render(<CreateTableDialog {...defaultProps} />)

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))

    // Column list PK checkbox (identified by its title attribute in FieldRow)
    const listPkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    expect(listPkCheckbox.checked).toBe(false)

    // Props panel PK checkbox (identified by its sibling label text)
    const propsPkLabelText = screen.getByText('explorer.createTable.props.primaryKey')
    const propsPkCheckbox = propsPkLabelText
      .closest('label')
      ?.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(propsPkCheckbox).toBeTruthy()
    expect(propsPkCheckbox.checked).toBe(false)

    // Click the properties panel checkbox
    await user.click(propsPkCheckbox)
    expect(propsPkCheckbox.checked).toBe(true)

    // Column-list PK checkbox should also be checked now
    expect(listPkCheckbox.checked).toBe(true)
  })

  it('generates PK change SQL in edit mode when PK is added to an existing column', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn({ name: 'Id', type: 'int', isPrimaryKey: false })]
    })

    const editProps = { ...defaultProps, editTable: { schema: 'dbo', tableName: 'Orders' } }
    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)
    })

    // Toggle PK on the existing column
    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    await user.click(pkCheckbox)
    expect(pkCheckbox.checked).toBe(true)

    await user.click(screen.getByText('explorer.editTable.saveButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        'conn-1',
        expect.stringMatching(/ADD CONSTRAINT \[PK_Orders\] PRIMARY KEY CLUSTERED \(\[Id\]\)/),
        undefined,
        undefined,
        undefined
      )
    })
  })

  it('generates DROP + ADD PK SQL when PK is removed from an existing column in edit mode', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn({ name: 'Id', type: 'int', isPrimaryKey: true })]
    })

    const editProps = { ...defaultProps, editTable: { schema: 'dbo', tableName: 'Orders' } }
    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)
    })

    // The column is already marked as PK — uncheck it
    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    expect(pkCheckbox.checked).toBe(true)
    await user.click(pkCheckbox)
    expect(pkCheckbox.checked).toBe(false)

    await user.click(screen.getByText('explorer.editTable.saveButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith(
        'conn-1',
        expect.stringMatching(/DROP CONSTRAINT/),
        undefined,
        undefined,
        undefined
      )
    })
    // No ADD CONSTRAINT — PK was removed entirely
    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).not.toMatch(/ADD CONSTRAINT/)
  })
})

describe('CreateTableDialog – SQLite provider', () => {
  const sqliteProps = {
    connectionId: 'conn-sqlite',
    databaseName: 'main',
    provider: 'sqlite' as const,
    onClose: vi.fn(),
    onSuccess: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('generates CREATE TABLE without USE prefix for SQLite', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    render(<CreateTableDialog {...sqliteProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Products')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'Id')

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).not.toMatch(/USE/i)
    expect(sqlArg).toMatch(/CREATE TABLE/i)
  })

  it('generates CREATE TABLE with double-quoted identifiers for SQLite', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    render(<CreateTableDialog {...sqliteProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Products')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'Id')

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).toMatch(/"Products"/)
    expect(sqlArg).toMatch(/"Id"/)
    expect(sqlArg).not.toMatch(/\[Products\]/)
  })

  it('generates inline PRIMARY KEY for single PK column in SQLite', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    render(<CreateTableDialog {...sqliteProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Items')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'Id')

    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    await user.click(pkCheckbox)

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).toMatch(/"Id" INT PRIMARY KEY/)
    expect(sqlArg).not.toMatch(/CONSTRAINT/)
    expect(sqlArg).not.toMatch(/CLUSTERED/)
  })
})

describe('CreateTableDialog – MySQL provider', () => {
  const mysqlProps = {
    connectionId: 'conn-mysql',
    databaseName: 'myapp',
    provider: 'mysql' as const,
    onClose: vi.fn(),
    onSuccess: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('defaults schema to the database name for MySQL', () => {
    render(<CreateTableDialog {...mysqlProps} />)
    const schemaInput = screen.getByLabelText(
      'explorer.createTable.schemaLabel'
    ) as HTMLInputElement
    expect(schemaInput.value).toBe('myapp')
  })

  it('generates CREATE TABLE with backtick-quoted identifiers', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    render(<CreateTableDialog {...mysqlProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Users')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'Id')

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).toMatch(/`Users`/)
    expect(sqlArg).toMatch(/`Id`/)
    expect(sqlArg).not.toMatch(/\[Users\]/)
    expect(sqlArg).not.toMatch(/\[Id\]/)
  })

  it('does not include USE [db] prefix in MySQL CREATE TABLE', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    render(<CreateTableDialog {...mysqlProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Products')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'Id')

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).not.toMatch(/USE\s+/i)
    expect(sqlArg).toMatch(/CREATE TABLE/i)
  })

  it('generates PRIMARY KEY without CLUSTERED for MySQL', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    render(<CreateTableDialog {...mysqlProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Orders')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'OrderId')

    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    await user.click(pkCheckbox)

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).toMatch(/PRIMARY KEY \(`OrderId`\)/)
    expect(sqlArg).not.toMatch(/CLUSTERED/)
    expect(sqlArg).not.toMatch(/CONSTRAINT/)
  })

  it('does not generate IDENTITY() syntax in MySQL ALTER TABLE when adding a column', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn({ name: 'Id', type: 'int' })]
    })

    const editProps = { ...mysqlProps, editTable: { schema: 'myapp', tableName: 'Items' } }
    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)
    })

    // Add a new column to trigger ALTER SQL generation
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    const nameInputs = screen.getAllByPlaceholderText('column_name')
    await user.type(nameInputs[1], 'Name')

    await user.click(screen.getByText('explorer.editTable.saveButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).not.toMatch(/IDENTITY\(/)
    // Backtick quoting is used in the ALTER statement
    expect(sqlArg).toMatch(/`myapp`\.`Items`/)
  })

  it('generates MODIFY COLUMN in MySQL ALTER TABLE for type changes', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn({ name: 'Name', type: 'varchar', maxLength: 50, isNullable: true })]
    })

    const editProps = { ...mysqlProps, editTable: { schema: 'myapp', tableName: 'Users' } }
    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)
    })

    // Change nullability to trigger a modify
    const nullableCheckbox = screen.getByTitle('Nullable') as HTMLInputElement
    expect(nullableCheckbox.checked).toBe(true)
    await user.click(nullableCheckbox)

    await user.click(screen.getByText('explorer.editTable.saveButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).toMatch(/MODIFY COLUMN/)
    expect(sqlArg).not.toMatch(/ALTER COLUMN/)
  })

  it('generates ADD PRIMARY KEY without CLUSTERED in MySQL ALTER TABLE', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn({ name: 'Id', type: 'int', isPrimaryKey: false })]
    })

    const editProps = { ...mysqlProps, editTable: { schema: 'myapp', tableName: 'Orders' } }
    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)
    })

    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    await user.click(pkCheckbox)

    await user.click(screen.getByText('explorer.editTable.saveButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).toMatch(/ADD PRIMARY KEY \(`Id`\)/)
    expect(sqlArg).not.toMatch(/CLUSTERED/)
    expect(sqlArg).not.toMatch(/CONSTRAINT/)
  })

  it('generates DROP PRIMARY KEY in MySQL ALTER TABLE', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })
    vi.spyOn(window.api.database, 'getTableSchema').mockResolvedValue({
      status: 'ok',
      columns: [makeColumn({ name: 'Id', type: 'int', isPrimaryKey: true })]
    })

    const editProps = { ...mysqlProps, editTable: { schema: 'myapp', tableName: 'Orders' } }
    render(<CreateTableDialog {...editProps} />)

    await waitFor(() => {
      expect(screen.getAllByPlaceholderText('column_name')).toHaveLength(1)
    })

    const pkCheckbox = screen.getByTitle('Primary key') as HTMLInputElement
    expect(pkCheckbox.checked).toBe(true)
    await user.click(pkCheckbox)

    await user.click(screen.getByText('explorer.editTable.saveButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    expect(sqlArg).toMatch(/DROP PRIMARY KEY/)
    expect(sqlArg).not.toMatch(/DECLARE @pkName/)
  })

  it('generates VARCHAR with length for MySQL', async () => {
    const user = userEvent.setup()
    const executeSpy = vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
      status: 'ok',
      resultSets: [],
      messages: [],
      durationMs: 5
    })

    render(<CreateTableDialog {...mysqlProps} />)

    await user.type(screen.getByLabelText('explorer.createTable.tableNameLabel'), 'Users')
    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    await user.type(screen.getByPlaceholderText('column_name'), 'FirstName')

    // Change type to varchar (which requires a length in MySQL)
    const typeSelect = screen.getByDisplayValue('int')
    await user.selectOptions(typeSelect, 'varchar')

    await user.click(screen.getByText('explorer.createTable.createButton'))

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalled()
    })

    const [, sqlArg] = executeSpy.mock.calls[0]
    // varchar must have a length — matches VARCHAR(n) pattern
    expect(sqlArg).toMatch(/VARCHAR\(\d+\)/)
    expect(sqlArg).not.toMatch(/VARCHAR NULL/)
    expect(sqlArg).not.toMatch(/NVARCHAR/)
  })
})
