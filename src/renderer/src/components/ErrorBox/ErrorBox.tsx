import { type JSX, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './ErrorBox.css'

interface ErrorBoxProps {
  error: string
  statement?: string
}

interface ContextMenuState {
  x: number
  y: number
}

export default function ErrorBox({ error, statement }: ErrorBoxProps): JSX.Element {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  const handleCopy = useCallback(() => {
    const selection = window.getSelection()
    const selectedText = selection?.toString() ?? ''

    if (selectedText.length > 0) {
      navigator.clipboard.writeText(selectedText)
    } else {
      const fullText = statement ? `Error: ${error}\n\n${statement}` : `Error: ${error}`
      navigator.clipboard.writeText(fullText)
    }

    setContextMenu(null)
  }, [error, statement])

  const menuRef = useRef<HTMLUListElement | null>(null)

  const closeMenu = useCallback(() => setContextMenu(null), [])

  useEffect(() => {
    if (!contextMenu) return
    const handleClickOutside = (e: MouseEvent) => {
      const insideMenu = menuRef.current?.contains(e.target as Node) ?? false
      if (!insideMenu) {
        closeMenu()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [contextMenu, closeMenu])

  return (
    <div
      ref={containerRef}
      className="error-box"
      role="alert"
      onContextMenu={handleContextMenu}
    >
      <div className="error-box__message">
        <span className="error-box__label">Error:</span>
        <span>{error}</span>
      </div>
      {statement && (
        <pre className="error-box__statement">{statement}</pre>
      )}
      {contextMenu && createPortal(
        <ul
          ref={menuRef}
          className="error-box__context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
        >
          <li role="menuitem" onMouseDown={handleCopy}>Copy</li>
        </ul>,
        document.body
      )}
    </div>
  )
}
