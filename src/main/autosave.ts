/**
 * autosave — crash-recovery persistence for unsaved query documents.
 *
 * Dirty query tabs are snapshotted to a manifest under the userData directory
 * while the app runs. On a clean quit the manifest is deleted; if the app
 * crashes it survives and is detected on the next launch to offer recovery.
 */
import { app } from 'electron'
import { join } from 'path'
import { readFile, writeFile, unlink, rename, mkdir } from 'fs/promises'
import { unlinkSync } from 'fs'

export interface DraftDocument {
  /** The originating tab id at snapshot time. */
  draftId: string
  title: string
  /** Present = file-backed; restoring and saving overwrites the original file. */
  filePath?: string
  content: string
  connectionId?: string
  databaseName?: string
  mongoCollection?: string
  /** ISO timestamp of the last snapshot. */
  savedAt: string
}

export interface AutosaveManifest {
  version: 1
  drafts: DraftDocument[]
}

const MANIFEST_VERSION = 1 as const

function getAutosaveDir(): string {
  return join(app.getPath('userData'), 'autosave')
}

function getAutosavePath(): string {
  return join(getAutosaveDir(), 'session.json')
}

/**
 * Reads the autosave manifest, deletes it, and returns its drafts. Returns an
 * empty array when the file is missing or corrupt (errors are swallowed so a
 * bad manifest never blocks startup).
 */
export async function readAndConsumeAutosave(): Promise<DraftDocument[]> {
  const path = getAutosavePath()
  let raw: string
  try {
    raw = await readFile(path, 'utf-8')
  } catch {
    return []
  }
  // Delete regardless of parse outcome so a corrupt manifest cannot linger.
  await clearAutosave()
  try {
    const parsed = JSON.parse(raw) as AutosaveManifest
    if (!parsed || !Array.isArray(parsed.drafts)) return []
    return parsed.drafts
  } catch {
    return []
  }
}

/**
 * Atomically writes the manifest with the given drafts. When `drafts` is empty
 * the manifest file is removed instead of writing an empty one.
 */
export async function writeAutosave(drafts: DraftDocument[]): Promise<void> {
  if (drafts.length === 0) {
    await clearAutosave()
    return
  }
  await mkdir(getAutosaveDir(), { recursive: true })
  const path = getAutosavePath()
  const tmpPath = `${path}.tmp`
  const manifest: AutosaveManifest = { version: MANIFEST_VERSION, drafts }
  await writeFile(tmpPath, JSON.stringify(manifest), 'utf-8')
  await rename(tmpPath, path)
}

/** Best-effort removal of the autosave manifest. */
export async function clearAutosave(): Promise<void> {
  try {
    await unlink(getAutosavePath())
  } catch {
    // Missing file (or already removed) — nothing to do.
  }
}

/**
 * Synchronous best-effort removal of the autosave manifest. Used on a
 * deliberate quit, immediately before `app.exit()`, so a late renderer write
 * cannot recreate the manifest after it has been cleared.
 */
export function clearAutosaveSync(): void {
  try {
    unlinkSync(getAutosavePath())
  } catch {
    // Missing file (or already removed) — nothing to do.
  }
}
