import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useTabsManager } from '../useTabsManager'
import type { QueryTab } from '../../explorer.types'
import type { DraftDocument } from '../../../../../../preload/index.d'

function renderTabsManager(): ReturnType<
  typeof renderHook<ReturnType<typeof useTabsManager>, unknown>
> {
  return renderHook(() =>
    useTabsManager({
      isActive: true,
      activeConnectionId: null,
      getSelectedContext: () => ({ connectionId: null, databaseName: null }),
      onResultsToggle: () => {},
      onToggleAiPanel: () => {},
      connections: [],
      setConnections: () => {}
    })
  )
}

function draft(overrides: Partial<DraftDocument> & { draftId: string }): DraftDocument {
  return {
    title: 'Unnamed',
    content: '',
    savedAt: new Date().toISOString(),
    ...overrides
  }
}

describe('useTabsManager.restoreDrafts', () => {
  it('recreates dirty query tabs preserving content, title and filePath', () => {
    const { result } = renderTabsManager()

    act(() => {
      result.current.restoreDrafts([
        draft({ draftId: 'old-1', title: 'a.sql', filePath: '/tmp/a.sql', content: 'A' }),
        draft({ draftId: 'old-2', title: 'Unnamed', content: 'B' })
      ])
    })

    const tabs = result.current.tabs as QueryTab[]
    expect(tabs).toHaveLength(2)
    expect(tabs.every((t) => t.kind === 'query' && t.isDirty)).toBe(true)
    expect(tabs[0]).toMatchObject({ title: 'a.sql', filePath: '/tmp/a.sql', content: 'A' })
    expect(tabs[1]).toMatchObject({ title: 'Unnamed', content: 'B', filePath: undefined })

    // Fresh unique ids are assigned (not the original draftIds).
    expect(new Set(tabs.map((t) => t.id)).size).toBe(2)
    expect(tabs.map((t) => t.id)).not.toContain('old-1')

    // The last restored tab becomes active.
    expect(result.current.activeTabId).toBe(tabs[1].id)
  })

  it('does nothing when given an empty draft list', () => {
    const { result } = renderTabsManager()

    act(() => {
      result.current.restoreDrafts([])
    })

    expect(result.current.tabs).toHaveLength(0)
    expect(result.current.activeTabId).toBeNull()
  })
})
