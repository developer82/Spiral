// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import SizeSelector from '../SizeSelector'

// Mirror the app-wide i18n mock: t(key) returns the key string.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// Deliberately not equal to any preset so base dims never collide in queries.
const CURRENT = { width: 1500, height: 950 }

function renderSelector(): { onChange: Mock } {
  const onChange = vi.fn()
  render(
    <SizeSelector currentWidth={CURRENT.width} currentHeight={CURRENT.height} onChange={onChange} />
  )
  return { onChange }
}

/** Latest dimensions reported to the onChange callback. */
function lastChange(onChange: Mock): { width: number; height: number } | null {
  return onChange.mock.calls.at(-1)?.[0] ?? null
}

describe('SizeSelector', () => {
  afterEach(() => cleanup())

  it('reports the current size by default', () => {
    const { onChange } = renderSelector()
    expect(lastChange(onChange)).toEqual({ width: 1500, height: 950 })
  })

  it('reports a selected common preset size', () => {
    const { onChange } = renderSelector()
    fireEvent.click(screen.getByText('1920 × 1080'))
    expect(lastChange(onChange)).toEqual({ width: 1920, height: 1080 })
  })

  it('derives height from the current width for an aspect ratio', () => {
    const { onChange } = renderSelector()
    // 16:9 of width 1500 => round(1500 * 9 / 16) = 844
    fireEvent.click(screen.getByRole('button', { name: /16:9/ }))
    expect(lastChange(onChange)).toEqual({ width: 1500, height: 844 })
  })

  it('reports custom width and height', () => {
    const { onChange } = renderSelector()
    fireEvent.click(screen.getByRole('button', { name: 'sizeSelector.custom' }))
    fireEvent.change(screen.getByLabelText('sizeSelector.width'), { target: { value: '640' } })
    fireEvent.change(screen.getByLabelText('sizeSelector.height'), { target: { value: '480' } })
    expect(lastChange(onChange)).toEqual({ width: 640, height: 480 })
  })

  it('reports null while custom size is empty', () => {
    const { onChange } = renderSelector()
    fireEvent.click(screen.getByRole('button', { name: 'sizeSelector.custom' }))
    expect(lastChange(onChange)).toBeNull()
  })

  it('reports null for an out-of-range custom size', () => {
    const { onChange } = renderSelector()
    fireEvent.click(screen.getByRole('button', { name: 'sizeSelector.custom' }))
    fireEvent.change(screen.getByLabelText('sizeSelector.width'), { target: { value: '50' } }) // below 100px min
    fireEvent.change(screen.getByLabelText('sizeSelector.height'), { target: { value: '480' } })
    expect(lastChange(onChange)).toBeNull()
  })
})
