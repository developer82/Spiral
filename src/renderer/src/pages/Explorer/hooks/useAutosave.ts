/**
 * useAutosave — persists the content of dirty query tabs to a temporary
 * manifest so unsaved work can be recovered after an unclean shutdown.
 *
 * Writes are debounced. The whole set of dirty query drafts is written each
 * time, so tabs that were saved (no longer dirty) or closed naturally drop out.
 */
import { useEffect, useRef } from 'react'
import type { Tab, QueryTab } from '../explorer.types'
import type { DraftDocument } from '../../../../../preload/index.d'

const AUTOSAVE_DEBOUNCE_MS = 800
const EMPTY_SERIALIZED = JSON.stringify([])

/** A draft without its write-time timestamp, used for change detection. */
type DraftPayload = Omit<DraftDocument, 'savedAt'>

function toDraftPayloads(tabs: Tab[]): DraftPayload[] {
  return tabs
    .filter((t): t is QueryTab => t.kind === 'query' && t.isDirty)
    .map((t) => ({
      draftId: t.id,
      title: t.title,
      filePath: t.filePath,
      content: t.content,
      connectionId: t.connectionId,
      databaseName: t.databaseName,
      mongoCollection: t.mongoCollection
    }))
}

function stamp(payloads: DraftPayload[]): DraftDocument[] {
  const savedAt = new Date().toISOString()
  return payloads.map((p) => ({ ...p, savedAt }))
}

export function useAutosave({ tabs }: { tabs: Tab[] }): void {
  const payloadsRef = useRef<DraftPayload[]>([])
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Seed with the serialized empty set so mounting with no dirty tabs does not
  // trigger a redundant write; a later transition back to empty still writes.
  const lastSerializedRef = useRef<string>(EMPTY_SERIALIZED)

  useEffect(() => {
    const payloads = toDraftPayloads(tabs)
    payloadsRef.current = payloads
    // Ignore renders that did not change the persisted content (e.g. switching
    // tabs, running a query) to avoid redundant disk writes.
    const serialized = JSON.stringify(payloads)
    if (serialized === lastSerializedRef.current) return
    const hadDrafts = lastSerializedRef.current !== EMPTY_SERIALIZED
    lastSerializedRef.current = serialized

    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    // When unsaved content first appears (no drafts a moment ago), persist it
    // immediately so even a crash within the debounce window is recoverable.
    // Subsequent keystrokes are debounced to avoid excessive disk writes.
    if (!hadDrafts && payloads.length > 0) {
      void window.api.autosave.write(stamp(payloadsRef.current))
      return
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      void window.api.autosave.write(stamp(payloadsRef.current))
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [tabs])

  // Flush pending changes immediately when the window loses focus or unloads,
  // narrowing the window of edits that a crash could lose.
  useEffect(() => {
    function flush(): void {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      void window.api.autosave.write(stamp(payloadsRef.current))
    }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [])
}
