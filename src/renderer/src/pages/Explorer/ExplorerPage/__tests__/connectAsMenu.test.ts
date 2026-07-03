import { describe, it, expect, vi } from 'vitest'
import { buildConnectAsItems } from '../connectAsMenu'
import type { ConnectionRecord } from '../../connections.types'

const t = (key: string): string => key

function makeConnection(overrides: Partial<ConnectionRecord> = {}): ConnectionRecord {
  return {
    id: 'c1',
    name: 'My DB',
    provider: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'admin',
    password: '',
    rememberPassword: false,
    defaultDatabase: 'postgres',
    ...overrides
  }
}

describe('buildConnectAsItems', () => {
  it('includes the default user and "Manage Users" item, even with no profiles', () => {
    const items = buildConnectAsItems(makeConnection(), t, {
      onConnectProfile: vi.fn(),
      onManageUsers: vi.fn()
    })
    expect(items).toHaveLength(3) // default user + divider + manage users
    expect(items[0]).toMatchObject({
      id: 'connect-as-default',
      label: 'admin explorer.contextMenu.connectAsDefaultUserSuffix'
    })
    expect(items[1]).toMatchObject({ separator: true })
    expect(items[2]).toMatchObject({ id: 'manage-users', label: 'explorer.contextMenu.manageUsers' })
  })

  it('omits the default user item when the connection has no username', () => {
    const items = buildConnectAsItems(makeConnection({ username: '' }), t, {
      onConnectProfile: vi.fn(),
      onManageUsers: vi.fn()
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 'manage-users' })
    expect(items.some((i) => i.separator)).toBe(false)
  })

  it('renders a profile item per additional user, after the default user, with a divider before Manage Users', () => {
    const conn = makeConnection({
      additionalUsers: [
        { id: 'u1', profileName: 'Read-only', username: 'ro' },
        { id: 'u2', username: 'writer' }
      ]
    })
    const items = buildConnectAsItems(conn, t, {
      onConnectProfile: vi.fn(),
      onManageUsers: vi.fn()
    })
    expect(items).toHaveLength(5) // default user + 2 profiles + divider + manage users
    expect(items[0]).toMatchObject({ id: 'connect-as-default' })
    expect(items[items.length - 2]).toMatchObject({ separator: true })
    expect(items[items.length - 1]).toMatchObject({ id: 'manage-users' })
  })

  it('labels a profile with its profileName when present', () => {
    const conn = makeConnection({
      additionalUsers: [{ id: 'u1', profileName: 'Read-only', username: 'ro' }]
    })
    const items = buildConnectAsItems(conn, t, {
      onConnectProfile: vi.fn(),
      onManageUsers: vi.fn()
    })
    expect(items[1].label).toBe('Read-only')
  })

  it('falls back to username when profileName is empty or whitespace', () => {
    const conn = makeConnection({
      additionalUsers: [
        { id: 'u1', profileName: '   ', username: 'writer' },
        { id: 'u2', username: 'reader' }
      ]
    })
    const items = buildConnectAsItems(conn, t, {
      onConnectProfile: vi.fn(),
      onManageUsers: vi.fn()
    })
    expect(items[1].label).toBe('writer')
    expect(items[2].label).toBe('reader')
  })

  it('wires the default user item onClick to onConnectProfile with the connection username/password', () => {
    const onConnectProfile = vi.fn()
    const conn = makeConnection({ username: 'admin', password: 'secret' })
    const [item] = buildConnectAsItems(conn, t, { onConnectProfile, onManageUsers: vi.fn() })
    item.onClick?.()
    expect(onConnectProfile).toHaveBeenCalledWith({ id: 'default', username: 'admin', password: 'secret' })
  })

  it('wires each profile item onClick to onConnectProfile with that profile', () => {
    const onConnectProfile = vi.fn()
    const profile = { id: 'u1', profileName: 'Read-only', username: 'ro' }
    const conn = makeConnection({ additionalUsers: [profile] })
    const items = buildConnectAsItems(conn, t, { onConnectProfile, onManageUsers: vi.fn() })
    items[1].onClick?.()
    expect(onConnectProfile).toHaveBeenCalledWith(profile)
  })

  it('wires the Manage Users item onClick to onManageUsers', () => {
    const onManageUsers = vi.fn()
    const items = buildConnectAsItems(makeConnection(), t, {
      onConnectProfile: vi.fn(),
      onManageUsers
    })
    items[items.length - 1].onClick?.()
    expect(onManageUsers).toHaveBeenCalledOnce()
  })
})
