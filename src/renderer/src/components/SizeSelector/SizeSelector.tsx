import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { TextField } from '../Field'
import {
  ASPECT_RATIOS,
  COMMON_SIZES,
  MAX_DIMENSION,
  MIN_DIMENSION,
  parseDimension,
  type Dimensions
} from './sizeOptions'
import './SizeSelector.css'

export type { Dimensions } from './sizeOptions'

interface SizeSelectorProps {
  /** Base size used for the "Current" preset and aspect-ratio height derivation. */
  currentWidth: number
  currentHeight: number
  /** Fires whenever the resolved dimensions change (null = incomplete/invalid custom). */
  onChange: (dims: Dimensions | null) => void
}

export default function SizeSelector({
  currentWidth,
  currentHeight,
  onChange
}: SizeSelectorProps): React.JSX.Element {
  const { t } = useTranslation()
  const [selected, setSelected] = useState('current')
  const [customWidth, setCustomWidth] = useState('')
  const [customHeight, setCustomHeight] = useState('')

  // Resolve the currently selected option to concrete output dimensions, or
  // null when the selection is incomplete/invalid (custom out of range).
  const dimensions = useMemo<Dimensions | null>(() => {
    if (selected === 'current') {
      return { width: currentWidth, height: currentHeight }
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
        width: currentWidth,
        height: Math.round((currentWidth * ratio.h) / ratio.w)
      }
    }
    return null
  }, [selected, customWidth, customHeight, currentWidth, currentHeight])

  // Keep the parent in sync with the resolved dimensions. Consumers pass a
  // stable setter, so this only fires when the dimensions actually change.
  useEffect(() => {
    onChange(dimensions)
  }, [dimensions, onChange])

  return (
    <>
      {/* Size presets */}
      <div className="size-selector__section">
        <span className="size-selector__section-label">{t('sizeSelector.size')}</span>
        <div className="size-selector__options">
          <button
            type="button"
            className={`size-selector__option${selected === 'current' ? ' size-selector__option--active' : ''}`}
            onClick={() => setSelected('current')}
          >
            <span>{t('sizeSelector.current')}</span>
            <span className="size-selector__option-dims">
              {currentWidth} × {currentHeight}
            </span>
          </button>
          {COMMON_SIZES.map((size) => {
            const id = `size:${size.width}x${size.height}`
            return (
              <button
                key={id}
                type="button"
                className={`size-selector__option${selected === id ? ' size-selector__option--active' : ''}`}
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
      <div className="size-selector__section">
        <span className="size-selector__section-label">{t('sizeSelector.aspectRatio')}</span>
        <div className="size-selector__options">
          {ASPECT_RATIOS.map((ratio) => {
            const id = `ratio:${ratio.label}`
            const height = Math.round((currentWidth * ratio.h) / ratio.w)
            return (
              <button
                key={id}
                type="button"
                className={`size-selector__option${selected === id ? ' size-selector__option--active' : ''}`}
                onClick={() => setSelected(id)}
              >
                <span>{ratio.label}</span>
                <span className="size-selector__option-dims">
                  {currentWidth} × {height}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Custom */}
      <div className="size-selector__section">
        <span className="size-selector__section-label">{t('sizeSelector.custom')}</span>
        <div className="size-selector__options">
          <button
            type="button"
            className={`size-selector__option${selected === 'custom' ? ' size-selector__option--active' : ''}`}
            onClick={() => setSelected('custom')}
          >
            <span>{t('sizeSelector.custom')}</span>
          </button>
        </div>
        {selected === 'custom' && (
          <div className="size-selector__custom-row">
            <TextField
              type="number"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={customWidth}
              onChange={setCustomWidth}
              clearable={false}
              error={customWidth !== '' && parseDimension(customWidth) === null}
              ariaLabel={t('sizeSelector.width')}
              placeholder={t('sizeSelector.width')}
              className="size-selector__custom-field"
            />
            <span className="size-selector__custom-sep">×</span>
            <TextField
              type="number"
              min={MIN_DIMENSION}
              max={MAX_DIMENSION}
              value={customHeight}
              onChange={setCustomHeight}
              clearable={false}
              error={customHeight !== '' && parseDimension(customHeight) === null}
              ariaLabel={t('sizeSelector.height')}
              placeholder={t('sizeSelector.height')}
              className="size-selector__custom-field"
            />
          </div>
        )}
      </div>
    </>
  )
}
