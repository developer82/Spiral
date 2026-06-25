import { describe, it, expect } from 'vitest'
import { reorderTabs } from '../reorderTabs'

describe('reorderTabs', () => {
  const tabs = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]

  it('moves a tab forward to a later target position', () => {
    const result = reorderTabs(tabs, 'a', 'c')
    expect(result.map((t) => t.id)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves a tab backward to an earlier target position', () => {
    const result = reorderTabs(tabs, 'd', 'b')
    expect(result.map((t) => t.id)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('moves a tab to the first position', () => {
    const result = reorderTabs(tabs, 'c', 'a')
    expect(result.map((t) => t.id)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moves a tab to the last position', () => {
    const result = reorderTabs(tabs, 'a', 'd')
    expect(result.map((t) => t.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('does not mutate the original array', () => {
    const original = [...tabs]
    reorderTabs(tabs, 'a', 'c')
    expect(tabs).toEqual(original)
  })

  it('returns the same array reference when dragged and target are identical', () => {
    const result = reorderTabs(tabs, 'b', 'b')
    expect(result).toBe(tabs)
  })

  it('returns the same array reference when the dragged id is missing', () => {
    const result = reorderTabs(tabs, 'missing', 'b')
    expect(result).toBe(tabs)
  })

  it('returns the same array reference when the target id is missing', () => {
    const result = reorderTabs(tabs, 'a', 'missing')
    expect(result).toBe(tabs)
  })

  it('handles a single-element list without changing it', () => {
    const single = [{ id: 'only' }]
    const result = reorderTabs(single, 'only', 'only')
    expect(result).toBe(single)
  })
})
