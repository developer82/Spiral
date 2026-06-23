import type { InputHTMLAttributes } from 'react'
import { X } from 'lucide-react'
import './Field.css'

export interface TextFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'className'
> {
  value: string | number
  onChange: (value: string) => void
  className?: string
  clearable?: boolean
  error?: boolean
  ariaLabel?: string
}

export default function TextField({
  value,
  onChange,
  className,
  clearable = true,
  error = false,
  disabled = false,
  readOnly = false,
  ariaLabel,
  ...inputProps
}: TextFieldProps): React.JSX.Element {
  const stringValue = String(value ?? '')
  const showClear = clearable && !disabled && !readOnly && stringValue.length > 0

  return (
    <div className={`field${className ? ` ${className}` : ''}`}>
      <div
        className={[
          'field__control',
          error ? 'field__control--error' : '',
          disabled ? 'field__control--disabled' : ''
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          {...inputProps}
          className="field__native"
          value={value}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel}
          onChange={(event) => onChange(event.target.value)}
        />
        {showClear && (
          <button
            type="button"
            className="field__clear"
            aria-label="Clear"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onChange('')}
          >
            <X size={13} aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  )
}
