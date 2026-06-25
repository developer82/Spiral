/**
 * Pure helper for drag-and-drop tab reordering. Moves the tab identified by
 * `draggedId` so it sits at the position currently occupied by `targetId`,
 * shifting the other tabs accordingly. Returns the original array reference
 * unchanged when the move is a no-op (same id) or either id is missing, so
 * callers can rely on referential equality to skip redundant state updates.
 */
export function reorderTabs<T extends { id: string }>(
  tabs: readonly T[],
  draggedId: string,
  targetId: string
): T[] {
  if (draggedId === targetId) return tabs as T[]
  const fromIndex = tabs.findIndex((t) => t.id === draggedId)
  const toIndex = tabs.findIndex((t) => t.id === targetId)
  if (fromIndex === -1 || toIndex === -1) return tabs as T[]
  const next = [...tabs]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}
