// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfettiProvider, useConfettiContext } from '../../../contexts/ConfettiContext'
import ConfettiLayer from '../ConfettiLayer'

function TriggerHandle({
  triggerRef
}: {
  triggerRef: { current: (() => void) | null }
}): null {
  const { triggerConfetti } = useConfettiContext()
  triggerRef.current = triggerConfetti
  return null
}

function renderWithTrigger(): { triggerRef: { current: (() => void) | null } } {
  const triggerRef: { current: (() => void) | null } = { current: null }
  render(
    <ConfettiProvider>
      <TriggerHandle triggerRef={triggerRef} />
      <ConfettiLayer />
    </ConfettiProvider>
  )
  return { triggerRef }
}

describe('ConfettiLayer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('renders nothing when there are no active bursts', () => {
    render(
      <ConfettiProvider>
        <ConfettiLayer />
      </ConfettiProvider>
    )
    expect(document.querySelector('.confetti-layer')).not.toBeInTheDocument()
  })

  it('renders the confetti layer when a burst is triggered', () => {
    const { triggerRef } = renderWithTrigger()
    act(() => {
      triggerRef.current!()
    })
    expect(document.querySelector('.confetti-layer')).toBeInTheDocument()
  })

  it('renders confetti pieces when a burst is active', () => {
    const { triggerRef } = renderWithTrigger()
    act(() => {
      triggerRef.current!()
    })
    expect(document.querySelectorAll('.confetti-piece').length).toBeGreaterThan(0)
  })

  it('marks the layer as aria-hidden', () => {
    const { triggerRef } = renderWithTrigger()
    act(() => {
      triggerRef.current!()
    })
    expect(document.querySelector('.confetti-layer')).toHaveAttribute('aria-hidden', 'true')
  })

  it('removes the layer after the cleanup timeout', () => {
    const { triggerRef } = renderWithTrigger()
    act(() => {
      triggerRef.current!()
    })
    expect(document.querySelector('.confetti-layer')).toBeInTheDocument()
    act(() => {
      vi.advanceTimersByTime(6000)
    })
    expect(document.querySelector('.confetti-layer')).not.toBeInTheDocument()
  })
})
