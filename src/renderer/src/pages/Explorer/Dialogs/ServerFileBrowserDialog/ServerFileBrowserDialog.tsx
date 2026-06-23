import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Folder, File as FileIcon, HardDrive, ChevronRight, Home } from 'lucide-react'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'
import type { ServerDirEntry } from '../../../../../../preload/index.d'
import './ServerFileBrowserDialog.css'

interface ServerFileBrowserDialogProps {
  connectionId: string
  /** 'save' lets the user type a new file name; 'open' requires picking an existing file. */
  mode: 'save' | 'open'
  /** Default file name suggestion (save mode). */
  defaultFileName?: string
  onSelect: (fullPath: string) => void
  onClose: () => void
  zIndex?: number
}

/** Ensure a directory path ends with a single trailing separator. */
function withTrailingSlash(path: string, sep: string): string {
  if (!path) return path
  return path.endsWith(sep) ? path : `${path}${sep}`
}

/** Join a directory and a file/segment name with the platform's separator. */
function joinPath(dir: string, name: string, sep: string): string {
  return `${withTrailingSlash(dir, sep)}${name}`
}

function ServerFileBrowserDialog({
  connectionId,
  mode,
  defaultFileName,
  onSelect,
  onClose,
  zIndex
}: ServerFileBrowserDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  // Empty currentPath means we are at the drive list (the root).
  const [currentPath, setCurrentPath] = useState('')
  const [platform, setPlatform] = useState<'windows' | 'linux'>('windows')
  const [drives, setDrives] = useState<string[]>([])
  const [entries, setEntries] = useState<ServerDirEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualMode, setManualMode] = useState(false)
  const [manualPath, setManualPath] = useState('')
  const [fileName, setFileName] = useState(defaultFileName ?? '')

  const loadDrives = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError(null)
    try {
      const result = await window.api.database.listServerDrives(connectionId)
      console.log('[backup] listServerDrives result:', result)
      if (result.status === 'error') {
        setError(result.message)
        setManualMode(true)
        return
      }
      if (result.drives.length === 0) {
        // Server returned no fixed drives (e.g. restricted xp_fixeddrives) — let the
        // user type a full path instead of being stuck.
        setManualMode(true)
        return
      }
      setDrives(result.drives)
      setPlatform(result.platform)
      setEntries([])
      setCurrentPath('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setManualMode(true)
    } finally {
      setLoading(false)
    }
  }, [connectionId])

  const loadDir = useCallback(
    async (path: string): Promise<void> => {
      setLoading(true)
      setError(null)
      try {
        const result = await window.api.database.listServerDir(connectionId, path)
        console.log('[backup] listServerDir result for', path, ':', result)
        if (result.status === 'error') {
          setError(result.message)
          return
        }
        setEntries(result.entries)
        setCurrentPath(path)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    [connectionId]
  )

  useEffect(() => {
    void loadDrives()
  }, [loadDrives])

  const sep = platform === 'linux' ? '/' : '\\'

  function handleEntryClick(entry: ServerDirEntry): void {
    if (entry.isDirectory) {
      void loadDir(joinPath(currentPath, entry.name, sep))
    } else if (mode === 'open') {
      setFileName(entry.name)
    }
  }

  function navigateToCrumb(index: number): void {
    // index -1 = drive/root list
    if (index < 0) {
      void loadDrives()
      return
    }
    const segments = currentPath.split(sep).filter(Boolean)
    // For Windows, segments[0] is "C:" for "C:\foo\bar". For Linux, paths are rooted at "/".
    const target =
      platform === 'linux'
        ? `/${segments.slice(0, index + 1).join('/')}`
        : segments.slice(0, index + 1).join('\\')
    void loadDir(withTrailingSlash(target, sep))
  }

  function handleConfirm(): void {
    if (manualMode) {
      if (!manualPath.trim()) return
      onSelect(manualPath.trim())
      return
    }
    if (!currentPath || !fileName.trim()) return
    onSelect(joinPath(currentPath, fileName.trim(), sep))
  }

  const crumbSegments = currentPath.split(sep).filter(Boolean)
  const confirmDisabled = manualMode ? !manualPath.trim() : !currentPath || !fileName.trim()

  return (
    <BaseDialog
      title={t('explorer.serverFileBrowser.title')}
      icon={<HardDrive size={16} />}
      onClose={onClose}
      maxWidth="40rem"
      width="40rem"
      zIndex={zIndex}
      analyticsId="server_file_browser"
      footer={
        <div className="server-browser__footer">
          <Button
            variant="ghost"
            onClick={() => {
              if (manualMode) {
                setError(null)
                setManualMode(false)
                void loadDrives()
              } else {
                setManualMode(true)
              }
            }}
          >
            {manualMode
              ? t('explorer.serverFileBrowser.browseDrives')
              : t('explorer.serverFileBrowser.enterManually')}
          </Button>
          <div className="server-browser__footer-right">
            <Button variant="ghost" onClick={onClose}>
              {t('explorer.serverFileBrowser.cancel')}
            </Button>
            <Button variant="primary" onClick={handleConfirm} disabled={confirmDisabled}>
              {t('explorer.serverFileBrowser.select')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="server-browser__body">
        {manualMode ? (
          <div className="server-browser__manual">
            {error && (
              <div className="server-browser__manual-notice">
                {t('explorer.serverFileBrowser.manualFallback')}
              </div>
            )}
            <label className="conn-dialog__label" htmlFor="server-browser-manual-path">
              {t('explorer.serverFileBrowser.manualPathLabel')}
            </label>
            <input
              id="server-browser-manual-path"
              className="conn-dialog__input"
              type="text"
              value={manualPath}
              onChange={(e) => setManualPath(e.target.value)}
              placeholder={t('explorer.serverFileBrowser.manualPathPlaceholder')}
              autoFocus
            />
            {error && <ErrorBox error={error} />}
          </div>
        ) : (
          <>
            <div className="server-browser__breadcrumb">
              <button
                type="button"
                className="server-browser__crumb"
                onClick={() => navigateToCrumb(-1)}
              >
                <Home size={13} />
              </button>
              {crumbSegments.map((seg, i) => (
                <span className="server-browser__crumb-group" key={`${seg}-${i}`}>
                  <ChevronRight size={12} className="server-browser__crumb-sep" />
                  <button
                    type="button"
                    className="server-browser__crumb"
                    onClick={() => navigateToCrumb(i)}
                  >
                    {seg}
                  </button>
                </span>
              ))}
            </div>

            <div className="server-browser__list">
              {loading && (
                <div className="server-browser__empty">
                  {t('explorer.serverFileBrowser.loading')}
                </div>
              )}
              {!loading && error && <ErrorBox error={error} />}
              {!loading && !error && currentPath === '' && drives.length === 0 && (
                <div className="server-browser__empty">
                  {t('explorer.serverFileBrowser.noDrives')}
                </div>
              )}
              {!loading &&
                !error &&
                currentPath === '' &&
                drives.map((drive) => (
                  <button
                    type="button"
                    key={drive}
                    className="server-browser__row"
                    onClick={() => void loadDir(drive)}
                  >
                    <HardDrive size={14} className="server-browser__row-icon" />
                    <span className="server-browser__row-name">{drive}</span>
                  </button>
                ))}
              {!loading && !error && currentPath !== '' && entries.length === 0 && (
                <div className="server-browser__empty">
                  {t('explorer.serverFileBrowser.emptyFolder')}
                </div>
              )}
              {!loading &&
                !error &&
                currentPath !== '' &&
                entries.map((entry) => {
                  const isSelectedFile = !entry.isDirectory && entry.name === fileName
                  return (
                    <button
                      type="button"
                      key={entry.name}
                      className={`server-browser__row${isSelectedFile ? ' server-browser__row--selected' : ''}${entry.isDirectory ? '' : ' server-browser__row--file'}`}
                      onClick={() => handleEntryClick(entry)}
                    >
                      {entry.isDirectory ? (
                        <Folder
                          size={14}
                          className="server-browser__row-icon server-browser__row-icon--folder"
                        />
                      ) : (
                        <FileIcon size={14} className="server-browser__row-icon" />
                      )}
                      <span className="server-browser__row-name">{entry.name}</span>
                    </button>
                  )
                })}
            </div>

            <div className="server-browser__filename">
              <label className="conn-dialog__label" htmlFor="server-browser-filename">
                {t('explorer.serverFileBrowser.fileNameLabel')}
              </label>
              <input
                id="server-browser-filename"
                className="conn-dialog__input"
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder={t('explorer.serverFileBrowser.fileNamePlaceholder')}
                readOnly={mode === 'open'}
              />
            </div>
          </>
        )}
      </div>
    </BaseDialog>
  )
}

export default ServerFileBrowserDialog
