// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, type Mock } from 'vitest'
import TakeScreenshotDialog, {
  type ScreenshotPreview
} from '../TakeScreenshotDialog'

// Mirror the app-wide i18n mock: t(key) returns the key string.
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

// Stub the canvas compositing so tests don't depend on a real 2D context;
// it just tags the URL so we can assert whether compositing ran.
vi.mock('../trafficLights', () => ({
  composeScreenshotWithTrafficLights: (dataUrl: string) =>
    Promise.resolve(`${dataUrl}#with-traffic-lights`)
}))

// Deliberately not equal to any preset so preview dims never collide in queries.
const preview: ScreenshotPreview = {
  dataUrl: 'data:image/png;base64,AAAA',
  width: 1500,
  height: 950
}

function renderDialog(
  overrides: Partial<React.ComponentProps<typeof TakeScreenshotDialog>> = {}
): { onConfirm: Mock; onCancel: Mock } {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <TakeScreenshotDialog
      open={true}
      preview={preview}
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />
  )
  return { onConfirm, onCancel }
}

const captureBtn = (): HTMLElement =>
  screen.getByRole('button', { name: 'takeScreenshotDialog.capture' })

describe('TakeScreenshotDialog', () => {
  afterEach(() => cleanup())

  it('renders nothing when open is false', () => {
    const { container } = render(
      <TakeScreenshotDialog open={false} preview={preview} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when preview is null', () => {
    const { container } = render(
      <TakeScreenshotDialog open={true} preview={null} onConfirm={vi.fn()} onCancel={vi.fn()} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the dialog and the preview image when open', () => {
    renderDialog()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('data:image/png;base64,AAAA')
  })

  it('defaults to the current size and captures at the window dimensions', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(captureBtn())
    expect(onConfirm).toHaveBeenCalledWith(1500, 950)
  })

  it('captures at a selected common preset size', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByText('1920 × 1080'))
    fireEvent.click(captureBtn())
    expect(onConfirm).toHaveBeenCalledWith(1920, 1080)
  })

  it('derives height from the current width for an aspect ratio', () => {
    const { onConfirm } = renderDialog()
    // 16:9 of width 1500 => round(1500 * 9 / 16) = 844
    fireEvent.click(screen.getByRole('button', { name: /16:9/ }))
    fireEvent.click(captureBtn())
    expect(onConfirm).toHaveBeenCalledWith(1500, 844)
  })

  it('captures at custom width and height', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'sizeSelector.custom' }))
    fireEvent.change(screen.getByLabelText('sizeSelector.width'), {
      target: { value: '640' }
    })
    fireEvent.change(screen.getByLabelText('sizeSelector.height'), {
      target: { value: '480' }
    })
    fireEvent.click(captureBtn())
    expect(onConfirm).toHaveBeenCalledWith(640, 480)
  })

  it('disables Capture while custom size is empty', () => {
    const { onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'sizeSelector.custom' }))
    expect(captureBtn()).toBeDisabled()
    fireEvent.click(captureBtn())
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('disables Capture for an out-of-range custom size', () => {
    renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'sizeSelector.custom' }))
    fireEvent.change(screen.getByLabelText('sizeSelector.width'), {
      target: { value: '50' } // below the 100px minimum
    })
    fireEvent.change(screen.getByLabelText('sizeSelector.height'), {
      target: { value: '480' }
    })
    expect(captureBtn()).toBeDisabled()
  })

  it('shows the keyboard-shortcut hint under the preview', () => {
    renderDialog()
    expect(screen.getByText('takeScreenshotDialog.shortcutHint')).toBeInTheDocument()
  })

  it('shows the raw preview when traffic lights are not requested', () => {
    renderDialog()
    const img = screen.getByRole('img') as HTMLImageElement
    expect(img.src).toContain('data:image/png;base64,AAAA')
    expect(img.src).not.toContain('with-traffic-lights')
  })

  it('composites traffic lights onto the preview when requested', async () => {
    renderDialog({ showTrafficLights: true })
    await waitFor(() => {
      const img = screen.getByRole('img') as HTMLImageElement
      expect(img.src).toContain('with-traffic-lights')
    })
  })

  it('cancel triggers onCancel without capturing', () => {
    const { onCancel, onConfirm } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'takeScreenshotDialog.cancel' }))
    expect(onCancel).toHaveBeenCalledOnce()
    expect(onConfirm).not.toHaveBeenCalled()
  })
})
