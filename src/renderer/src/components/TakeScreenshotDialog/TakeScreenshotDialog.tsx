import { useState } from 'react'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import SizeSelector, { type Dimensions } from '../SizeSelector/SizeSelector'
import './TakeScreenshotDialog.css'

export interface ScreenshotPreview {
  dataUrl: string
  width: number
  height: number
}

interface TakeScreenshotDialogProps {
  open: boolean
  preview: ScreenshotPreview | null
  onConfirm: (width: number, height: number) => void
  onCancel: () => void
}

export default function TakeScreenshotDialog({
  open,
  preview,
  onConfirm,
  onCancel
}: TakeScreenshotDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [dimensions, setDimensions] = useState<Dimensions | null>(null)

  if (!open || !preview) return null

  function handleCapture(): void {
    if (!dimensions) return
    onConfirm(dimensions.width, dimensions.height)
  }

  return (
    <BaseDialog
      title={t('takeScreenshotDialog.title')}
      icon={<Camera size={16} />}
      onClose={onCancel}
      maxWidth="520px"
      zIndex={200}
      analyticsId="take_screenshot"
      footerSpaceBetween
      footer={
        <>
          <span className="take-screenshot-dialog__output">
            {dimensions ? `${dimensions.width} × ${dimensions.height}` : '—'}
          </span>
          <div className="dialog__footer-right">
            <Button variant="ghost" onClick={onCancel}>
              {t('takeScreenshotDialog.cancel')}
            </Button>
            <Button variant="primary" onClick={handleCapture} disabled={!dimensions}>
              {t('takeScreenshotDialog.capture')}
            </Button>
          </div>
        </>
      }
    >
      <div className="dialog__scroll-area">
        {/* Preview */}
        <div className="take-screenshot-dialog__preview">
          <img
            src={preview.dataUrl}
            alt={t('takeScreenshotDialog.preview')}
            className="take-screenshot-dialog__preview-img"
          />
        </div>

        <SizeSelector
          currentWidth={preview.width}
          currentHeight={preview.height}
          onChange={setDimensions}
        />
      </div>
    </BaseDialog>
  )
}
