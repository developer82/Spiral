import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SearchField from '../SearchField'

afterEach(() => {
  cleanup()
})

describe('SearchField', () => {
  describe('rendering', () => {
    it('renders a text input', () => {
      render(<SearchField value="" onChange={vi.fn()} />)
      expect(screen.getByRole('textbox')).toBeTruthy()
    })

    it('displays the current value', () => {
      render(<SearchField value="hello" onChange={vi.fn()} />)
      const input = screen.getByRole('textbox') as HTMLInputElement
      expect(input.value).toBe('hello')
    })

    it('applies the placeholder text', () => {
      render(<SearchField value="" onChange={vi.fn()} placeholder="Search..." />)
      expect(screen.getByPlaceholderText('Search...')).toBeTruthy()
    })

    it('applies the aria-label', () => {
      render(<SearchField value="" onChange={vi.fn()} ariaLabel="Search connections" />)
      expect(screen.getByRole('textbox').getAttribute('aria-label')).toBe('Search connections')
    })

    it('applies a custom className to the root element', () => {
      const { container } = render(
        <SearchField value="" onChange={vi.fn()} className="my-search" />
      )
      expect(container.querySelector('.search-field.my-search')).toBeTruthy()
    })
  })

  describe('search icon', () => {
    it('renders the search icon by default', () => {
      const { container } = render(<SearchField value="" onChange={vi.fn()} />)
      expect(container.querySelector('.search-field__search-icon')).toBeTruthy()
    })

    it('does not render the search icon when hideSearchIcon is true', () => {
      const { container } = render(<SearchField value="" onChange={vi.fn()} hideSearchIcon />)
      expect(container.querySelector('.search-field__search-icon')).toBeNull()
    })

    it('renders the search icon when hideSearchIcon is false', () => {
      const { container } = render(<SearchField value="" onChange={vi.fn()} hideSearchIcon={false} />)
      expect(container.querySelector('.search-field__search-icon')).toBeTruthy()
    })
  })

  describe('hint text', () => {
    it('does not render hint element when hint is omitted', () => {
      const { container } = render(<SearchField value="" onChange={vi.fn()} />)
      expect(container.querySelector('.search-field__hint')).toBeNull()
    })

    it('renders hint text when provided', () => {
      render(<SearchField value="" onChange={vi.fn()} hint="Type to filter" />)
      expect(screen.getByText('Type to filter')).toBeTruthy()
    })
  })

  describe('buttons', () => {
    it('does not render action buttons when buttons prop is omitted', () => {
      const { container } = render(<SearchField value="" onChange={vi.fn()} />)
      expect(container.querySelector('.search-field__actions')).toBeNull()
    })

    it('does not render divider when buttons prop is omitted', () => {
      const { container } = render(<SearchField value="" onChange={vi.fn()} />)
      expect(container.querySelector('.search-field__divider')).toBeNull()
    })

    it('renders the correct number of buttons', () => {
      const buttons = [
        { icon: <span>A</span>, ariaLabel: 'Button A', onClick: vi.fn() },
        { icon: <span>B</span>, ariaLabel: 'Button B', onClick: vi.fn() },
      ]
      render(<SearchField value="" onChange={vi.fn()} buttons={buttons} />)
      expect(screen.getAllByRole('button')).toHaveLength(2)
    })

    it('applies aria-label to each button', () => {
      const buttons = [
        { icon: <span>A</span>, ariaLabel: 'Filter', onClick: vi.fn() },
        { icon: <span>B</span>, ariaLabel: 'Sort', onClick: vi.fn() },
      ]
      render(<SearchField value="" onChange={vi.fn()} buttons={buttons} />)
      expect(screen.getByRole('button', { name: 'Filter' })).toBeTruthy()
      expect(screen.getByRole('button', { name: 'Sort' })).toBeTruthy()
    })

    it('renders a divider when buttons are provided', () => {
      const buttons = [{ icon: <span>A</span>, ariaLabel: 'Filter', onClick: vi.fn() }]
      const { container } = render(<SearchField value="" onChange={vi.fn()} buttons={buttons} />)
      expect(container.querySelector('.search-field__divider')).toBeTruthy()
    })

    it('applies active class to an active button', () => {
      const buttons = [
        { icon: <span>A</span>, ariaLabel: 'Filter', onClick: vi.fn(), active: true },
      ]
      const { container } = render(<SearchField value="" onChange={vi.fn()} buttons={buttons} />)
      expect(container.querySelector('.search-field__btn--active')).toBeTruthy()
    })

    it('does not apply active class to an inactive button', () => {
      const buttons = [
        { icon: <span>A</span>, ariaLabel: 'Filter', onClick: vi.fn(), active: false },
      ]
      const { container } = render(<SearchField value="" onChange={vi.fn()} buttons={buttons} />)
      expect(container.querySelector('.search-field__btn--active')).toBeNull()
    })

    it('sets aria-pressed=true on an active button', () => {
      const buttons = [
        { icon: <span>A</span>, ariaLabel: 'Filter', onClick: vi.fn(), active: true },
      ]
      render(<SearchField value="" onChange={vi.fn()} buttons={buttons} />)
      expect(screen.getByRole('button', { name: 'Filter' }).getAttribute('aria-pressed')).toBe('true')
    })

    it('calls the button onClick handler when clicked', () => {
      const onClick = vi.fn()
      const buttons = [{ icon: <span>A</span>, ariaLabel: 'Filter', onClick }]
      render(<SearchField value="" onChange={vi.fn()} buttons={buttons} />)
      fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
      expect(onClick).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear button', () => {
    it('does not render the clear button when value is empty', () => {
      render(<SearchField value="" onChange={vi.fn()} />)
      expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull()
    })

    it('renders the clear button when value is non-empty', () => {
      render(<SearchField value="hello" onChange={vi.fn()} />)
      expect(screen.getByRole('button', { name: 'Clear search' })).toBeTruthy()
    })

    it('calls onChange with empty string when clear button is clicked', () => {
      const onChange = vi.fn()
      render(<SearchField value="hello" onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      expect(onChange).toHaveBeenCalledWith('')
    })

    it('calls onChange exactly once when clear button is clicked', () => {
      const onChange = vi.fn()
      render(<SearchField value="hello" onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })

  describe('interaction', () => {
    it('calls onChange when the input value changes', () => {
      const onChange = vi.fn()
      render(<SearchField value="" onChange={onChange} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'abc' } })
      expect(onChange).toHaveBeenCalledWith('abc')
    })

    it('calls onChange exactly once per change event', () => {
      const onChange = vi.fn()
      render(<SearchField value="" onChange={onChange} />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
      expect(onChange).toHaveBeenCalledTimes(1)
    })
  })
})
