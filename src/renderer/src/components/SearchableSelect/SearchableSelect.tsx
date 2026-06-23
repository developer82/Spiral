import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react'
import './SearchableSelect.css'

export interface SearchableSelectOption {
  value: string
  label: string
  description?: string
}

interface SearchableSelectProps {
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  emptyOptionLabel: string
  searchPlaceholder: string
  noResultsLabel: string
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  ariaLabel,
  emptyOptionLabel,
  searchPlaceholder,
  noResultsLabel
}: SearchableSelectProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [panelDirection, setPanelDirection] = useState<'downward' | 'upward'>('downward')

  const selectedOption = options.find((option) => option.value === value) ?? null

  const filteredOptions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLocaleLowerCase()
    if (!normalizedSearch) return options

    return options.filter((option) => {
      const haystack = `${option.label} ${option.description ?? ''}`.toLocaleLowerCase()
      return haystack.includes(normalizedSearch)
    })
  }, [options, searchTerm])

  useEffect(() => {
    if (!isOpen) return

    searchInputRef.current?.focus()

    const handlePointerDown = (event: MouseEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  useLayoutEffect(() => {
    if (!isOpen) return

    const updatePanelLayout = (): void => {
      const container = containerRef.current
      const panel = panelRef.current
      if (!container || !panel) return

      const dialogPanel = container.closest('.dialog__panel, .conn-dialog__panel') as HTMLElement | null
      const containerRect = container.getBoundingClientRect()
      const boundaryRect =
        dialogPanel?.getBoundingClientRect() ?? new DOMRect(0, 0, window.innerWidth, window.innerHeight)

      const edgeMargin = 16
      const panelGap = 8
      const availableBelow = Math.max(0, boundaryRect.bottom - containerRect.bottom - edgeMargin - panelGap)
      const nextDirection = 'downward'
      const maxPanelHeight = Math.max(140, availableBelow)

      setPanelDirection(nextDirection)
      panel.style.setProperty('--searchable-select-panel-max-height', `${maxPanelHeight}px`)
    }

    updatePanelLayout()
    window.addEventListener('resize', updatePanelLayout)

    return () => {
      window.removeEventListener('resize', updatePanelLayout)
    }
  }, [isOpen])

  function handleSelect(nextValue: string): void {
    onChange(nextValue)
    setSearchTerm('')
    setIsOpen(false)
  }

  return (
    <div className="searchable-select" ref={containerRef}>
      <button
        type="button"
        className={`searchable-select__control${isOpen ? ' searchable-select__control--open' : ''}`}
        aria-label={ariaLabel}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <span className={`searchable-select__value${selectedOption ? '' : ' searchable-select__value--placeholder'}`}>
          {selectedOption?.label ?? emptyOptionLabel}
        </span>
        <span className="searchable-select__indicator" aria-hidden="true">
          {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>

      {isOpen && (
        <div
          ref={panelRef}
          className={`searchable-select__panel searchable-select__panel--${panelDirection}`}
        >
          <div className="searchable-select__search-row">
            <Search size={14} className="searchable-select__search-icon" />
            <input
              ref={searchInputRef}
              className="searchable-select__search-input"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={searchPlaceholder}
            />
          </div>

          <div className="searchable-select__options" aria-label={ariaLabel}>
            <button
              type="button"
              className={`searchable-select__option${value === '' ? ' searchable-select__option--selected' : ''}`}
              onClick={() => handleSelect('')}
            >
              <span className="searchable-select__option-label">{emptyOptionLabel}</span>
              {value === '' && <Check size={14} className="searchable-select__option-check" />}
            </button>

            {filteredOptions.length === 0 ? (
              <div className="searchable-select__empty">{noResultsLabel}</div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`searchable-select__option${isSelected ? ' searchable-select__option--selected' : ''}`}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span className="searchable-select__option-content">
                      <span className="searchable-select__option-label">{option.label}</span>
                      {option.description && (
                        <span className="searchable-select__option-description">{option.description}</span>
                      )}
                    </span>
                    {isSelected && <Check size={14} className="searchable-select__option-check" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
