import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ManageTriggersDialog from '../ManageTriggersDialog'
import type { TriggerDefinition } from '../../../../../../../preload/index.d'

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

const sampleTrigger: TriggerDefinition = {
  triggerName: 'trg_AfterInsert',
  isInsteadOf: false,
  isInsert: true,
  isUpdate: false,
  isDelete: false,
  body: 'SET NOCOUNT ON;\n-- insert logic here',
  description: 'Audits new orders'
}

// ── helpers ───────────────────────────────────────────────────────────────────

function mockGetTriggers(triggers: TriggerDefinition[]): void {
  vi.spyOn(window.api.database, 'getTriggers').mockResolvedValue({
    status: 'ok',
    triggers
  })
}

function mockGetTablesQuery(): void {
  vi.spyOn(window.api.database, 'executeQuery').mockResolvedValue({
    status: 'ok',
    resultSets: [
      {
        columns: ['TABLE_SCHEMA', 'TABLE_NAME'],
        rows: [
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Orders' },
          { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Products' }
        ],
        rowCount: 2
      }
    ],
    messages: [],
    durationMs: 0
  })
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('ManageTriggersDialog — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTablesQuery()
  })

  afterEach(() => cleanup())

  it('renders the dialog title', async () => {
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageTriggers.dialogTitle')).toBeInTheDocument()
    )
  })

  it('renders the triggers list header', async () => {
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageTriggers.listHeader')).toBeInTheDocument()
    )
  })

  it('shows empty state when no triggers exist', async () => {
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageTriggers.noTriggers')).toBeInTheDocument()
    )
  })

  it('renders existing trigger name in the list', async () => {
    mockGetTriggers([sampleTrigger])
    render(<ManageTriggersDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('trg_AfterInsert')).toBeInTheDocument()
    )
  })

  it('renders the add trigger button', async () => {
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageTriggers.addButton')).toBeInTheDocument()
    )
  })

  it('shows "select or add" empty state in editor panel before selection', async () => {
    mockGetTriggers([sampleTrigger])
    render(<ManageTriggersDialog {...baseProps} />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageTriggers.selectOrAdd')).toBeInTheDocument()
    )
  })
})

// ── Selecting a trigger ───────────────────────────────────────────────────────

describe('ManageTriggersDialog — select existing trigger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTablesQuery()
  })

  afterEach(() => cleanup())

  it('shows editor fields when a trigger is selected', async () => {
    const user = userEvent.setup()
    mockGetTriggers([sampleTrigger])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('trg_AfterInsert'))
    await user.click(screen.getByText('trg_AfterInsert'))

    expect(screen.getByText('explorer.manageTriggers.nameLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageTriggers.timingLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageTriggers.eventsLabel')).toBeInTheDocument()
  })

  it('shows delete button when a trigger is selected', async () => {
    const user = userEvent.setup()
    mockGetTriggers([sampleTrigger])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('trg_AfterInsert'))
    await user.click(screen.getByText('trg_AfterInsert'))

    expect(screen.getByText('explorer.manageTriggers.deleteButton')).toBeInTheDocument()
  })

  it('populates the name input with the trigger name when selected', async () => {
    const user = userEvent.setup()
    mockGetTriggers([sampleTrigger])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('trg_AfterInsert'))
    await user.click(screen.getByText('trg_AfterInsert'))

    const nameInput = screen.getByDisplayValue('trg_AfterInsert')
    expect(nameInput).toBeInTheDocument()
  })
})

// ── Add new trigger ───────────────────────────────────────────────────────────

describe('ManageTriggersDialog — add new', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTablesQuery()
  })

  afterEach(() => cleanup())

  it('shows editor fields when "Add Trigger" is clicked', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.addButton'))
    await user.click(screen.getByText('explorer.manageTriggers.addButton'))

    expect(screen.getByText('explorer.manageTriggers.nameLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.manageTriggers.saveButton')).toBeInTheDocument()
  })

  it('does not show delete button for a new trigger', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.addButton'))
    await user.click(screen.getByText('explorer.manageTriggers.addButton'))

    expect(screen.queryByText('explorer.manageTriggers.deleteButton')).not.toBeInTheDocument()
  })

  it('shows (new) placeholder in list when adding', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.addButton'))
    await user.click(screen.getByText('explorer.manageTriggers.addButton'))

    expect(screen.getByText('explorer.manageTriggers.newTrigger')).toBeInTheDocument()
  })
})

// ── Validation ────────────────────────────────────────────────────────────────

describe('ManageTriggersDialog — validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTablesQuery()
  })

  afterEach(() => cleanup())

  it('shows name required error when saving without a name', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.addButton'))
    await user.click(screen.getByText('explorer.manageTriggers.addButton'))

    // Clear the name input and try to save
    const nameInput = screen.getByPlaceholderText('explorer.manageTriggers.namePlaceholder')
    await user.clear(nameInput)
    await user.click(screen.getByText('explorer.manageTriggers.saveButton'))

    expect(screen.getByText('explorer.manageTriggers.validation.nameRequired')).toBeInTheDocument()
  })

  it('shows event required error when no events are checked', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.addButton'))
    await user.click(screen.getByText('explorer.manageTriggers.addButton'))

    // Type a name
    const nameInput = screen.getByPlaceholderText('explorer.manageTriggers.namePlaceholder')
    await user.type(nameInput, 'trg_Test')

    // Uncheck INSERT (which is checked by default)
    const insertCheckbox = screen.getByText('explorer.manageTriggers.insertEvent')
    // The checkbox is the sibling input, find the label and toggle
    const checkboxes = screen.getAllByRole('checkbox')
    // Uncheck all events
    for (const cb of checkboxes) {
      if ((cb as HTMLInputElement).checked) {
        await user.click(cb)
      }
    }

    await user.click(screen.getByText('explorer.manageTriggers.saveButton'))

    expect(screen.getByText('explorer.manageTriggers.validation.eventRequired')).toBeInTheDocument()
    void insertCheckbox // used to avoid unused variable lint warning
  })
})

// ── Save ──────────────────────────────────────────────────────────────────────

describe('ManageTriggersDialog — save', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTablesQuery()
  })

  afterEach(() => cleanup())

  it('calls saveTrigger and onSuccess on valid save', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    const saveSpy = vi.spyOn(window.api.database, 'saveTrigger').mockResolvedValue({ status: 'ok' })
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.addButton'))
    await user.click(screen.getByText('explorer.manageTriggers.addButton'))

    const nameInput = screen.getByPlaceholderText('explorer.manageTriggers.namePlaceholder')
    await user.type(nameInput, 'trg_NewTrigger')

    await user.click(screen.getByText('explorer.manageTriggers.saveButton'))

    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'conn-1',
        'MyDB',
        expect.objectContaining({ triggerName: 'trg_NewTrigger' }),
        undefined
      )
      expect(baseProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('shows server error message when saveTrigger fails', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    vi.spyOn(window.api.database, 'saveTrigger').mockResolvedValue({
      status: 'error',
      message: 'Object already exists'
    })
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.addButton'))
    await user.click(screen.getByText('explorer.manageTriggers.addButton'))

    const nameInput = screen.getByPlaceholderText('explorer.manageTriggers.namePlaceholder')
    await user.type(nameInput, 'trg_Dup')

    await user.click(screen.getByText('explorer.manageTriggers.saveButton'))

    await waitFor(() => {
      expect(screen.getByText('Object already exists')).toBeInTheDocument()
    })
    expect(baseProps.onSuccess).not.toHaveBeenCalled()
  })
})

// ── Delete ────────────────────────────────────────────────────────────────────

describe('ManageTriggersDialog — delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTablesQuery()
  })

  afterEach(() => cleanup())

  it('calls deleteTrigger and onSuccess when delete is confirmed', async () => {
    const user = userEvent.setup()
    mockGetTriggers([sampleTrigger])
    const deleteSpy = vi
      .spyOn(window.api.database, 'deleteTrigger')
      .mockResolvedValue({ status: 'ok' })
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('trg_AfterInsert'))
    await user.click(screen.getByText('trg_AfterInsert'))

    await waitFor(() => screen.getByText('explorer.manageTriggers.deleteButton'))
    await user.click(screen.getByText('explorer.manageTriggers.deleteButton'))

    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('conn-1', 'MyDB', 'trg_AfterInsert', 'dbo')
      expect(baseProps.onSuccess).toHaveBeenCalled()
    })
  })

  it('shows server error message when deleteTrigger fails', async () => {
    const user = userEvent.setup()
    mockGetTriggers([sampleTrigger])
    vi.spyOn(window.api.database, 'deleteTrigger').mockResolvedValue({
      status: 'error',
      message: 'Cannot drop trigger'
    })
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('trg_AfterInsert'))
    await user.click(screen.getByText('trg_AfterInsert'))

    await waitFor(() => screen.getByText('explorer.manageTriggers.deleteButton'))
    await user.click(screen.getByText('explorer.manageTriggers.deleteButton'))

    await waitFor(() => {
      expect(screen.getByText('Cannot drop trigger')).toBeInTheDocument()
    })
    expect(baseProps.onSuccess).not.toHaveBeenCalled()
  })
})

// ── Close ─────────────────────────────────────────────────────────────────────

describe('ManageTriggersDialog — close', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetTablesQuery()
  })

  afterEach(() => cleanup())

  it('calls onClose when the × button is clicked', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.listHeader'))
    await user.click(screen.getByLabelText('common.close'))

    expect(baseProps.onClose).toHaveBeenCalled()
  })

  it('calls onClose when clicking the backdrop overlay', async () => {
    const user = userEvent.setup()
    mockGetTriggers([])
    render(<ManageTriggersDialog {...baseProps} />)

    await waitFor(() => screen.getByText('explorer.manageTriggers.listHeader'))

    // The outer div is the overlay — find by role="dialog"
    const overlay = screen.getByRole('dialog')
    // Simulate mousedown directly on the overlay
    await user.pointer({ target: overlay, keys: '[MouseLeft>]' })

    expect(baseProps.onClose).toHaveBeenCalled()
  })
})
