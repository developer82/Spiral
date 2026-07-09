// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import {
  drawTrafficLights,
  composeScreenshotWithTrafficLights,
  TRAFFIC_LIGHT_COLORS
} from '../trafficLights'

/** Minimal 2D-context stub that records the calls we assert on. */
function makeCtxStub(): {
  ctx: CanvasRenderingContext2D
  arcs: Array<{ x: number; y: number; r: number }>
  fills: string[]
  strokes: string[]
  lineWidths: number[]
} {
  const arcs: Array<{ x: number; y: number; r: number }> = []
  const fills: string[] = []
  const strokes: string[] = []
  const lineWidths: number[] = []
  // `drawTrafficLights` sets fillStyle/strokeStyle/lineWidth, then calls
  // fill()/stroke(); we snapshot the current values at those calls.
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 0 }
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    arc: (x: number, y: number, r: number) => arcs.push({ x, y, r }),
    fill: () => fills.push(state.fillStyle),
    stroke: () => {
      strokes.push(state.strokeStyle)
      lineWidths.push(state.lineWidth)
    }
  }
  // Mirror property writes into `state` so fill()/stroke() see the latest value.
  const proxy = new Proxy(ctx, {
    set(target, prop, value) {
      if (typeof prop === 'string' && prop in state) {
        ;(state as Record<string, unknown>)[prop] = value
      }
      return Reflect.set(target, prop, value)
    }
  })
  return { ctx: proxy as unknown as CanvasRenderingContext2D, arcs, fills, strokes, lineWidths }
}

describe('drawTrafficLights', () => {
  it('draws three buttons in the native close/minimize/zoom colors', () => {
    const { ctx, arcs, fills, strokes } = makeCtxStub()
    drawTrafficLights(ctx, 1)

    expect(arcs).toHaveLength(3)
    expect(fills).toEqual(TRAFFIC_LIGHT_COLORS.map((c) => c.fill))
    expect(strokes).toEqual(TRAFFIC_LIGHT_COLORS.map((c) => c.stroke))
  })

  it('positions buttons at the native offset with 20px center spacing (scale 1)', () => {
    const { ctx, arcs } = makeCtxStub()
    drawTrafficLights(ctx, 1)

    // First center: (GROUP_LEFT + RADIUS, GROUP_TOP + RADIUS) = (18, 17), r = 6.
    expect(arcs[0]).toEqual({ x: 18, y: 17, r: 6 })
    expect(arcs[1]).toEqual({ x: 38, y: 17, r: 6 })
    expect(arcs[2]).toEqual({ x: 58, y: 17, r: 6 })
  })

  it('scales positions and radius by the device scale factor', () => {
    const { ctx, arcs, lineWidths } = makeCtxStub()
    drawTrafficLights(ctx, 2)

    expect(arcs[0]).toEqual({ x: 36, y: 34, r: 12 })
    expect(arcs[2]).toEqual({ x: 116, y: 34, r: 12 })
    // Border width scales but never drops below 1px.
    expect(lineWidths.every((w) => w === 2)).toBe(true)
  })

  it('keeps a minimum 1px border below scale 1', () => {
    const { ctx, lineWidths } = makeCtxStub()
    drawTrafficLights(ctx, 0.5)
    expect(lineWidths.every((w) => w === 1)).toBe(true)
  })
})

describe('composeScreenshotWithTrafficLights', () => {
  it('returns the original data URL when the image fails to load', async () => {
    // jsdom Images never fire onload; drive onerror synchronously instead.
    const original = window.Image
    class FailingImage {
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    // @ts-expect-error test double
    window.Image = FailingImage

    const url = 'data:image/png;base64,AAAA'
    await expect(composeScreenshotWithTrafficLights(url, 800)).resolves.toBe(url)

    window.Image = original
  })
})
