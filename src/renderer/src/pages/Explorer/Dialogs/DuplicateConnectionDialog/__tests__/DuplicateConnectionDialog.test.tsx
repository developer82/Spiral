import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import DuplicateConnectionDialog from '../DuplicateConnectionDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('DuplicateConnectionDialog', () => {
  const mockOnSubmit = vi.fn<(newName: string) => Promise<void>>()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    mockOnSubmit.mockResolvedValue(undefined)
  })

  afterEach(() => {
    cleanup()
  })

  it('renders with the provided initial name prefilled', () => {
    render(
      <DuplicateConnectionDialog
        initialName="My Server - Copy"
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    )

    expect(screen.getByText('explorer.duplicateConnection.dialogTitle')).toBeInTheDocument()
    expect(screen.getByDisplayValue('My Server - Copy')).toBeInTheDocument()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(
      <DuplicateConnectionDialog
        initialName="My Server - Copy"
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByText('explorer.duplicateConnection.cancelButton'))
    expect(mockOnClose).toHaveBeenCalledTimes(1)
  })

  it('submits the trimmed name when valid', async () => {
    const user = userEvent.setup()
    render(
      <DuplicateConnectionDialog
        initialName="My Server - Copy"
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    )

    const input = screen.getByDisplayValue('My Server - Copy')
    await user.clear(input)
    await user.type(input, '  Renamed Copy  ')
    await user.click(screen.getByText('explorer.duplicateConnection.duplicateButton'))

    await waitFor(() => {
      expect(mockOnSubmit).toHaveBeenCalledWith('Renamed Copy')
    })
  })

  it('shows a validation error and does not submit when the name is blank', async () => {
    const user = userEvent.setup()
    render(
      <DuplicateConnectionDialog
        initialName="My Server - Copy"
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    )

    const input = screen.getByDisplayValue('My Server - Copy')
    await user.clear(input)
    await user.type(input, '   ')
    await user.click(screen.getByText('explorer.duplicateConnection.duplicateButton'))

    await waitFor(() => {
      expect(
        screen.getByText('explorer.duplicateConnection.validation.nameRequired')
      ).toBeInTheDocument()
    })
    expect(mockOnSubmit).not.toHaveBeenCalled()
  })

  it('surfaces an error thrown by onSubmit', async () => {
    const user = userEvent.setup()
    mockOnSubmit.mockRejectedValueOnce(new Error('Create failed'))

    render(
      <DuplicateConnectionDialog
        initialName="My Server - Copy"
        onSubmit={mockOnSubmit}
        onClose={mockOnClose}
      />
    )

    await user.click(screen.getByText('explorer.duplicateConnection.duplicateButton'))

    await waitFor(() => {
      expect(screen.getByText('Create failed')).toBeInTheDocument()
    })
  })
})
