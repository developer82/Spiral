import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Download, Loader, XCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import {
  dispatchConnectionsUpdated,
  dispatchComparisonsUpdated
} from '../../events/connectionEvents'
import './ImportEnvironmentDialog.css'

type ImportPhase = 'waiting' | 'importing' | 'done' | 'error'

interface StepItem {
  key: string
  label: string
  done: boolean
}

interface ImportResult {
  connectionsImported?: number
  comparisonsImported?: number
  settingsImported?: boolean
  error?: string
}

interface ImportEnvironmentDialogProps {
  onClose: () => void
  onSettingsImported?: () => void
}

export default function ImportEnvironmentDialog({
  onClose,
  onSettingsImported
}: ImportEnvironmentDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<ImportPhase>('waiting')
  const [steps, setSteps] = useState<StepItem[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const closedRef = useRef(false)

  useEffect(() => {
    const unsubProgress = window.api.environment.onImportProgress((progress) => {
      setPhase('importing')
      const label = stepLabel(progress.step, t)
      setSteps((prev) => {
        const already = prev.findIndex((s) => s.key === progress.step)
        if (already >= 0) return prev
        const updated = prev.map((s) => ({ ...s, done: true }))
        return [...updated, { key: progress.step, label, done: false }]
      })
    })

    window.api.environment
      .import()
      .then((res) => {
        unsubProgress()
        if (closedRef.current) return

        if ('cancelled' in res) {
          onClose()
          return
        }

        if ('error' in res) {
          setPhase('error')
          setResult({ error: res.error })
          return
        }

        setSteps((prev) => prev.map((s) => ({ ...s, done: true })))
        setPhase('done')
        setResult({
          connectionsImported: res.connectionsImported,
          comparisonsImported: res.comparisonsImported,
          settingsImported: res.settingsImported
        })

        if (res.connectionsImported > 0) dispatchConnectionsUpdated()
        if (res.comparisonsImported > 0) dispatchComparisonsUpdated()
        if (res.settingsImported) onSettingsImported?.()
      })
      .catch((err: unknown) => {
        unsubProgress()
        if (closedRef.current) return
        setPhase('error')
        setResult({ error: err instanceof Error ? err.message : 'Unknown error' })
      })

    return () => {
      unsubProgress()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleClose(): void {
    closedRef.current = true
    onClose()
  }

  const isFinished = phase === 'done' || phase === 'error'

  const phaseIcon =
    phase === 'done' ? (
      <CheckCircle size={16} style={{ color: '#4ade80' }} />
    ) : phase === 'error' ? (
      <XCircle size={16} style={{ color: '#f87171' }} />
    ) : (
      <Download size={16} />
    )

  return (
    <BaseDialog
      title={t('environmentImportExport.importTitle')}
      icon={phaseIcon}
      onClose={isFinished ? handleClose : undefined}
      maxWidth="28rem"
      zIndex={120}
      footer={
        isFinished ? (
          <Button variant="primary" onClick={handleClose} autoFocus>
            {t('environmentImportExport.close')}
          </Button>
        ) : undefined
      }
    >
      <div className="import-env-dialog__body">
        {phase === 'waiting' && (
          <div className="import-env-dialog__waiting">
            <span className="import-env-dialog__spinner">
              <Loader size={16} />
            </span>
            <span>{t('environmentImportExport.importWaiting')}</span>
          </div>
        )}

        {(phase === 'importing' || phase === 'done') && steps.length > 0 && (
          <ul className="import-env-dialog__steps">
            {steps.map((step) => (
              <li
                key={step.key}
                className={`import-env-dialog__step${step.done ? ' import-env-dialog__step--done' : ''}`}
              >
                <span className="import-env-dialog__step-icon">
                  {step.done ? (
                    <CheckCircle size={13} />
                  ) : (
                    <span className="import-env-dialog__step-spinner">
                      <Loader size={13} />
                    </span>
                  )}
                </span>
                <span>{step.label}</span>
              </li>
            ))}
          </ul>
        )}

        {phase === 'done' && result && (
          <div className="import-env-dialog__success">
            <p className="import-env-dialog__success-message">
              {t('environmentImportExport.importSuccess')}
            </p>
            <ul className="import-env-dialog__summary">
              {(result.connectionsImported ?? 0) > 0 && (
                <li>
                  {t('environmentImportExport.importSuccessConnections', {
                    count: result.connectionsImported
                  })}
                </li>
              )}
              {(result.comparisonsImported ?? 0) > 0 && (
                <li>
                  {t('environmentImportExport.importSuccessComparisons', {
                    count: result.comparisonsImported
                  })}
                </li>
              )}
              {result.settingsImported && (
                <li>{t('environmentImportExport.importSuccessSettings')}</li>
              )}
            </ul>
          </div>
        )}

        {phase === 'error' && result && (
          <div className="import-env-dialog__error">
            <p className="import-env-dialog__error-title">
              {t('environmentImportExport.importError')}
            </p>
            <p className="import-env-dialog__error-message">{result.error}</p>
          </div>
        )}
      </div>
    </BaseDialog>
  )
}

function stepLabel(step: string, t: (key: string) => string): string {
  switch (step) {
    case 'validating':
      return t('environmentImportExport.importValidating')
    case 'connections':
      return t('environmentImportExport.importConnections')
    case 'comparisons':
      return t('environmentImportExport.importComparisons')
    case 'settings':
      return t('environmentImportExport.importSettings')
    default:
      return step
  }
}
