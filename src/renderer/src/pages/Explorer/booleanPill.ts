/**
 * Maps a keyword (lowercase) to [trueLabel, falseLabel].
 * Used to derive context-aware display labels for boolean fields.
 */
const BOOLEAN_LABEL_MAP: Record<string, [string, string]> = {
  status: ['SUCCESS', 'FAILED'],
  enabled: ['ENABLED', 'DISABLED'],
  active: ['ACTIVE', 'INACTIVE'],
  privilege: ['AUTHORIZED', 'UNAUTHORIZED'],
  restriction: ['RESTRICTED', 'UNRESTRICTED'],
  restricted: ['RESTRICTED', 'UNRESTRICTED'],
  authentication: ['AUTHENTICATED', 'ANONYMOUS'],
  authenticated: ['AUTHENTICATED', 'ANONYMOUS'],
  encryption: ['ENCRYPTED', 'PLAINTEXT'],
  trusted: ['TRUSTED', 'UNTRUSTED'],
  protection: ['PROTECTED', 'UNPROTECTED'],
  mode: ['MANUAL', 'AUTOMATED'],
  override: ['FORCED', 'DEFAULT'],
  scope: ['GLOBAL', 'LOCAL'],
  environment: ['PRODUCTION', 'SANDBOX'],
  persistence: ['PERMANENT', 'TEMPORARY'],
  visibility: ['PUBLIC', 'PRIVATE'],
  state: ['STALE', 'FRESH'],
  payment: ['PAID', 'UNPAID'],
  settlement: ['SETTLED', 'DISPUTED'],
  billing: ['BILLABLE', 'NON_BILLABLE'],
  refund: ['REFUNDED', 'NON_REFUNDABLE'],
  tax: ['TAXABLE', 'EXEMPT'],
  credit: ['CREDIT', 'DEBIT'],
  transaction: ['CAPTURED', 'VOIDED'],
  publication: ['PUBLISHED', 'DRAFT'],
  published: ['PUBLISHED', 'DRAFT'],
  curation: ['FEATURED', 'STANDARD'],
  archiving: ['ARCHIVED', 'LIVE'],
  moderation: ['FLAGGED', 'CLEAN'],
  copyright: ['PUBLIC DOMAIN', 'COPYRIGHTED'],
  sensitivity: ['SENSITIVE', 'GENERAL'],
  delivery: ['DELIVERED', 'UNDELIVERED'],
  'read state': ['READ', 'UNREAD'],
  engagement: ['OPENED', 'UNOPENED'],
  subscription: ['OPT IN', 'OPT OUT'],
  priority: ['URGENT', 'NORMAL'],
  reachability: ['REACHABLE', 'BOUNCED'],
  stock: ['IN STOCK', 'OUT OF STOCK'],
  condition: ['NEW', 'USED'],
  allocation: ['ASSIGNED', 'UNASSIGNED'],
  usage: ['OCCUPIED', 'VACANT'],
  hardware: ['ONLINE', 'OFFLINE'],
  movement: ['STATIONARY', 'IN_TRANSIT']
}

/**
 * Strips a leading IS_ prefix (case-insensitive) from a column name.
 */
function stripIsPrefix(name: string): string {
  return name.replace(/^is_/i, '')
}

/**
 * Resolves the display label for a boolean value given a column name.
 *
 * 1. Strip leading IS_ from the column name.
 * 2. Check for an exact (case-insensitive) match in the keyword map.
 * 3. If no exact match, find all keywords contained within the column name
 *    and pick the longest one (to minimise false positives from short keywords).
 * 4. Fall back to "TRUE" / "FALSE" if no match is found.
 */
export function resolveBooleanLabel(columnName: string, value: boolean): string {
  const stripped = stripIsPrefix(columnName).toLowerCase()

  // Exact match
  const exact = BOOLEAN_LABEL_MAP[stripped]
  if (exact) return value ? exact[0] : exact[1]

  // Partial / contains match — prefer the longest keyword that appears in the column name
  let bestKey: string | null = null
  for (const key of Object.keys(BOOLEAN_LABEL_MAP)) {
    if (stripped.includes(key)) {
      if (bestKey === null || key.length > bestKey.length) {
        bestKey = key
      }
    }
  }

  if (bestKey !== null) {
    const labels = BOOLEAN_LABEL_MAP[bestKey]
    return value ? labels[0] : labels[1]
  }

  return value ? 'TRUE' : 'FALSE'
}
