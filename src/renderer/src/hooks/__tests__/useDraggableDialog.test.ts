// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { useDraggableDialog } from '../useDraggableDialog'

describe('useDraggableDialog', () => {
  let panel: HTMLDivElement
  let header: HTMLDivElement

  beforeEach(() => {
    panel = document.createElement('div')
    document.body.appendChild(panel)

    header = document.createElement('div')
    ;(header as unknown as Record<string, unknown>).setPointerCapture = vi.fn()
    document.body.appendChild(header)
  })

  afterEach(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    panel.remove()
    header.remove()
  })

  function setup() {
    const hookResult = renderHook(() => useDraggableDialog())
    act(() => { hookResult.result.current.panelRef(panel) })
    return hookResult
  }

  function pointerDown(result: ReturnType<typeof setup>['result'], x: number, y: number, button = 0) {
    act(() => {
      result.current.dragHandleProps.onPointerDown({
        button, clientX: x, clientY: y, pointerId: 1,
        currentTarget: header, target: header, preventDefault: vi.fn(),
      } as unknown as React.PointerEvent)
    })
  }

  function fireMove(x: number, y: number) {
    act(() => {
      header.dispatchEvent(new MouseEvent('pointermove', { bubbles: false, clientX: x, clientY: y }))
    })
  }

  function fireUp() {
    act(() => {
      header.dispatchEvent(new MouseEvent('pointerup', { bubbles: false }))
    })
  }

  it('sets initial position on panel when ref is attached', () => {
    setup()
    expect(panel.style.position).toBe('relative')
    expect(panel.style.left).toBe('0px')
    expect(panel.style.top).toBe('0px')
  })

  it('provides dragHandleProps with grab cursor and onPointerDown handler', () => {
    const { result } = setup()
    expect(result.current.dragHandleProps.style.cursor).toBe('grab')
    expect(typeof result.current.dragHandleProps.onPointerDown).toBe('function')
  })

  it('updates panel position after a drag sequence', () => {
    const { result } = setup()
    pointerDown(result, 100, 100)
    fireMove(150, 120)
    expect(panel.style.left).toBe('50px')
    expect(panel.style.top).toBe('20px')
  })

  it('accumulates deltas across multiple moves', () => {
    const { result } = setup()
    pointerDown(result, 0, 0)
    fireMove(10, 5)
    fireMove(30, 10)
    expect(panel.style.left).toBe('30px')
    expect(panel.style.top).toBe('10px')
  })

  it('stops updating position after pointerup', () => {
    const { result } = setup()
    pointerDown(result, 100, 100)
    fireUp()
    fireMove(200, 200)
    expect(panel.style.left).toBe('0px')
    expect(panel.style.top).toBe('0px')
  })

  it('sets grabbing cursor and userSelect none during drag', () => {
    const { result } = setup()
    pointerDown(result, 100, 100)
    expect(document.body.style.cursor).toBe('grabbing')
    expect(document.body.style.userSelect).toBe('none')
  })

  it('restores cursor and userSelect after pointerup', () => {
    const { result } = setup()
    pointerDown(result, 100, 100)
    fireUp()
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  it('does not start drag for non-left-button clicks', () => {
    const { result } = setup()
    pointerDown(result, 100, 100, 2)
    fireMove(200, 200)
    expect(panel.style.left).toBe('0px')
    expect(panel.style.top).toBe('0px')
    expect(document.body.style.cursor).toBe('')
  })

  it('clamps Y to keep panel header visible on extreme upward drag', () => {
    // jsdom default innerHeight is 768; clamp floor = -(768/2 - 80) = -304
    const { result } = setup()
    pointerDown(result, 100, 100)
    fireMove(100, -9999)
    const top = parseFloat(panel.style.top)
    const expectedFloor = -(window.innerHeight / 2 - 80)
    expect(top).toBeGreaterThanOrEqual(expectedFloor)
  })

  it('does not start drag when pointerdown target is a button', () => {
    const { result } = setup()
    const btn = document.createElement('button')
    header.appendChild(btn)
    act(() => {
      result.current.dragHandleProps.onPointerDown({
        button: 0, clientX: 100, clientY: 100, pointerId: 1,
        currentTarget: header, target: btn, preventDefault: vi.fn(),
      } as unknown as React.PointerEvent)
    })
    fireMove(200, 200)
    expect(panel.style.left).toBe('0px')
    expect(panel.style.top).toBe('0px')
    expect(document.body.style.cursor).toBe('')
    btn.remove()
  })

  it('restores body styles on unmount during drag', () => {
    const { result, unmount } = setup()
    pointerDown(result, 100, 100)
    expect(document.body.style.cursor).toBe('grabbing')
    unmount()
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })

  describe('dialog--dragging class', () => {
    let overlay: HTMLDivElement

    beforeEach(() => {
      overlay = document.createElement('div')
      overlay.classList.add('my-dialog')
      overlay.appendChild(panel)
      document.body.appendChild(overlay)
    })

    afterEach(() => {
      overlay.remove()
    })

    it('adds dialog--dragging class to overlay on pointerdown', () => {
      const { result } = setup()
      pointerDown(result, 100, 100)
      expect(overlay.style.backdropFilter).toBe('blur(0px)')
    })

    it('removes dialog--dragging class from overlay on pointerup', () => {
      const { result } = setup()
      pointerDown(result, 100, 100)
      fireUp()
      expect(overlay.style.backdropFilter).toBe('')
    })

    it('removes dialog--dragging class from overlay on pointercancel', () => {
      const { result } = setup()
      pointerDown(result, 100, 100)
      act(() => {
        header.dispatchEvent(new MouseEvent('pointercancel', { bubbles: false }))
      })
      expect(overlay.style.backdropFilter).toBe('')
    })

    it('removes dialog--dragging class on unmount during drag', () => {
      const { result, unmount } = setup()
      pointerDown(result, 100, 100)
      expect(overlay.style.backdropFilter).toBe('blur(0px)')
      unmount()
      expect(overlay.style.backdropFilter).toBe('')
    })
  })
})
