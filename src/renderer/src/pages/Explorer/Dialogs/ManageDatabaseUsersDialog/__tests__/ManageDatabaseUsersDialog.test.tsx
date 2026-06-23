import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ManageDatabaseUsersDialog from '../ManageDatabaseUsersDialog'
import type { DatabaseUserDetails, DatabaseUserRoleEntry, ExplorerNode } from '../../../../../../../preload/index.d'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, opts?: Record<string, string>) => {
    if (opts) {
      return Object.entries(opts).reduce(
        (s, [k, v]) => s.replace(`{{${k}}}`, v),
        key
      )
    }
    return key
  }})
}))

// ── shared props ──────────────────────────────────────────────────────────────

const baseProps = {
  connectionId: 'conn-1',
  databaseName: 'MyDB',
  onClose: vi.fn(),
  onSuccess: vi.fn()
}

const sampleUser: DatabaseUserDetails = {
  name: 'appuser',
  type: 'S',
  loginName: 'appLogin',
  defaultSchema: 'dbo'
}

const sampleRoles: DatabaseUserRoleEntry[] = [
  { roleName: 'db_datareader', isMember: true },
  { roleName: 'db_datawriter', isMember: false },
  { roleName: 'public', isMember: true }
]

const userNode = (name: string): ExplorerNode => ({
  id: `db:MyDB:security:users:${name}`,
  label: name,
  kind: 'security-user'
})

// ── setup helpers ─────────────────────────────────────────────────────────────

function mockGetChildren(users: string[] = [], logins: string[] = [], schemas: string[] = []): void {
  vi.spyOn(window.api.database, 'getChildren').mockImplementation((_conn, nodeId) => {
    if (typeof nodeId === 'string' && nodeId.includes('security:users') && nodeId.startsWith('db:')) {
      return Promise.resolve({ status: 'ok', children: users.map(userNode) })
    }
    if (nodeId === 'security:users') {
      return Promise.resolve({
        status: 'ok',
        children: logins.map((l) => ({ id: `security:users:${l}`, label: l, kind: 'security-user' as const }))
      })
    }
    if (typeof nodeId === 'string' && nodeId.includes('security:schemas')) {
      return Promise.resolve({
        status: 'ok',
        children: schemas.map((s) => ({ id: `db:MyDB:security:schemas:${s}`, label: s, kind: 'security-schema' as const }))
      })
    }
    return Promise.resolve({ status: 'ok', children: [] })
  })
}

function mockUserDetails(details: DatabaseUserDetails | null = sampleUser): void {
  vi.spyOn(window.api.database, 'getDatabaseUserDetails').mockResolvedValue(details)
}

function mockUserRoles(roles: DatabaseUserRoleEntry[] = sampleRoles): void {
  vi.spyOn(window.api.database, 'getDatabaseUserRoles').mockResolvedValue(roles)
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('ManageDatabaseUsersDialog — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['appuser'], ['appLogin'], ['dbo', 'reporting'])
  })

  afterEach(() => cleanup())

  it('renders the dialog title with database name', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} />)
    await waitFor(() =>
      expect(
        screen.getByText(/explorer\.manageDatabaseUsers\.dialogTitle/)
      ).toBeInTheDocument()
    )
  })

  it('renders the users list after mount', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} />)
    await waitFor(() => expect(screen.getByText('appuser')).toBeInTheDocument())
  })

  it('shows select-or-add message when no user selected', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageDatabaseUsers.selectOrAdd')
      ).toBeInTheDocument()
    )
  })
})

// ── Tab visibility ────────────────────────────────────────────────────────────

describe('ManageDatabaseUsersDialog — tabs on user selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['appuser'], ['appLogin'], ['dbo'])
    mockUserDetails()
    mockUserRoles()
  })

  afterEach(() => cleanup())

  it('shows General and Membership tabs when a user is selected via initialUserName', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} initialUserName="appuser" />)
    await waitFor(() => {
      expect(screen.getByText('explorer.manageDatabaseUsers.tab_general')).toBeInTheDocument()
      expect(screen.getByText('explorer.manageDatabaseUsers.tab_membership')).toBeInTheDocument()
    })
  })
})

// ── Edit mode constraints ─────────────────────────────────────────────────────

describe('ManageDatabaseUsersDialog — edit mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['appuser'], ['appLogin'], ['dbo'])
    mockUserDetails()
    mockUserRoles()
  })

  afterEach(() => cleanup())

  it('disables user name input when editing', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} initialUserName="appuser" />)
    await waitFor(() => screen.getByText('explorer.manageDatabaseUsers.tab_general'))

    const userNameInput = screen.getByPlaceholderText(
      'explorer.manageDatabaseUsers.userNamePlaceholder'
    )
    expect(userNameInput).toBeDisabled()
  })

  it('disables user type radios when editing', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} initialUserName="appuser" />)
    await waitFor(() => screen.getByText('explorer.manageDatabaseUsers.tab_general'))

    const radios = screen.getAllByRole('radio')
    radios.forEach((radio) => expect(radio).toBeDisabled())
  })

  it('disables login dropdown when editing', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} initialUserName="appuser" />)
    await waitFor(() => screen.getByText('explorer.manageDatabaseUsers.tab_general'))

    const loginSelect = screen.getAllByRole('combobox')[0]
    expect(loginSelect).toBeDisabled()
  })
})

// ── Save button state ─────────────────────────────────────────────────────────

describe('ManageDatabaseUsersDialog — save button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren([], ['appLogin'], ['dbo'])
    mockUserDetails()
    mockUserRoles()
  })

  afterEach(() => cleanup())

  it('shows save button in add-new mode', async () => {
    render(<ManageDatabaseUsersDialog {...baseProps} openOnNew />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageDatabaseUsers.saveButton')
      ).toBeInTheDocument()
    )
  })
})
