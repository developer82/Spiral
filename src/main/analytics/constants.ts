// Google Analytics 4 (GA4) Measurement Protocol configuration.
//
// NOTE: The api_secret below is shipped inside the application bundle. This is
// inherent to using the GA4 Measurement Protocol from a desktop app — there is
// no way to keep it private on the client. A leaked Measurement Protocol secret
// only permits sending events to this property; it cannot be used to read any
// analytics data.
//
// Replace the placeholder values below with the real Measurement ID and API
// secret from the GA4 property (Admin → Data Streams → Measurement Protocol API
// secrets). While the placeholders are in place the analytics service no-ops and
// never sends any network requests, which keeps development builds silent.

// Typed as `string` (not string literals) so the placeholder comparisons in the
// analytics service aren't narrowed away by TypeScript.
export const GA_MEASUREMENT_ID: string = 'c2fd1c5cb3fa'
export const GA_API_SECRET: string = 'ee194d1542054645a63536983beeb2a9'

export const GA_PLACEHOLDER_MEASUREMENT_ID = 'G-XXXXXXXXXX'
export const GA_PLACEHOLDER_API_SECRET = 'XXXXXXXX'

// export const GA_ENDPOINT = 'https://www.google-analytics.com/mp/collect'
// export const GA_DEBUG_ENDPOINT = 'https://www.google-analytics.com/debug/mp/collect'
export const GA_ENDPOINT = 'http://analytics.susita.com/ga/mp/collect'
export const GA_DEBUG_ENDPOINT = 'http://analytics.susita.com/ga/debug/mp/collect'

// Network timeout for a single Measurement Protocol request.
export const GA_REQUEST_TIMEOUT_MS = 5000

// GA4 limits event names to 40 chars (letters, digits, underscores).
export const GA_EVENT_NAME_MAX_LENGTH = 40

// Cap on string parameter values we forward, as an extra guard against ever
// sending large/free-form text.
export const GA_PARAM_STRING_MAX_LENGTH = 100
