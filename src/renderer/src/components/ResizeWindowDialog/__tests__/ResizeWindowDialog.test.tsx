// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import ResizeWindowDialog from '../ResizeWindowDialog'

// Mirror the app-wide i18n mock: t(key) returns the key string.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof ResizeWindowDialog>> = {}
): { onResize: Mock; onCancel: Mock } {
  const onResize = vi.fn()
  const onCancel = vi.fn()
  render(
    <ResizeWindowDialog
      open={true}
      currentWidth={1500}
      currentHeight={950}
      onResize={onResize}
      onCancel={onCancel}
      {...overrides}
    />
  )
  return { onResize, onCancel }
}

const resizeBtn = (): HTMLElement =>
  screen.getByRole('button', { name: 'resizeWindowDialog.resize' })

describe('ResizeWindowDialog', () => {
  afterEach(() => cleanup())

  it('renders nothing when open is false', () => {
    const { container } = render(
      <ResizeWindowDialog
        open={false}
        currentWidth={1500}
        currentHeight={950}
        onResize={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('resizes to the current size by default', () => {
    const { onResize } = renderDialog()
    fireEvent.click(resizeBtn())
    expect(onResize).toHaveBeenCalledWith(1500, 950)
  })

  it('resizes to a selected preset size', () => {
    const { onResize } = renderDialog()
    fireEvent.click(screen.getByText('1280 × 720'))
    fireEvent.click(resizeBtn())
    expect(onResize).toHaveBeenCalledWith(1280, 720)
  })

  it('disables Resize for an incomplete custom size', () => {
    const { onResize } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'sizeSelector.custom' }))
    expect(resizeBtn()).toBeDisabled()
    fireEvent.click(resizeBtn())
    expect(onResize).not.toHaveBeenCalled()
  })

  it('cancel triggers onCancel without resizing', () => {
    const { onCancel, onResize } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'resizeWindowDialog.cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onResize).not.toHaveBeenCalled()
  })
})
