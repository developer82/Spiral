import { render, screen, waitFor, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ManageMongoAggregationsDialog from '../ManageMongoAggregationsDialog'
import type { MongoAggregationDefinition } from '../../../../../../../preload/index.d'

// Monaco Editor is already stubbed in test-setup.ts via vi.mock('@monaco-editor/react')

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// ── helpers ───────────────────────────────────────────────────────────────────

const baseProps = {
  connectionId: 'conn-1',
  databaseName: 'testdb',
  collectionName: 'orders',
  onClose: vi.fn(),
  onSuccess: vi.fn()
}

const sampleAgg: MongoAggregationDefinition = {
  id: 'agg-1',
  connectionId: 'conn-1',
  databaseName: 'testdb',
  collectionName: 'orders',
  name: 'Total by Status',
  stages: [
    { id: 'stage-1', stageType: '$group', json: '{ "_id": "$status", "count": { "$sum": 1 } }', enabled: true, collapsed: false }
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z'
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('ManageMongoAggregationsDialog', () => {
  beforeEach(() => {
    vi.spyOn(window.api.database, 'getMongoAggregations').mockResolvedValue({ status: 'ok', aggregations: [] })
    vi.spyOn(window.api.database, 'getMongoAggregationSample').mockResolvedValue({ status: 'ok', documents: [] })
    vi.spyOn(window.api.database, 'getCollectionFields').mockResolvedValue({ status: 'ok', fields: ['_id', 'status', 'amount'] })
    vi.spyOn(window.api.database, 'saveMongoAggregation').mockResolvedValue({ status: 'ok', id: 'new-id' })
    vi.spyOn(window.api.database, 'deleteMongoAggregation').mockResolvedValue({ status: 'ok' })
    vi.spyOn(window.api.database, 'runMongoAggregation').mockResolvedValue({
      status: 'ok',
      resultSet: { columns: ['_id', 'count'], rows: [{ _id: 'active', count: 5 }], rowCount: 1, rawDocuments: [] }
    })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders empty state when no aggregations exist', async () => {
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText('No aggregations yet')).toBeDefined()
    })
  })

  it('loads and displays aggregations on mount', async () => {
    vi.spyOn(window.api.database, 'getMongoAggregations').mockResolvedValue({
      status: 'ok', aggregations: [sampleAgg]
    })
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => {
      expect(screen.getByText('Total by Status')).toBeDefined()
    })
  })

  it('clicking Add creates a new entry with default name', async () => {
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('No aggregations yet'))

    const addBtn = screen.getByText('Add')
    await user.click(addBtn)

    expect(screen.getByDisplayValue('New Aggregation')).toBeDefined()
  })

  it('name field change is reflected', async () => {
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('No aggregations yet'))

    await user.click(screen.getByText('Add'))
    const nameInput = screen.getByDisplayValue('New Aggregation')
    await user.clear(nameInput)
    await user.type(nameInput, 'My Pipeline')

    expect(screen.getByDisplayValue('My Pipeline')).toBeDefined()
  })

  it('save calls saveMongoAggregation with correct params', async () => {
    const saveSpy = vi.spyOn(window.api.database, 'saveMongoAggregation')
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('No aggregations yet'))

    await user.click(screen.getByText('Add'))
    const nameInput = screen.getByDisplayValue('New Aggregation')
    await user.clear(nameInput)
    await user.type(nameInput, 'Test Pipeline')

    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledWith(
        'conn-1', 'testdb', 'orders',
        expect.objectContaining({ name: 'Test Pipeline' }),
        undefined
      )
    })
  })

  it('save shows error when name is empty', async () => {
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('No aggregations yet'))

    await user.click(screen.getByText('Add'))
    const nameInput = screen.getByDisplayValue('New Aggregation')
    await user.clear(nameInput)
    await user.click(screen.getByText('Save'))

    await waitFor(() => {
      // ErrorBox renders error text in a <span>
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  it('selecting an existing aggregation populates name field', async () => {
    vi.spyOn(window.api.database, 'getMongoAggregations').mockResolvedValue({
      status: 'ok', aggregations: [sampleAgg]
    })
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('Total by Status'))

    await user.click(screen.getByText('Total by Status'))
    expect(screen.getByDisplayValue('Total by Status')).toBeDefined()
  })

  it('delete calls deleteMongoAggregation', async () => {
    const deleteSpy = vi.spyOn(window.api.database, 'deleteMongoAggregation')
    vi.spyOn(window.api.database, 'getMongoAggregations').mockResolvedValue({
      status: 'ok', aggregations: [sampleAgg]
    })
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('Total by Status'))

    await user.click(screen.getByText('Total by Status'))
    await user.click(screen.getByText('Delete'))
    await waitFor(() => {
      expect(deleteSpy).toHaveBeenCalledWith('conn-1', 'testdb', 'orders', 'agg-1')
    })
  })

  it('Add Stage appends a stage card', async () => {
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('No aggregations yet'))

    await user.click(screen.getByText('Add'))
    await user.click(screen.getByText('Add Stage'))

    expect(screen.getByText('#1')).toBeDefined()
  })

  it('opens to initial aggregation when initialAggregationId provided', async () => {
    vi.spyOn(window.api.database, 'getMongoAggregations').mockResolvedValue({
      status: 'ok', aggregations: [sampleAgg]
    })
    render(<ManageMongoAggregationsDialog {...baseProps} initialAggregationId="agg-1" />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Total by Status')).toBeDefined()
    })
  })

  it('opens to new when openOnNew provided', async () => {
    render(<ManageMongoAggregationsDialog {...baseProps} openOnNew />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('New Aggregation')).toBeDefined()
    })
  })

  it('shows document examples section', async () => {
    vi.spyOn(window.api.database, 'getMongoAggregationSample').mockResolvedValue({
      status: 'ok', documents: ['{ "_id": "1", "status": "active" }']
    })
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('No aggregations yet'))

    // Document Examples appears in the right panel — click Add to open it
    await user.click(screen.getByText('Add'))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Document Examples/ })).toBeDefined()
    })
  })

  it('backend error on save shows error message', async () => {
    vi.spyOn(window.api.database, 'saveMongoAggregation').mockResolvedValue({
      status: 'error', message: 'Save failed'
    })
    const user = userEvent.setup()
    render(<ManageMongoAggregationsDialog {...baseProps} />)
    await waitFor(() => screen.getByText('No aggregations yet'))

    await user.click(screen.getByText('Add'))
    await user.click(screen.getByText('Save'))
    await waitFor(() => {
      // ErrorBox renders as role="alert"
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })
})
