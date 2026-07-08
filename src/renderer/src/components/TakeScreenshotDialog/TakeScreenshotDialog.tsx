import { useMemo, useState } from 'react'
import { Camera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import { TextField } from '../Field'
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

/** Fixed pixel sizes offered as quick presets. */
const COMMON_SIZES: Array<{ width: number; height: number }> = [
  { width: 1920, height: 1080 },
  { width: 1280, height: 720 },
  { width: 1280, height: 768 },
  { width: 1024, height: 768 },
  { width: 800, height: 600 }
]

/** Screen aspect ratios; height is derived from the current window width. */
const ASPECT_RATIOS: Array<{ label: string; w: number; h: number }> = [
  { label: '16:9', w: 16, h: 9 },
  { label: '4:3', w: 4, h: 3 },
  { label: '3:2', w: 3, h: 2 },
  { label: '1:1', w: 1, h: 1 },
  { label: '16:10', w: 16, h: 10 }
]

const MIN_DIMENSION = 100
const MAX_DIMENSION = 8000

/** Clamp a parsed custom dimension, returning null when it is not usable. */
function parseDimension(value: string): number | null {
  const n = Number(value)
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null
  if (n < MIN_DIMENSION || n > MAX_DIMENSION) return null
  return n
}

export default function TakeScreenshotDialog({
  open,
  preview,
  onConfirm,
  onCancel
}: TakeScreenshotDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()
  const [selected, setSelected] = useState('current')
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')

  // Resolve the currently selected option to concrete output dimensions, or
  // null when the selection is incomplete/invalid (custom out of range).
  const dimensions = useMemo<{ width: number; height: number } | null>(() => {
    if (!preview) return null
    if (selected === 'current') {
      return { width: preview.width, height: preview.height }
    }
    if (selected === 'custom') {
      const width = parseDimension(customWidth)
      const height = parseDimension(customHeight)
      if (width === null || height === null) return null
      return { width, height }
    }
    if (selected.startsWith('size:')) {
      const [w, h] = selected.slice(5).split('x').map(Number)
      return { width: w, height: h }
    }
    if (selected.startsWith('ratio:')) {
      const ratio = ASPECT_RATIOS.find((r) => r.label === selected.slice(6))
      if (!ratio) return null
      return {
        width: preview.width,
        height: Math.round((preview.width * ratio.h) / ratio.w)
      }
    }
    return null
  }, [selected, customWidth, customHeight, preview])

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
            {dimensions
              ? `${dimensions.width} × ${dimensions.height}`
              : '—'}
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

        {/* Size presets */}
        <div className="take-screenshot-dialog__section">
          <span className="take-screenshot-dialog__section-label">
            {t('takeScreenshotDialog.size')}
          </span>
          <div className="take-screenshot-dialog__options">
            <button
              type="button"
              className={`take-screenshot-dialog__option${selected === 'current' ? ' take-screenshot-dialog__option--active' : ''}`}
              onClick={() => setSelected('current')}
            >
              <span>{t('takeScreenshotDialog.current')}</span>
              <span className="take-screenshot-dialog__option-dims">
                {preview.width} × {preview.height}
              </span>
            </button>
            {COMMON_SIZES.map((size) => {
              const id = `size:${size.width}x${size.height}`
              return (
                <button
                  key={id}
                  type="button"
                  className={`take-screenshot-dialog__option${selected === id ? ' take-screenshot-dialog__option--active' : ''}`}
                  onClick={() => setSelected(id)}
                >
                  <span>
                    {size.width} × {size.height}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Aspect ratios */}
        <div className="take-screenshot-dialog__section">
          <span className="take-screenshot-dialog__section-label">
            {t('takeScreenshotDialog.aspectRatio')}
          </span>
          <div className="take-screenshot-dialog__options">
            {ASPECT_RATIOS.map((ratio) => {
              const id = `ratio:${ratio.label}`
              const height = Math.round((preview.width * ratio.h) / ratio.w)
              return (
                <button
                  key={id}
                  type="button"
                  className={`take-screenshot-dialog__option${selected === id ? ' take-screenshot-dialog__option--active' : ''}`}
                  onClick={() => setSelected(id)}
                >
                  <span>{ratio.label}</span>
                  <span className="take-screenshot-dialog__option-dims">
                    {preview.width} × {height}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom */}
        <div className="take-screenshot-dialog__section">
          <span className="take-screenshot-dialog__section-label">
            {t('takeScreenshotDialog.custom')}
          </span>
          <div className="take-screenshot-dialog__options">
            <button
              type="button"
              className={`take-screenshot-dialog__option${selected === 'custom' ? ' take-screenshot-dialog__option--active' : ''}`}
              onClick={() => setSelected('custom')}
            >
              <span>{t('takeScreenshotDialog.custom')}</span>
            </button>
          </div>
          {selected === 'custom' && (
            <div className="take-screenshot-dialog__custom-row">
              <TextField
                type="number"
                min={MIN_DIMENSION}
                max={MAX_DIMENSION}
                value={customWidth}
                onChange={setCustomWidth}
                clearable={false}
                error={customWidth !== '' && parseDimension(customWidth) === null}
                ariaLabel={t('takeScreenshotDialog.width')}
                placeholder={t('takeScreenshotDialog.width')}
                className="take-screenshot-dialog__custom-field"
              />
              <span className="take-screenshot-dialog__custom-sep">×</span>
              <TextField
                type="number"
                min={MIN_DIMENSION}
                max={MAX_DIMENSION}
                value={customHeight}
                onChange={setCustomHeight}
                clearable={false}
                error={customHeight !== '' && parseDimension(customHeight) === null}
                ariaLabel={t('takeScreenshotDialog.height')}
                placeholder={t('takeScreenshotDialog.height')}
                className="take-screenshot-dialog__custom-field"
              />
            </div>
          )}
        </div>
      </div>
    </BaseDialog>
  )
}
