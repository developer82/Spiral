import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ServerFileBrowserDialog from '../ServerFileBrowserDialog'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

describe('ServerFileBrowserDialog', () => {
  const onSelect = vi.fn()
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(window.api.database, 'listServerDrives').mockResolvedValue({
      status: 'ok',
      drives: ['C:\\', 'D:\\'],
      platform: 'windows'
    })
    vi.spyOn(window.api.database, 'listServerDir').mockResolvedValue({
      status: 'ok',
      entries: [
        { name: 'Backups', isDirectory: true },
        { name: 'old.bak', isDirectory: false }
      ]
    })
  })

  afterEach(() => cleanup())

  it('lists drives on open', async () => {
    render(
      <ServerFileBrowserDialog
        connectionId="c1"
        mode="save"
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    expect(await screen.findByText('C:\\')).toBeInTheDocument()
    expect(screen.getByText('D:\\')).toBeInTheDocument()
  })

  it('navigates into a drive and returns the chosen path in save mode', async () => {
    const user = userEvent.setup()
    render(
      <ServerFileBrowserDialog
        connectionId="c1"
        mode="save"
        defaultFileName="MyDB.bak"
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    await user.click(await screen.findByText('C:\\'))
    await waitFor(() => expect(screen.getByText('Backups')).toBeInTheDocument())

    await user.click(screen.getByText('explorer.serverFileBrowser.select'))
    expect(onSelect).toHaveBeenCalledWith('C:\\MyDB.bak')
  })

  it('falls back to manual entry when no drives are returned', async () => {
    vi.spyOn(window.api.database, 'listServerDrives').mockResolvedValue({
      status: 'ok',
      drives: [],
      platform: 'windows'
    })
    render(
      <ServerFileBrowserDialog
        connectionId="c1"
        mode="save"
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    expect(
      await screen.findByLabelText('explorer.serverFileBrowser.manualPathLabel')
    ).toBeInTheDocument()
  })

  it('lets the user switch to manual entry from the browser', async () => {
    const user = userEvent.setup()
    render(
      <ServerFileBrowserDialog
        connectionId="c1"
        mode="save"
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    await screen.findByText('C:\\')
    await user.click(screen.getByText('explorer.serverFileBrowser.enterManually'))
    const input = await screen.findByLabelText('explorer.serverFileBrowser.manualPathLabel')
    await user.type(input, 'C:\\Backups\\db.bak')
    await user.click(screen.getByText('explorer.serverFileBrowser.select'))
    expect(onSelect).toHaveBeenCalledWith('C:\\Backups\\db.bak')
  })

  it('browses a Linux server using forward-slash paths rooted at /', async () => {
    vi.spyOn(window.api.database, 'listServerDrives').mockResolvedValue({
      status: 'ok',
      drives: ['/'],
      platform: 'linux'
    })
    vi.spyOn(window.api.database, 'listServerDir').mockResolvedValue({
      status: 'ok',
      entries: [
        { name: 'var', isDirectory: true },
        { name: 'readme.txt', isDirectory: false }
      ]
    })
    const user = userEvent.setup()
    render(
      <ServerFileBrowserDialog
        connectionId="c1"
        mode="save"
        defaultFileName="dump.sql"
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    await user.click(await screen.findByText('/'))
    await waitFor(() => expect(screen.getByText('var')).toBeInTheDocument())

    await user.click(screen.getByText('explorer.serverFileBrowser.select'))
    expect(onSelect).toHaveBeenCalledWith('/dump.sql')
  })

  it('falls back to manual entry when drive listing is denied', async () => {
    vi.spyOn(window.api.database, 'listServerDrives').mockResolvedValue({
      status: 'error',
      message: 'permission denied'
    })
    const user = userEvent.setup()
    render(
      <ServerFileBrowserDialog
        connectionId="c1"
        mode="save"
        onSelect={onSelect}
        onClose={onClose}
      />
    )
    const input = await screen.findByLabelText('explorer.serverFileBrowser.manualPathLabel')
    await user.type(input, 'C:\\Backups\\db.bak')
    await user.click(screen.getByText('explorer.serverFileBrowser.select'))
    expect(onSelect).toHaveBeenCalledWith('C:\\Backups\\db.bak')
  })
})
