import { useEffect, type ReactNode, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useDraggableDialog } from '../../hooks/useDraggableDialog'
import { trackEvent } from '../../analytics/track'
import '../../styles/dialog.css'

interface BaseDialogProps {
  title: string
  icon?: ReactNode
  onClose?: () => void
  closeDisabled?: boolean
  maxWidth?: string
  maxHeight?: string
  width?: string
  minWidth?: string
  height?: string
  minHeight?: string
  zIndex?: number
  footer?: ReactNode
  footerSpaceBetween?: boolean
  ariaLabel?: string
  /** Stable slug used to track dialog opens (e.g. "new_connection"). */
  analyticsId?: string
  children: ReactNode
}

export default function BaseDialog({
  title,
  icon,
  onClose,
  closeDisabled = false,
  maxWidth,
  maxHeight,
  width,
  minWidth,
  height,
  minHeight,
  zIndex,
  footer,
  footerSpaceBetween = false,
  ariaLabel,
  analyticsId,
  children
}: BaseDialogProps): React.JSX.Element {
  const { dragHandleProps, panelRef } = useDraggableDialog()

  useEffect(() => {
    if (analyticsId) trackEvent('dialog_open', { dialog: analyticsId })
  }, [analyticsId])

  useEffect(() => {
    if (!onClose) return
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && !closeDisabled) onClose!()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose, closeDisabled])

  function handleOverlayMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target === e.currentTarget && onClose && !closeDisabled) onClose()
  }

  const panelStyle: CSSProperties = {}
  if (maxWidth) panelStyle.maxWidth = maxWidth
  if (maxHeight) panelStyle.maxHeight = maxHeight
  if (width) panelStyle.width = width
  if (minWidth) panelStyle.minWidth = minWidth
  if (height) panelStyle.height = height
  if (minHeight) panelStyle.minHeight = minHeight

  const overlayStyle: CSSProperties = {}
  if (zIndex !== undefined) overlayStyle.zIndex = zIndex

  return createPortal(
    <div
      className="dialog"
      style={overlayStyle}
      onMouseDown={handleOverlayMouseDown}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
    >
      <div className="dialog__panel" ref={panelRef} style={panelStyle}>
        <div className="dialog__header" {...dragHandleProps}>
          <div className="dialog__header-left">
            {icon && <span className="dialog__header-icon">{icon}</span>}
            <h2 className="dialog__title">{title}</h2>
          </div>
          {onClose && (
            <button
              type="button"
              className="dialog__close"
              onClick={onClose}
              disabled={closeDisabled}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="dialog__body">{children}</div>

        {footer && (
          <div
            className={
              footerSpaceBetween ? 'dialog__footer dialog__footer--space-between' : 'dialog__footer'
            }
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
