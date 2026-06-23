import { act, fireEvent, render, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { Toolbar } from '../Toolbar'

vi.mock('../../../pages/Settings/useSettings', () => ({
  useSettings: () => ({
    settings: { showToolbarTextButtons: false },
    updateSetting: vi.fn(),
    resetSettings: vi.fn()
  })
}))

afterEach(() => {
  cleanup()
})

describe('Toolbar', () => {
  it('renders a single group without any separator', () => {
    const { container } = render(
      <Toolbar groups={[[<span key="a">A</span>]]} />
    )
    expect(container.querySelector('.toolbar')).toBeInTheDocument()
    expect(container.querySelector('.toolbar-btn__separator')).not.toBeInTheDocument()
  })

  it('renders separators between multiple non-empty groups', () => {
    const { container } = render(
      <Toolbar groups={[
        [<span key="a">A</span>],
        [<span key="b">B</span>],
        [<span key="c">C</span>]
      ]} />
    )
    expect(container.querySelectorAll('.toolbar-btn__separator')).toHaveLength(2)
  })

  it('filters out groups where all children are null or false', () => {
    const { container } = render(
      <Toolbar groups={[
        [<span key="a">A</span>],
        [null, false, undefined],
        [<span key="b">B</span>]
      ]} />
    )
    expect(container.querySelectorAll('.toolbar-btn__separator')).toHaveLength(1)
  })

  it('renders no separator when only one non-empty group remains after filtering', () => {
    const { container } = render(
      <Toolbar groups={[
        [null, false],
        [<span key="a">A</span>],
        [undefined]
      ]} />
    )
    expect(container.querySelector('.toolbar-btn__separator')).not.toBeInTheDocument()
  })

  it('renders no separator with no groups', () => {
    const { container } = render(<Toolbar groups={[]} />)
    expect(container.querySelector('.toolbar')).toBeInTheDocument()
    expect(container.querySelector('.toolbar-btn__separator')).not.toBeInTheDocument()
  })

  it('applies className prop alongside toolbar class', () => {
    const { container } = render(
      <Toolbar groups={[[<span key="a">A</span>]]} className="my-toolbar" />
    )
    const toolbar = container.querySelector('.toolbar')
    expect(toolbar).toBeInTheDocument()
    expect(toolbar).toHaveClass('my-toolbar')
  })
})

describe('Toolbar (macOS)', () => {
  let originalPlatform: NodeJS.Platform

  beforeEach(() => {
    const api = (window as unknown as { api: { platform: NodeJS.Platform } }).api
    originalPlatform = api.platform
    api.platform = 'darwin'
    document.documentElement.setAttribute('data-platform', 'darwin')
    vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  })

  afterEach(() => {
    const api = (window as unknown as { api: { platform: NodeJS.Platform } }).api
    api.platform = originalPlatform
    document.documentElement.removeAttribute('data-platform')
    vi.restoreAllMocks()
  })

  it('wraps each non-empty group in .toolbar__group', () => {
    const { container } = render(
      <Toolbar groups={[
        [<button key="a" className="toolbar-btn">A</button>],
        [<button key="b" className="toolbar-btn">B</button>]
      ]} />
    )
    expect(container.querySelectorAll('.toolbar__group')).toHaveLength(2)
  })

  it('does not render toolbar-btn__separator between groups on macOS', () => {
    const { container } = render(
      <Toolbar groups={[
        [<button key="a" className="toolbar-btn">A</button>],
        [<button key="b" className="toolbar-btn">B</button>]
      ]} />
    )
    expect(container.querySelector('.toolbar-btn__separator')).not.toBeInTheDocument()
  })

  it('interleaves a divider between buttons inside a group ((n-1) dividers for n children)', () => {
    const { container } = render(
      <Toolbar groups={[[
        <button key="a" className="toolbar-btn">A</button>,
        <button key="b" className="toolbar-btn">B</button>,
        <button key="c" className="toolbar-btn">C</button>
      ]]} />
    )
    expect(container.querySelectorAll('.toolbar__group-divider')).toHaveLength(2)
  })

  it('does not render a divider when a group has only one child', () => {
    const { container } = render(
      <Toolbar groups={[[<button key="a" className="toolbar-btn">A</button>]]} />
    )
    expect(container.querySelector('.toolbar__group-divider')).not.toBeInTheDocument()
  })

  it('filters null/false children before interleaving dividers', () => {
    const { container } = render(
      <Toolbar groups={[[
        <button key="a" className="toolbar-btn">A</button>,
        null,
        false,
        <button key="b" className="toolbar-btn">B</button>
      ]]} />
    )
    expect(container.querySelectorAll('.toolbar__group-divider')).toHaveLength(1)
  })

  it('reflects window focus state via data-window-focused', () => {
    const { container } = render(
      <Toolbar groups={[[<button key="a" className="toolbar-btn">A</button>]]} />
    )
    const toolbar = container.querySelector('.toolbar') as HTMLElement
    expect(toolbar.getAttribute('data-window-focused')).toBe('true')

    act(() => {
      fireEvent.blur(window)
    })
    expect(toolbar.getAttribute('data-window-focused')).toBe('false')

    act(() => {
      fireEvent.focus(window)
    })
    expect(toolbar.getAttribute('data-window-focused')).toBe('true')
  })
})
