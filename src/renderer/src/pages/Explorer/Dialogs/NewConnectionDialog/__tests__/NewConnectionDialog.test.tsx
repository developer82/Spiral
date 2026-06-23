import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import NewConnectionDialog from '../NewConnectionDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

const mockTriggerConfetti = vi.fn()
vi.mock('../../../../../hooks/useConfetti', () => ({
  useConfetti: () => ({ triggerConfetti: mockTriggerConfetti })
}))

describe('NewConnectionDialog', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockTriggerConfetti.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders all form fields', () => {
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    expect(screen.getByText('explorer.dialog.title')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.name')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.provider')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.host')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.port')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.username')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.password')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.rememberPassword')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.defaultDatabase')).toBeInTheDocument()
  })

  it('defaults port to 1433', () => {
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    expect(screen.getByDisplayValue('1433')).toBeInTheDocument()
  })

  it('renders Test Connection button disabled', () => {
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    const testBtn = screen.getByText('explorer.dialog.actions.testConnection')
    expect(testBtn).toBeDisabled()
  })

  it('calls onCancel when Cancel button is clicked', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByText('explorer.dialog.actions.cancel'))

    expect(mockOnCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when close (X) button is clicked', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByLabelText('Close'))

    expect(mockOnCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when clicking the overlay backdrop', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    // The overlay is the outer .conn-dialog element
    const overlay = screen.getByRole('dialog')
    await user.pointer({ target: overlay, keys: '[MouseLeft>]' })

    expect(mockOnCancel).toHaveBeenCalledOnce()
  })

  it('shows required-field validation errors when submitting an empty form', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    expect(screen.getByText('explorer.dialog.validation.nameRequired')).toBeInTheDocument()
    expect(screen.getByText('explorer.dialog.validation.hostRequired')).toBeInTheDocument()
    expect(screen.getByText('explorer.dialog.validation.usernameRequired')).toBeInTheDocument()
    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('clears a field error as soon as the user types in that field', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByText('explorer.dialog.actions.save'))
    expect(screen.getByText('explorer.dialog.validation.nameRequired')).toBeInTheDocument()

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'My Server')
    expect(screen.queryByText('explorer.dialog.validation.nameRequired')).not.toBeInTheDocument()
  })

  it('clears populated text fields with the inline clear button', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    const nameInput = screen.getByLabelText('explorer.dialog.fields.name')
    await user.type(nameInput, 'My Server')
    await user.click(screen.getByRole('button', { name: 'Clear' }))

    expect(nameInput).toHaveValue('')
  })

  it('calls onSave with rememberPassword true when checkbox is checked', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), '127.0.0.1')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')
    await user.click(screen.getByLabelText('explorer.dialog.fields.rememberPassword'))

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ rememberPassword: true, name: 'Dev Server' })
      )
    })
  })

  it('calls onSave with rememberPassword false when checkbox is left unchecked', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), '127.0.0.1')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ rememberPassword: false })
      )
    })
  })

  it('provider dropdown defaults to sqlserver', () => {
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    const select = screen.getByLabelText('explorer.dialog.fields.provider') as HTMLSelectElement
    expect(select.value).toBe('sqlserver')
  })

  it('Save button is disabled while saving', async () => {
    const user = userEvent.setup()
    // onSave never resolves during this test so the saving state persists
    mockOnSave.mockReturnValue(new Promise(() => {}))
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), '127.0.0.1')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(screen.getByText('explorer.dialog.actions.save')).toBeDisabled()
    })
  })

  it('Test Connection button is disabled when host is empty', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    expect(screen.getByText('explorer.dialog.actions.testConnection')).toBeDisabled()
  })

  it('Test Connection button is disabled when username is empty', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')

    expect(screen.getByText('explorer.dialog.actions.testConnection')).toBeDisabled()
  })

  it('Test Connection button is enabled when host and username are filled', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    expect(screen.getByText('explorer.dialog.actions.testConnection')).toBeEnabled()
  })

  it('shows success message after a successful test connection', async () => {
    vi.spyOn(window.api.database, 'testConnection').mockResolvedValue({ status: 'connected' })
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.testConnection'))

    await waitFor(() => {
      expect(screen.getByText('explorer.dialog.testResult.success')).toBeInTheDocument()
    })
  })

  it('shows error message after a failed test connection', async () => {
    vi.spyOn(window.api.database, 'testConnection').mockResolvedValue({
      status: 'error',
      message: 'Connection refused'
    })
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.testConnection'))

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument()
    })
  })

  it('triggers confetti on successful test connection', async () => {
    vi.spyOn(window.api.database, 'testConnection').mockResolvedValue({ status: 'connected' })
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.testConnection'))

    await waitFor(() => {
      expect(mockTriggerConfetti).toHaveBeenCalledOnce()
    })
  })

  it('does not trigger confetti on failed test connection', async () => {
    vi.spyOn(window.api.database, 'testConnection').mockResolvedValue({
      status: 'error',
      message: 'Connection refused'
    })
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.testConnection'))

    await waitFor(() => {
      expect(screen.getByText('Connection refused')).toBeInTheDocument()
    })
    expect(mockTriggerConfetti).not.toHaveBeenCalled()
  })

  it('clears test result when a form field changes', async () => {
    vi.spyOn(window.api.database, 'testConnection').mockResolvedValue({ status: 'connected' })
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.testConnection'))
    await waitFor(() => {
      expect(screen.getByText('explorer.dialog.testResult.success')).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), '1')
    expect(screen.queryByText('explorer.dialog.testResult.success')).not.toBeInTheDocument()
  })

  it('shows validation errors and does not call testConnection when required fields are missing', async () => {
    const testSpy = vi.spyOn(window.api.database, 'testConnection')
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.testConnection'))

    expect(screen.getByText('explorer.dialog.validation.nameRequired')).toBeInTheDocument()
    expect(testSpy).not.toHaveBeenCalled()
  })

  it('calls testConnection with the current form values', async () => {
    const testSpy = vi.spyOn(window.api.database, 'testConnection').mockResolvedValue({ status: 'connected' })
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Dev Server')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.testConnection'))

    await waitFor(() => {
      expect(testSpy).toHaveBeenCalledWith(
        expect.objectContaining({ host: 'localhost', username: 'sa', name: 'Dev Server' })
      )
    })
  })
})

// ── Edit mode ─────────────────────────────────────────────────────────────────

const MOCK_EDIT_RECORD = {
  id: 'conn-1',
  name: 'Production Server',
  provider: 'sqlserver' as const,
  host: 'prod.example.com',
  port: 1433,
  username: 'admin',
  password: 'secret',
  rememberPassword: true,
  defaultDatabase: 'app_db'
}

describe('NewConnectionDialog – edit mode', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows the edit title when initialValues are provided', () => {
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={MOCK_EDIT_RECORD}
      />
    )

    expect(screen.getByText('explorer.dialog.editTitle')).toBeInTheDocument()
    expect(screen.queryByText('explorer.dialog.title')).not.toBeInTheDocument()
  })

  it('shows Update button instead of Save in edit mode', () => {
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={MOCK_EDIT_RECORD}
      />
    )

    expect(screen.getByText('explorer.dialog.actions.update')).toBeInTheDocument()
    expect(screen.queryByText('explorer.dialog.actions.save')).not.toBeInTheDocument()
  })

  it('prefills all form fields from initialValues', () => {
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={MOCK_EDIT_RECORD}
      />
    )

    expect(screen.getByDisplayValue('Production Server')).toBeInTheDocument()
    expect(screen.getByDisplayValue('prod.example.com')).toBeInTheDocument()
    expect(screen.getByDisplayValue('admin')).toBeInTheDocument()
    expect(screen.getByDisplayValue('app_db')).toBeInTheDocument()
    const checkbox = screen.getByLabelText(
      'explorer.dialog.fields.rememberPassword'
    ) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('calls onSave with updated values when the form is submitted in edit mode', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)

    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={MOCK_EDIT_RECORD}
      />
    )

    const nameInput = screen.getByLabelText('explorer.dialog.fields.name')
    await user.clear(nameInput)
    await user.type(nameInput, 'Renamed Server')

    await user.click(screen.getByText('explorer.dialog.actions.update'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Renamed Server', host: 'prod.example.com' })
      )
    })
  })

  it('shows New Connection title and Save button when no initialValues provided', () => {
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    expect(screen.getByText('explorer.dialog.title')).toBeInTheDocument()
    expect(screen.getByText('explorer.dialog.actions.save')).toBeInTheDocument()
  })
})

// ── Tabs ──────────────────────────────────────────────────────────────────────

describe('NewConnectionDialog – tabs', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('shows Connection Details tab as active by default', () => {
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    const detailsTab = screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionDetails' })
    expect(detailsTab).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('explorer.dialog.fields.host')).toBeInTheDocument()
  })

  it('switches to Connection String tab and shows the textarea', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))

    expect(
      screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' })
    ).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('explorer.dialog.tabs.connectionString')).toBeInTheDocument()
    expect(screen.queryByLabelText('explorer.dialog.fields.host')).not.toBeInTheDocument()
  })

  it('switches back to Connection Details tab', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionDetails' }))

    expect(screen.getByLabelText('explorer.dialog.fields.host')).toBeInTheDocument()
  })

  it('Name field is always visible regardless of active tab', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    expect(screen.getByLabelText('explorer.dialog.fields.name')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))

    expect(screen.getByLabelText('explorer.dialog.fields.name')).toBeInTheDocument()
  })
})

// ── Connection string generation ──────────────────────────────────────────────

describe('NewConnectionDialog – connection string generation', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('generates connection string from initial form values', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'myserver')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'admin')

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))

    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString') as HTMLTextAreaElement
    expect(textarea.value).toContain('Server=myserver,1433')
    expect(textarea.value).toContain('User Id=admin')
    expect(textarea.value).toContain('TrustServerCertificate=True')
  })

  it('generates connection string from initialValues in edit mode', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'c1',
          name: 'Prod',
          provider: 'sqlserver',
          host: 'prod.db.local',
          port: 1433,
          username: 'sa',
          password: 'p@ss',
          rememberPassword: false,
          defaultDatabase: 'mydb'
        }}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))

    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString') as HTMLTextAreaElement
    expect(textarea.value).toBe(
      'Server=prod.db.local,1433;Database=mydb;User Id=sa;Password=p@ss;TrustServerCertificate=True;'
    )
  })

  it('updates connection string when a form field changes', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'newhost')

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString') as HTMLTextAreaElement
    expect(textarea.value).toContain('Server=newhost,1433')
  })
})

// ── Connection string parsing ──────────────────────────────────────────────────

describe('NewConnectionDialog – connection string parsing', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('parses a valid connection string and updates form fields', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString')
    await user.clear(textarea)
    await user.type(textarea, 'Server=remotehost,5433;Database=mydb;User Id=devuser;Password=devpass;TrustServerCertificate=True;')

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionDetails' }))

    expect((screen.getByLabelText('explorer.dialog.fields.host') as HTMLInputElement).value).toBe('remotehost')
    expect((screen.getByLabelText('explorer.dialog.fields.port') as HTMLInputElement).value).toBe('5433')
    expect((screen.getByLabelText('explorer.dialog.fields.username') as HTMLInputElement).value).toBe('devuser')
    expect((screen.getByLabelText('explorer.dialog.fields.defaultDatabase') as HTMLInputElement).value).toBe('mydb')
  })

  it('shows parse error when connection string is invalid', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString')
    await user.clear(textarea)
    await user.type(textarea, 'this is not a valid connection string')

    expect(
      screen.getByText('explorer.dialog.connectionStringTab.parseError')
    ).toBeInTheDocument()
  })

  it('does not change form fields when connection string is invalid', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'originalhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'originaluser')

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString')
    await user.clear(textarea)
    await user.type(textarea, 'not valid')

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionDetails' }))
    expect((screen.getByLabelText('explorer.dialog.fields.host') as HTMLInputElement).value).toBe('originalhost')
    expect((screen.getByLabelText('explorer.dialog.fields.username') as HTMLInputElement).value).toBe('originaluser')
  })

  it('clears parse error after a valid connection string is entered', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString')

    // Type invalid first
    await user.clear(textarea)
    await user.type(textarea, 'invalid')
    expect(screen.getByText('explorer.dialog.connectionStringTab.parseError')).toBeInTheDocument()

    // Now type valid
    await user.clear(textarea)
    await user.type(textarea, 'Server=localhost,1433;User Id=sa;')
    expect(screen.queryByText('explorer.dialog.connectionStringTab.parseError')).not.toBeInTheDocument()
  })
})

// ── Options tab ───────────────────────────────────────────────────────────────

describe('NewConnectionDialog – options tab', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  async function openOptionsTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.options' }))
  }

  it('renders the Options tab button', () => {
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    expect(
      screen.getByRole('tab', { name: 'explorer.dialog.tabs.options' })
    ).toBeInTheDocument()
  })

  it('switches to Options tab and shows color and auto-connect controls', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    expect(screen.getByRole('tab', { name: 'explorer.dialog.tabs.options' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByLabelText('explorer.dialog.fields.color')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.fields.autoConnect')).toBeInTheDocument()
  })

  it('color input defaults to the provider color when no custom color is set', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    const colorInput = screen.getByLabelText('explorer.dialog.fields.color') as HTMLInputElement
    // SQL Server default provider color
    expect(colorInput.value.toLowerCase()).toBe('#e8312a')
  })

  it('color input reflects a custom color set via initialValues', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'c1',
          name: 'Dev',
          provider: 'sqlserver',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          color: '#ff00ff',
          autoConnect: false
        }}
      />
    )

    await openOptionsTab(user)

    const colorInput = screen.getByLabelText('explorer.dialog.fields.color') as HTMLInputElement
    expect(colorInput.value.toLowerCase()).toBe('#ff00ff')
  })

  it('"Reset to default" button is disabled when no custom color is set', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    const resetBtn = screen.getByText('explorer.dialog.fields.colorResetDefault')
    expect(resetBtn).toBeDisabled()
  })

  it('"Reset to default" button is enabled when a custom color is set', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'c1',
          name: 'Dev',
          provider: 'sqlserver',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          color: '#aabbcc',
          autoConnect: false
        }}
      />
    )

    await openOptionsTab(user)

    const resetBtn = screen.getByText('explorer.dialog.fields.colorResetDefault')
    expect(resetBtn).toBeEnabled()
  })

  it('clicking "Reset to default" clears the custom color and shows the provider default', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'c1',
          name: 'Dev',
          provider: 'sqlserver',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          color: '#aabbcc',
          autoConnect: false
        }}
      />
    )

    await openOptionsTab(user)

    await user.click(screen.getByText('explorer.dialog.fields.colorResetDefault'))

    const colorInput = screen.getByLabelText('explorer.dialog.fields.color') as HTMLInputElement
    expect(colorInput.value.toLowerCase()).toBe('#e8312a')
  })

  it('auto-connect toggle is unchecked by default', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.autoConnect') as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('auto-connect toggle is checked when initialValues.autoConnect is true', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'c1',
          name: 'Dev',
          provider: 'sqlserver',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          autoConnect: true
        }}
      />
    )

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.autoConnect') as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('clicking the auto-connect toggle updates its state', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.autoConnect') as HTMLInputElement
    expect(toggle.checked).toBe(false)

    await user.click(toggle)
    expect(toggle.checked).toBe(true)
  })

  it('onSave is called with color and autoConnect values from the options tab', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    // Fill required fields
    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Test Conn')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    // Set auto-connect in options tab
    await openOptionsTab(user)
    await user.click(screen.getByLabelText('explorer.dialog.fields.autoConnect'))

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ autoConnect: true, color: '' })
      )
    })
  })

  it('renders the eager loading toggle in the options tab', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    expect(screen.getByLabelText('explorer.dialog.fields.eagerLoading')).toBeInTheDocument()
  })

  it('renders the environment selector in the options tab', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    expect(screen.getByRole('button', { name: 'explorer.dialog.fields.environment' })).toBeInTheDocument()
    expect(screen.getByText('explorer.dialog.fields.environmentUnset')).toBeInTheDocument()
  })

  it('allows selecting an environment from the searchable dropdown', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)
    await user.click(screen.getByRole('button', { name: 'explorer.dialog.fields.environment' }))
    await user.type(
      screen.getByPlaceholderText('explorer.dialog.fields.environmentSearchPlaceholder'),
      'qa'
    )
    await user.click(screen.getByRole('button', { name: /QA/i }))

    expect(screen.getByRole('button', { name: 'explorer.dialog.fields.environment' })).toHaveTextContent('QA')
  })

  it('shows the selected environment in edit mode', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'env-1',
          name: 'Prod Conn',
          provider: 'sqlserver',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          environmentId: 'qa'
        }}
      />
    )

    await openOptionsTab(user)

    expect(screen.getByRole('button', { name: 'explorer.dialog.fields.environment' })).toHaveTextContent('QA')
  })

  it('onSave includes environmentId when an environment is selected', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Test Conn')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await openOptionsTab(user)
    await user.click(screen.getByRole('button', { name: 'explorer.dialog.fields.environment' }))
    await user.click(screen.getByRole('button', { name: /Production/i }))
    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ environmentId: 'production' })
      )
    })
  })

  it('eager loading toggle defaults to unchecked', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.eagerLoading') as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('eager loading toggle can be checked', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.eagerLoading') as HTMLInputElement
    expect(toggle.checked).toBe(false)

    await user.click(toggle)
    expect(toggle.checked).toBe(true)
  })

  it('eager loading toggle is checked when initialValues.eagerLoading is true', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'x',
          name: 'My Server',
          provider: 'sqlserver',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          eagerLoading: true
        }}
      />
    )

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.eagerLoading') as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('onSave is called with eagerLoading: true when toggle is enabled', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Test Conn')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await openOptionsTab(user)
    await user.click(screen.getByLabelText('explorer.dialog.fields.eagerLoading'))

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ eagerLoading: true })
      )
    })
  })

  it('onSave is called with eagerLoading: false by default', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Test Conn')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ eagerLoading: false })
      )
    })
  })

  it('Name field is always visible when options tab is active', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    expect(screen.getByLabelText('explorer.dialog.fields.name')).toBeInTheDocument()
  })

  // ── Background Auto Refresh ────────────────────────────────────────────────

  it('background auto refresh toggle is present in the options tab', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    expect(screen.getByLabelText('explorer.dialog.fields.backgroundAutoRefresh')).toBeInTheDocument()
  })

  it('background auto refresh toggle is unchecked by default', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.backgroundAutoRefresh') as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('background auto refresh toggle is checked when initialValues.backgroundAutoRefresh is true', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'test-id',
          name: 'Test',
          provider: 'sqlserver',
          host: 'localhost',
          port: 1433,
          username: 'sa',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          backgroundAutoRefresh: true
        }}
      />
    )

    await openOptionsTab(user)

    const toggle = screen.getByLabelText('explorer.dialog.fields.backgroundAutoRefresh') as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('onSave is called with backgroundAutoRefresh: true when toggle is enabled', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Test Conn')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await openOptionsTab(user)
    await user.click(screen.getByLabelText('explorer.dialog.fields.backgroundAutoRefresh'))

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundAutoRefresh: true })
      )
    })
  })

  it('onSave is called with backgroundAutoRefresh: false by default', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Test Conn')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')
    await user.type(screen.getByLabelText('explorer.dialog.fields.username'), 'sa')

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundAutoRefresh: false })
      )
    })
  })

  it('does not render hideEmptyDatabases toggle for non-Redis provider', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await openOptionsTab(user)

    expect(
      screen.queryByLabelText('explorer.dialog.fields.redisHideEmptyDatabases')
    ).not.toBeInTheDocument()
  })

  it('renders hideEmptyDatabases toggle for Redis provider', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'r1',
          name: 'Redis Conn',
          provider: 'redis',
          defaultDatabase: '',
          host: 'localhost',
          port: 6379,
          username: '',
          password: '',
          rememberPassword: false
        }}
      />
    )

    await openOptionsTab(user)

    expect(
      screen.getByLabelText('explorer.dialog.fields.redisHideEmptyDatabases')
    ).toBeInTheDocument()
  })

  it('hideEmptyDatabases toggle is unchecked by default for Redis', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'r2',
          name: 'Redis Conn',
          provider: 'redis',
          defaultDatabase: '',
          host: 'localhost',
          port: 6379,
          username: '',
          password: '',
          rememberPassword: false
        }}
      />
    )

    await openOptionsTab(user)

    const toggle = screen.getByLabelText(
      'explorer.dialog.fields.redisHideEmptyDatabases'
    ) as HTMLInputElement
    expect(toggle.checked).toBe(false)
  })

  it('hideEmptyDatabases toggle is checked when initialValues.redisHideEmptyDatabases is true', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'r3',
          name: 'Redis Conn',
          provider: 'redis',
          defaultDatabase: '',
          host: 'localhost',
          port: 6379,
          username: '',
          password: '',
          rememberPassword: false,
          redisHideEmptyDatabases: true
        }}
      />
    )

    await openOptionsTab(user)

    const toggle = screen.getByLabelText(
      'explorer.dialog.fields.redisHideEmptyDatabases'
    ) as HTMLInputElement
    expect(toggle.checked).toBe(true)
  })

  it('onSave is called with redisHideEmptyDatabases: true when toggle is enabled for Redis', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'r4',
          name: 'Redis Conn',
          provider: 'redis',
          defaultDatabase: '',
          host: 'localhost',
          port: 6379,
          username: '',
          password: '',
          rememberPassword: false
        }}
      />
    )

    await openOptionsTab(user)
    await user.click(
      screen.getByLabelText('explorer.dialog.fields.redisHideEmptyDatabases')
    )

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ redisHideEmptyDatabases: true })
      )
    })
  })

  it('onSave is called with redisHideEmptyDatabases: false by default for Redis', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'r5',
          name: 'Redis Conn',
          provider: 'redis',
          defaultDatabase: '',
          host: 'localhost',
          port: 6379,
          username: '',
          password: '',
          rememberPassword: false
        }}
      />
    )

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ redisHideEmptyDatabases: false })
      )
    })
  })
})

// ── Redis – Connection String tab ─────────────────────────────────────────────

describe('NewConnectionDialog – Redis connection string tab', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  async function switchToRedis(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.selectOptions(screen.getByLabelText('explorer.dialog.fields.provider'), 'redis')
  }

  it('shows the Connection String tab for Redis', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await switchToRedis(user)

    expect(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' })).toBeInTheDocument()
  })

  it('generates a redis:// connection string from initialValues', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'r1',
          name: 'My Redis',
          provider: 'redis',
          host: 'cache.local',
          port: 6379,
          username: 'alice',
          password: 'secret',
          rememberPassword: false,
          defaultDatabase: '2'
        }}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString') as HTMLTextAreaElement
    expect(textarea.value).toBe('redis://alice:secret@cache.local:6379/2')
  })

  it('shows the textarea when Connection String tab is active for Redis', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'r2',
          name: 'My Redis',
          provider: 'redis',
          defaultDatabase: '',
          host: 'localhost',
          port: 6379,
          username: '',
          password: '',
          rememberPassword: false
        }}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    expect(screen.getByLabelText('explorer.dialog.tabs.connectionString')).toBeInTheDocument()
  })
})

// ── MongoDB provider ──────────────────────────────────────────────────────────

describe('NewConnectionDialog – MongoDB provider', () => {
  const mockOnSave = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  async function selectMongoDB(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    const providerSelect = screen.getByLabelText('explorer.dialog.fields.provider') as HTMLSelectElement
    await user.selectOptions(providerSelect, 'mongodb')
  }

  it('shows Connection String tab for MongoDB', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)

    expect(
      screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' })
    ).toBeInTheDocument()
  })

  it('MongoDB URI field is in the Connection String tab, not Connection Details', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)

    // URI textarea is NOT visible while Connection Details tab is active
    expect(screen.queryByLabelText('explorer.dialog.tabs.connectionString')).not.toBeInTheDocument()

    // Switch to Connection String tab — textarea appears
    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    expect(screen.getByLabelText('explorer.dialog.tabs.connectionString')).toBeInTheDocument()
  })

  it('Connection String tab shows a built mongodb:// URI when host is filled', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString') as HTMLTextAreaElement
    expect(textarea.value).toContain('mongodb://')
    expect(textarea.value).toContain('localhost')
  })

  it('editing the Connection String tab updates Connection Details host field', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)
    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString')
    await user.clear(textarea)
    await user.type(textarea, 'mongodb://admin:pass@myserver:27017/mydb')

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionDetails' }))
    expect((screen.getByLabelText('explorer.dialog.fields.host') as HTMLInputElement).value).toBe('myserver')
  })

  it('shows auth mechanism dropdown for MongoDB', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)

    expect(screen.getByLabelText('explorer.dialog.fields.mongodbAuthMechanism')).toBeInTheDocument()
  })

  it('Test Connection button enabled when MongoDB host is provided', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)
    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'My Mongo')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'localhost')

    expect(screen.getByText('explorer.dialog.actions.testConnection')).toBeEnabled()
  })

  it('Test Connection button disabled when host is empty', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)
    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'My Mongo')

    expect(screen.getByText('explorer.dialog.actions.testConnection')).toBeDisabled()
  })

  it('shows validation error when saving MongoDB without host', async () => {
    const user = userEvent.setup()
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)
    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'My Mongo')

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    expect(screen.getByText('explorer.dialog.validation.hostRequired')).toBeInTheDocument()
    expect(mockOnSave).not.toHaveBeenCalled()
  })

  it('calls onSave with provider=mongodb when form is filled', async () => {
    const user = userEvent.setup()
    mockOnSave.mockResolvedValue(undefined)
    render(<NewConnectionDialog onSave={mockOnSave} onCancel={mockOnCancel} />)

    await selectMongoDB(user)
    await user.type(screen.getByLabelText('explorer.dialog.fields.name'), 'Atlas Dev')
    await user.type(screen.getByLabelText('explorer.dialog.fields.host'), 'cluster0.mongodb.net')

    await user.click(screen.getByText('explorer.dialog.actions.save'))

    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'mongodb', name: 'Atlas Dev', host: 'cluster0.mongodb.net' })
      )
    })
  })

  it('prefills MongoDB fields when initialValues provider is mongodb', () => {
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'm1',
          name: 'My Mongo',
          provider: 'mongodb',
          host: 'cluster0.mongodb.net',
          port: 27017,
          username: 'root',
          password: 'pass',
          rememberPassword: true,
          defaultDatabase: 'mydb'
        }}
      />
    )

    expect((screen.getByLabelText('explorer.dialog.fields.host') as HTMLInputElement).value).toBe('cluster0.mongodb.net')
  })

  it('loads saved mongodbUri into Connection String tab when editing', async () => {
    const user = userEvent.setup()
    render(
      <NewConnectionDialog
        onSave={mockOnSave}
        onCancel={mockOnCancel}
        initialValues={{
          id: 'm2',
          name: 'Atlas SRV',
          provider: 'mongodb',
          host: 'cluster0.mongodb.net',
          port: 27017,
          username: '',
          password: '',
          rememberPassword: false,
          defaultDatabase: '',
          mongodbUri: 'mongodb+srv://user:pass@cluster0.mongodb.net/mydb'
        }}
      />
    )

    await user.click(screen.getByRole('tab', { name: 'explorer.dialog.tabs.connectionString' }))
    const textarea = screen.getByLabelText('explorer.dialog.tabs.connectionString') as HTMLTextAreaElement
    expect(textarea.value).toBe('mongodb+srv://user:pass@cluster0.mongodb.net/mydb')
  })
})
