import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import CreateDatabaseDialog from '../CreateDatabaseDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('CreateDatabaseDialog', () => {
  const mockOnSubmit = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the dialog title and input', () => {
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    expect(screen.getByText('explorer.createDatabase.dialogTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.createDatabase.nameLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.createDatabase.createButton')).toBeInTheDocument()
    expect(screen.getByText('explorer.createDatabase.cancelButton')).toBeInTheDocument()
  })

  it('autofocuses the name input', () => {
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)
    expect(screen.getByLabelText('explorer.createDatabase.nameLabel')).toHaveFocus()
  })

  // ── Validation ────────────────────────────────────────────────────────────

  it('shows a required-name error when submitting with an empty input', async () => {
    const user = userEvent.setup()
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.click(screen.getByText('explorer.createDatabase.createButton'))

    expect(
      screen.getByText('explorer.createDatabase.validation.nameRequired')
    ).toBeInTheDocument()
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('shows a required-name error when submitting with only whitespace', async () => {
    const user = userEvent.setup()
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.type(screen.getByLabelText('explorer.createDatabase.nameLabel'), '   ')
    await user.click(screen.getByText('explorer.createDatabase.createButton'))

    expect(
      screen.getByText('explorer.createDatabase.validation.nameRequired')
    ).toBeInTheDocument()
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it.each(['[MyDB]', "MyDB'Drop", 'My[DB', 'My]DB'])(
    'shows an invalid-chars error for name "%s"',
    async (invalidName) => {
      const user = userEvent.setup()
      render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

      const input = screen.getByLabelText('explorer.createDatabase.nameLabel')
      fireEvent.change(input, { target: { value: invalidName } })
      await user.click(screen.getByText('explorer.createDatabase.createButton'))

      expect(
        screen.getByText('explorer.createDatabase.validation.nameInvalidChars')
      ).toBeInTheDocument()
      expect(mockOnSubmit).not.toHaveBeenCalled()
    }
  )

  it('clears the validation error when the user starts typing', async () => {
    const user = userEvent.setup()
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.click(screen.getByText('explorer.createDatabase.createButton'))
    expect(
      screen.getByText('explorer.createDatabase.validation.nameRequired')
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('explorer.createDatabase.nameLabel'), 'M')
    expect(
      screen.queryByText('explorer.createDatabase.validation.nameRequired')
    ).not.toBeInTheDocument()
  })

  // ── Successful submit ─────────────────────────────────────────────────────

  it('calls onSubmit with the trimmed name when form is valid', async () => {
    const user = userEvent.setup()
    mockOnSubmit.mockResolvedValue(undefined)
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.type(screen.getByLabelText('explorer.createDatabase.nameLabel'), '  MyNewDB  ')
    await user.click(screen.getByText('explorer.createDatabase.createButton'))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('MyNewDB')
    })
  })

  it('disables inputs and buttons while submitting', async () => {
    const user = userEvent.setup()
    let resolveSubmit!: () => void
    mockOnSubmit.mockReturnValue(new Promise<void>((res) => (resolveSubmit = res)))
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.type(screen.getByLabelText('explorer.createDatabase.nameLabel'), 'MyDB')
    await user.click(screen.getByText('explorer.createDatabase.createButton'))

    await waitFor(() => {
      expect(screen.getByText('explorer.createDatabase.creatingButton')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('explorer.createDatabase.nameLabel')).toBeDisabled()
    expect(screen.getByText('explorer.createDatabase.cancelButton')).toBeDisabled()

    resolveSubmit()
  })

  // ── Server error ──────────────────────────────────────────────────────────

  it('shows an inline server error when onSubmit rejects', async () => {
    const user = userEvent.setup()
    mockOnSubmit.mockRejectedValue(new Error('Database already exists'))
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.type(screen.getByLabelText('explorer.createDatabase.nameLabel'), 'Existing')
    await user.click(screen.getByText('explorer.createDatabase.createButton'))

    await waitFor(() => {
      expect(screen.getByText('Database already exists')).toBeInTheDocument()
    })
  })

  it('clears a server error when the user changes the name', async () => {
    const user = userEvent.setup()
    mockOnSubmit.mockRejectedValue(new Error('Server error'))
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.type(screen.getByLabelText('explorer.createDatabase.nameLabel'), 'BadName')
    await user.click(screen.getByText('explorer.createDatabase.createButton'))
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument())

    await user.type(screen.getByLabelText('explorer.createDatabase.nameLabel'), 'x')
    expect(screen.queryByText('Server error')).not.toBeInTheDocument()
  })

  // ── Cancel / close ────────────────────────────────────────────────────────

  it('calls onClose when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.click(screen.getByText('explorer.createDatabase.cancelButton'))

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when the X button is clicked', async () => {
    const user = userEvent.setup()
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    await user.click(screen.getByLabelText('Close'))

    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when clicking the overlay backdrop', async () => {
    const user = userEvent.setup()
    render(<CreateDatabaseDialog onSubmit={mockOnSubmit} onClose={mockOnClose} />)

    const overlay = screen.getByRole('dialog')
    await user.pointer({ target: overlay, keys: '[MouseLeft>]' })

    expect(mockOnClose).toHaveBeenCalledOnce()
  })
})
