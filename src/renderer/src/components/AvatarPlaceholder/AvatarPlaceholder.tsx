import { UserRound } from 'lucide-react'
import './AvatarPlaceholder.css'

// Derive up to 2 initials from a display name
function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Deterministic hue from the name string
function nameToHue(name: string): number {
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return hash % 360
}

interface AvatarPlaceholderProps {
  displayName: string
  /** Diameter of the circle. Passed to the container via inline style. */
  size: number
  /** Font size for the initials text. */
  fontSize?: number
  className?: string
}

export default function AvatarPlaceholder({
  displayName,
  size,
  fontSize,
  className = ''
}: AvatarPlaceholderProps): React.JSX.Element {
  const initials = getInitials(displayName)

  if (!initials) {
    return (
      <span
        className={`avatar-placeholder avatar-placeholder--icon ${className}`}
        style={{ width: size, height: size }}
      >
        <UserRound size={size * 0.55} strokeWidth={1.25} />
      </span>
    )
  }

  const hue = nameToHue(displayName)

  return (
    <span
      className={`avatar-placeholder avatar-placeholder--initials ${className}`}
      style={{
        width: size,
        height: size,
        background: `hsl(${hue}, 55%, 42%)`,
        fontSize: fontSize ?? Math.round(size * 0.36)
      }}
      aria-label={displayName}
    >
      {initials}
    </span>
  )
}
