import { createContext, useCallback, useContext, useState } from 'react'

const COLORS = [
  '#a1faff',
  '#ff6b6b',
  '#ffd93d',
  '#6bcb77',
  '#4d96ff',
  '#ff922b',
  '#cc5de8',
  '#f06595',
  '#74c0fc',
  '#63e6be'
]

export interface ConfettiParticle {
  id: number
  x: number      // starting left % (0–8 for left burst, 92–100 for right burst)
  endX: string   // horizontal travel distance, e.g. "45vw"
  endY: string   // vertical travel distance (negative = up), e.g. "-80vh"
  color: string
  width: number
  height: number
  duration: number
  delay: number
  spin: string
  isCircle: boolean
}

export interface ConfettiBurst {
  id: number
  particles: ConfettiParticle[]
}

interface ConfettiContextValue {
  bursts: ConfettiBurst[]
  triggerConfetti: () => void
}

const ConfettiContext = createContext<ConfettiContextValue | null>(null)

const PARTICLE_COUNT = 70
const CLEANUP_BUFFER_MS = 500

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function generateParticles(burstId: number): ConfettiParticle[] {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const isLeft = i < PARTICLE_COUNT / 2
    const duration = randomBetween(1800, 3600)
    const spins = Math.floor(randomBetween(2, 6)) * (Math.random() > 0.5 ? 1 : -1)
    const endYVh = randomBetween(50, 100)
    const endXVw = isLeft
      ? randomBetween(-15, 60)  // left corner: fan right-upward
      : randomBetween(-60, 15)  // right corner: fan left-upward
    return {
      id: burstId * 1000 + i,
      x: isLeft ? randomBetween(0, 8) : randomBetween(92, 100),
      endX: `${endXVw}vw`,
      endY: `-${endYVh}vh`,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      width: randomBetween(7, 14),
      height: randomBetween(4, 10),
      duration,
      delay: randomBetween(0, 400),
      spin: `${spins * 180}deg`,
      isCircle: Math.random() > 0.72
    }
  })
}

export function ConfettiProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [bursts, setBursts] = useState<ConfettiBurst[]>([])

  const triggerConfetti = useCallback(() => {
    const id = Date.now()
    const maxDuration = 3600 + 400 + CLEANUP_BUFFER_MS
    setBursts((prev) => [...prev, { id, particles: generateParticles(id) }])
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id))
    }, maxDuration)
  }, [])

  return (
    <ConfettiContext.Provider value={{ bursts, triggerConfetti }}>
      {children}
    </ConfettiContext.Provider>
  )
}

export function useConfettiContext(): ConfettiContextValue {
  const ctx = useContext(ConfettiContext)
  if (!ctx) throw new Error('useConfettiContext must be used inside ConfettiProvider')
  return ctx
}
