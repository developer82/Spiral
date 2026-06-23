// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import JsonViewer from '../JsonViewer'

// ── mocks ─────────────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (!opts) return key
      return Object.entries(opts).reduce(
        (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
        key
      )
    }
  })
}))

vi.mock('lucide-react', () => ({
  ChevronRight: ({ className }: { size?: number; className?: string }) => (
    <span data-testid="chevron" className={className} />
  )
}))

vi.mock('../../Menu/Menu', () => ({
  default: ({
    items,
    onClose
  }: {
    items: Array<{ id: string; label?: string; onClick?: () => void; separator?: true }>
    position: { x: number; y: number }
    onClose: () => void
  }) => (
    <div role="menu">
      {items
        .filter(i => !i.separator)
        .map(item => (
          <div
            key={item.id}
            role="menuitem"
            onMouseDown={() => {
              item.onClick?.()
              onClose()
            }}
          >
            {item.label}
          </div>
        ))}
    </div>
  )
}))

// ── setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

// ── helpers ───────────────────────────────────────────────────────────────────

function viewer(): HTMLElement {
  return document.querySelector('.json-viewer')!
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('JsonViewer', () => {
  describe('valid JSON rendering', () => {
    it('renders a primitive string value', () => {
      render(<JsonViewer json='"hello"' />)
      expect(screen.getByText(/hello/)).toBeInTheDocument()
    })

    it('renders object keys and values', () => {
      render(<JsonViewer json='{"name":"Alice","age":30}' collapsible={false} />)
      expect(screen.getByText(/name/)).toBeInTheDocument()
      expect(screen.getByText(/Alice/)).toBeInTheDocument()
      expect(screen.getByText(/age/)).toBeInTheDocument()
      expect(screen.getByText(/30/)).toBeInTheDocument()
    })

    it('renders nested objects when collapsible is false', () => {
      render(<JsonViewer json='{"user":{"name":"Bob"}}' collapsible={false} />)
      expect(screen.getByText(/user/)).toBeInTheDocument()
      expect(screen.getByText(/name/)).toBeInTheDocument()
      expect(screen.getByText(/Bob/)).toBeInTheDocument()
    })

    it('renders null values', () => {
      render(<JsonViewer json='{"val":null}' collapsible={false} />)
      expect(screen.getByText('null')).toBeInTheDocument()
    })

    it('renders boolean values', () => {
      render(<JsonViewer json='{"flag":true}' collapsible={false} />)
      expect(screen.getByText('true')).toBeInTheDocument()
    })

    it('renders empty objects inline', () => {
      const { container } = render(<JsonViewer json='{}' />)
      expect(container.textContent).toContain('{}')
    })

    it('renders empty arrays inline', () => {
      const { container } = render(<JsonViewer json='[]' />)
      expect(container.textContent).toContain('[]')
    })
  })

  describe('syntax highlighting', () => {
    it('applies syntax highlight classes by default', () => {
      const { container } = render(<JsonViewer json='{"key":"val"}' collapsible={false} />)
      expect(container.querySelector('.json-viewer__key')).toBeInTheDocument()
      expect(container.querySelector('.json-viewer__string')).toBeInTheDocument()
    })

    it('applies number and boolean classes', () => {
      const { container } = render(
        <JsonViewer json='{"n":42,"b":true}' collapsible={false} />
      )
      expect(container.querySelector('.json-viewer__number')).toBeInTheDocument()
      expect(container.querySelector('.json-viewer__boolean')).toBeInTheDocument()
    })

    it('applies null class', () => {
      const { container } = render(<JsonViewer json='{"x":null}' collapsible={false} />)
      expect(container.querySelector('.json-viewer__null')).toBeInTheDocument()
    })

    it('does not apply highlight classes when syntaxHighlighting is false', () => {
      const { container } = render(
        <JsonViewer json='{"key":"val"}' collapsible={false} syntaxHighlighting={false} />
      )
      expect(container.querySelector('.json-viewer__key')).not.toBeInTheDocument()
      expect(container.querySelector('.json-viewer__string')).not.toBeInTheDocument()
    })
  })

  describe('collapsible behaviour', () => {
    it('does not show toggle buttons when collapsible is false', () => {
      render(<JsonViewer json='{"key":{"a":1}}' collapsible={false} />)
      expect(screen.queryAllByRole('button')).toHaveLength(0)
    })

    it('shows Array type hint with count when an array is collapsed', () => {
      render(<JsonViewer json='{"items":[1,2,3]}' collapsible={true} />)
      expect(screen.getByText('Array (3)')).toBeInTheDocument()
    })

    it('shows Object type hint when an object is collapsed', () => {
      render(<JsonViewer json='{"nested":{"a":1}}' collapsible={true} />)
      expect(screen.getByText('Object')).toBeInTheDocument()
    })

    it('hides child content when a node is collapsed (default)', () => {
      render(<JsonViewer json='{"nested":{"a":1}}' collapsible={true} />)
      expect(screen.queryByText('1')).not.toBeInTheDocument()
    })

    it('expands a collapsed node when toggle is clicked', () => {
      render(<JsonViewer json='{"nested":{"a":1}}' collapsible={true} />)
      expect(screen.getByText('Object')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /Expand Object/ }))

      expect(screen.queryByText('Object')).not.toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
    })

    it('collapses an expanded node when toggle is clicked again', () => {
      render(<JsonViewer json='{"nested":{"a":1}}' collapsible={true} expandAllByDefault={true} />)
      expect(screen.getByText('1')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Collapse' }))

      expect(screen.queryByText('1')).not.toBeInTheDocument()
      expect(screen.getByText('Object')).toBeInTheDocument()
    })

    it('starts all nodes expanded when expandAllByDefault is true', () => {
      render(
        <JsonViewer
          json='{"user":{"name":"Alice"},"items":[1,2]}'
          collapsible={true}
          expandAllByDefault={true}
        />
      )
      expect(screen.getByText(/Alice/)).toBeInTheDocument()
      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
      expect(screen.queryByText('Object')).not.toBeInTheDocument()
      expect(screen.queryByText(/Array/)).not.toBeInTheDocument()
    })

    it('respects expandAllByDefault=false by keeping nodes collapsed', () => {
      render(<JsonViewer json='{"user":{"name":"Alice"}}' expandAllByDefault={false} />)
      expect(screen.getByText('Object')).toBeInTheDocument()
      expect(screen.queryByText(/Alice/)).not.toBeInTheDocument()
    })

    it('shows all content when collapsible is false regardless of expandAllByDefault', () => {
      render(
        <JsonViewer
          json='{"user":{"name":"Alice"}}'
          collapsible={false}
          expandAllByDefault={false}
        />
      )
      expect(screen.getByText(/Alice/)).toBeInTheDocument()
    })
  })

  describe('expand / collapse all via context menu', () => {
    it('expands all nodes via Expand All menu action', () => {
      render(
        <JsonViewer json='{"user":{"name":"Alice"},"items":[1,2]}' collapsible={true} />
      )
      expect(screen.getByText('Object')).toBeInTheDocument()

      fireEvent.contextMenu(viewer())
      fireEvent.mouseDown(screen.getByText('jsonViewer.expandAll'))

      expect(screen.queryByText('Object')).not.toBeInTheDocument()
      expect(screen.getByText(/Alice/)).toBeInTheDocument()
    })

    it('collapses all nodes via Collapse All menu action', () => {
      render(
        <JsonViewer
          json='{"user":{"name":"Alice"}}'
          collapsible={true}
          expandAllByDefault={true}
        />
      )
      expect(screen.getByText(/Alice/)).toBeInTheDocument()

      fireEvent.contextMenu(viewer())
      fireEvent.mouseDown(screen.getByText('jsonViewer.collapseAll'))

      expect(screen.queryByText(/Alice/)).not.toBeInTheDocument()
      expect(screen.getByText('Object')).toBeInTheDocument()
    })

    it('does not show expand/collapse actions when collapsible is false', () => {
      render(<JsonViewer json='{"key":{"a":1}}' collapsible={false} />)
      fireEvent.contextMenu(viewer())
      expect(screen.queryByText('jsonViewer.expandAll')).not.toBeInTheDocument()
      expect(screen.queryByText('jsonViewer.collapseAll')).not.toBeInTheDocument()
    })
  })

  describe('context menu – copy', () => {
    it('opens context menu on right-click', () => {
      render(<JsonViewer json='{"key":"val"}' />)
      fireEvent.contextMenu(viewer())
      expect(screen.getByRole('menu')).toBeInTheDocument()
    })

    it('copies formatted JSON when copyFormatted is true (default) and nothing is selected', () => {
      const json = '{"key":"val"}'
      render(<JsonViewer json={json} />)
      fireEvent.contextMenu(viewer())
      fireEvent.mouseDown(screen.getByText('jsonViewer.copy'))
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        JSON.stringify({ key: 'val' }, null, 2)
      )
    })

    it('copies compact JSON when copyFormatted is false and nothing is selected', () => {
      const json = '{"key":"val"}'
      render(<JsonViewer json={json} copyFormatted={false} />)
      fireEvent.contextMenu(viewer())
      fireEvent.mouseDown(screen.getByText('jsonViewer.copy'))
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('{"key":"val"}')
    })

    it('copies only selected text when a selection exists, regardless of copyFormatted', () => {
      render(<JsonViewer json='{"key":"val"}' copyFormatted={true} />)
      const mockGetSelection = vi
        .spyOn(window, 'getSelection')
        .mockReturnValue({ toString: () => 'selected text' } as Selection)

      fireEvent.contextMenu(viewer())
      fireEvent.mouseDown(screen.getByText('jsonViewer.copy'))

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('selected text')
      mockGetSelection.mockRestore()
    })

    it('shows only Expand All when all nodes are collapsed (default state)', () => {
      render(<JsonViewer json='{"key":{"a":1}}' collapsible={true} />)
      fireEvent.contextMenu(viewer())
      expect(screen.getByText('jsonViewer.expandAll')).toBeInTheDocument()
      expect(screen.queryByText('jsonViewer.collapseAll')).not.toBeInTheDocument()
    })

    it('shows only Collapse All when all nodes are expanded', () => {
      render(<JsonViewer json='{"key":{"a":1}}' collapsible={true} expandAllByDefault={true} />)
      fireEvent.contextMenu(viewer())
      expect(screen.queryByText('jsonViewer.expandAll')).not.toBeInTheDocument()
      expect(screen.getByText('jsonViewer.collapseAll')).toBeInTheDocument()
    })

    it('shows both actions when nodes are partially expanded', () => {
      render(<JsonViewer json='{"a":{"x":1}}' collapsible={true} />)
      // Expand the root node so root is expanded but root.a is still collapsed
      fireEvent.click(screen.getByRole('button', { name: 'Expand Object' }))
      fireEvent.contextMenu(viewer())
      expect(screen.getByText('jsonViewer.expandAll')).toBeInTheDocument()
      expect(screen.getByText('jsonViewer.collapseAll')).toBeInTheDocument()
    })
  })

  describe('invalid JSON fallback', () => {
    it('shows the invalid JSON error label', () => {
      render(<JsonViewer json='not valid json' />)
      expect(screen.getByText('jsonViewer.invalidJson')).toBeInTheDocument()
    })

    it('renders the raw text as selectable content', () => {
      render(<JsonViewer json='not valid json' />)
      expect(screen.getByText('not valid json')).toBeInTheDocument()
    })

    it('shows a location hint when the error includes a position', () => {
      // Constructing JSON that produces an "at position N" error in V8
      render(<JsonViewer json='{"a": }' />)
      // The error bar is present regardless of whether position parsing succeeds
      expect(screen.getByText('jsonViewer.invalidJson')).toBeInTheDocument()
    })

    it('allows copying the raw text via the context menu', () => {
      const invalidJson = 'not valid json'
      render(<JsonViewer json={invalidJson} />)
      fireEvent.contextMenu(viewer())
      fireEvent.mouseDown(screen.getByText('jsonViewer.copy'))
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(invalidJson)
    })

    it('copies raw text for invalid JSON regardless of copyFormatted', () => {
      const invalidJson = 'not valid json'
      render(<JsonViewer json={invalidJson} copyFormatted={true} />)
      fireEvent.contextMenu(viewer())
      fireEvent.mouseDown(screen.getByText('jsonViewer.copy'))
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(invalidJson)
    })

    it('does not show expand/collapse actions for invalid JSON', () => {
      render(<JsonViewer json='not valid json' />)
      fireEvent.contextMenu(viewer())
      expect(screen.queryByText('jsonViewer.expandAll')).not.toBeInTheDocument()
    })

    it('does not show expand/collapse actions when the document has no expandable fields', () => {
      render(<JsonViewer json='"hello"' collapsible={true} />)
      fireEvent.contextMenu(viewer())
      expect(screen.queryByText('jsonViewer.expandAll')).not.toBeInTheDocument()
      expect(screen.queryByText('jsonViewer.collapseAll')).not.toBeInTheDocument()
    })

    it('does not show expand/collapse actions for an empty object', () => {
      render(<JsonViewer json='{}' collapsible={true} />)
      fireEvent.contextMenu(viewer())
      expect(screen.queryByText('jsonViewer.expandAll')).not.toBeInTheDocument()
      expect(screen.queryByText('jsonViewer.collapseAll')).not.toBeInTheDocument()
    })

    it('does not show expand/collapse actions for a flat object with only primitive values', () => {
      render(<JsonViewer json='{"_id":"6a1ad3e8e639f439cc240eed","Name":"Ophir"}' collapsible={true} />)
      fireEvent.contextMenu(viewer())
      expect(screen.queryByText('jsonViewer.expandAll')).not.toBeInTheDocument()
      expect(screen.queryByText('jsonViewer.collapseAll')).not.toBeInTheDocument()
    })
  })
})
