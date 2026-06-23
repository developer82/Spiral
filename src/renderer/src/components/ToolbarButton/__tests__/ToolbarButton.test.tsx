import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ToolbarButton, { ToolbarSeparator } from '../ToolbarButton'
import { Pencil } from 'lucide-react'

let mockShowToolbarTextButtons = false

vi.mock('../../../pages/Settings/useSettings', () => ({
  useSettings: () => ({
    settings: { showToolbarTextButtons: mockShowToolbarTextButtons },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

afterEach(() => {
  cleanup()
  mockShowToolbarTextButtons = false
})

describe('ToolbarButton', () => {
  it('renders the button', () => {
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('hides label text when showToolbarTextButtons is false', () => {
    mockShowToolbarTextButtons = false
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} />)
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('shows label text when showToolbarTextButtons is true', () => {
    mockShowToolbarTextButtons = true
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} />)
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('applies active class when active is true', () => {
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} active />)
    expect(screen.getByRole('button').className).toContain('toolbar-btn--active')
  })

  it('does not apply active class when active is false', () => {
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} />)
    expect(screen.getByRole('button').className).not.toContain('toolbar-btn--active')
  })

  it('is disabled when disabled prop is true', () => {
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} disabled />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('sets title attribute when tooltip is provided', () => {
    render(
      <ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} tooltip="Edit (Ctrl+E)" />
    )
    expect(screen.getByRole('button')).toHaveAttribute('title', 'Edit (Ctrl+E)')
  })

  it('shows tooltip div on mouse enter', async () => {
    const user = userEvent.setup()
    render(
      <ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} tooltip="Edit (Ctrl+E)" />
    )
    await user.hover(screen.getByRole('button'))
    expect(screen.getByText('Edit (Ctrl+E)')).toBeInTheDocument()
  })

  it('hides tooltip div on mouse leave', async () => {
    const user = userEvent.setup()
    render(
      <ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} tooltip="Edit (Ctrl+E)" />
    )
    await user.hover(screen.getByRole('button'))
    await user.unhover(screen.getByRole('button'))
    expect(screen.queryByText('Edit (Ctrl+E)')).not.toBeInTheDocument()
  })

  it('does not show tooltip div when tooltip prop is not provided', async () => {
    const user = userEvent.setup()
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={vi.fn()} />)
    await user.hover(screen.getByRole('button'))
    expect(document.querySelector('.toolbar-btn__tooltip')).not.toBeInTheDocument()
  })

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={onClick} />)
    await user.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(<ToolbarButton icon={<Pencil size={15} />} label="Edit" onClick={onClick} disabled />)
    await user.click(screen.getByRole('button'))
    expect(onClick).not.toHaveBeenCalled()
  })
})

describe('ToolbarSeparator', () => {
  it('renders a separator element', () => {
    const { container } = render(<ToolbarSeparator />)
    expect(container.querySelector('.toolbar-btn__separator')).toBeInTheDocument()
  })
})
