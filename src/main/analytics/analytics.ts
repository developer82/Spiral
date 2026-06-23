import { app } from 'electron'
import { randomUUID } from 'crypto'
import store, { analyticsStore } from '../store'
import {
  GA_API_SECRET,
  GA_ENDPOINT,
  GA_EVENT_NAME_MAX_LENGTH,
  GA_MEASUREMENT_ID,
  GA_PARAM_STRING_MAX_LENGTH,
  GA_PLACEHOLDER_API_SECRET,
  GA_PLACEHOLDER_MEASUREMENT_ID,
  GA_REQUEST_TIMEOUT_MS
} from './constants'

export type AnalyticsParams = Record<string, unknown>

// One session per app run so events group together in GA4 reports.
const sessionId = `${Date.now()}`

/**
 * Returns the persistent anonymous client id used as the GA4 `client_id`.
 * Generated once on first use and stored in the dedicated analytics store. It
 * identifies an installation, not a person.
 */
export function getClientId(): string {
  let clientId = analyticsStore.get('clientId')
  if (!clientId) {
    clientId = randomUUID()
    analyticsStore.set('clientId', clientId)
  }
  return clientId
}

/** Whether GA credentials have been configured (i.e. are not the placeholders). */
function hasCredentials(): boolean {
  return (
    GA_MEASUREMENT_ID !== GA_PLACEHOLDER_MEASUREMENT_ID &&
    GA_API_SECRET !== GA_PLACEHOLDER_API_SECRET &&
    GA_MEASUREMENT_ID.length > 0 &&
    GA_API_SECRET.length > 0
  )
}

/**
 * The single gate for all outbound analytics: the user must not have opted out
 * AND real credentials must be configured. Both checks are read fresh on every
 * call so toggling the setting takes effect immediately.
 */
export function isEnabled(): boolean {
  return store.get('analyticsEnabled') !== false && hasCredentials()
}

/** Normalize an event name to GA4 rules: lowercase, [a-z0-9_], max 40 chars. */
function sanitizeEventName(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+/, '')
  return cleaned.slice(0, GA_EVENT_NAME_MAX_LENGTH) || 'event'
}

/**
 * Filter event params so we only ever forward safe primitive values. Long
 * strings are dropped entirely as a guard against accidentally sending
 * free-form text.
 */
function sanitizeParams(params?: AnalyticsParams): AnalyticsParams {
  const result: AnalyticsParams = {}
  if (!params) return result
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    if (typeof value === 'string') {
      if (value.length <= GA_PARAM_STRING_MAX_LENGTH) result[key] = value
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = value
    }
  }
  return result
}

async function send(name: string, params?: AnalyticsParams): Promise<void> {
  if (!isEnabled()) return

  const payload = {
    client_id: getClientId(),
    events: [
      {
        name: sanitizeEventName(name),
        params: {
          ...sanitizeParams(params),
          session_id: sessionId,
          engagement_time_msec: 1,
          app_version: app.getVersion(),
          platform: process.platform
        }
      }
    ]
  }

  try {
    await fetch(`${GA_ENDPOINT}?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(GA_REQUEST_TIMEOUT_MS)
    })
  } catch {
    // Analytics must never break or block the app — swallow all errors.
  }
}

/** Track an arbitrary product event. Fire-and-forget; never throws. */
export function trackEvent(name: string, params?: AnalyticsParams): void {
  void send(name, params)
}

/** Track a page/screen view. */
export function trackPageView(pageId: string): void {
  void send('page_view', {
    page: pageId,
    page_title: pageId,
    page_location: `app://spiral/${pageId}`
  })
}

/** Track the app launching. Called once after the app is ready. */
export function trackAppOpen(): void {
  void send('app_open')
}
