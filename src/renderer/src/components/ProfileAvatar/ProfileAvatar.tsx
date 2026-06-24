import { useProfileContext } from '../../contexts/ProfileContext'
import AvatarPlaceholder from '../AvatarPlaceholder/AvatarPlaceholder'
import './ProfileAvatar.css'

interface ProfileAvatarProps {
  /** Diameter of the avatar in pixels. Defaults to 24. */
  size?: number
  className?: string
}

/**
 * Presentational user-avatar visual. Renders the chosen avatar image with the
 * user's zoom/offset transform applied, or a generated placeholder when no
 * image is set. Shared by the side navigation bar and the title bar so both
 * surfaces stay visually in sync.
 */
export default function ProfileAvatar({ size = 24, className = '' }: ProfileAvatarProps): React.JSX.Element {
  const { profile } = useProfileContext()

  if (profile.avatarDataUrl) {
    return (
      <span
        className={`profile-avatar__clip${className ? ` ${className}` : ''}`}
        style={{ width: size, height: size }}
      >
        <img
          src={profile.avatarDataUrl}
          alt={profile.displayName || ''}
          className="profile-avatar__img"
          style={{
            transform: `translate(${profile.avatarOffsetX}%, ${profile.avatarOffsetY}%) scale(${profile.avatarZoom})`,
            transformOrigin: 'center'
          }}
        />
      </span>
    )
  }

  return <AvatarPlaceholder displayName={profile.displayName} size={size} className={className} />
}
