import { useEffect, useRef, useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTipsContext, type TipItem } from '../../contexts/TipsContext'
import './TipsNotification.css'

const TITLE_KEYS = [
  'tips.titles.aTipForYou',
  'tips.titles.tipOfTheDay',
  'tips.titles.niceToKnow',
  'tips.titles.whatsNext',
  'tips.titles.didYouKnow',
  'tips.titles.didYouTryThisTrick',
  'tips.titles.haveYouTriedThis',
  'tips.titles.includedInThisApplication'
]

const EXIT_DURATION_MS = 320

interface TipsNotificationProps {
  tip: TipItem
  onDismiss: () => void
}

function TipsNotification({ tip, onDismiss }: TipsNotificationProps): React.JSX.Element {
  const { t } = useTranslation()
  const [exiting, setExiting] = useState(false)
  const titleKey = useRef(TITLE_KEYS[Math.floor(Math.random() * TITLE_KEYS.length)])

  useEffect(() => {
    if (!exiting) return
    const id = setTimeout(() => onDismiss(), EXIT_DURATION_MS)
    return () => clearTimeout(id)
  }, [exiting, onDismiss])

  function handleDismiss(): void {
    const animationsOff = document.documentElement.getAttribute('data-animations') === 'off'
    if (animationsOff) {
      onDismiss()
      return
    }
    setExiting(true)
  }

  function handleNavigate(): void {
    if (!tip.screen) return
    const action =
      tip.screen.page === 'settings' && tip.screen.section
        ? `view:settings:${tip.screen.section}`
        : `view:${tip.screen.page}`
    window.dispatchEvent(new CustomEvent('menu:file-action', { detail: action }))
    handleDismiss()
  }

  return (
    <div
      className={`tips-notification${exiting ? ' tips-notification--exiting' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="tips-notification__header">
        <Lightbulb size={15} className="tips-notification__icon" aria-hidden="true" />
        <span className="tips-notification__title">{t(titleKey.current)}</span>
        <button
          type="button"
          className="tips-notification__close"
          onClick={handleDismiss}
          aria-label={t('tips.dismiss')}
        >
          <X size={13} />
        </button>
      </div>
      <p
        className={`tips-notification__body${tip.screen ? ' tips-notification__body--clickable' : ''}`}
        onClick={tip.screen ? handleNavigate : undefined}
        role={tip.screen ? 'button' : undefined}
        tabIndex={tip.screen ? 0 : undefined}
        onKeyDown={
          tip.screen
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') handleNavigate()
              }
            : undefined
        }
      >
        {tip.text}
      </p>
    </div>
  )
}

export function TipsLayer(): React.JSX.Element | null {
  const { activeTip, dismissTip } = useTipsContext()
  if (!activeTip) return null
  return <TipsNotification tip={activeTip} onDismiss={dismissTip} />
}

export default TipsNotification
