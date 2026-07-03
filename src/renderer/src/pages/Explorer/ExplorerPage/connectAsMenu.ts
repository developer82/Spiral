import type { MenuItem } from '../../../components/Menu/Menu'
import type { ConnectionRecord, ConnectionUserProfile } from '../connections.types'

interface ConnectAsHandlers {
  onConnectProfile: (profile: ConnectionUserProfile) => void
  onManageUsers: () => void
}

/**
 * Builds the submenu items for the connection "Connect As…" context-menu entry:
 * the connection's own default user first (if a username is set on the
 * connection), then one leaf per additional user profile (label falls back
 * from profileName to username), a divider when any of those exist, and an
 * always-present "Manage Users" item. Kept as a pure function so it can be
 * unit-tested without rendering.
 */
export function buildConnectAsItems(
  conn: ConnectionRecord,
  t: (key: string) => string,
  handlers: ConnectAsHandlers
): MenuItem[] {
  const profiles = conn.additionalUsers ?? []
  const items: MenuItem[] = []
  if (conn.username) {
    items.push({
      id: 'connect-as-default',
      label: `${conn.username} ${t('explorer.contextMenu.connectAsDefaultUserSuffix')}`,
      onClick: () =>
        handlers.onConnectProfile({ id: 'default', username: conn.username, password: conn.password })
    })
  }
  items.push(
    ...profiles.map((profile) => ({
      id: `connect-as-${profile.id}`,
      label: profile.profileName?.trim() || profile.username,
      onClick: () => handlers.onConnectProfile(profile)
    }))
  )
  if (items.length > 0) {
    items.push({ id: 'connect-as-sep', separator: true })
  }
  items.push({
    id: 'manage-users',
    label: t('explorer.contextMenu.manageUsers'),
    onClick: handlers.onManageUsers
  })
  return items
}
