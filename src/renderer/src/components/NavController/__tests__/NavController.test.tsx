import { createPortal } from 'react-dom'
import { render, screen, cleanup, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import NavController, { useScreenNav } from '../NavController'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

vi.mock('../../SideNav/SideNav', () => ({
  default: ({ activeItem, isVisible }: { activeItem?: string; isVisible?: boolean }) => (
    <aside data-testid="sidenav" data-active={activeItem} data-visible={isVisible} />
  )
}))

vi.mock('../../../hooks/useSkyColor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../hooks/useSkyColor')>()),
  useSkyColor: () => ({ r: 100, g: 150, b: 200, intensity: 1 })
}))

afterEach(() => {
  cleanup()
})

function SlotProbe({ label }: { label: string }): React.JSX.Element {
  const slotEl = useScreenNav()
  if (!slotEl) return <></>
  return <>{createPortal(<div data-testid="portaled-content">{label}</div>, slotEl)}</>
}

describe('NavController', () => {
  describe('rendering', () => {
    it('renders the SideNav', () => {
      render(<NavController />)
      expect(screen.getByTestId('sidenav')).toBeTruthy()
    })

    it('passes activeItem to SideNav', () => {
      render(<NavController activeItem="explorer" />)
      expect(screen.getByTestId('sidenav').getAttribute('data-active')).toBe('explorer')
    })

    it('passes isVisible to SideNav', () => {
      render(<NavController isVisible={false} />)
      expect(screen.getByTestId('sidenav').getAttribute('data-visible')).toBe('false')
    })

    it('renders children', () => {
      render(
        <NavController>
          <div data-testid="child-content">main content</div>
        </NavController>
      )
      expect(screen.getByTestId('child-content')).toBeTruthy()
    })

    it('renders the screen-nav slot element', () => {
      const { container } = render(<NavController />)
      expect(container.querySelector('.nav-controller__screen-nav')).toBeTruthy()
    })

    it('applies sky color glow variables to the screen-nav slot', async () => {
      const { container } = await act(async () => render(<NavController />))
      const slot = container.querySelector('.nav-controller__screen-nav') as HTMLElement
      expect(slot.style.getPropertyValue('--sidenav-glow-bg')).toBe('rgba(100, 150, 200, 0.120)')
      expect(slot.style.getPropertyValue('--sidenav-glow-border')).toBe('rgba(100, 150, 200, 0.350)')
    })
  })

  describe('useScreenNav', () => {
    it('returns null when used outside NavController', () => {
      let capturedSlot: HTMLDivElement | null = undefined as unknown as HTMLDivElement | null
      function Probe(): React.JSX.Element {
        capturedSlot = useScreenNav()
        return <></>
      }
      render(<Probe />)
      expect(capturedSlot).toBeNull()
    })

    it('returns the slot element when used inside NavController', async () => {
      let capturedSlot: HTMLDivElement | null = null
      function Probe(): React.JSX.Element {
        capturedSlot = useScreenNav()
        return <></>
      }
      await act(async () => {
        render(
          <NavController>
            <Probe />
          </NavController>
        )
      })
      expect(capturedSlot).not.toBeNull()
      expect((capturedSlot as unknown as HTMLDivElement) instanceof HTMLDivElement).toBe(true)
    })
  })

  describe('portal injection', () => {
    it('renders portaled content inside the screen-nav slot', async () => {
      await act(async () => {
        render(
          <NavController>
            <SlotProbe label="injected nav" />
          </NavController>
        )
      })
      expect(screen.getByTestId('portaled-content').textContent).toBe('injected nav')
    })

    it('portaled content appears inside nav-controller__screen-nav', async () => {
      const { container } = await act(async () =>
        render(
          <NavController>
            <SlotProbe label="slot content" />
          </NavController>
        )
      )
      const slot = container.querySelector('.nav-controller__screen-nav')
      expect(slot).toBeTruthy()
      expect(slot!.querySelector('[data-testid="portaled-content"]')).toBeTruthy()
    })

    it('renders no portaled content when slot consumer is absent', async () => {
      const { container } = render(<NavController />)
      const slot = container.querySelector('.nav-controller__screen-nav')
      expect(slot!.childElementCount).toBe(0)
    })
  })
})
