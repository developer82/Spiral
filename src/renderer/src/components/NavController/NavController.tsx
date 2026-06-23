import { createContext, useContext, useEffect, useState } from 'react'
import { useSkyColor, applySkyGlow } from '../../hooks/useSkyColor'
import SideNav from '../SideNav/SideNav'
import './NavController.css'

const NavControllerContext = createContext<HTMLDivElement | null>(null)

export function useScreenNav(): HTMLDivElement | null {
  return useContext(NavControllerContext)
}

interface NavControllerProps {
  activeItem?: string
  isVisible?: boolean
  onNavigate?: (id: string) => void
  onNavigateToProfile?: () => void
  children?: React.ReactNode
}

function NavController({
  activeItem,
  isVisible,
  onNavigate,
  onNavigateToProfile,
  children
}: NavControllerProps): React.JSX.Element {
  const [slotEl, setSlotEl] = useState<HTMLDivElement | null>(null)
  const skyColor = useSkyColor()

  useEffect(() => {
    const el = slotEl
    if (!el) return
    applySkyGlow(el, skyColor)
  }, [skyColor, slotEl])

  return (
    <NavControllerContext.Provider value={slotEl}>
      <div className="nav-controller">
        <div className="nav-controller__nav">
          <SideNav
            activeItem={activeItem}
            isVisible={isVisible}
            onNavigate={onNavigate}
            onNavigateToProfile={onNavigateToProfile}
          />
          <div ref={setSlotEl} className="nav-controller__screen-nav" />
        </div>
        {children}
      </div>
    </NavControllerContext.Provider>
  )
}

export default NavController
