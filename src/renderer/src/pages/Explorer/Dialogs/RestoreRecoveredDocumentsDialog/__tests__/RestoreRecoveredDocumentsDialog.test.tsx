// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import '../../../../../i18n'
import RestoreRecoveredDocumentsDialog from '../RestoreRecoveredDocumentsDialog'
import type { DraftDocument } from '../../../../../../../preload/index.d'

function draft(overrides: Partial<DraftDocument> & { draftId: string }): DraftDocument {
  return {
    title: 'Unnamed',
    content: '',
    savedAt: new Date().toISOString(),
    ...overrides
  }
}

const drafts: DraftDocument[] = [
  draft({ draftId: 'd1', title: 'a.sql', filePath: '/tmp/a.sql', content: 'A' }),
  draft({ draftId: 'd2', title: 'Scratch', content: 'B' })
]

function restoreButton(): HTMLButtonElement {
  return screen
    .getAllByRole('button')
    .find((b) => /Restore/i.test(b.textContent ?? '')) as HTMLButtonElement
}

afterEach(cleanup)

describe('RestoreRecoveredDocumentsDialog', () => {
  it('lists a checkbox per draft, all checked by default', () => {
    render(
      <RestoreRecoveredDocumentsDialog drafts={drafts} onRestore={vi.fn()} onDiscard={vi.fn()} />
    )
    const boxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(2)
    expect(boxes.every((b) => b.checked)).toBe(true)
    // File-backed draft shows its basename.
    expect(screen.getByText('a.sql')).toBeInTheDocument()
  })

  it('restores only the checked drafts', () => {
    const onRestore = vi.fn()
    render(
      <RestoreRecoveredDocumentsDialog drafts={drafts} onRestore={onRestore} onDiscard={vi.fn()} />
    )
    // Uncheck the first draft.
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    fireEvent.click(restoreButton())

    expect(onRestore).toHaveBeenCalledTimes(1)
    const selected = onRestore.mock.calls[0][0] as DraftDocument[]
    expect(selected).toHaveLength(1)
    expect(selected[0].draftId).toBe('d2')
  })

  it('disables Restore when no draft is selected', () => {
    render(
      <RestoreRecoveredDocumentsDialog drafts={drafts} onRestore={vi.fn()} onDiscard={vi.fn()} />
    )
    screen.getAllByRole('checkbox').forEach((b) => fireEvent.click(b))
    expect(restoreButton()).toBeDisabled()
  })

  it('invokes onDiscard from the Discard button', () => {
    const onDiscard = vi.fn()
    render(
      <RestoreRecoveredDocumentsDialog drafts={drafts} onRestore={vi.fn()} onDiscard={onDiscard} />
    )
    const discard = screen
      .getAllByRole('button')
      .find((b) => /Discard/i.test(b.textContent ?? '')) as HTMLButtonElement
    fireEvent.click(discard)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })
})
