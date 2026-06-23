import { Activity, Database, GitCompareArrows, Settings } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useProfileContext } from '../../contexts/ProfileContext'
import { useSkyColor, applySkyGlow } from '../../hooks/useSkyColor'
import AvatarPlaceholder from '../AvatarPlaceholder/AvatarPlaceholder'
import './SideNav.css'

interface NavItem {
  id: string
  icon: React.ElementType
  labelKey: string
}

const TOP_NAV_ITEMS: NavItem[] = [
  { id: 'explorer', icon: Database, labelKey: 'nav.sideNav.explorer' },
  { id: 'profiler', icon: Activity, labelKey: 'nav.sideNav.profiler' },
  { id: 'compare', icon: GitCompareArrows, labelKey: 'nav.sideNav.compare' }
]

const BOTTOM_NAV_ITEMS: NavItem[] = [{ id: 'settings', icon: Settings, labelKey: 'nav.sideNav.settings' }]

interface SideNavProps {
  activeItem?: string
  isVisible?: boolean
  onNavigate?: (id: string) => void
  onNavigateToProfile?: () => void
}

function SideNav({ activeItem = 'explorer', isVisible = true, onNavigate, onNavigateToProfile }: SideNavProps): React.JSX.Element {
  const { t } = useTranslation()
  const { profile } = useProfileContext()
  const navRef = useRef<HTMLElement>(null)
  const skyColor = useSkyColor()

  useEffect(() => {
    const el = navRef.current
    if (!el) return
    applySkyGlow(el, skyColor)
  }, [skyColor])

  return (
    <aside
      ref={navRef}
      className={`sidenav${isVisible ? '' : ' sidenav--hidden'}`}
      aria-hidden={!isVisible}
      aria-label={t('nav.sideNav.ariaLabel')}
    >
      <nav className="sidenav__top">
        {TOP_NAV_ITEMS.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            className={`sidenav__item${activeItem === id ? ' sidenav__item--active' : ''}`}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            aria-current={activeItem === id ? 'page' : undefined}
            tabIndex={isVisible ? 0 : -1}
            onClick={() => onNavigate?.(id)}
          >
            <Icon className="sidenav__icon" strokeWidth={1.5} />
          </button>
        ))}
      </nav>
      <nav className="sidenav__bottom">
        {/* Profile button — above the settings icon */}
        <button
          className={`sidenav__item sidenav__item--profile${activeItem === 'settings' && false ? '' : ''}`}
          title={profile.displayName || t('nav.sideNav.profile')}
          aria-label={t('nav.sideNav.profile')}
          tabIndex={isVisible ? 0 : -1}
          onClick={() => onNavigateToProfile?.()}
        >
          {profile.avatarDataUrl ? (
            <span className="sidenav__avatar-clip">
              <img
                src={profile.avatarDataUrl}
                alt={profile.displayName || t('nav.sideNav.profile')}
                className="sidenav__avatar"
                style={{
                  transform: `translate(${profile.avatarOffsetX}%, ${profile.avatarOffsetY}%) scale(${profile.avatarZoom})`,
                  transformOrigin: 'center'
                }}
              />
            </span>
          ) : (
            <AvatarPlaceholder displayName={profile.displayName} size={24} />
          )}
        </button>

        {BOTTOM_NAV_ITEMS.map(({ id, icon: Icon, labelKey }) => (
          <button
            key={id}
            className={`sidenav__item${activeItem === id ? ' sidenav__item--active' : ''}`}
            title={t(labelKey)}
            aria-label={t(labelKey)}
            aria-current={activeItem === id ? 'page' : undefined}
            tabIndex={isVisible ? 0 : -1}
            onClick={() => onNavigate?.(id)}
          >
            <Icon className="sidenav__icon" strokeWidth={1.5} />
          </button>
        ))}
      </nav>
    </aside>
  )
}

export default SideNav
