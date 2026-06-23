import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ErrorBox from '../ErrorBox'

const writeTextMock = vi.fn()

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    writable: true,
    configurable: true
  })
  writeTextMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('ErrorBox', () => {
  describe('rendering', () => {
    it('renders the error message', () => {
      render(<ErrorBox error="Something went wrong" />)
      expect(screen.getByText('Something went wrong')).toBeTruthy()
      expect(screen.getByText('Error:')).toBeTruthy()
    })

    it('renders the SQL statement when provided', () => {
      render(<ErrorBox error="Syntax error" statement="SELECT * FORM users" />)
      expect(screen.getByText('SELECT * FORM users')).toBeTruthy()
    })

    it('does not render statement block when statement is not provided', () => {
      render(<ErrorBox error="Some error" />)
      expect(screen.queryByRole('generic', { name: /statement/i })).toBeNull()
      const pres = document.querySelectorAll('pre')
      expect(pres.length).toBe(0)
    })

    it('has role="alert"', () => {
      render(<ErrorBox error="Error" />)
      expect(screen.getByRole('alert')).toBeTruthy()
    })
  })

  describe('context menu', () => {
    it('does not show context menu by default', () => {
      render(<ErrorBox error="Error" />)
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('shows context menu on right-click', () => {
      render(<ErrorBox error="Error" />)
      fireEvent.contextMenu(screen.getByRole('alert'))
      expect(screen.getByRole('menu')).toBeTruthy()
      expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeTruthy()
    })

    it('hides context menu after clicking Copy', () => {
      render(<ErrorBox error="Error" />)
      fireEvent.contextMenu(screen.getByRole('alert'))
      fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Copy' }))
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('hides context menu when clicking outside the app', () => {
      render(
        <div>
          <ErrorBox error="Error" />
          <button>outside</button>
        </div>
      )
      fireEvent.contextMenu(screen.getByRole('alert'))
      expect(screen.getByRole('menu')).toBeTruthy()
      fireEvent.mouseDown(screen.getByText('outside'))
      expect(screen.queryByRole('menu')).toBeNull()
    })

    it('hides context menu when left-clicking inside the error box', () => {
      render(<ErrorBox error="Error" />)
      fireEvent.contextMenu(screen.getByRole('alert'))
      expect(screen.getByRole('menu')).toBeTruthy()
      fireEvent.mouseDown(screen.getByRole('alert'))
      expect(screen.queryByRole('menu')).toBeNull()
    })
  })

  describe('copy behaviour', () => {
    it('copies full error (no statement) when no text is selected', () => {
      render(<ErrorBox error="Connection failed" />)
      fireEvent.contextMenu(screen.getByRole('alert'))
      fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Copy' }))
      expect(writeTextMock).toHaveBeenCalledWith('Error: Connection failed')
    })

    it('copies full error with statement when no text is selected', () => {
      render(<ErrorBox error="Syntax error" statement="SELECT * FORM users" />)
      fireEvent.contextMenu(screen.getByRole('alert'))
      fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Copy' }))
      expect(writeTextMock).toHaveBeenCalledWith('Error: Syntax error\n\nSELECT * FORM users')
    })

    it('copies only the selected text when a selection exists', () => {
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => 'Syntax'
      } as Selection)

      render(<ErrorBox error="Syntax error" statement="SELECT * FORM users" />)
      fireEvent.contextMenu(screen.getByRole('alert'))
      fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Copy' }))
      expect(writeTextMock).toHaveBeenCalledWith('Syntax')

      getSelectionSpy.mockRestore()
    })

    it('copies full error when selection is empty string', () => {
      const getSelectionSpy = vi.spyOn(window, 'getSelection').mockReturnValue({
        toString: () => ''
      } as Selection)

      render(<ErrorBox error="DB error" statement="DROP TABLE users" />)
      fireEvent.contextMenu(screen.getByRole('alert'))
      fireEvent.mouseDown(screen.getByRole('menuitem', { name: 'Copy' }))
      expect(writeTextMock).toHaveBeenCalledWith('Error: DB error\n\nDROP TABLE users')

      getSelectionSpy.mockRestore()
    })
  })
})
