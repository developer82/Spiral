import { useState } from 'react'
import { PackageOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import './ExportEnvironmentDialog.css'

interface ExportOptions {
  connections: boolean
  comparisons: boolean
  passwords: boolean
  settings: boolean
}

interface ExportEnvironmentDialogProps {
  onClose: () => void
}

export default function ExportEnvironmentDialog({
  onClose
}: ExportEnvironmentDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [options, setOptions] = useState<ExportOptions>({
    connections: true,
    comparisons: true,
    passwords: false,
    settings: true
  })
  const [exporting, setExporting] = useState(false)

  const passwordsEnabled = options.connections || options.comparisons

  function toggle(key: keyof ExportOptions): void {
    setOptions((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (key === 'connections' || key === 'comparisons') {
        if (!next.connections && !next.comparisons) {
          next.passwords = false
        }
      }
      return next
    })
  }

  async function handleExport(): Promise<void> {
    setExporting(true)
    try {
      const result = await window.api.environment.export(options)
      if ('cancelled' in result) return
      onClose()
    } finally {
      setExporting(false)
    }
  }

  const exportDisabled =
    exporting || (!options.connections && !options.comparisons && !options.settings)

  return (
    <BaseDialog
      analyticsId="export_environment"
      title={t('environmentImportExport.exportTitle')}
      icon={<PackageOpen size={16} />}
      onClose={onClose}
      maxWidth="30rem"
      zIndex={120}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={exporting}>
            {t('environmentImportExport.cancel')}
          </Button>
          <Button variant="primary" onClick={handleExport} disabled={exportDisabled} autoFocus>
            {exporting
              ? t('environmentImportExport.exporting')
              : t('environmentImportExport.export')}
          </Button>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <p className="export-env-dialog__description">
          {t('environmentImportExport.exportDescription')}
        </p>
        <div className="export-env-dialog__options">
          <label className="export-env-dialog__option">
            <input
              type="checkbox"
              checked={options.connections}
              onChange={() => toggle('connections')}
            />
            <span>{t('environmentImportExport.exportConnections')}</span>
          </label>
          <label className="export-env-dialog__option">
            <input
              type="checkbox"
              checked={options.comparisons}
              onChange={() => toggle('comparisons')}
            />
            <span>{t('environmentImportExport.exportComparisons')}</span>
          </label>
          <label
            className={`export-env-dialog__option export-env-dialog__option--sub${!passwordsEnabled ? ' export-env-dialog__option--disabled' : ''}`}
          >
            <input
              type="checkbox"
              checked={options.passwords}
              disabled={!passwordsEnabled}
              onChange={() => toggle('passwords')}
            />
            <span>
              {t('environmentImportExport.exportPasswords')}
              <span className="export-env-dialog__option-hint">
                {t('environmentImportExport.exportPasswordsHint')}
              </span>
            </span>
          </label>
          <label className="export-env-dialog__option">
            <input
              type="checkbox"
              checked={options.settings}
              onChange={() => toggle('settings')}
            />
            <span>{t('environmentImportExport.exportSettings')}</span>
          </label>
        </div>
      </div>
    </BaseDialog>
  )
}
