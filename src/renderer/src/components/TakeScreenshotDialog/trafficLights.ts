/**
 * macOS renders the window "traffic light" buttons (close / minimize / zoom) as
 * a native layer on top of the web contents. `webContents.capturePage()` only
 * grabs the web layer, so screenshots taken on macOS with a hidden title bar are
 * missing those buttons. To keep captured screenshots looking like the real
 * window we paint artificial traffic lights onto the captured image.
 *
 * All geometry constants are expressed in logical (CSS) pixels and match the
 * native `trafficLightPosition: { x: 12, y: 11 }` used when the window is
 * created, so the artificial buttons line up with where the native ones sit.
 */

/** Diameter of a single traffic-light button, in logical pixels. */
const BUTTON_DIAMETER = 12
const BUTTON_RADIUS = BUTTON_DIAMETER / 2
/** Center-to-center distance between adjacent buttons, in logical pixels. */
const BUTTON_SPACING = 20
/** Top-left of the button group, matching the native trafficLightPosition. */
const GROUP_LEFT = 12
const GROUP_TOP = 11

/** Fill + border colors for close, minimize and zoom, in native order. */
export const TRAFFIC_LIGHT_COLORS = [
  { fill: '#FF5F57', stroke: '#E0443E' }, // close (red)
  { fill: '#FEBC2E', stroke: '#DEA123' }, // minimize (yellow)
  { fill: '#28C840', stroke: '#1AAB29' } // zoom (green)
] as const

/**
 * Paint the three traffic-light buttons onto a 2D canvas context. `scale` maps
 * logical pixels to the image's device pixels (e.g. 2 on a Retina capture), so
 * the buttons render crisply at the captured image's real resolution.
 */
export function drawTrafficLights(ctx: CanvasRenderingContext2D, scale: number): void {
  ctx.save()
  for (let i = 0; i < TRAFFIC_LIGHT_COLORS.length; i++) {
    const centerX = (GROUP_LEFT + BUTTON_RADIUS + i * BUTTON_SPACING) * scale
    const centerY = (GROUP_TOP + BUTTON_RADIUS) * scale
    const radius = BUTTON_RADIUS * scale

    ctx.beginPath()
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2)
    ctx.fillStyle = TRAFFIC_LIGHT_COLORS[i].fill
    ctx.fill()
    ctx.lineWidth = Math.max(1, scale)
    ctx.strokeStyle = TRAFFIC_LIGHT_COLORS[i].stroke
    ctx.stroke()
  }
  ctx.restore()
}

/**
 * Load a captured PNG data URL, overlay the artificial traffic lights and return
 * the composited PNG data URL. `logicalWidth` is the window content width in
 * logical pixels the capture was taken at; it is used to derive the device scale
 * so the buttons sit at the correct size/position regardless of Retina scaling.
 *
 * If the image can't be loaded or a 2D context isn't available (e.g. under a
 * test environment without canvas support) the original data URL is returned
 * unchanged so the screenshot still saves.
 */
export function composeScreenshotWithTrafficLights(
  dataUrl: string,
  logicalWidth: number
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        resolve(dataUrl)
        return
      }
      ctx.drawImage(img, 0, 0)
      const scale = logicalWidth > 0 ? img.naturalWidth / logicalWidth : 1
      drawTrafficLights(ctx, scale)
      resolve(canvas.toDataURL('image/png'))
    }
    img.onerror = () => resolve(dataUrl)
    img.src = dataUrl
  })
}
