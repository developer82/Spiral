// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfettiProvider, useConfettiContext } from '../ConfettiContext'
import type { ConfettiBurst } from '../ConfettiContext'

function TestConsumer({
  onRender
}: {
  onRender: (value: { bursts: ConfettiBurst[]; triggerConfetti: () => void }) => void
}): null {
  const value = useConfettiContext()
  onRender(value)
  return null
}

describe('ConfettiContext', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('starts with an empty burst list', () => {
    const onRender = vi.fn()
    render(
      <ConfettiProvider>
        <TestConsumer onRender={onRender} />
      </ConfettiProvider>
    )
    const { bursts } = onRender.mock.calls[onRender.mock.calls.length - 1][0]
    expect(bursts).toHaveLength(0)
  })

  it('adds a burst with particles when triggerConfetti is called', () => {
    let captured: ReturnType<typeof useConfettiContext> | null = null
    const onRender = vi.fn((v) => {
      captured = v
    })

    render(
      <ConfettiProvider>
        <TestConsumer onRender={onRender} />
      </ConfettiProvider>
    )

    act(() => {
      captured!.triggerConfetti()
    })

    const { bursts } = onRender.mock.calls[onRender.mock.calls.length - 1][0]
    expect(bursts).toHaveLength(1)
    expect(bursts[0].particles.length).toBeGreaterThan(0)
  })

  it('assigns unique ids to each particle within a burst', () => {
    let captured: ReturnType<typeof useConfettiContext> | null = null
    const onRender = vi.fn((v) => {
      captured = v
    })

    render(
      <ConfettiProvider>
        <TestConsumer onRender={onRender} />
      </ConfettiProvider>
    )

    act(() => {
      captured!.triggerConfetti()
    })

    const { bursts } = onRender.mock.calls[onRender.mock.calls.length - 1][0]
    const ids = bursts[0].particles.map((p) => p.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it('removes the burst after the cleanup timeout', () => {
    let captured: ReturnType<typeof useConfettiContext> | null = null
    const onRender = vi.fn((v) => {
      captured = v
    })

    render(
      <ConfettiProvider>
        <TestConsumer onRender={onRender} />
      </ConfettiProvider>
    )

    act(() => {
      captured!.triggerConfetti()
    })

    // Advance past max duration (3600ms) + delay (400ms) + buffer (500ms)
    act(() => {
      vi.advanceTimersByTime(6000)
    })

    const { bursts } = onRender.mock.calls[onRender.mock.calls.length - 1][0]
    expect(bursts).toHaveLength(0)
  })

  it('supports multiple simultaneous bursts', () => {
    let captured: ReturnType<typeof useConfettiContext> | null = null
    const onRender = vi.fn((v) => {
      captured = v
    })

    render(
      <ConfettiProvider>
        <TestConsumer onRender={onRender} />
      </ConfettiProvider>
    )

    act(() => {
      captured!.triggerConfetti()
      captured!.triggerConfetti()
    })

    const { bursts } = onRender.mock.calls[onRender.mock.calls.length - 1][0]
    expect(bursts).toHaveLength(2)
  })

  it('throws when used outside ConfettiProvider', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<TestConsumer onRender={vi.fn()} />)).toThrow(
      'useConfettiContext must be used inside ConfettiProvider'
    )
    consoleSpy.mockRestore()
  })
})
