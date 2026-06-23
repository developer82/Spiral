import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import './ToolbarButton.css'
import { useSettings } from '../../pages/Settings/useSettings'
import { trackEvent } from '../../analytics/track'

interface ToolbarButtonProps {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  active?: boolean
  disabled?: boolean
  tooltip?: string
  className?: string
  /** Stable slug; when set, clicks fire a `button_click` analytics event. */
  analyticsId?: string
}

interface TooltipPos {
  x: number
  y: number
}

export function ToolbarSeparator(): React.JSX.Element {
  return <div className="toolbar-btn__separator" />
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  tooltip,
  className,
  analyticsId
}: ToolbarButtonProps): React.JSX.Element {
  const { settings } = useSettings()
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null)

  const handleClick = useCallback(() => {
    if (analyticsId) trackEvent('button_click', { button: analyticsId })
    onClick?.()
  }, [analyticsId, onClick])

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!tooltip) return
      const rect = e.currentTarget.getBoundingClientRect()
      setTooltipPos({
        x: rect.left + rect.width / 2,
        y: rect.bottom + 6
      })
    },
    [tooltip]
  )

  const handleMouseLeave = useCallback(() => {
    setTooltipPos(null)
  }, [])

  let cls = 'toolbar-btn'
  if (active) cls += ' toolbar-btn--active'
  if (className) cls += ` ${className}`

  return (
    <>
      <button
        className={cls}
        title={tooltip}
        onClick={handleClick}
        disabled={disabled}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {icon}
        {settings.showToolbarTextButtons && <span>{label}</span>}
      </button>
      {tooltip &&
        tooltipPos &&
        createPortal(
          <div className="toolbar-btn__tooltip" style={{ left: tooltipPos.x, top: tooltipPos.y }}>
            {tooltip}
          </div>,
          document.body
        )}
    </>
  )
}

export default ToolbarButton
