import { render, screen, cleanup } from '@testing-library/react'
import { createRef } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import QueryEditor, { type QueryEditorHandle } from '../QueryEditor'
import type { QueryContextInfo } from '../queryContextUtils'

// Use the same @monaco-editor/react mock pattern from QueryEditorHandle.test.tsx
vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(() => null)
}))

vi.mock('../../../Settings/useSettings', () => ({
  useSettings: () => ({
    settings: { theme: 'dark' },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

afterEach(cleanup)

const BASE_CONTEXT: QueryContextInfo = {
  providerLabel: 'SQL Server',
  connectionName: 'Dev DB',
  database: 'AdventureWorks',
  objectName: 'dbo.Orders',
  objectLabel: 'Table',
  syntaxLabel: 'SQL'
}

describe('QueryEditor context panel', () => {
  it('does not render the panel when queryContext is not provided', () => {
    const ref = createRef<QueryEditorHandle>()
    render(<QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} />)
    expect(document.querySelector('.query-editor__context-panel')).toBeNull()
  })

  it('renders the panel when queryContext is provided', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    expect(document.querySelector('.query-editor__context-panel')).not.toBeNull()
  })

  it('shows the provider label', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    expect(screen.getByText('SQL Server')).toBeTruthy()
  })

  it('shows the connection name', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    expect(screen.getByText('Dev DB')).toBeTruthy()
  })

  it('shows the database when present', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    expect(screen.getByText('AdventureWorks')).toBeTruthy()
  })

  it('hides the database row when database is null', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor
        ref={ref}
        value=""
        onChange={vi.fn()}
        visible={true}
        queryContext={{ ...BASE_CONTEXT, database: null }}
      />
    )
    const rows = document.querySelectorAll('.query-editor__context-row')
    // Provider, Connection, Object, Syntax — no Database row
    expect(rows.length).toBe(4)
  })

  it('shows the object name with the object label', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    expect(screen.getByText('dbo.Orders')).toBeTruthy()
    expect(screen.getByText('Table')).toBeTruthy()
  })

  it('hides the object row when objectName is null', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor
        ref={ref}
        value=""
        onChange={vi.fn()}
        visible={true}
        queryContext={{ ...BASE_CONTEXT, objectName: null }}
      />
    )
    const rows = document.querySelectorAll('.query-editor__context-row')
    // Provider, Connection, Database, Syntax — no Object row
    expect(rows.length).toBe(4)
  })

  it('shows "Multiple" for multi-source SQL queries', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor
        ref={ref}
        value=""
        onChange={vi.fn()}
        visible={true}
        queryContext={{ ...BASE_CONTEXT, objectName: 'Multiple' }}
      />
    )
    expect(screen.getByText('Multiple')).toBeTruthy()
  })

  it('shows "Collection" label for MongoDB context', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor
        ref={ref}
        value=""
        onChange={vi.fn()}
        visible={true}
        queryContext={{
          ...BASE_CONTEXT,
          providerLabel: 'MongoDB',
          objectLabel: 'Collection',
          objectName: 'orders',
          syntaxLabel: 'JSON'
        }}
      />
    )
    expect(screen.getByText('Collection')).toBeTruthy()
    expect(screen.getByText('orders')).toBeTruthy()
    expect(screen.getByText('JSON')).toBeTruthy()
  })

  it('shows the syntax label', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    expect(screen.getByText('SQL')).toBeTruthy()
  })

  it('labels the panel for screen readers', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    const panel = document.querySelector('.query-editor__context-panel')
    expect(panel?.getAttribute('aria-label')).toBe('Query context')
  })

  it('renders all five rows when all context fields are present', () => {
    const ref = createRef<QueryEditorHandle>()
    render(
      <QueryEditor ref={ref} value="" onChange={vi.fn()} visible={true} queryContext={BASE_CONTEXT} />
    )
    const rows = document.querySelectorAll('.query-editor__context-row')
    expect(rows.length).toBe(5)
  })
})
