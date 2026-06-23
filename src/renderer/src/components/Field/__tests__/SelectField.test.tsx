import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SelectField from '../SelectField'

const options = [
  { value: 'postgres', label: 'PostgreSQL' },
  { value: 'mysql', label: 'MySQL' },
  { value: 'sqlite', label: 'SQLite', disabled: true }
]

afterEach(() => {
  cleanup()
})

describe('SelectField', () => {
  it('renders the selected option', () => {
    render(<SelectField options={options} value="mysql" onChange={vi.fn()} ariaLabel="Provider" />)
    expect(screen.getByRole('combobox', { name: 'Provider' })).toHaveTextContent('MySQL')
  })

  it('opens a listbox under the combobox', () => {
    render(<SelectField options={options} value="" onChange={vi.fn()} ariaLabel="Provider" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Provider' }))
    expect(screen.getByRole('listbox', { name: 'Provider' })).toBeInTheDocument()
  })

  it('selects an option and closes', () => {
    const onChange = vi.fn()
    render(<SelectField options={options} value="" onChange={onChange} ariaLabel="Provider" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Provider' }))
    fireEvent.click(screen.getByRole('option', { name: 'PostgreSQL' }))
    expect(onChange).toHaveBeenCalledWith('postgres')
    expect(screen.queryByRole('listbox', { name: 'Provider' })).not.toBeInTheDocument()
  })

  it('closes on Escape', () => {
    render(<SelectField options={options} value="" onChange={vi.fn()} ariaLabel="Provider" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Provider' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('listbox', { name: 'Provider' })).not.toBeInTheDocument()
  })

  it('marks disabled options as disabled', () => {
    render(<SelectField options={options} value="" onChange={vi.fn()} ariaLabel="Provider" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Provider' }))
    expect(screen.getByRole('option', { name: 'SQLite' })).toBeDisabled()
  })
})
