// @vitest-environment jsdom
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import AboutDialog from '../AboutDialog'

vi.mock('../../../assets/logo_animation.mp4', () => ({ default: 'mocked-video.mp4' }))
vi.mock('../../../../../../package.json', () => ({ default: { version: '1.2.3' } }))

describe('AboutDialog', () => {
  const mockOnClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  // ── Rendering ─────────────────────────────────────────────────────────────

  it('renders the app name', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    expect(screen.getByText('Spiral')).toBeInTheDocument()
  })

  it('renders the version number', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    expect(screen.getByText('Version: 1.2.3')).toBeInTheDocument()
  })

  it('renders the credit line', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    expect(screen.getByText(/Made with help of AI by Ophir Oren/)).toBeInTheDocument()
  })

  it('renders the description', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    expect(screen.getByText(/cross-platform SQL client/)).toBeInTheDocument()
  })

  it('renders the OK button', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument()
  })

  it('renders a video element with the correct src', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    const video = document.querySelector('video')
    expect(video).toBeInTheDocument()
    expect(video?.src).toContain('mocked-video.mp4')
  })

  it('renders the video with autoPlay and muted, without loop', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    const video = document.querySelector('video')
    expect(video?.autoplay).toBe(true)
    expect(video?.muted).toBe(true)
    expect(video?.loop).toBe(false)
  })

  it('has the correct dialog role and aria-modal', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('aria-labelledby', 'about-dialog-title')
  })

  // ── Interactions ──────────────────────────────────────────────────────────

  it('calls onClose when OK button is clicked', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when Escape key is pressed', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('calls onClose when clicking the overlay backdrop', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    const overlay = screen.getByRole('dialog')
    fireEvent.mouseDown(overlay)
    expect(mockOnClose).toHaveBeenCalledOnce()
  })

  it('does not call onClose when clicking inside the panel', () => {
    render(<AboutDialog onClose={mockOnClose} />)
    const panel = document.querySelector('.about-dialog__panel')!
    fireEvent.mouseDown(panel)
    expect(mockOnClose).not.toHaveBeenCalled()
  })
})
