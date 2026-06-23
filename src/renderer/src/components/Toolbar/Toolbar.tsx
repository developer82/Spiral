import React, { useEffect, useState } from 'react'
import './Toolbar.css'
import { ToolbarSeparator } from '../ToolbarButton/ToolbarButton'

interface ToolbarProps {
  groups: React.ReactNode[][]
  className?: string
}

function useWindowFocus(): boolean {
  const [focused, setFocused] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hasFocus() : true
  )
  useEffect(() => {
    const onFocus = (): void => setFocused(true)
    const onBlur = (): void => setFocused(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('blur', onBlur)
    }
  }, [])
  return focused
}

export function Toolbar({ groups, className }: ToolbarProps): React.JSX.Element {
  const nonEmptyGroups = groups
    .map((group) => React.Children.toArray(group))
    .filter((group) => group.length > 0)
  const cls = className ? `toolbar ${className}` : 'toolbar'
  const isMac = typeof window !== 'undefined' && window.api?.platform === 'darwin'
  const focused = useWindowFocus()

  if (isMac) {
    return (
      <div className={cls} data-window-focused={focused ? 'true' : 'false'}>
        {nonEmptyGroups.map((group, gIdx) => (
          <div className="toolbar__group" key={gIdx}>
            {group.map((child, cIdx) => (
              <React.Fragment key={cIdx}>
                {cIdx > 0 && <span className="toolbar__group-divider" aria-hidden="true" />}
                {child}
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={cls}>
      {nonEmptyGroups.map((group, index) => (
        <React.Fragment key={index}>
          {index > 0 && <ToolbarSeparator />}
          {group}
        </React.Fragment>
      ))}
    </div>
  )
}
