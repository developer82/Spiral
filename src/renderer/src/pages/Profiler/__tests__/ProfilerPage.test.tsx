import { render, screen, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ProfilerPage from '../ProfilerPage'
import { ProfilerProvider } from '../../../contexts/ProfilerContext'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// ProfilerTabView uses Monaco — already mocked in test-setup.ts

function renderWithProvider(ui: React.ReactNode): ReturnType<typeof render> {
  return render(<ProfilerProvider>{ui}</ProfilerProvider>)
}

describe('ProfilerPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Empty state ────────────────────────────────────────────────────────────

  it('renders empty state when there are no profiler tabs', () => {
    renderWithProvider(<ProfilerPage />)
    expect(screen.getByText('profiler.emptyState')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('does not render a tab bar when there are no tabs', () => {
    renderWithProvider(<ProfilerPage />)
    expect(screen.queryByRole('button', { name: /profiler/i })).not.toBeInTheDocument()
  })
})
