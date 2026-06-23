// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('electron', () => ({
  app: { getVersion: vi.fn(() => '1.2.3') }
}))

// Controllable opt-out flag and a tiny in-memory analytics store.
const settingsGet = vi.fn((_key: string) => true as unknown)
let clientIdValue = ''
const analyticsGet = vi.fn((_key: string) => clientIdValue)
const analyticsSet = vi.fn((key: string, value: string) => {
  void key
  clientIdValue = value
})

vi.mock('../store', () => ({
  default: { get: (key: string) => settingsGet(key) },
  analyticsStore: {
    get: (key: string) => analyticsGet(key),
    set: (key: string, value: string) => analyticsSet(key, value)
  }
}))

// Configured (non-placeholder) credentials so the service is enabled.
vi.mock('../analytics/constants', () => ({
  GA_MEASUREMENT_ID: 'G-REAL12345',
  GA_API_SECRET: 'real-secret',
  GA_PLACEHOLDER_MEASUREMENT_ID: 'G-XXXXXXXXXX',
  GA_PLACEHOLDER_API_SECRET: 'XXXXXXXX',
  GA_ENDPOINT: 'https://www.google-analytics.com/mp/collect',
  GA_DEBUG_ENDPOINT: 'https://www.google-analytics.com/debug/mp/collect',
  GA_REQUEST_TIMEOUT_MS: 5000,
  GA_EVENT_NAME_MAX_LENGTH: 40,
  GA_PARAM_STRING_MAX_LENGTH: 100
}))

// ── Helpers ─────────────────────────────────────────────────────────────────

function lastFetchBody(fetchMock: ReturnType<typeof vi.fn>): {
  client_id: string
  events: Array<{ name: string; params: Record<string, unknown> }>
} {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]
  return JSON.parse((call[1] as { body: string }).body)
}

describe('analytics service', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    clientIdValue = ''
    settingsGet.mockImplementation(() => true)
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as never
  })

  afterEach(() => {
    vi.resetModules()
  })

  it('sends an event to the GA Measurement Protocol endpoint with housekeeping params', async () => {
    const { trackEvent } = await import('../analytics/analytics')
    trackEvent('connection_opened', { provider: 'postgres' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toContain('https://www.google-analytics.com/mp/collect')
    expect(url).toContain('measurement_id=G-REAL12345')
    expect(url).toContain('api_secret=real-secret')
    expect((init as { method: string }).method).toBe('POST')

    const body = lastFetchBody(fetchMock)
    expect(body.events[0].name).toBe('connection_opened')
    expect(body.events[0].params.provider).toBe('postgres')
    expect(body.events[0].params.app_version).toBe('1.2.3')
    expect(body.events[0].params.platform).toBe(process.platform)
    expect(body.events[0].params.engagement_time_msec).toBe(1)
    expect(body.events[0].params.session_id).toBeDefined()
  })

  it('generates and persists a client id on first use, then reuses it', async () => {
    const { trackEvent } = await import('../analytics/analytics')

    trackEvent('app_open')
    expect(analyticsSet).toHaveBeenCalledTimes(1)
    const firstId = lastFetchBody(fetchMock).client_id
    expect(firstId).toBeTruthy()

    trackEvent('app_open')
    // No new id generated on the second call.
    expect(analyticsSet).toHaveBeenCalledTimes(1)
    expect(lastFetchBody(fetchMock).client_id).toBe(firstId)
  })

  it('does not send when the user has opted out', async () => {
    settingsGet.mockImplementation((key: string) => (key === 'analyticsEnabled' ? false : true))
    const { trackEvent } = await import('../analytics/analytics')

    trackEvent('app_open')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sanitizes event names to GA4 rules (lowercase, [a-z0-9_], max length)', async () => {
    const { trackEvent } = await import('../analytics/analytics')
    trackEvent('Some Event! With-Punctuation')

    const body = lastFetchBody(fetchMock)
    expect(body.events[0].name).toBe('some_event__with_punctuation')
  })

  it('drops overly long string params but keeps booleans and numbers', async () => {
    const { trackEvent } = await import('../analytics/analytics')
    const longValue = 'x'.repeat(200)
    trackEvent('test_event', { secret: longValue, flag: true, count: 5 })

    const params = lastFetchBody(fetchMock).events[0].params
    expect(params.secret).toBeUndefined()
    expect(params.flag).toBe(true)
    expect(params.count).toBe(5)
  })

  it('swallows fetch errors and never throws', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    const { trackEvent } = await import('../analytics/analytics')

    expect(() => trackEvent('app_open')).not.toThrow()
    // Give the rejected promise a chance to settle without surfacing.
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

  it('sends page view events with standard page_title and page_location parameters', async () => {
    const { trackPageView } = await import('../analytics/analytics')
    trackPageView('explorer')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const body = lastFetchBody(fetchMock)
    expect(body.events[0].name).toBe('page_view')
    expect(body.events[0].params.page).toBe('explorer')
    expect(body.events[0].params.page_title).toBe('explorer')
    expect(body.events[0].params.page_location).toBe('app://spiral/explorer')
  })
})

describe('analytics service with placeholder credentials', () => {
  it('does not send when credentials are still placeholders', async () => {
    vi.resetModules()
    vi.doMock('electron', () => ({ app: { getVersion: vi.fn(() => '1.0.0') } }))
    vi.doMock('../store', () => ({
      default: { get: () => true },
      analyticsStore: { get: () => 'existing-id', set: vi.fn() }
    }))
    vi.doMock('../analytics/constants', () => ({
      GA_MEASUREMENT_ID: 'G-XXXXXXXXXX',
      GA_API_SECRET: 'XXXXXXXX',
      GA_PLACEHOLDER_MEASUREMENT_ID: 'G-XXXXXXXXXX',
      GA_PLACEHOLDER_API_SECRET: 'XXXXXXXX',
      GA_ENDPOINT: 'https://www.google-analytics.com/mp/collect',
      GA_DEBUG_ENDPOINT: 'https://www.google-analytics.com/debug/mp/collect',
      GA_REQUEST_TIMEOUT_MS: 5000,
      GA_EVENT_NAME_MAX_LENGTH: 40,
      GA_PARAM_STRING_MAX_LENGTH: 100
    }))

    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    global.fetch = fetchMock as never

    const { trackEvent, isEnabled } = await import('../analytics/analytics')
    expect(isEnabled()).toBe(false)
    trackEvent('app_open')
    expect(fetchMock).not.toHaveBeenCalled()

    vi.doUnmock('../analytics/constants')
    vi.doUnmock('../store')
    vi.doUnmock('electron')
  })
})
