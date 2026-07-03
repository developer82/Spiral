import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import AddEditUserModal from '../AddEditUserModal'
import type { ConnectionUserProfile } from '../../../connections.types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('AddEditUserModal', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders empty fields in add mode with the "add" title and a disabled Save button', () => {
    render(<AddEditUserModal onSave={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'explorer.dialog.users.add' })).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.users.profileName')).toHaveValue('')
    expect(screen.getByLabelText('explorer.dialog.users.username')).toHaveValue('')
    expect(screen.getByLabelText('explorer.dialog.users.password')).toHaveValue('')
    expect(screen.getByText('explorer.dialog.actions.save')).toBeDisabled()
  })

  it('renders pre-filled fields in edit mode with the "edit" title', () => {
    const user: ConnectionUserProfile = {
      id: 'u1',
      profileName: 'Read-only',
      username: 'ro',
      password: 'roPass'
    }
    render(<AddEditUserModal user={user} onSave={vi.fn()} onClose={vi.fn()} />)

    expect(
      screen.getByRole('dialog', { name: 'explorer.dialog.users.editTitle' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText('explorer.dialog.users.profileName')).toHaveValue('Read-only')
    expect(screen.getByLabelText('explorer.dialog.users.username')).toHaveValue('ro')
    expect(screen.getByLabelText('explorer.dialog.users.password')).toHaveValue('roPass')
    expect(screen.getByText('explorer.dialog.actions.save')).toBeEnabled()
  })

  it('enables the Save button once a username is entered', async () => {
    const user = userEvent.setup()
    render(<AddEditUserModal onSave={vi.fn()} onClose={vi.fn()} />)

    const saveButton = screen.getByText('explorer.dialog.actions.save')
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText('explorer.dialog.users.username'), 'ro')
    expect(saveButton).toBeEnabled()
  })

  it('calls onSave with a freshly generated id and onClose when adding a new profile', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<AddEditUserModal onSave={onSave} onClose={onClose} />)

    await user.type(screen.getByLabelText('explorer.dialog.users.profileName'), 'Read-only')
    await user.type(screen.getByLabelText('explorer.dialog.users.username'), 'ro')
    await user.type(screen.getByLabelText('explorer.dialog.users.password'), 'roPass')
    await user.click(screen.getByText('explorer.dialog.actions.save'))

    expect(onSave).toHaveBeenCalledTimes(1)
    const savedProfile = onSave.mock.calls[0][0] as ConnectionUserProfile
    expect(savedProfile.id).toEqual(expect.any(String))
    expect(savedProfile.id.length).toBeGreaterThan(0)
    expect(savedProfile).toMatchObject({
      profileName: 'Read-only',
      username: 'ro',
      password: 'roPass'
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('preserves the original id when saving an edited profile', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    const existing: ConnectionUserProfile = {
      id: 'u1',
      profileName: 'Read-only',
      username: 'ro',
      password: 'roPass'
    }
    render(<AddEditUserModal user={existing} onSave={onSave} onClose={onClose} />)

    const usernameInput = screen.getByLabelText('explorer.dialog.users.username')
    await user.clear(usernameInput)
    await user.type(usernameInput, 'admin')
    await user.click(screen.getByText('explorer.dialog.actions.save'))

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'u1', username: 'admin', profileName: 'Read-only' })
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose without calling onSave when Cancel is clicked', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const onClose = vi.fn()
    render(<AddEditUserModal onSave={onSave} onClose={onClose} />)

    await user.type(screen.getByLabelText('explorer.dialog.users.username'), 'ro')
    await user.click(screen.getByText('explorer.dialog.actions.cancel'))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSave).not.toHaveBeenCalled()
  })
})
