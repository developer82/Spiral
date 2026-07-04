import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import Button from '../../../../components/Button/Button'
import type { DraftDocument } from '../../../../../../preload/index.d'
import './RestoreRecoveredDocumentsDialog.css'

interface RestoreRecoveredDocumentsDialogProps {
  drafts: DraftDocument[]
  onRestore: (selected: DraftDocument[]) => void
  onDiscard: () => void
}

/** Display label for a draft: the file basename when file-backed, else its title. */
function draftLabel(draft: DraftDocument): string {
  if (draft.filePath) {
    return draft.filePath.split(/[\\/]/).pop() ?? draft.filePath
  }
  return draft.title
}

function RestoreRecoveredDocumentsDialog({
  drafts,
  onRestore,
  onDiscard
}: RestoreRecoveredDocumentsDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  // All drafts are selected by default.
  const [selected, setSelected] = useState<Set<string>>(() => new Set(drafts.map((d) => d.draftId)))

  function toggle(draftId: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(draftId)) next.delete(draftId)
      else next.add(draftId)
      return next
    })
  }

  function handleRestore(): void {
    onRestore(drafts.filter((d) => selected.has(d.draftId)))
  }

  return (
    <BaseDialog
      title={t('explorer.restoreRecovered.dialogTitle')}
      onClose={onDiscard}
      maxWidth="30rem"
      analyticsId="restore_recovered_documents"
      footerSpaceBetween
      footer={
        <>
          <div className="dialog__footer-left">
            <Button variant="ghost" onClick={onDiscard}>
              {t('explorer.restoreRecovered.discardButton')}
            </Button>
          </div>
          <div className="dialog__footer-right">
            <Button variant="primary" onClick={handleRestore} disabled={selected.size === 0}>
              {t('explorer.restoreRecovered.restoreButton', { count: selected.size })}
            </Button>
          </div>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <p className="restore-recovered__message">
          {t('explorer.restoreRecovered.message', { count: drafts.length })}
        </p>
        <ul className="restore-recovered__list">
          {drafts.map((draft) => (
            <li key={draft.draftId} className="restore-recovered__item">
              <label className="restore-recovered__label">
                <input
                  type="checkbox"
                  className="restore-recovered__checkbox"
                  checked={selected.has(draft.draftId)}
                  onChange={() => toggle(draft.draftId)}
                />
                <span className="restore-recovered__name">{draftLabel(draft)}</span>
                <span className="restore-recovered__hint">
                  {t('explorer.restoreRecovered.unsavedHint')}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </BaseDialog>
  )
}

export default RestoreRecoveredDocumentsDialog
