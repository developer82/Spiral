// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// A per-test userData directory that the mocked electron `app.getPath` returns.
let userDataDir = ''

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => userDataDir) }
}))

import {
  readAndConsumeAutosave,
  writeAutosave,
  clearAutosave,
  clearAutosaveSync,
  type DraftDocument
} from '../autosave'

function makeDraft(overrides: Partial<DraftDocument> = {}): DraftDocument {
  return {
    draftId: 'tab-1',
    title: 'Unnamed',
    content: 'SELECT 1',
    savedAt: new Date().toISOString(),
    ...overrides
  }
}

function manifestPath(): string {
  return join(userDataDir, 'autosave', 'session.json')
}

describe('autosave', () => {
  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'spiral-autosave-'))
  })

  afterEach(() => {
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('round-trips drafts and deletes the manifest on consume', async () => {
    const drafts = [
      makeDraft({ draftId: 'tab-1', title: 'a.sql', filePath: '/tmp/a.sql', content: 'A' }),
      makeDraft({ draftId: 'tab-2', title: 'Unnamed', content: 'B' })
    ]
    await writeAutosave(drafts)
    expect(existsSync(manifestPath())).toBe(true)

    const recovered = await readAndConsumeAutosave()
    expect(recovered).toHaveLength(2)
    expect(recovered[0]).toMatchObject({ draftId: 'tab-1', filePath: '/tmp/a.sql', content: 'A' })
    expect(recovered[1]).toMatchObject({ draftId: 'tab-2', content: 'B' })
    // Manifest is consumed (deleted) so it cannot be recovered twice.
    expect(existsSync(manifestPath())).toBe(false)
  })

  it('returns an empty array when no manifest exists', async () => {
    const recovered = await readAndConsumeAutosave()
    expect(recovered).toEqual([])
  })

  it('returns an empty array (without throwing) for a corrupt manifest', async () => {
    mkdirSync(join(userDataDir, 'autosave'), { recursive: true })
    writeFileSync(manifestPath(), '{ not valid json', 'utf-8')

    const recovered = await readAndConsumeAutosave()
    expect(recovered).toEqual([])
    // Corrupt manifest is still removed so it does not linger.
    expect(existsSync(manifestPath())).toBe(false)
  })

  it('removes the manifest when writing an empty draft set', async () => {
    await writeAutosave([makeDraft()])
    expect(existsSync(manifestPath())).toBe(true)

    await writeAutosave([])
    expect(existsSync(manifestPath())).toBe(false)
  })

  it('clearAutosave is a no-op when the manifest is absent', async () => {
    await expect(clearAutosave()).resolves.toBeUndefined()
    expect(existsSync(manifestPath())).toBe(false)
  })

  it('clearAutosaveSync removes an existing manifest', async () => {
    await writeAutosave([makeDraft()])
    expect(existsSync(manifestPath())).toBe(true)

    clearAutosaveSync()
    expect(existsSync(manifestPath())).toBe(false)
  })

  it('clearAutosaveSync is a no-op when the manifest is absent', () => {
    expect(() => clearAutosaveSync()).not.toThrow()
    expect(existsSync(manifestPath())).toBe(false)
  })
})
