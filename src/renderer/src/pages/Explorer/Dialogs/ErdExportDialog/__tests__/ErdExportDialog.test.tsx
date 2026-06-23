// @vitest-environment jsdom
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import ErdExportDialog from '../ErdExportDialog'
import type { ErdExportOptions } from '../ErdExportDialog'

describe('ErdExportDialog', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders nothing when open is false', () => {
    const { container } = render(
      <ErdExportDialog
        open={false}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders the dialog when open is true', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Export as PNG')).toBeInTheDocument()
  })

  it('background color input is present and defaults to #ffffff', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const colorInput = screen.getByLabelText('Background color') as HTMLInputElement
    expect(colorInput).toBeInTheDocument()
    expect(colorInput.value).toBe('#ffffff')
  })

  it('transparent checkbox is present and unchecked by default', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const checkbox = screen.getByLabelText('Transparent background') as HTMLInputElement
    expect(checkbox).toBeInTheDocument()
    expect(checkbox.checked).toBe(false)
  })

  it('checking transparent disables the color picker', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const transparentCheckbox = screen.getByLabelText('Transparent background')
    const colorInput = screen.getByLabelText('Background color') as HTMLInputElement

    expect(colorInput.disabled).toBe(false)
    fireEvent.click(transparentCheckbox)
    expect(colorInput.disabled).toBe(true)
  })

  it('renders the three grid toggle buttons', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByTitle('None')).toBeInTheDocument()
    expect(screen.getByTitle('Dots')).toBeInTheDocument()
    expect(screen.getByTitle('Grid')).toBeInTheDocument()
  })

  it('grid defaults to currentGrid prop', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="dots"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const dotsBtn = screen.getByTitle('Dots')
    expect(dotsBtn.className).toContain('erd-export-dialog__grid-btn--active')
    const noneBtn = screen.getByTitle('None')
    expect(noneBtn.className).not.toContain('erd-export-dialog__grid-btn--active')
  })

  it('include stats checkbox is present and checked by default', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    const checkbox = screen.getByLabelText('Include database summary') as HTMLInputElement
    expect(checkbox).toBeInTheDocument()
    expect(checkbox.checked).toBe(true)
  })

  it('cancel button triggers onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByText('Cancel'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('close button triggers onCancel', () => {
    const onCancel = vi.fn()
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />
    )
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('export button triggers onConfirm with correct default options', () => {
    const onConfirm = vi.fn()
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByText('Export'))
    expect(onConfirm).toHaveBeenCalledOnce()
    const opts: ErdExportOptions = onConfirm.mock.calls[0][0]
    expect(opts.backgroundColor).toBe('#ffffff')
    expect(opts.transparent).toBe(false)
    expect(opts.grid).toBe('none')
    expect(opts.includeStats).toBe(true)
  })

  it('changing grid selection propagates to onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByTitle('Dots'))
    fireEvent.click(screen.getByText('Export'))
    const opts: ErdExportOptions = onConfirm.mock.calls[0][0]
    expect(opts.grid).toBe('dots')
  })

  it('transparent option propagates to onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Transparent background'))
    fireEvent.click(screen.getByText('Export'))
    const opts: ErdExportOptions = onConfirm.mock.calls[0][0]
    expect(opts.transparent).toBe(true)
  })

  it('unchecking includeStats propagates to onConfirm', () => {
    const onConfirm = vi.fn()
    render(
      <ErdExportDialog
        open={true}
        databaseName="TestDb"
        currentGrid="none"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />
    )
    fireEvent.click(screen.getByLabelText('Include database summary'))
    fireEvent.click(screen.getByText('Export'))
    const opts: ErdExportOptions = onConfirm.mock.calls[0][0]
    expect(opts.includeStats).toBe(false)
  })

  it('displays the filename in the footer', () => {
    render(
      <ErdExportDialog
        open={true}
        databaseName="MyDatabase"
        currentGrid="none"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />
    )
    expect(screen.getByText('MyDatabase-erd.png')).toBeInTheDocument()
  })
})
