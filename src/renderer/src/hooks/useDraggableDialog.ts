import { useRef, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'

export interface UseDraggableDialogReturn {
  panelRef: (el: HTMLDivElement | null) => void
  dragHandleProps: {
    onPointerDown: (e: React.PointerEvent) => void
    style: CSSProperties
  }
}

/** Minimum pixels of the panel top bar that must stay inside the viewport after dragging. */
const MIN_VISIBLE_TOP_PX = 80

/**
 * Provides drag-to-reposition behaviour for a dialog panel.
 *
 * On pointerdown the pointer is captured to the header element and native
 * pointermove / pointerup listeners are added directly to that element.
 * This bypasses both React's synthetic-event delegation and document-level
 * listeners, giving guaranteed event delivery via the browser's pointer-
 * capture mechanism.  Position is written straight to the DOM — no React
 * state — so repaints are immediate.
 *
 * Usage:
 *   const { panelRef, dragHandleProps } = useDraggableDialog()
 *   <div className="…__panel" ref={panelRef}>
 *     <div className="…__header" {...dragHandleProps}>
 */
export function useDraggableDialog(): UseDraggableDialogReturn {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const positionRef = useRef({ x: 0, y: 0 })
  const cleanupRef = useRef<(() => void) | null>(null)

  // If the dialog unmounts while a drag is in progress, clean up body styles
  // and remove any dangling listeners.
  useEffect(() => {
    return () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      cleanupRef.current?.()
    }
  }, [])

  const panelRef = useCallback((el: HTMLDivElement | null) => {
    elementRef.current = el
    if (el) {
      // Use relative positioning + left/top instead of transform, so that the
      // backdrop-filter composited layer does not interfere with movement.
      el.style.position = 'relative'
      el.style.left = `${positionRef.current.x}px`
      el.style.top = `${positionRef.current.y}px`
    }
  }, [])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return

    // Don't capture the pointer if the user clicked an interactive element
    // (button, link, input …) inside the header — let those handle their own events.
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea')) return

    const panel = elementRef.current
    if (!panel) return

    // Capture the pointer on the header element so all subsequent pointermove
    // and pointerup events are delivered here — even if the cursor leaves the
    // element.  We then attach native listeners directly on the element rather
    // than on document, so React's event delegation cannot interfere.
    const target = e.currentTarget as HTMLElement
    target.setPointerCapture(e.pointerId)

    let lastX = e.clientX
    let lastY = e.clientY

    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    const overlay = panel.parentElement
    if (overlay) {
      overlay.style.backdropFilter = 'blur(0px)'
      overlay.style.setProperty('-webkit-backdrop-filter', 'blur(0px)')
    }

    const onMove = (ev: PointerEvent): void => {
      const dx = ev.clientX - lastX
      const dy = ev.clientY - lastY
      lastX = ev.clientX
      lastY = ev.clientY

      positionRef.current.x += dx
      positionRef.current.y += dy

      const minY = -(window.innerHeight / 2 - MIN_VISIBLE_TOP_PX)
      if (positionRef.current.y < minY) positionRef.current.y = minY

      panel.style.left = `${positionRef.current.x}px`
      panel.style.top = `${positionRef.current.y}px`
    }

    const cleanup = (): void => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      if (overlay) {
        overlay.style.backdropFilter = ''
        overlay.style.removeProperty('-webkit-backdrop-filter')
      }
      target.removeEventListener('pointermove', onMove)
      target.removeEventListener('pointerup', cleanup)
      target.removeEventListener('pointercancel', cleanup)
      cleanupRef.current = null
    }

    cleanupRef.current = cleanup
    target.addEventListener('pointermove', onMove)
    target.addEventListener('pointerup', cleanup)
    target.addEventListener('pointercancel', cleanup)
  }, [])

  return {
    panelRef,
    dragHandleProps: {
      onPointerDown: handlePointerDown,
      style: { cursor: 'grab', userSelect: 'none', WebkitUserSelect: 'none' },
    },
  }
}
