import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TipsNotification from '../components/TipsNotification/TipsNotification'
import type { TipItem } from '../contexts/TipsContext'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const tipWithScreen: TipItem = {
  id: 'tip-test',
  text: 'Use Ctrl+Enter to run your query.',
  category: 'productivity',
  screen: { page: 'explorer' }
}

const tipWithSection: TipItem = {
  id: 'tip-settings',
  text: 'Adjust font scaling in appearance settings.',
  category: 'appearance',
  screen: { page: 'settings', section: 'appearance' }
}

const tipWithoutScreen: TipItem = {
  id: 'tip-general',
  text: 'A general tip with no navigation.',
  category: 'general'
}

describe('TipsNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    cleanup()
  })

  it('renders the tip text', () => {
    render(<TipsNotification tip={tipWithScreen} onDismiss={vi.fn()} />)
    expect(screen.getByText(tipWithScreen.text)).toBeInTheDocument()
  })

  it('renders a title string', () => {
    render(<TipsNotification tip={tipWithScreen} onDismiss={vi.fn()} />)
    const title = document.querySelector('.tips-notification__title')
    expect(title).not.toBeNull()
    expect(title!.textContent).toMatch(/^tips\.titles\./)
  })

  it('renders the lightbulb icon', () => {
    render(<TipsNotification tip={tipWithScreen} onDismiss={vi.fn()} />)
    expect(document.querySelector('.tips-notification__icon')).not.toBeNull()
  })

  it('applies --exiting class after close button click', () => {
    render(<TipsNotification tip={tipWithScreen} onDismiss={vi.fn()} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'tips.dismiss' })) })
    expect(document.querySelector('.tips-notification--exiting')).not.toBeNull()
  })

  it('does not call onDismiss immediately after close click', () => {
    const onDismiss = vi.fn()
    render(<TipsNotification tip={tipWithScreen} onDismiss={onDismiss} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'tips.dismiss' })) })
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('calls onDismiss after exit animation completes', () => {
    const onDismiss = vi.fn()
    render(<TipsNotification tip={tipWithScreen} onDismiss={onDismiss} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'tips.dismiss' })) })
    act(() => { vi.advanceTimersByTime(320) })
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('body with screen dispatches navigation event on click', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<TipsNotification tip={tipWithScreen} onDismiss={vi.fn()} />)
    act(() => { fireEvent.click(screen.getByText(tipWithScreen.text)) })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'menu:file-action', detail: 'view:explorer' })
    )
  })

  it('body with settings section dispatches correct navigation action', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')
    render(<TipsNotification tip={tipWithSection} onDismiss={vi.fn()} />)
    act(() => { fireEvent.click(screen.getByText(tipWithSection.text)) })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'menu:file-action', detail: 'view:settings:appearance' })
    )
  })

  it('body without screen has no clickable role', () => {
    render(<TipsNotification tip={tipWithoutScreen} onDismiss={vi.fn()} />)
    const body = document.querySelector('.tips-notification__body')
    expect(body).not.toHaveClass('tips-notification__body--clickable')
    expect(body?.getAttribute('role')).toBeNull()
  })

  it('calls onDismiss immediately when animations are off', () => {
    document.documentElement.setAttribute('data-animations', 'off')
    const onDismiss = vi.fn()
    render(<TipsNotification tip={tipWithScreen} onDismiss={onDismiss} />)
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'tips.dismiss' })) })
    expect(onDismiss).toHaveBeenCalledOnce()
    document.documentElement.removeAttribute('data-animations')
  })
})
