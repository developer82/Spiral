import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight } from 'lucide-react'
import './Menu.css'

export interface MenuItem {
  id: string
  label?: string
  icon?: React.ReactNode
  disabled?: boolean
  separator?: true
  shortcut?: string
  onClick?: () => void
  items?: MenuItem[]
}

export interface MenuPosition {
  x: number
  y: number
}

export interface MenuProps {
  items: MenuItem[]
  position: MenuPosition | null
  onClose: () => void
  onNavigatePrev?: () => void
  onNavigateNext?: () => void
}

interface InternalMenuProps {
  items: MenuItem[]
  position: MenuPosition
  onClose: () => void
  nested?: boolean
  onNavigatePrev?: () => void
  onNavigateNext?: () => void
}

function InternalMenu({ items, position, onClose, nested = false, onNavigatePrev, onNavigateNext }: InternalMenuProps): React.JSX.Element {
  const menuRef = useRef<HTMLDivElement>(null)
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)
  const [openSubMenuIndex, setOpenSubMenuIndex] = useState<number | null>(null)
  const [clickingIndex, setClickingIndex] = useState<number>(-1)
  const [adjustedPos, setAdjustedPos] = useState(position)
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Adjust position to stay within viewport (top-level menus only)
  useEffect(() => {
    if (nested) return
    const el = menuRef.current
    if (!el) return
    const { innerWidth, innerHeight } = window
    const rect = el.getBoundingClientRect()
    let { x, y } = position
    if (x + rect.width > innerWidth) x = Math.max(0, innerWidth - rect.width - 4)
    if (y + rect.height > innerHeight) y = Math.max(0, innerHeight - rect.height - 4)
    setAdjustedPos({ x, y })
  }, [position, nested])

  // Focus the menu element so keyboard events fire
  useEffect(() => {
    menuRef.current?.focus()
  }, [])

  const handleItemMouseEnter = useCallback((index: number) => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
    setFocusedIndex(index)
    const item = items[index]
    if (item.items && item.items.length > 0) {
      setOpenSubMenuIndex(index)
    } else {
      setOpenSubMenuIndex(null)
    }
  }, [items])

  const handleItemMouseLeave = useCallback((index: number) => {
    const item = items[index]
    if (!item.items || item.items.length === 0) {
      setFocusedIndex(-1)
    }
    // delay closing sub-menu so cursor can move into it
    closeTimerRef.current = setTimeout(() => {
      setOpenSubMenuIndex(null)
    }, 120)
  }, [items])

  const handleSubMenuMouseEnter = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  function handleItemClick(item: MenuItem, index: number): void {
    if (item.disabled || item.separator) return
    if (item.items && item.items.length > 0) return // sub-menu parent, don't close
    setClickingIndex(index)
    setTimeout(() => {
      item.onClick?.()
      onClose()
    }, 200)
  }

  function getFocusableItems(): number[] {
    return items
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !item.separator && !item.disabled)
      .map(({ index }) => index)
  }

  function handleKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const focusable = getFocusableItems()
      if (focusable.length > 0 && focusedIndex >= 0) {
        const item = items[focusedIndex]
        if (item.items && item.items.length > 0) {
          if (nested) e.stopPropagation()
          setOpenSubMenuIndex(focusedIndex)
          return
        }
      }
      if (!nested) onNavigateNext?.()
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (nested) {
        e.stopPropagation()
        onClose()
      } else {
        onNavigatePrev?.()
      }
      return
    }

    const focusable = getFocusableItems()
    if (focusable.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const currentPos = focusable.indexOf(focusedIndex)
      const next = focusable[(currentPos + 1) % focusable.length]
      setFocusedIndex(next)
      setOpenSubMenuIndex(null)
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      const currentPos = focusable.indexOf(focusedIndex)
      const prev = focusable[(currentPos - 1 + focusable.length) % focusable.length]
      setFocusedIndex(prev)
      setOpenSubMenuIndex(null)
      return
    }

    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (focusedIndex >= 0) {
        const item = items[focusedIndex]
        if (item.items && item.items.length > 0) {
          setOpenSubMenuIndex(focusedIndex)
        } else {
          handleItemClick(item, focusedIndex)
        }
      }
      return
    }
  }

  // Initialise focus to first item
  useEffect(() => {
    if (!nested) {
      const focusable = getFocusableItems()
      if (focusable.length > 0) setFocusedIndex(-1)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={menuRef}
      className="menu"
      role="menu"
      tabIndex={-1}
      style={nested ? { position: 'static' } : { left: adjustedPos.x, top: adjustedPos.y }}
      onKeyDown={handleKeyDown}
      aria-label="Menu"
    >
      {items.map((item, index) => {
        if (item.separator) {
          return <div key={item.id} className="menu__separator" role="separator" />
        }

        const isFocused = focusedIndex === index
        const hasSubMenu = !!(item.items && item.items.length > 0)
        const isSubMenuOpen = openSubMenuIndex === index

        return (
          <div
            key={item.id}
            role="menuitem"
            aria-haspopup={hasSubMenu ? 'menu' : undefined}
            aria-expanded={hasSubMenu ? isSubMenuOpen : undefined}
            aria-disabled={item.disabled}
            className={[
              'menu__item',
              isFocused ? 'menu__item--focused' : '',
              item.disabled ? 'menu__item--disabled' : '',
              hasSubMenu ? 'menu__item--has-submenu' : '',
              clickingIndex === index ? 'menu__item--clicking' : ''
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleItemClick(item, index)}
            onMouseEnter={() => handleItemMouseEnter(index)}
            onMouseLeave={() => handleItemMouseLeave(index)}
          >
            {item.icon != null && (
              <span className="menu__item-icon" aria-hidden="true">
                {item.icon}
              </span>
            )}
            <span className="menu__item-label">{item.label}</span>
            {item.shortcut && (
              <span className="menu__item-shortcut">{item.shortcut}</span>
            )}
            {hasSubMenu && (
              <span className="menu__item-arrow" aria-hidden="true">
                <ChevronRight size={12} />
              </span>
            )}
            {hasSubMenu && isSubMenuOpen && (
              <div
                className="menu__submenu"
                onMouseEnter={handleSubMenuMouseEnter}
              >
                <InternalMenu
                  items={item.items!}
                  position={{ x: 0, y: 0 }}
                  onClose={onClose}
                  nested
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function Menu({ items, position, onClose, onNavigatePrev, onNavigateNext }: MenuProps): React.JSX.Element | null {
  // Close when clicking outside
  useEffect(() => {
    if (!position) return

    function handleMouseDown(e: MouseEvent): void {
      const target = e.target as HTMLElement
      // Don't close if the click is on an element that should manage its own
      // menu toggle (e.g. a trigger button that closes/opens on click)
      if (target.closest('[data-menu-trigger]')) return
      const menus = document.querySelectorAll('.menu')
      for (const menu of menus) {
        if (menu.contains(target)) return
      }
      onClose()
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [position, onClose])

  if (!position || items.length === 0) return null

  return createPortal(
    <InternalMenu items={items} position={position} onClose={onClose} onNavigatePrev={onNavigatePrev} onNavigateNext={onNavigateNext} />,
    document.body
  )
}

export default Menu
