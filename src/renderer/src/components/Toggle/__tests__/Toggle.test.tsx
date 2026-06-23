import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Toggle from '../Toggle'

afterEach(() => {
  cleanup()
})

describe('Toggle', () => {
  describe('rendering', () => {
    it('renders a checkbox input', () => {
      render(<Toggle id="test-toggle" label="Test toggle" checked={false} onChange={vi.fn()} />)
      expect(screen.getByRole('checkbox')).toBeTruthy()
    })

    it('reflects checked state', () => {
      render(<Toggle id="test-toggle" label="Test toggle" checked={true} onChange={vi.fn()} />)
      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.checked).toBe(true)
    })

    it('reflects unchecked state', () => {
      render(<Toggle id="test-toggle" label="Test toggle" checked={false} onChange={vi.fn()} />)
      const input = screen.getByRole('checkbox') as HTMLInputElement
      expect(input.checked).toBe(false)
    })

    it('sets aria-label from label prop', () => {
      render(<Toggle id="test-toggle" label="Enable feature" checked={false} onChange={vi.fn()} />)
      expect(screen.getByRole('checkbox').getAttribute('aria-label')).toBe('Enable feature')
    })

    it('associates label with input via id', () => {
      render(<Toggle id="my-toggle" label="My toggle" checked={false} onChange={vi.fn()} />)
      expect(screen.getByRole('checkbox').id).toBe('my-toggle')
    })
  })

  describe('size variants', () => {
    it('does not apply toggle--sm class when size is md', () => {
      const { container } = render(
        <Toggle id="test-toggle" label="Test" checked={false} onChange={vi.fn()} size="md" />
      )
      expect(container.querySelector('.toggle--sm')).toBeNull()
    })

    it('does not apply toggle--sm class when size is omitted', () => {
      const { container } = render(
        <Toggle id="test-toggle" label="Test" checked={false} onChange={vi.fn()} />
      )
      expect(container.querySelector('.toggle--sm')).toBeNull()
    })

    it('applies toggle--sm class when size is sm', () => {
      const { container } = render(
        <Toggle id="test-toggle" label="Test" checked={false} onChange={vi.fn()} size="sm" />
      )
      expect(container.querySelector('.toggle--sm')).toBeTruthy()
    })
  })

  describe('interaction', () => {
    it('calls onChange with true when toggled on', () => {
      const onChange = vi.fn()
      render(<Toggle id="test-toggle" label="Test toggle" checked={false} onChange={onChange} />)
      fireEvent.click(screen.getByRole('checkbox'))
      expect(onChange).toHaveBeenCalledWith(true)
    })

    it('calls onChange with false when toggled off', () => {
      const onChange = vi.fn()
      render(<Toggle id="test-toggle" label="Test toggle" checked={true} onChange={onChange} />)
      fireEvent.click(screen.getByRole('checkbox'))
      expect(onChange).toHaveBeenCalledWith(false)
    })

    it('calls onChange exactly once per click', () => {
      const onChange = vi.fn()
      render(<Toggle id="test-toggle" label="Test toggle" checked={false} onChange={onChange} />)
      fireEvent.click(screen.getByRole('checkbox'))
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })
})
