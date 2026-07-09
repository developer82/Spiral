import { useEffect, useState } from 'react'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import SizeSelector, { type Dimensions } from '../SizeSelector/SizeSelector'
import { composeScreenshotWithTrafficLights } from './trafficLights'
import './TakeScreenshotDialog.css'

export interface ScreenshotPreview {
  dataUrl: string
  width: number
  height: number
}

interface TakeScreenshotDialogProps {
  open: boolean
  preview: ScreenshotPreview | null
  /**
   * When true, paint artificial macOS traffic-light buttons onto the preview so
   * it matches the saved screenshot. Set on macOS with a custom (hidden) title
   * bar, where the native buttons aren't captured. See {@link trafficLights}.
   */
  showTrafficLights?: boolean
  onConfirm: (width: number, height: number) => void
  onCancel: () => void
}

export default function TakeScreenshotDialog({
  open,
  preview,
  showTrafficLights = false,
  onConfirm,
  onCancel
}: TakeScreenshotDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [dimensions, setDimensions] = useState<Dimensions | null>(null)
  // Mirror the platform-specific accelerator handled in TopBar.
  const screenshotShortcut = window.api.platform === 'darwin' ? 'Cmd+Shift+T' : 'Ctrl+Shift+T'
  // The preview image to display: either the raw capture or, on macOS, the
  // capture with artificial traffic lights composited on top.
  const [displayUrl, setDisplayUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!preview) {
      setDisplayUrl(null)
      return
    }
    if (!showTrafficLights) {
      setDisplayUrl(preview.dataUrl)
      return
    }
    let active = true
    void composeScreenshotWithTrafficLights(preview.dataUrl, preview.width).then((url) => {
      if (active) setDisplayUrl(url)
    })
    return () => {
      active = false
    }
  }, [preview, showTrafficLights])

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
            src={displayUrl ?? preview.dataUrl}
            alt={t('takeScreenshotDialog.preview')}
            className="take-screenshot-dialog__preview-img"
          />
        </div>

        <p className="take-screenshot-dialog__shortcut-hint">
          {t('takeScreenshotDialog.shortcutHint', { shortcut: screenshotShortcut })}
        </p>

        <SizeSelector
          currentWidth={preview.width}
          currentHeight={preview.height}
          onChange={setDimensions}
        />
      </div>
    </BaseDialog>
  )
}
