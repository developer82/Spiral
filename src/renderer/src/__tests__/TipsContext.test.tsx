import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TipsProvider, useTipsContext } from '../contexts/TipsContext'

const mockUpdateSetting = vi.fn()
let mockShowTipsAndTricks = true

vi.mock('../contexts/SettingsContext', () => ({
  useSettingsContext: () => ({
    settings: { showTipsAndTricks: mockShowTipsAndTricks },
    updateSetting: mockUpdateSetting
  })
}))

// Stub out the tips JSON import so tests are deterministic
vi.mock('../data/tips.json', () => ({
  default: [
    { id: 'tip-1', text: 'Tip one', category: 'general', screen: { page: 'explorer' } },
    { id: 'tip-2', text: 'Tip two', category: 'general', screen: { page: 'profiler' } },
    { id: 'tip-3', text: 'Tip three', category: 'general' }
  ]
}))

function TestConsumer(): React.JSX.Element {
  const { activeTip, dismissTip, previewTip, notifyNavigation } = useTipsContext()
  return (
    <div>
      <span data-testid="tip-text">{activeTip?.text ?? 'no-tip'}</span>
      <button onClick={dismissTip}>dismiss</button>
      <button onClick={previewTip}>preview</button>
      <button onClick={() => notifyNavigation('profiler')}>navigate</button>
    </div>
  )
}

function renderProvider(): ReturnType<typeof render> {
  return render(
    <TipsProvider>
      <TestConsumer />
    </TipsProvider>
  )
}

describe('TipsContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    mockShowTipsAndTricks = true
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    cleanup()
  })

  it('starts with no active tip', () => {
    renderProvider()
    expect(screen.getByTestId('tip-text').textContent).toBe('no-tip')
  })

  it('shows a tip after the initial 15-second delay', () => {
    renderProvider()
    act(() => { vi.advanceTimersByTime(15_000) })
    expect(screen.getByTestId('tip-text').textContent).not.toBe('no-tip')
  })

  it('does not show a tip when showTipsAndTricks is false', () => {
    mockShowTipsAndTricks = false
    renderProvider()
    act(() => { vi.advanceTimersByTime(30_000) })
    expect(screen.getByTestId('tip-text').textContent).toBe('no-tip')
  })

  it('dismissTip clears the active tip', () => {
    renderProvider()
    act(() => { vi.advanceTimersByTime(15_000) })
    expect(screen.getByTestId('tip-text').textContent).not.toBe('no-tip')
    act(() => { screen.getByText('dismiss').click() })
    expect(screen.getByTestId('tip-text').textContent).toBe('no-tip')
  })

  it('shows a new tip after cooldown following dismiss', () => {
    renderProvider()
    act(() => { vi.advanceTimersByTime(15_000) })
    act(() => { screen.getByText('dismiss').click() })
    // Math.random returns 0 so extra delay = 0, only COOLDOWN_MS (5 min) remains
    act(() => { vi.advanceTimersByTime(5 * 60_000) })
    expect(screen.getByTestId('tip-text').textContent).not.toBe('no-tip')
  })

  it('previewTip shows a tip immediately without waiting', () => {
    renderProvider()
    act(() => { screen.getByText('preview').click() })
    expect(screen.getByTestId('tip-text').textContent).not.toBe('no-tip')
  })

  it('notifyNavigation schedules a tip in 0–2 min when no tip is showing', () => {
    renderProvider()
    // Don't advance to initial tip; navigate immediately
    act(() => { screen.getByText('navigate').click() })
    // Math.random = 0 → delay = 0
    act(() => { vi.advanceTimersByTime(0) })
    expect(screen.getByTestId('tip-text').textContent).not.toBe('no-tip')
  })

  it('notifyNavigation does nothing when a tip is already showing', () => {
    renderProvider()
    act(() => { vi.advanceTimersByTime(15_000) })
    const textAfterInitial = screen.getByTestId('tip-text').textContent
    act(() => { screen.getByText('navigate').click() })
    act(() => { vi.advanceTimersByTime(0) })
    // Tip should be unchanged (still the same tip, not replaced)
    expect(screen.getByTestId('tip-text').textContent).toBe(textAfterInitial)
  })

  it('notifyNavigation does not schedule a tip when showTipsAndTricks is false', () => {
    mockShowTipsAndTricks = false
    renderProvider()
    act(() => { screen.getByText('navigate').click() })
    act(() => { vi.advanceTimersByTime(2 * 60_000) })
    expect(screen.getByTestId('tip-text').textContent).toBe('no-tip')
  })

  it('dismissTip does not reschedule when showTipsAndTricks is false', () => {
    // Start with tips on so we can get one showing
    mockShowTipsAndTricks = true
    renderProvider()
    act(() => { vi.advanceTimersByTime(15_000) })
    expect(screen.getByTestId('tip-text').textContent).not.toBe('no-tip')
    // Now disable tips and dismiss
    mockShowTipsAndTricks = false
    act(() => { screen.getByText('dismiss').click() })
    // Advance well past cooldown — no new tip should appear
    act(() => { vi.advanceTimersByTime(10 * 60_000) })
    expect(screen.getByTestId('tip-text').textContent).toBe('no-tip')
  })

  it('clears timer on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearTimeout')
    const { unmount } = renderProvider()
    unmount()
    expect(clearSpy).toHaveBeenCalled()
  })

  it('throws when used outside TipsProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer />)).toThrow('useTipsContext must be used inside TipsProvider')
    spy.mockRestore()
  })
})
