import { useConfettiContext } from '../../contexts/ConfettiContext'
import './ConfettiLayer.css'

function ConfettiLayer(): React.JSX.Element | null {
  const { bursts } = useConfettiContext()

  if (bursts.length === 0) return null

  return (
    <div className="confetti-layer" aria-hidden="true">
      {bursts.flatMap((burst) =>
        burst.particles.map((particle) => (
          <span
            key={particle.id}
            className="confetti-piece"
            style={
              {
                left: `${particle.x}%`,
                bottom: 0,
                width: `${particle.width}px`,
                height: `${particle.height}px`,
                backgroundColor: particle.color,
                borderRadius: particle.isCircle ? '50%' : '2px',
                animationDuration: `${particle.duration}ms`,
                animationDelay: `${particle.delay}ms`,
                '--spin': particle.spin,
                '--end-x': particle.endX,
                '--end-y': particle.endY
              } as React.CSSProperties
            }
          />
        ))
      )}
    </div>
  )
}

export default ConfettiLayer
