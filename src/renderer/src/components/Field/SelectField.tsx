import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import './Field.css'

export interface SelectFieldOption {
  value: string
  label: string
  description?: string
  disabled?: boolean
}

interface SelectFieldProps {
  options: SelectFieldOption[]
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  placeholder?: string
  disabled?: boolean
  error?: boolean
  className?: string
  id?: string
}

export default function SelectField({
  options,
  value,
  onChange,
  ariaLabel,
  placeholder,
  disabled = false,
  error = false,
  className,
  id
}: SelectFieldProps): React.JSX.Element {
  const generatedId = useId()
  const listboxId = `${id ?? generatedId}-listbox`
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = useMemo(
    () => options.find((option) => option.value === value) ?? null,
    [options, value]
  )

  useEffect(() => {
    if (!isOpen) return

    const handlePointerDown = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  function handleSelect(nextValue: string): void {
    onChange(nextValue)
    setIsOpen(false)
  }

  return (
    <div className={`field field__select${className ? ` ${className}` : ''}`} ref={rootRef}>
      <div
        className={[
          'field__control',
          isOpen ? 'field__control--open' : '',
          error ? 'field__control--error' : '',
          disabled ? 'field__control--disabled' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <button
          id={id}
          type="button"
          className="field__select-button"
          role="combobox"
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listboxId : undefined}
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <span className={`field__select-value${selectedOption ? '' : ' field__select-value--placeholder'}`}>
            {selectedOption?.label ?? placeholder ?? ''}
          </span>
          <span className="field__select-indicator" aria-hidden="true">
            {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </span>
        </button>
      </div>

      {isOpen && (
        <div className="field__panel">
          <div id={listboxId} className="field__options" role="listbox" aria-label={ariaLabel}>
            {options.map((option) => {
              const isSelected = option.value === value

              return (
                <button
                  key={option.value}
                  type="button"
                  className={`field__option${isSelected ? ' field__option--selected' : ''}`}
                  role="option"
                  aria-selected={isSelected}
                  disabled={option.disabled}
                  onClick={() => handleSelect(option.value)}
                >
                  <span className="field__option-label">{option.label}</span>
                  {isSelected && <Check size={14} className="field__option-check" aria-hidden="true" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
