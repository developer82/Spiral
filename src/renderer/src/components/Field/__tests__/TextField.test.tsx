import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import TextField from '../TextField'

afterEach(() => {
  cleanup()
})

describe('TextField', () => {
  it('renders a textbox with the current value', () => {
    render(<TextField value="spiral" onChange={vi.fn()} ariaLabel="Name" />)
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('spiral')
  })

  it('calls onChange with the next input value', () => {
    const onChange = vi.fn()
    render(<TextField value="" onChange={onChange} ariaLabel="Name" />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'db' } })
    expect(onChange).toHaveBeenCalledWith('db')
  })

  it('shows a circular clear button when the field has text', () => {
    render(<TextField value="db" onChange={vi.fn()} ariaLabel="Name" />)
    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('clears the value through onChange', () => {
    const onChange = vi.fn()
    render(<TextField value="db" onChange={onChange} ariaLabel="Name" />)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onChange).toHaveBeenCalledWith('')
  })

  it('hides the clear button when disabled', () => {
    render(<TextField value="db" onChange={vi.fn()} ariaLabel="Name" disabled />)
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
  })
})
