import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TrackedEventType } from './profiler.types'
import BaseDialog from '../../components/BaseDialog/BaseDialog'
import Button from '../../components/Button/Button'
import './StartProfilingDialog.css'

interface StartProfilingDialogProps {
  connectionName: string
  databaseName: string
  onStart: (trackedEvents: TrackedEventType[]) => void
  onClose: () => void
}

const ALL_EVENT_TYPES: TrackedEventType[] = [
  'sql-statement',
  'blocked-query',
  'session-login',
  'session-logout',
  'error'
]

function StartProfilingDialog({
  connectionName,
  databaseName,
  onStart,
  onClose
}: StartProfilingDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const [checked, setChecked] = useState<Set<TrackedEventType>>(new Set(ALL_EVENT_TYPES))

  function toggle(type: TrackedEventType): void {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  function handleStart(): void {
    const selected = ALL_EVENT_TYPES.filter((t) => checked.has(t))
    if (selected.length === 0) return
    onStart(selected)
  }

  return (
    <BaseDialog
      analyticsId="start_profiling"
      title={t('profiler.startDialog.title')}
      onClose={onClose}
      maxWidth="30rem"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('profiler.startDialog.cancel')}
          </Button>
          <Button variant="primary" onClick={handleStart} disabled={checked.size === 0}>
            {t('profiler.startDialog.start')}
          </Button>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <p className="profiler-dialog__subtitle">
          {connectionName} / {databaseName}
        </p>
        <div>
          <p className="profiler-dialog__section-label">
            {t('profiler.startDialog.eventsTitle')}
          </p>
          <div className="profiler-dialog__events">
            {ALL_EVENT_TYPES.map((type) => (
              <label key={type} className="profiler-dialog__event-row">
                <input
                  type="checkbox"
                  className="profiler-dialog__checkbox"
                  checked={checked.has(type)}
                  onChange={() => toggle(type)}
                />
                <span className="profiler-dialog__event-label">
                  {t(
                    `profiler.eventTypes.${type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`
                  )}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </BaseDialog>
  )
}

export default StartProfilingDialog
