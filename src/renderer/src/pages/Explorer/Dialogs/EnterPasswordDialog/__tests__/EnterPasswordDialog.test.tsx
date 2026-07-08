import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import EnterPasswordDialog from '../EnterPasswordDialog'
import type { ConnectionRecord } from '../../../connections.types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

function makeConnection(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'conn-1',
    name: 'My Server',
    provider: 'sqlserver',
    host: 'localhost',
    port: 1433,
    username: 'sa',
    password: '',
    rememberPassword: false,
    defaultDatabase: 'master',
    ...overrides
  }
}

describe('EnterPasswordDialog', () => {
  const mockOnConnect = vi.fn()
  const mockOnCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the title, fields, checkbox and buttons', () => {
    render(
      <EnterPasswordDialog
        connection={makeConnection()}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    expect(screen.getByText('explorer.enterPassword.dialogTitle')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.enterPassword.usernameLabel')).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.enterPassword.passwordLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.enterPassword.rememberLabel')).toBeInTheDocument()
    expect(screen.getByText('explorer.enterPassword.connectButton')).toBeInTheDocument()
    expect(screen.getByText('explorer.enterPassword.cancelButton')).toBeInTheDocument()
  })

  it('prefills the username from the connection record', () => {
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: 'admin' })}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getByLabelText('explorer.enterPassword.usernameLabel')).toHaveValue('admin')
  })

  it('seeds the username from initialUsername, overriding the connection username', () => {
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: 'admin' })}
        initialUsername="readonly"
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getByLabelText('explorer.enterPassword.usernameLabel')).toHaveValue('readonly')
  })

  it('shows an initial server error (e.g. a failed saved-credential connect)', () => {
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: 'admin' })}
        initialUsername="ro"
        initialError="Login failed for user 'ro'"
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getByText("Login failed for user 'ro'")).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.enterPassword.usernameLabel')).toHaveValue('ro')
  })

  it('passes the seeded profile username through to onConnect', async () => {
    const user = userEvent.setup()
    mockOnConnect.mockResolvedValue(undefined)
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: 'admin' })}
        initialUsername="readonly"
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )
    await user.type(screen.getByLabelText('explorer.enterPassword.passwordLabel'), 'secret')
    await user.click(screen.getByText('explorer.enterPassword.rememberLabel'))
    await user.click(screen.getByText('explorer.enterPassword.connectButton'))
    await waitFor(() => {
      expect(mockOnConnect).toHaveBeenCalledWith('readonly', 'secret', true)
    })
  })

  it('autofocuses the password field when a username is already stored', () => {
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: 'sa' })}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getByLabelText('explorer.enterPassword.passwordLabel')).toHaveFocus()
  })

  it('autofocuses the username field when no username is stored', () => {
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: '' })}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )
    expect(screen.getByLabelText('explorer.enterPassword.usernameLabel')).toHaveFocus()
  })

  // ── Optional fields ───────────────────────────────────────────────────────

  it('submits with an empty password (anonymous login) without a validation error', async () => {
    const user = userEvent.setup()
    mockOnConnect.mockResolvedValue(undefined)
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: 'sa' })}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByText('explorer.enterPassword.connectButton'))

    await waitFor(() => {
      expect(mockOnConnect).toHaveBeenCalledWith('sa', '', false)
    })
    expect(
      screen.queryByText('explorer.enterPassword.validation.passwordRequired')
    ).not.toBeInTheDocument()
  })

  it('submits with both username and password empty (fully anonymous login)', async () => {
    const user = userEvent.setup()
    mockOnConnect.mockResolvedValue(undefined)
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: '' })}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByText('explorer.enterPassword.connectButton'))

    await waitFor(() => {
      expect(mockOnConnect).toHaveBeenCalledWith('', '', false)
    })
  })

  // ── Successful submit ─────────────────────────────────────────────────────

  it('calls onConnect with the entered username, password and remember flag', async () => {
    const user = userEvent.setup()
    mockOnConnect.mockResolvedValue(undefined)
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: 'sa' })}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.type(screen.getByLabelText('explorer.enterPassword.passwordLabel'), 'secret')
    await user.click(screen.getByText('explorer.enterPassword.rememberLabel'))
    await user.click(screen.getByText('explorer.enterPassword.connectButton'))

    await waitFor(() => {
      expect(mockOnConnect).toHaveBeenCalledWith('sa', 'secret', true)
    })
  })

  it('passes the edited username through to onConnect', async () => {
    const user = userEvent.setup()
    mockOnConnect.mockResolvedValue(undefined)
    render(
      <EnterPasswordDialog
        connection={makeConnection({ username: '' })}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.type(screen.getByLabelText('explorer.enterPassword.usernameLabel'), 'newuser')
    await user.type(screen.getByLabelText('explorer.enterPassword.passwordLabel'), 'pw')
    await user.click(screen.getByText('explorer.enterPassword.connectButton'))

    await waitFor(() => {
      expect(mockOnConnect).toHaveBeenCalledWith('newuser', 'pw', false)
    })
  })

  it('disables inputs and buttons while connecting', async () => {
    const user = userEvent.setup()
    let resolveConnect!: () => void
    mockOnConnect.mockReturnValue(new Promise<void>((res) => (resolveConnect = res)))
    render(
      <EnterPasswordDialog
        connection={makeConnection()}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.type(screen.getByLabelText('explorer.enterPassword.passwordLabel'), 'pw')
    await user.click(screen.getByText('explorer.enterPassword.connectButton'))

    await waitFor(() => {
      expect(screen.getByText('explorer.enterPassword.connectingButton')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('explorer.enterPassword.passwordLabel')).toBeDisabled()
    expect(screen.getByText('explorer.enterPassword.cancelButton')).toBeDisabled()

    resolveConnect()
  })

  // ── Server error ──────────────────────────────────────────────────────────

  it('shows an inline server error when onConnect rejects and keeps the dialog open', async () => {
    const user = userEvent.setup()
    mockOnConnect.mockRejectedValue(new Error('Login failed for user'))
    render(
      <EnterPasswordDialog
        connection={makeConnection()}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.type(screen.getByLabelText('explorer.enterPassword.passwordLabel'), 'wrong')
    await user.click(screen.getByText('explorer.enterPassword.connectButton'))

    await waitFor(() => {
      expect(screen.getByText('Login failed for user')).toBeInTheDocument()
    })
    expect(mockOnCancel).not.toHaveBeenCalled()
  })

  it('clears a server error when the user edits the password', async () => {
    const user = userEvent.setup()
    mockOnConnect.mockRejectedValue(new Error('Auth error'))
    render(
      <EnterPasswordDialog
        connection={makeConnection()}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.type(screen.getByLabelText('explorer.enterPassword.passwordLabel'), 'bad')
    await user.click(screen.getByText('explorer.enterPassword.connectButton'))
    await waitFor(() => expect(screen.getByText('Auth error')).toBeInTheDocument())

    await user.type(screen.getByLabelText('explorer.enterPassword.passwordLabel'), 'x')
    expect(screen.queryByText('Auth error')).not.toBeInTheDocument()
  })

  // ── Cancel / close ────────────────────────────────────────────────────────

  it('calls onCancel when the Cancel button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <EnterPasswordDialog
        connection={makeConnection()}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByText('explorer.enterPassword.cancelButton'))

    expect(mockOnCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when the X button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <EnterPasswordDialog
        connection={makeConnection()}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    await user.click(screen.getByLabelText('Close'))

    expect(mockOnCancel).toHaveBeenCalledOnce()
  })

  it('calls onCancel when clicking the overlay backdrop', async () => {
    const user = userEvent.setup()
    render(
      <EnterPasswordDialog
        connection={makeConnection()}
        onConnect={mockOnConnect}
        onCancel={mockOnCancel}
      />
    )

    const overlay = screen.getByRole('dialog')
    await user.pointer({ target: overlay, keys: '[MouseLeft>]' })

    expect(mockOnCancel).toHaveBeenCalledOnce()
  })
})
