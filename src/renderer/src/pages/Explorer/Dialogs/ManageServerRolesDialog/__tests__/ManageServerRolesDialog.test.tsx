import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ManageServerRolesDialog from '../ManageServerRolesDialog'
import type { ExplorerNode, ServerRoleDetails } from '../../../../../../../preload/index.d'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts) {
        return Object.entries(opts).reduce((s, [k, v]) => s.replace(`{{${k}}}`, v), key)
      }
      return key
    }
  })
}))

// ── helpers ───────────────────────────────────────────────────────────────────

const baseProps = {
  connectionId: 'conn-1',
  onClose: vi.fn(),
  onSuccess: vi.fn()
}

const roleNode = (name: string): ExplorerNode => ({
  id: `security:roles:${name}`,
  label: name,
  kind: 'security-role'
})

const loginNode = (name: string): ExplorerNode => ({
  id: `security:users:${name}`,
  label: name,
  kind: 'security-user'
})

const userDefinedRole: ServerRoleDetails = {
  name: 'MyRole',
  owner: 'sa',
  isFixedRole: false,
  members: ['login1'],
  memberships: ['sysadmin'],
  securables: [{ securable: 'SERVER', permission: 'CONNECT SQL', state: 'GRANT' }],
  endpoints: []
}

const fixedRole: ServerRoleDetails = {
  name: 'sysadmin',
  owner: 'sa',
  isFixedRole: true,
  members: ['login1'],
  memberships: [],
  securables: [],
  endpoints: []
}

const publicRole: ServerRoleDetails = {
  name: 'public',
  owner: 'sa',
  isFixedRole: true,
  members: [],
  memberships: [],
  securables: [],
  endpoints: []
}

function mockGetChildren(roleNames: string[] = [], loginNames: string[] = []): void {
  vi.spyOn(window.api.database, 'getChildren').mockImplementation((_conn, nodeId) => {
    if (nodeId === 'security:roles') {
      return Promise.resolve({ status: 'ok', children: roleNames.map(roleNode) })
    }
    if (nodeId === 'security:users') {
      return Promise.resolve({ status: 'ok', children: loginNames.map(loginNode) })
    }
    return Promise.resolve({ status: 'ok', children: [] })
  })
}

function mockRoleDetails(details: ServerRoleDetails | null = userDefinedRole): void {
  vi.spyOn(window.api.database, 'getServerRoleDetails').mockResolvedValue(details)
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe('ManageServerRolesDialog — rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['MyRole', 'sysadmin'], ['login1', 'login2'])
  })

  afterEach(() => cleanup())

  it('renders the dialog title', async () => {
    render(<ManageServerRolesDialog {...baseProps} />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.dialogTitle')
      ).toBeInTheDocument()
    )
  })

  it('renders the roles list after mount', async () => {
    render(<ManageServerRolesDialog {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText('MyRole')).toBeInTheDocument()
      expect(screen.getByText('sysadmin')).toBeInTheDocument()
    })
  })

  it('shows select-or-add message when no role selected', async () => {
    render(<ManageServerRolesDialog {...baseProps} />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.selectOrAdd')
      ).toBeInTheDocument()
    )
  })

  it('shows Add Role button', async () => {
    render(<ManageServerRolesDialog {...baseProps} />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.addButton')
      ).toBeInTheDocument()
    )
  })
})

// ── Tab visibility ────────────────────────────────────────────────────────────

describe('ManageServerRolesDialog — tabs on role selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['MyRole'], ['login1', 'login2'])
    mockRoleDetails()
  })

  afterEach(() => cleanup())

  it('shows General, Members, and Memberships tabs when a user-defined role is selected', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="MyRole" />)
    await waitFor(() => {
      expect(screen.getByText('explorer.manageServerRoles.tab_general')).toBeInTheDocument()
      expect(screen.getByText('explorer.manageServerRoles.tab_members')).toBeInTheDocument()
      expect(screen.getByText('explorer.manageServerRoles.tab_memberships')).toBeInTheDocument()
    })
  })
})

// ── Edit mode constraints ─────────────────────────────────────────────────────

describe('ManageServerRolesDialog — edit mode for user-defined role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['MyRole'], ['login1', 'login2'])
    mockRoleDetails(userDefinedRole)
  })

  afterEach(() => cleanup())

  it('disables role name input when editing', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="MyRole" />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_general'))

    const nameInput = screen.getByPlaceholderText('explorer.manageServerRoles.roleNamePlaceholder')
    expect(nameInput).toBeDisabled()
  })

  it('shows Delete button for user-defined role', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="MyRole" />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.deleteButton')
      ).toBeInTheDocument()
    )
  })

  it('shows Save button for user-defined role', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="MyRole" />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.saveButton')
      ).toBeInTheDocument()
    )
  })
})

// ── Fixed role constraints ────────────────────────────────────────────────────

describe('ManageServerRolesDialog — fixed role (sysadmin)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['sysadmin'], ['login1'])
    mockRoleDetails(fixedRole)
  })

  afterEach(() => cleanup())

  it('shows fixed role notice for fixed roles', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="sysadmin" />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.fixedRoleReadOnly')
      ).toBeInTheDocument()
    )
  })

  it('does NOT show Delete button for fixed roles', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="sysadmin" />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_general'))

    expect(screen.queryByText('explorer.manageServerRoles.deleteButton')).not.toBeInTheDocument()
  })

  it('shows Save button for fixed role (member changes allowed)', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="sysadmin" />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.saveButton')
      ).toBeInTheDocument()
    )
  })
})

// ── Public role constraints ───────────────────────────────────────────────────

describe('ManageServerRolesDialog — public role', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['public'], [])
    mockRoleDetails(publicRole)
  })

  afterEach(() => cleanup())

  it('does NOT show Save button for public role', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="public" />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_general'))

    expect(screen.queryByText('explorer.manageServerRoles.saveButton')).not.toBeInTheDocument()
  })

  it('does NOT show Delete button for public role', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="public" />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_general'))

    expect(screen.queryByText('explorer.manageServerRoles.deleteButton')).not.toBeInTheDocument()
  })

  it('shows public membership notice in Members tab', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="public" />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_members'))

    fireEvent.click(screen.getByText('explorer.manageServerRoles.tab_members'))
    await waitFor(() =>
      expect(
        screen.getByText(/public role/)
      ).toBeInTheDocument()
    )
  })
})

// ── Add new mode ──────────────────────────────────────────────────────────────

describe('ManageServerRolesDialog — add new mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['sysadmin'], ['sa', 'login1'])
  })

  afterEach(() => cleanup())

  it('opens in add-new mode when openOnNew=true', async () => {
    render(<ManageServerRolesDialog {...baseProps} openOnNew />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageServerRoles.tab_general')).toBeInTheDocument()
    )
  })

  it('role name input is enabled in add-new mode', async () => {
    render(<ManageServerRolesDialog {...baseProps} openOnNew />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_general'))

    const nameInput = screen.getByPlaceholderText('explorer.manageServerRoles.roleNamePlaceholder')
    expect(nameInput).not.toBeDisabled()
  })

  it('shows New Role placeholder in list while adding', async () => {
    render(<ManageServerRolesDialog {...baseProps} openOnNew />)
    await waitFor(() =>
      expect(screen.getByText('explorer.manageServerRoles.newRole')).toBeInTheDocument()
    )
  })

  it('shows Save button in add-new mode', async () => {
    render(<ManageServerRolesDialog {...baseProps} openOnNew />)
    await waitFor(() =>
      expect(
        screen.getByText('explorer.manageServerRoles.saveButton')
      ).toBeInTheDocument()
    )
  })
})

// ── Members tab ───────────────────────────────────────────────────────────────

describe('ManageServerRolesDialog — Members tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['MyRole'], ['login1', 'login2'])
    mockRoleDetails(userDefinedRole)
  })

  afterEach(() => cleanup())

  it('shows existing members after navigating to Members tab', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="MyRole" />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_members'))

    fireEvent.click(screen.getByText('explorer.manageServerRoles.tab_members'))
    await waitFor(() => expect(screen.getByText('login1')).toBeInTheDocument())
  })
})

// ── Memberships tab ───────────────────────────────────────────────────────────

describe('ManageServerRolesDialog — Memberships tab', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetChildren(['MyRole', 'sysadmin'], ['login1'])
    mockRoleDetails(userDefinedRole)
  })

  afterEach(() => cleanup())

  it('shows existing memberships after navigating to Memberships tab', async () => {
    render(<ManageServerRolesDialog {...baseProps} initialRoleName="MyRole" />)
    await waitFor(() => screen.getByText('explorer.manageServerRoles.tab_memberships'))

    fireEvent.click(screen.getByText('explorer.manageServerRoles.tab_memberships'))
    await waitFor(() => {
      const spans = screen.getAllByText('sysadmin')
      expect(spans.length).toBeGreaterThan(0)
    })
  })
})
