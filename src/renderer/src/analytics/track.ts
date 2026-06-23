// Thin renderer-side wrappers around the analytics IPC bridge. Call sites use
// these instead of touching `window.api` directly so event naming stays
// centralized. The opt-out gate lives in the main process, so these are pure
// fire-and-forget and never throw.

/** Track an arbitrary product event with optional params. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  try {
    void window.api.analytics.track(name, params)
  } catch {
    // Never let analytics break the UI.
  }
}

/** Track a page/screen view. */
export function trackPageView(pageId: string): void {
  try {
    void window.api.analytics.pageView(pageId)
  } catch {
    // Never let analytics break the UI.
  }
}
