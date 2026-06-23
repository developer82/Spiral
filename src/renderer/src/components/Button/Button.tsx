import { forwardRef } from 'react'
import { Loader2 } from 'lucide-react'
import { trackEvent } from '../../analytics/track'
import './Button.css'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-solid'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  /** Stable slug; when set, clicks fire a `button_click` analytics event. */
  analyticsId?: string
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading,
    disabled,
    className,
    children,
    type = 'button',
    analyticsId,
    onClick,
    ...rest
  },
  ref
) {
  const classes = ['btn', `btn--${variant}`, `btn--${size}`, className].filter(Boolean).join(' ')

  function handleClick(e: React.MouseEvent<HTMLButtonElement>): void {
    if (analyticsId) trackEvent('button_click', { button: analyticsId })
    onClick?.(e)
  }

  return (
    <button
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || isLoading}
      onClick={handleClick}
      {...rest}
    >
      {isLoading && <Loader2 size={13} className="btn__spinner" aria-hidden="true" />}
      {children}
    </button>
  )
})

export default Button
