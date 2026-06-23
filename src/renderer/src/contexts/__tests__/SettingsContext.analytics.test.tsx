import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { SettingsProvider, useSettingsContext } from '../SettingsContext'

function wrapper({ children }: { children: ReactNode }): React.JSX.Element {
  return <SettingsProvider>{children}</SettingsProvider>
}

describe('SettingsContext analytics tracking', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('tracks a setting_changed event with the value for safe primitive settings', () => {
    const trackSpy = vi.spyOn(window.api.analytics, 'track')
    const { result } = renderHook(() => useSettingsContext(), { wrapper })

    act(() => {
      result.current.updateSetting('likeConfetti', true)
    })

    expect(trackSpy).toHaveBeenCalledWith('setting_changed', {
      setting: 'likeConfetti',
      value: true
    })
  })

  it('never forwards the value of denylisted (sensitive) settings like hfToken', () => {
    const trackSpy = vi.spyOn(window.api.analytics, 'track')
    const { result } = renderHook(() => useSettingsContext(), { wrapper })

    act(() => {
      result.current.updateSetting('hfToken', 'super-secret-token')
    })

    expect(trackSpy).toHaveBeenCalledWith('setting_changed', { setting: 'hfToken' })
    // The token value must never appear in any analytics payload.
    const sentSecret = trackSpy.mock.calls.some((call) =>
      JSON.stringify(call).includes('super-secret-token')
    )
    expect(sentSecret).toBe(false)
  })

  it('does not forward the value of structured settings (environments)', () => {
    const trackSpy = vi.spyOn(window.api.analytics, 'track')
    const { result } = renderHook(() => useSettingsContext(), { wrapper })

    act(() => {
      result.current.updateSetting('environments', [])
    })

    expect(trackSpy).toHaveBeenCalledWith('setting_changed', { setting: 'environments' })
  })
})
