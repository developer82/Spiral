import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, afterEach } from 'vitest'
import ClientStatisticsView from '../ClientStatisticsView'
import type { ClientStatistics } from '../ClientStatisticsView'

const SAMPLE_STATS: ClientStatistics = {
  totalExecutionTimeMs: 123,
  rowsReturned: 456,
  resultSetsCount: 2,
  bytesSentToServer: 1024
}

afterEach(() => {
  cleanup()
})

describe('ClientStatisticsView', () => {
  // ── Section rendering ─────────────────────────────────────────────────────

  it('renders the Time Statistics section', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('Time Statistics')).toBeInTheDocument()
  })

  it('renders the Query Profile Statistics section', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('Query Profile Statistics')).toBeInTheDocument()
  })

  it('renders the Network Statistics section', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('Network Statistics')).toBeInTheDocument()
  })

  // ── Statistic labels ──────────────────────────────────────────────────────

  it('renders Total Execution Time label', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('Total Execution Time')).toBeInTheDocument()
  })

  it('renders Rows Returned label', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('Rows Returned')).toBeInTheDocument()
  })

  it('renders Result Sets label', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('Result Sets')).toBeInTheDocument()
  })

  it('renders Bytes Sent to Server label', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('Bytes Sent to Server')).toBeInTheDocument()
  })

  // ── Statistic values ──────────────────────────────────────────────────────

  it('displays total execution time in milliseconds', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('123 ms')).toBeInTheDocument()
  })

  it('displays rows returned count', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('456')).toBeInTheDocument()
  })

  it('displays result sets count', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    expect(screen.getByText('2')).toBeInTheDocument()
  })

  it('displays bytes sent to server formatted', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    // 1024 bytes = 1.00 KB
    expect(screen.getByText('1.00 KB')).toBeInTheDocument()
  })

  // ── Table structure ───────────────────────────────────────────────────────

  it('renders three tables (one per section)', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    const tables = document.querySelectorAll('table')
    expect(tables.length).toBe(3)
  })

  it('each table has "Statistic" and "Current Execution" header columns', () => {
    render(<ClientStatisticsView statistics={SAMPLE_STATS} />)
    const statisticHeaders = screen.getAllByText('Statistic')
    const currentExecHeaders = screen.getAllByText('Current Execution')
    expect(statisticHeaders.length).toBe(3)
    expect(currentExecHeaders.length).toBe(3)
  })

  // ── Byte formatting ───────────────────────────────────────────────────────

  it('displays bytes as raw "B" when under 1 KB', () => {
    render(
      <ClientStatisticsView
        statistics={{ ...SAMPLE_STATS, bytesSentToServer: 512 }}
      />
    )
    expect(screen.getByText('512 B')).toBeInTheDocument()
  })

  it('displays bytes in MB when over 1 MB', () => {
    render(
      <ClientStatisticsView
        statistics={{ ...SAMPLE_STATS, bytesSentToServer: 2 * 1024 * 1024 }}
      />
    )
    expect(screen.getByText('2.00 MB')).toBeInTheDocument()
  })

  // ── Zero values ───────────────────────────────────────────────────────────

  it('handles zero rows returned without crashing', () => {
    render(
      <ClientStatisticsView
        statistics={{ ...SAMPLE_STATS, rowsReturned: 0, resultSetsCount: 0 }}
      />
    )
    // Should render two '0' cells
    const zeroCells = screen.getAllByText('0')
    expect(zeroCells.length).toBeGreaterThanOrEqual(2)
  })
})
