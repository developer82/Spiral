import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import TableColumnsEditor, { type TableField, newFieldId, makeDefaultField } from '../TableColumnsEditor'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// ── helpers ───────────────────────────────────────────────────────────────────

function makeField(overrides: Partial<TableField> = {}): TableField {
  return {
    id: newFieldId(),
    name: 'col1',
    type: 'int',
    length: null,
    precision: null,
    scale: null,
    isNullable: true,
    defaultValue: '',
    isPrimaryKey: false,
    isIdentity: false,
    identitySeed: 1,
    identityIncrement: 1,
    ...overrides
  }
}

const noop = (): void => {}

// ── newFieldId / makeDefaultField ─────────────────────────────────────────────

describe('newFieldId', () => {
  it('returns unique string IDs on each call', () => {
    const a = newFieldId()
    const b = newFieldId()
    expect(typeof a).toBe('string')
    expect(a).not.toBe(b)
  })
})

describe('makeDefaultField', () => {
  it('returns a field with sane defaults for sqlserver', () => {
    const field = makeDefaultField('sqlserver')
    expect(field.type).toBe('int')
    expect(field.isNullable).toBe(true)
    expect(field.isPrimaryKey).toBe(false)
    expect(field.isIdentity).toBe(false)
    expect(typeof field.id).toBe('string')
  })
})

// ── TableColumnsEditor rendering ──────────────────────────────────────────────

describe('TableColumnsEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders empty state when no fields provided', () => {
    render(
      <TableColumnsEditor
        fields={[]}
        onFieldsChange={noop}
        provider="sqlserver"
      />
    )
    expect(screen.getByText('explorer.createTable.noColumns')).toBeInTheDocument()
  })

  it('renders a field row for each field', () => {
    const fields = [
      makeField({ name: 'Id', type: 'int' }),
      makeField({ name: 'Name', type: 'nvarchar' })
    ]
    render(
      <TableColumnsEditor
        fields={fields}
        onFieldsChange={noop}
        provider="sqlserver"
      />
    )

    const nameInputs = screen.getAllByPlaceholderText('column_name')
    expect(nameInputs).toHaveLength(2)
    expect(nameInputs[0]).toHaveValue('Id')
    expect(nameInputs[1]).toHaveValue('Name')
  })

  it('calls onFieldsChange when Add Column button is clicked', async () => {
    const user = userEvent.setup()
    const handleChange = vi.fn()

    render(
      <TableColumnsEditor
        fields={[]}
        onFieldsChange={handleChange}
        provider="sqlserver"
      />
    )

    await user.click(screen.getByText('explorer.createTable.addColumnButton'))
    expect(handleChange).toHaveBeenCalledOnce()
    const newFields: TableField[] = handleChange.mock.calls[0][0]
    expect(newFields).toHaveLength(1)
    expect(newFields[0].type).toBe('int')
  })

  it('calls onFieldsChange with updated name when field name is edited', async () => {
    const field = makeField({ name: 'OldName' })
    const handleChange = vi.fn()

    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={handleChange}
        provider="sqlserver"
      />
    )

    const nameInput = screen.getByPlaceholderText('column_name')
    fireEvent.change(nameInput, { target: { value: 'NewName' } })

    const lastCall = handleChange.mock.calls[handleChange.mock.calls.length - 1][0] as TableField[]
    expect(lastCall[0].name).toBe('NewName')
  })

  it('calls onFieldsChange with field removed when delete button is clicked', async () => {
    const user = userEvent.setup()
    const field = makeField({ name: 'ToDelete' })
    const handleChange = vi.fn()

    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={handleChange}
        provider="sqlserver"
      />
    )

    const deleteBtn = screen.getByTitle('Delete column')
    await user.click(deleteBtn)

    const lastCall = handleChange.mock.calls[handleChange.mock.calls.length - 1][0] as TableField[]
    expect(lastCall).toHaveLength(0)
  })

  it('hides the PK column when showPrimaryKey=false', () => {
    const field = makeField()
    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
        showPrimaryKey={false}
      />
    )
    // PK header should not be present
    expect(screen.queryByText('PK')).not.toBeInTheDocument()
  })

  it('shows the PK column by default', () => {
    const field = makeField()
    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
      />
    )
    expect(screen.getByText('PK')).toBeInTheDocument()
  })

  it('shows properties panel when a field is selected', () => {
    const field = makeField({ type: 'nvarchar', length: 100 })

    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
      />
    )

    // Click the row <tr> directly to trigger selection (name input has stopPropagation)
    const row = document.querySelector('.tce__col-row') as HTMLElement
    fireEvent.click(row)

    // Length property should appear since nvarchar has length
    expect(screen.getByText('explorer.createTable.props.length')).toBeInTheDocument()
  })

  it('does not show identity property when showIdentity=false', () => {
    const field = makeField({ type: 'int' })

    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
        showIdentity={false}
      />
    )

    // Select the field by clicking the row directly
    const row = document.querySelector('.tce__col-row') as HTMLElement
    fireEvent.click(row)

    expect(screen.queryByText('explorer.createTable.props.identity')).not.toBeInTheDocument()
  })

  it('does not show default value when showDefaultValue=false', () => {
    const field = makeField({ type: 'int' })

    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
        showDefaultValue={false}
      />
    )

    // Select the field by clicking the row directly
    const row = document.querySelector('.tce__col-row') as HTMLElement
    fireEvent.click(row)

    expect(screen.queryByText('explorer.createTable.props.defaultValue')).not.toBeInTheDocument()
  })

  it('disables all inputs when disabled=true', () => {
    const field = makeField()
    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
        disabled={true}
      />
    )

    const nameInput = screen.getByPlaceholderText('column_name')
    expect(nameInput).toBeDisabled()

    const addBtn = screen.getByText('explorer.createTable.addColumnButton')
    expect(addBtn).toBeDisabled()
  })

  it('shows Identity checkbox as checked when the selected field has isIdentity=true', () => {
    const field = makeField({ type: 'int', isIdentity: true, identitySeed: 1, identityIncrement: 1 })

    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
      />
    )

    const row = document.querySelector('.tce__col-row') as HTMLElement
    fireEvent.click(row)

    const identityCheckbox = screen.getByRole('checkbox', {
      name: 'explorer.createTable.props.identity'
    }) as HTMLInputElement
    expect(identityCheckbox).toBeInTheDocument()
    expect(identityCheckbox).toBeChecked()
  })

  it('shows identity seed/increment inputs when the selected field has isIdentity=true', () => {
    const field = makeField({ type: 'int', isIdentity: true, identitySeed: 5, identityIncrement: 2 })

    render(
      <TableColumnsEditor
        fields={[field]}
        onFieldsChange={noop}
        provider="sqlserver"
      />
    )

    const row = document.querySelector('.tce__col-row') as HTMLElement
    fireEvent.click(row)

    expect(screen.getByText('explorer.createTable.props.identitySeedIncrement')).toBeInTheDocument()
    const numberInputs = screen.getAllByRole('spinbutton') as HTMLInputElement[]
    const seedInput = numberInputs.find((i) => i.value === '5')
    const incrInput = numberInputs.find((i) => i.value === '2')
    expect(seedInput).toBeDefined()
    expect(incrInput).toBeDefined()
  })
})
