import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { ProfilerEvent, ProfilerSessionConfig, TrackedEventType } from '../pages/Profiler/profiler.types'

export interface ProfilerTab {
  id: string
  profilingSessionId: string
  connectionId: string
  connectionName: string
  databaseName: string
  trackedEvents: TrackedEventType[]
  state: 'running' | 'paused' | 'stopped'
  events: ProfilerEvent[]
  error?: string
}

interface ProfilerContextValue {
  tabs: ProfilerTab[]
  activeTabId: string | null
  setActiveTabId: (id: string) => void
  activateSession: (config: ProfilerSessionConfig) => Promise<void>
  pauseTab: (tabId: string) => Promise<void>
  resumeTab: (tabId: string) => Promise<void>
  stopTab: (tabId: string) => Promise<void>
  closeTab: (tabId: string) => void
  registerNavigate: (fn: (page: string) => void) => void
}

const ProfilerContext = createContext<ProfilerContextValue | null>(null)

export function ProfilerProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [tabs, setTabs] = useState<ProfilerTab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const navigateRef = useRef<((page: string) => void) | null>(null)

  const registerNavigate = useCallback((fn: (page: string) => void) => {
    navigateRef.current = fn
  }, [])

  useEffect(() => {
    const unsubEvent = window.api.profiler.onEvent((payload) => {
      const { sessionId, event } = payload as { sessionId: string; event: ProfilerEvent }
      setTabs((prev) =>
        prev.map((tab) =>
          tab.profilingSessionId === sessionId
            ? { ...tab, events: [...tab.events, event] }
            : tab
        )
      )
    })

    const unsubUpdate = window.api.profiler.onEventUpdate((payload) => {
      const { sessionId, eventId, updates } = payload as {
        sessionId: string
        eventId: string
        updates: Partial<ProfilerEvent>
      }
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.profilingSessionId !== sessionId) return tab
          return {
            ...tab,
            events: tab.events.map((ev) =>
              ev.id === eventId ? { ...ev, ...updates } : ev
            )
          }
        })
      )
    })

    const unsubError = window.api.profiler.onError((payload) => {
      const { sessionId, message } = payload as { sessionId: string; message: string }
      setTabs((prev) =>
        prev.map((tab) =>
          tab.profilingSessionId === sessionId
            ? { ...tab, state: 'stopped', error: message }
            : tab
        )
      )
    })

    return () => {
      unsubEvent()
      unsubUpdate()
      unsubError()
    }
  }, [])

  const activateSession = useCallback(async (config: ProfilerSessionConfig) => {
    const profilingSessionId = await window.api.profiler.start(config)
    const tabId = `profiler-${profilingSessionId}`
    const newTab: ProfilerTab = {
      id: tabId,
      profilingSessionId,
      connectionId: config.connectionId,
      connectionName: config.connectionName,
      databaseName: config.databaseName,
      trackedEvents: config.trackedEvents,
      state: 'running',
      events: []
    }
    setTabs((prev) => [...prev, newTab])
    setActiveTabId(tabId)
    navigateRef.current?.('profiler')
  }, [])

  const pauseTab = useCallback(async (tabId: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId)
      if (!tab || tab.state !== 'running') return prev
      void window.api.profiler.pause(tab.profilingSessionId)
      return prev.map((t) => (t.id === tabId ? { ...t, state: 'paused' } : t))
    })
  }, [])

  const resumeTab = useCallback(async (tabId: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId)
      if (!tab || tab.state !== 'paused') return prev
      void window.api.profiler.resume(tab.profilingSessionId)
      return prev.map((t) => (t.id === tabId ? { ...t, state: 'running' } : t))
    })
  }, [])

  const stopTab = useCallback(async (tabId: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId)
      if (!tab || tab.state === 'stopped') return prev
      void window.api.profiler.stop(tab.profilingSessionId)
      return prev.map((t) => (t.id === tabId ? { ...t, state: 'stopped' } : t))
    })
  }, [])

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === tabId)
      if (tab && tab.state !== 'stopped') {
        void window.api.profiler.stop(tab.profilingSessionId)
      }
      return prev.filter((t) => t.id !== tabId)
    })
    setActiveTabId((prev) => {
      if (prev !== tabId) return prev
      // Select adjacent tab
      setTabs((current) => {
        const remaining = current.filter((t) => t.id !== tabId)
        return remaining
      })
      return null
    })
  }, [])

  return (
    <ProfilerContext.Provider
      value={{ tabs, activeTabId, setActiveTabId, activateSession, pauseTab, resumeTab, stopTab, closeTab, registerNavigate }}
    >
      {children}
    </ProfilerContext.Provider>
  )
}

export function useProfilerContext(): ProfilerContextValue {
  const ctx = useContext(ProfilerContext)
  if (!ctx) throw new Error('useProfilerContext must be used within ProfilerProvider')
  return ctx
}
