import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import StartProfilingDialog from '../StartProfilingDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('StartProfilingDialog', () => {
  const mockOnStart = vi.fn()
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders title, connection name, and database name', () => {
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="AdventureWorks"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    expect(screen.getByText('profiler.startDialog.title')).toBeInTheDocument()
    expect(screen.getByText('My Server / AdventureWorks')).toBeInTheDocument()
  })

  it('renders all 5 event type checkboxes checked by default', () => {
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="TestDB"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(5)
    checkboxes.forEach((cb) => expect(cb).toBeChecked())
  })

  // ── Interaction ───────────────────────────────────────────────────────────

  it('calls onStart with all event types when all are checked', async () => {
    const user = userEvent.setup()
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="TestDB"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    await user.click(screen.getByText('profiler.startDialog.start'))
    expect(mockOnStart).toHaveBeenCalledOnce()
    const events = mockOnStart.mock.calls[0][0] as string[]
    expect(events).toContain('sql-statement')
    expect(events).toContain('blocked-query')
    expect(events).toContain('session-login')
    expect(events).toContain('session-logout')
    expect(events).toContain('error')
  })

  it('calls onStart with only the checked event types', async () => {
    const user = userEvent.setup()
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="TestDB"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    // Uncheck all events except the first (sql-statement)
    const checkboxes = screen.getAllByRole('checkbox')
    for (let i = 1; i < checkboxes.length; i++) {
      await user.click(checkboxes[i])
    }
    await user.click(screen.getByText('profiler.startDialog.start'))
    expect(mockOnStart).toHaveBeenCalledWith(['sql-statement'])
  })

  it('disables the Start button when no events are checked', async () => {
    const user = userEvent.setup()
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="TestDB"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    const checkboxes = screen.getAllByRole('checkbox')
    for (const cb of checkboxes) {
      await user.click(cb)
    }
    expect(screen.getByText('profiler.startDialog.start')).toBeDisabled()
  })

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup()
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="TestDB"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    await user.click(screen.getByText('profiler.startDialog.cancel'))
    expect(mockOnClose).toHaveBeenCalledOnce()
    expect(mockOnStart).not.toHaveBeenCalled()
  })

  it('calls onClose when clicking the X button', async () => {
    const user = userEvent.setup()
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="TestDB"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    await user.click(screen.getByLabelText('Close'))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when clicking the overlay', () => {
    render(
      <StartProfilingDialog
        connectionName="My Server"
        databaseName="TestDB"
        onStart={mockOnStart}
        onClose={mockOnClose}
      />
    )
    // The overlay is the dialog element (role=dialog)
    const overlay = screen.getByRole('dialog')
    fireEvent.mouseDown(overlay)
    expect(mockOnClose).toHaveBeenCalledOnce()
  })
})
