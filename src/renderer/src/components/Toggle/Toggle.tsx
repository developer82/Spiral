import './Toggle.css'

interface ToggleProps {
  id: string
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  size?: 'sm' | 'md'
}

function Toggle({ id, label, checked, onChange, size = 'md' }: ToggleProps): React.JSX.Element {
  return (
    <label className={`toggle${size === 'sm' ? ' toggle--sm' : ''}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        className="toggle__input"
        aria-label={label}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle__track">
        <span className="toggle__thumb" />
      </span>
    </label>
  )
}

export default Toggle
