import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useSettingsContext } from './SettingsContext'
import tipsData from '../data/tips.json'

export type TipPageId = 'explorer' | 'settings' | 'profiler' | 'compare' | 'docs'

export interface TipItem {
  id: string
  text: string
  category: string
  screen?: {
    page: TipPageId
    section?: string
  }
}

interface TipsContextValue {
  activeTip: TipItem | null
  dismissTip: () => void
  previewTip: () => void
  notifyNavigation: (page: TipPageId) => void
}

const TipsContext = createContext<TipsContextValue | null>(null)

const INITIAL_DELAY_MS = 15_000
const COOLDOWN_MS = 5 * 60_000
const NAV_MAX_EXTRA_MS = 2 * 60_000

const tips: TipItem[] = tipsData as TipItem[]

function pickTip(page: TipPageId): TipItem | null {
  if (tips.length === 0) return null
  const relevant = tips.filter((tip) => tip.screen?.page === page)
  const others = tips.filter((tip) => tip.screen?.page !== page)
  if (relevant.length === 0) return others[Math.floor(Math.random() * others.length)] ?? null
  if (others.length === 0) return relevant[Math.floor(Math.random() * relevant.length)]
  const pool = Math.random() < 0.75 ? relevant : others
  return pool[Math.floor(Math.random() * pool.length)]
}

export function TipsProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { settings } = useSettingsContext()
  const showTipsAndTricks = settings.showTipsAndTricks ?? true

  const [activeTip, setActiveTip] = useState<TipItem | null>(null)
  const activeTipRef = useRef<TipItem | null>(null)
  const tipShownAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activePageRef = useRef<TipPageId>('explorer')

  // Re-assigned each render; callbacks access via ref to avoid stale closures
  const scheduleRef = useRef<(delay: number) => void>(() => {})
  scheduleRef.current = (delay: number): void => {
    if (!showTipsAndTricks) return
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    timerRef.current = setTimeout(() => {
      const tip = pickTip(activePageRef.current)
      if (!tip) return
      tipShownAtRef.current = Date.now()
      activeTipRef.current = tip
      setActiveTip(tip)
    }, delay)
  }

  useEffect(() => {
    if (!showTipsAndTricks) {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      activeTipRef.current = null
      setActiveTip(null)
      return
    }
    scheduleRef.current(INITIAL_DELAY_MS)
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [showTipsAndTricks])

  const dismissTip = useCallback((): void => {
    const shownAt = tipShownAtRef.current
    activeTipRef.current = null
    setActiveTip(null)
    if (shownAt === null) return
    const elapsed = Date.now() - shownAt
    const remaining = Math.max(0, COOLDOWN_MS - elapsed)
    scheduleRef.current(remaining + Math.random() * NAV_MAX_EXTRA_MS)
  }, [])

  const previewTip = useCallback((): void => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const tip = pickTip(activePageRef.current)
    if (!tip) return
    tipShownAtRef.current = Date.now()
    activeTipRef.current = tip
    setActiveTip(tip)
  }, [])

  const notifyNavigation = useCallback((page: TipPageId): void => {
    activePageRef.current = page
    if (activeTipRef.current !== null) return
    scheduleRef.current(Math.random() * NAV_MAX_EXTRA_MS)
  }, [])

  return (
    <TipsContext.Provider value={{ activeTip, dismissTip, previewTip, notifyNavigation }}>
      {children}
    </TipsContext.Provider>
  )
}

export function useTipsContext(): TipsContextValue {
  const ctx = useContext(TipsContext)
  if (!ctx) throw new Error('useTipsContext must be used inside TipsProvider')
  return ctx
}
