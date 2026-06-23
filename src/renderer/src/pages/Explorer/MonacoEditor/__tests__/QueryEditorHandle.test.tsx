import { render, act } from '@testing-library/react'
import { createRef } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import QueryEditor, { type QueryEditorHandle } from '../QueryEditor'

// Override the global @monaco-editor/react mock from test-setup.ts so we can
// capture the onMount prop and call it with a fake editor instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OnMountFn = (editor: any, monaco: any) => void

let capturedOnMount: OnMountFn | null = null

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn((props: { onMount?: OnMountFn }) => {
    capturedOnMount = props.onMount ?? null
    return null
  })
}))

vi.mock('../../../Settings/useSettings', () => ({
  useSettings: () => ({
    settings: { theme: 'dark' },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

const MOCK_MONACO = {
  KeyCode: { F5: 116, KeyR: 82 },
  KeyMod: { CtrlCmd: 2048 },
  editor: { setTheme: vi.fn() }
}

function createMockEditor(options: {
  selectionEmpty: boolean
  selectionText?: string
// eslint-disable-next-line @typescript-eslint/no-explicit-any
}): any {
  const { selectionEmpty, selectionText = '' } = options
  const mockModel = {
    getValueInRange: vi.fn(() => selectionText)
  }
  return {
    addCommand: vi.fn(),
    focus: vi.fn(),
    getDomNode: vi.fn(() => null),
    getSelection: vi.fn(() => ({ isEmpty: () => selectionEmpty })),
    getModel: vi.fn(() => mockModel)
  }
}

function mountEditorWithMock(
  ref: React.RefObject<QueryEditorHandle | null>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editorMock: any
): void {
  render(<QueryEditor ref={ref} value="SELECT 1" onChange={vi.fn()} visible={true} />)
  act(() => {
    capturedOnMount?.(editorMock, MOCK_MONACO)
  })
}

describe('QueryEditor', () => {
  beforeEach(() => {
    capturedOnMount = null
  })

  describe('getSelectedText', () => {
    it('returns empty string before the editor mounts', () => {
      const ref = createRef<QueryEditorHandle>()
      render(<QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} />)
      // onMount has not been called yet — editorRef.current is null
      expect(ref.current?.getSelectedText()).toBe('')
    })

    it('returns empty string when the selection is empty (cursor only)', () => {
      const ref = createRef<QueryEditorHandle>()
      mountEditorWithMock(ref, createMockEditor({ selectionEmpty: true, selectionText: '' }))
      expect(ref.current?.getSelectedText()).toBe('')
    })

    it('returns the selected text when text is selected', () => {
      const ref = createRef<QueryEditorHandle>()
      mountEditorWithMock(ref, createMockEditor({ selectionEmpty: false, selectionText: 'SELECT 1' }))
      expect(ref.current?.getSelectedText()).toBe('SELECT 1')
    })

    it('trims leading and trailing whitespace from the selected text', () => {
      const ref = createRef<QueryEditorHandle>()
      mountEditorWithMock(ref, createMockEditor({ selectionEmpty: false, selectionText: '  SELECT 1  ' }))
      expect(ref.current?.getSelectedText()).toBe('SELECT 1')
    })

    it('returns empty string when selected text is whitespace-only', () => {
      const ref = createRef<QueryEditorHandle>()
      mountEditorWithMock(ref, createMockEditor({ selectionEmpty: false, selectionText: '   ' }))
      expect(ref.current?.getSelectedText()).toBe('')
    })
  })

  describe('focus', () => {
    it('does nothing before the editor mounts', () => {
      const ref = createRef<QueryEditorHandle>()
      render(<QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} />)
      expect(() => ref.current?.focus()).not.toThrow()
    })

    it('calls editor.focus() after mount', () => {
      const ref = createRef<QueryEditorHandle>()
      const editorMock = createMockEditor({ selectionEmpty: true })
      mountEditorWithMock(ref, editorMock)
      ref.current?.focus()
      expect(editorMock.focus).toHaveBeenCalledOnce()
    })
  })
})
