import React from 'react'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Button from '../Button'

afterEach(() => {
  cleanup()
})

describe('Button', () => {
  describe('base class', () => {
    it('always renders with btn base class', () => {
      const { container } = render(<Button>Click</Button>)
      expect(container.querySelector('.btn')).toBeTruthy()
    })

    it('renders a button element', () => {
      render(<Button>Click</Button>)
      expect(screen.getByRole('button')).toBeTruthy()
    })

    it('defaults type to button', () => {
      render(<Button>Click</Button>)
      expect((screen.getByRole('button') as HTMLButtonElement).type).toBe('button')
    })
  })

  describe('variant classes', () => {
    it('applies btn--primary for variant="primary"', () => {
      const { container } = render(<Button variant="primary">Click</Button>)
      expect(container.querySelector('.btn--primary')).toBeTruthy()
    })

    it('applies btn--secondary for variant="secondary"', () => {
      const { container } = render(<Button variant="secondary">Click</Button>)
      expect(container.querySelector('.btn--secondary')).toBeTruthy()
    })

    it('applies btn--ghost for variant="ghost"', () => {
      const { container } = render(<Button variant="ghost">Click</Button>)
      expect(container.querySelector('.btn--ghost')).toBeTruthy()
    })

    it('applies btn--danger for variant="danger"', () => {
      const { container } = render(<Button variant="danger">Click</Button>)
      expect(container.querySelector('.btn--danger')).toBeTruthy()
    })

    it('applies btn--danger-solid for variant="danger-solid"', () => {
      const { container } = render(<Button variant="danger-solid">Click</Button>)
      expect(container.querySelector('.btn--danger-solid')).toBeTruthy()
    })

    it('defaults to primary variant when variant is omitted', () => {
      const { container } = render(<Button>Click</Button>)
      expect(container.querySelector('.btn--primary')).toBeTruthy()
    })
  })

  describe('size classes', () => {
    it('applies btn--md by default', () => {
      const { container } = render(<Button>Click</Button>)
      expect(container.querySelector('.btn--md')).toBeTruthy()
    })

    it('applies btn--sm when size="sm"', () => {
      const { container } = render(<Button size="sm">Click</Button>)
      expect(container.querySelector('.btn--sm')).toBeTruthy()
    })

    it('applies btn--lg when size="lg"', () => {
      const { container } = render(<Button size="lg">Click</Button>)
      expect(container.querySelector('.btn--lg')).toBeTruthy()
    })

    it('does not apply btn--sm when size="md"', () => {
      const { container } = render(<Button size="md">Click</Button>)
      expect(container.querySelector('.btn--sm')).toBeNull()
    })
  })

  describe('isLoading', () => {
    it('disables the button when isLoading is true', () => {
      render(<Button isLoading>Save</Button>)
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    })

    it('renders spinner when isLoading is true', () => {
      const { container } = render(<Button isLoading>Save</Button>)
      expect(container.querySelector('.btn__spinner')).toBeTruthy()
    })

    it('does not render spinner when isLoading is false', () => {
      const { container } = render(<Button isLoading={false}>Save</Button>)
      expect(container.querySelector('.btn__spinner')).toBeNull()
    })

    it('does not render spinner when isLoading is omitted', () => {
      const { container } = render(<Button>Save</Button>)
      expect(container.querySelector('.btn__spinner')).toBeNull()
    })

    it('still disables when disabled prop is true and isLoading is false', () => {
      render(<Button disabled>Save</Button>)
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    })

    it('is enabled when isLoading is false and disabled is false', () => {
      render(<Button isLoading={false} disabled={false}>Save</Button>)
      expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false)
    })
  })

  describe('prop forwarding', () => {
    it('calls onClick when clicked', () => {
      const onClick = vi.fn()
      render(<Button onClick={onClick}>Click</Button>)
      fireEvent.click(screen.getByRole('button'))
      expect(onClick).toHaveBeenCalledTimes(1)
    })

    it('does not call onClick when disabled', () => {
      const onClick = vi.fn()
      render(<Button disabled onClick={onClick}>Click</Button>)
      fireEvent.click(screen.getByRole('button'))
      expect(onClick).not.toHaveBeenCalled()
    })

    it('forwards aria-label', () => {
      render(<Button aria-label="Save document">Save</Button>)
      expect(screen.getByRole('button').getAttribute('aria-label')).toBe('Save document')
    })

    it('forwards type prop', () => {
      render(<Button type="submit">Submit</Button>)
      expect((screen.getByRole('button') as HTMLButtonElement).type).toBe('submit')
    })

    it('appends className without removing base classes', () => {
      const { container } = render(<Button className="my-extra-class">Click</Button>)
      const btn = container.querySelector('.btn')
      expect(btn).toBeTruthy()
      expect(btn?.classList.contains('my-extra-class')).toBe(true)
      expect(btn?.classList.contains('btn--primary')).toBe(true)
    })

    it('forwards data attributes', () => {
      render(<Button data-testid="my-btn">Click</Button>)
      expect(screen.getByTestId('my-btn')).toBeTruthy()
    })
  })

  describe('ref forwarding', () => {
    it('forwards ref to the underlying button element', () => {
      const ref = React.createRef<HTMLButtonElement>()
      render(<Button ref={ref}>Click</Button>)
      expect(ref.current).toBeTruthy()
      expect(ref.current?.tagName).toBe('BUTTON')
    })
  })
})
