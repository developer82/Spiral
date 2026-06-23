import { useEffect, useRef, type JSX } from 'react'
import Button from '../Button/Button'
import './AboutDialog.css'
import videoUrl from '../../assets/logo_animation.mp4'
import packageJson from '../../../../../package.json'
import { trackEvent } from '../../analytics/track'

interface AboutDialogProps {
  onClose: () => void
}

export default function AboutDialog({ onClose }: AboutDialogProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    trackEvent('dialog_open', { dialog: 'about' })
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleVideoEnded(): void {
    // Keep the last frame visible by doing nothing — the video naturally pauses on its last frame
  }

  return (
    <div
      className="about-dialog"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="about-dialog-title"
    >
      <div className="about-dialog__panel">
        <div className="about-dialog__video-container">
          <video
            ref={videoRef}
            className="about-dialog__video"
            src={videoUrl}
            autoPlay
            muted
            playsInline
            onEnded={handleVideoEnded}
          />
        </div>
        <div className="about-dialog__body">
          <h2 id="about-dialog-title" className="about-dialog__app-name">Spiral</h2>
          <p className="about-dialog__version">Version: {packageJson.version}</p>
          <p className="about-dialog__credit">
            Made with help of AI by Ophir Oren for educational purposes.
          </p>
          <p className="about-dialog__description">
            Spiral is a cross-platform SQL client for exploring, querying, and comparing databases across multiple providers.
          </p>
        </div>
        <div className="about-dialog__footer">
          <Button variant="primary" onClick={onClose} autoFocus>
            OK
          </Button>
        </div>
      </div>
    </div>
  )
}
