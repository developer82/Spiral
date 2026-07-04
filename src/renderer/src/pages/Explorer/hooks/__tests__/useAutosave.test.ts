import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAutosave } from '../useAutosave'
import type { Tab, QueryTab } from '../../explorer.types'

function queryTab(overrides: Partial<QueryTab> & { id: string }): QueryTab {
  return {
    kind: 'query',
    title: 'Unnamed',
    content: '',
    isDirty: false,
    ...overrides
  }
}

describe('useAutosave', () => {
  let writeSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    writeSpy = vi.fn().mockResolvedValue(undefined)
    window.api.autosave.write = writeSpy
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('writes immediately when unsaved content first appears', () => {
    const tabs: Tab[] = [
      queryTab({
        id: 'tab-1',
        title: 'a.sql',
        filePath: '/tmp/a.sql',
        content: 'A',
        isDirty: true
      }),
      queryTab({ id: 'tab-2', content: 'clean', isDirty: false })
    ]
    renderHook(({ tabs }) => useAutosave({ tabs }), { initialProps: { tabs } })

    // First dirty content is persisted without waiting for the debounce, so a
    // fast crash still leaves a recoverable manifest.
    expect(writeSpy).toHaveBeenCalledTimes(1)
    const drafts = writeSpy.mock.calls[0][0]
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({ draftId: 'tab-1', filePath: '/tmp/a.sql', content: 'A' })
    expect(drafts[0].savedAt).toEqual(expect.any(String))
  })

  it('debounces subsequent edits after the first write', () => {
    const first: Tab[] = [queryTab({ id: 'tab-1', content: 'A', isDirty: true })]
    const { rerender } = renderHook(({ tabs }) => useAutosave({ tabs }), {
      initialProps: { tabs: first }
    })
    expect(writeSpy).toHaveBeenCalledTimes(1) // immediate first write

    const edited: Tab[] = [queryTab({ id: 'tab-1', content: 'AB', isDirty: true })]
    rerender({ tabs: edited })
    // Not written again until the debounce elapses.
    expect(writeSpy).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(800)
    expect(writeSpy).toHaveBeenCalledTimes(2)
    expect(writeSpy.mock.calls[1][0][0]).toMatchObject({ content: 'AB' })
  })

  it('does not write when nothing is dirty', () => {
    const tabs: Tab[] = [queryTab({ id: 'tab-1', isDirty: false })]
    renderHook(({ tabs }) => useAutosave({ tabs }), { initialProps: { tabs } })

    vi.advanceTimersByTime(2000)
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('drops a tab from the draft set once it is saved', () => {
    const dirty: Tab[] = [queryTab({ id: 'tab-1', content: 'X', isDirty: true })]
    const { rerender } = renderHook(({ tabs }) => useAutosave({ tabs }), {
      initialProps: { tabs: dirty }
    })
    expect(writeSpy.mock.calls[0][0]).toHaveLength(1) // immediate first write

    // Tab saved → no longer dirty. The set becomes empty; the clearing write is
    // debounced (this is a transition away from having drafts, not toward it).
    const saved: Tab[] = [queryTab({ id: 'tab-1', content: 'X', isDirty: false })]
    rerender({ tabs: saved })
    vi.advanceTimersByTime(800)

    expect(writeSpy).toHaveBeenCalledTimes(2)
    expect(writeSpy.mock.calls[1][0]).toEqual([])
  })
})
