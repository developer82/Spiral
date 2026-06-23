// @vitest-environment jsdom

import '../../../../test-setup'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import StatBox from '../StatBox'

afterEach(() => {
  cleanup()
})

describe('StatBox', () => {
  it('renders the title and value', () => {
    render(<StatBox title="Total" value={42} mainColor="#d9dde4" />)

    expect(screen.getByText('Total')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('applies mainColor as CSS variable', () => {
    const { container } = render(<StatBox title="Added" value={5} mainColor="#54b98b" />)

    const box = container.querySelector('.stat-box') as HTMLElement
    expect(box.style.getPropertyValue('--stat-box-main-color')).toBe('#54b98b')
  })

  it('applies mainColor to the bottom strip via CSS variable', () => {
    const { container } = render(<StatBox title="Removed" value={3} mainColor="#d5585a" />)

    const box = container.querySelector('.stat-box') as HTMLElement
    expect(box.style.getPropertyValue('--stat-box-main-color')).toBe('#d5585a')
  })

  it('applies backgroundColor as CSS variable when provided', () => {
    const { container } = render(
      <StatBox title="Total" value={10} mainColor="#d9dde4" backgroundColor="#5b616d" />
    )

    const box = container.querySelector('.stat-box') as HTMLElement
    expect(box.style.getPropertyValue('--stat-box-bg-color')).toBe('#5b616d')
  })

  it('uses transparent for backgroundColor CSS variable when not provided', () => {
    const { container } = render(<StatBox title="Added" value={7} mainColor="#54b98b" />)

    const box = container.querySelector('.stat-box') as HTMLElement
    expect(box.style.getPropertyValue('--stat-box-bg-color')).toBe('transparent')
  })

  it('uses transparent for backgroundColor CSS variable when null is passed', () => {
    const { container } = render(
      <StatBox title="Modified" value={2} mainColor="#468ad5" backgroundColor={null} />
    )

    const box = container.querySelector('.stat-box') as HTMLElement
    expect(box.style.getPropertyValue('--stat-box-bg-color')).toBe('transparent')
  })

  it('renders the value in a strong element', () => {
    render(<StatBox title="Skipped" value={0} mainColor="#a3abb6" />)

    const value = screen.getByText('0')
    expect(value.tagName).toBe('STRONG')
  })

  it('renders the strip element', () => {
    const { container } = render(<StatBox title="Modified" value={8} mainColor="#468ad5" />)

    expect(container.querySelector('.stat-box__strip')).toBeInTheDocument()
  })
})
