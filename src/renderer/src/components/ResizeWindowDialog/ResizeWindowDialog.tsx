import { useState } from 'react'
import { Scaling } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import SizeSelector, { type Dimensions } from '../SizeSelector/SizeSelector'
import './ResizeWindowDialog.css'

interface ResizeWindowDialogProps {
  open: boolean
  currentWidth: number
  currentHeight: number
  onResize: (width: number, height: number) => void
  onCancel: () => void
}

export default function ResizeWindowDialog({
  open,
  currentWidth,
  currentHeight,
  onResize,
  onCancel
}: ResizeWindowDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [dimensions, setDimensions] = useState<Dimensions | null>(null)

  if (!open) return null

  function handleResize(): void {
    if (!dimensions) return
    onResize(dimensions.width, dimensions.height)
  }

  return (
    <BaseDialog
      title={t('resizeWindowDialog.title')}
      icon={<Scaling size={16} />}
      onClose={onCancel}
      maxWidth="520px"
      zIndex={200}
      analyticsId="resize_window"
      footerSpaceBetween
      footer={
        <>
          <span className="resize-window-dialog__output">
            {dimensions ? `${dimensions.width} × ${dimensions.height}` : '—'}
          </span>
          <div className="dialog__footer-right">
            <Button variant="ghost" onClick={onCancel}>
              {t('resizeWindowDialog.cancel')}
            </Button>
            <Button variant="primary" onClick={handleResize} disabled={!dimensions}>
              {t('resizeWindowDialog.resize')}
            </Button>
          </div>
        </>
      }
    >
      <div className="dialog__scroll-area">
        <SizeSelector
          currentWidth={currentWidth}
          currentHeight={currentHeight}
          onChange={setDimensions}
        />
      </div>
    </BaseDialog>
  )
}
