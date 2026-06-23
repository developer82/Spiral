import type { ReactNode, RefObject } from 'react'
import { X } from 'lucide-react'
import './SearchField.css'

export interface SearchFieldButton {
  icon: ReactNode
  ariaLabel: string
  onClick: () => void
  active?: boolean
  buttonRef?: RefObject<HTMLButtonElement | null>
}

export interface SearchFieldProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  hint?: string
  buttons?: SearchFieldButton[]
  ariaLabel?: string
  className?: string
  hideSearchIcon?: boolean
}

export default function SearchField({
  value,
  onChange,
  placeholder,
  hint,
  buttons,
  ariaLabel,
  className,
  hideSearchIcon = false
}: SearchFieldProps): React.JSX.Element {
  const hasButtons = buttons && buttons.length > 0

  return (
    <div className={`search-field${className ? ` ${className}` : ''}`}>
      <div className="search-field__wrapper">
        {!hideSearchIcon && (
          <svg
            className="search-field__search-icon"
            width="14"
            height="14"
            viewBox="0 0 12 12"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 8l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
        <input
          type="text"
          className="search-field__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
        />
        {value && (
          <button
            type="button"
            className="search-field__clear"
            aria-label="Clear search"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange('')}
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
        {hasButtons && (
          <>
            <span className="search-field__divider" role="separator" aria-hidden="true" />
            <div className="search-field__actions">
              {buttons.map((btn, i) => (
                <button
                  key={i}
                  ref={btn.buttonRef}
                  type="button"
                  className={`search-field__btn${btn.active ? ' search-field__btn--active' : ''}`}
                  aria-label={btn.ariaLabel}
                  aria-pressed={!!btn.active}
                  onClick={btn.onClick}
                >
                  {btn.icon}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {hint && <p className="search-field__hint">{hint}</p>}
    </div>
  )
}
