import { describe, it, expect } from 'vitest'
import { resolveBooleanLabel } from '../booleanPill'

describe('resolveBooleanLabel', () => {
  describe('exact matches', () => {
    it('Status → SUCCESS / FAILED', () => {
      expect(resolveBooleanLabel('Status', true)).toBe('SUCCESS')
      expect(resolveBooleanLabel('Status', false)).toBe('FAILED')
    })

    it('enabled → ENABLED / DISABLED (lowercase)', () => {
      expect(resolveBooleanLabel('enabled', true)).toBe('ENABLED')
      expect(resolveBooleanLabel('enabled', false)).toBe('DISABLED')
    })

    it('ACTIVE → ACTIVE / INACTIVE (uppercase)', () => {
      expect(resolveBooleanLabel('ACTIVE', true)).toBe('ACTIVE')
      expect(resolveBooleanLabel('ACTIVE', false)).toBe('INACTIVE')
    })

    it('Privilege → AUTHORIZED / UNAUTHORIZED', () => {
      expect(resolveBooleanLabel('Privilege', true)).toBe('AUTHORIZED')
      expect(resolveBooleanLabel('Privilege', false)).toBe('UNAUTHORIZED')
    })

    it('Restriction → RESTRICTED / UNRESTRICTED', () => {
      expect(resolveBooleanLabel('Restriction', true)).toBe('RESTRICTED')
      expect(resolveBooleanLabel('Restriction', false)).toBe('UNRESTRICTED')
    })

    it('Restricted → RESTRICTED / UNRESTRICTED', () => {
      expect(resolveBooleanLabel('Restricted', true)).toBe('RESTRICTED')
      expect(resolveBooleanLabel('Restricted', false)).toBe('UNRESTRICTED')
    })

    it('Authentication → AUTHENTICATED / ANONYMOUS', () => {
      expect(resolveBooleanLabel('Authentication', true)).toBe('AUTHENTICATED')
      expect(resolveBooleanLabel('Authentication', false)).toBe('ANONYMOUS')
    })

    it('Authenticated → AUTHENTICATED / ANONYMOUS', () => {
      expect(resolveBooleanLabel('Authenticated', true)).toBe('AUTHENTICATED')
      expect(resolveBooleanLabel('Authenticated', false)).toBe('ANONYMOUS')
    })

    it('Encryption → ENCRYPTED / PLAINTEXT', () => {
      expect(resolveBooleanLabel('Encryption', true)).toBe('ENCRYPTED')
      expect(resolveBooleanLabel('Encryption', false)).toBe('PLAINTEXT')
    })

    it('Trusted → TRUSTED / UNTRUSTED', () => {
      expect(resolveBooleanLabel('Trusted', true)).toBe('TRUSTED')
      expect(resolveBooleanLabel('Trusted', false)).toBe('UNTRUSTED')
    })

    it('Protection → PROTECTED / UNPROTECTED', () => {
      expect(resolveBooleanLabel('Protection', true)).toBe('PROTECTED')
      expect(resolveBooleanLabel('Protection', false)).toBe('UNPROTECTED')
    })

    it('Mode → MANUAL / AUTOMATED', () => {
      expect(resolveBooleanLabel('Mode', true)).toBe('MANUAL')
      expect(resolveBooleanLabel('Mode', false)).toBe('AUTOMATED')
    })

    it('Override → FORCED / DEFAULT', () => {
      expect(resolveBooleanLabel('Override', true)).toBe('FORCED')
      expect(resolveBooleanLabel('Override', false)).toBe('DEFAULT')
    })

    it('Scope → GLOBAL / LOCAL', () => {
      expect(resolveBooleanLabel('Scope', true)).toBe('GLOBAL')
      expect(resolveBooleanLabel('Scope', false)).toBe('LOCAL')
    })

    it('Environment → PRODUCTION / SANDBOX', () => {
      expect(resolveBooleanLabel('Environment', true)).toBe('PRODUCTION')
      expect(resolveBooleanLabel('Environment', false)).toBe('SANDBOX')
    })

    it('Persistence → PERMANENT / TEMPORARY', () => {
      expect(resolveBooleanLabel('Persistence', true)).toBe('PERMANENT')
      expect(resolveBooleanLabel('Persistence', false)).toBe('TEMPORARY')
    })

    it('Visibility → PUBLIC / PRIVATE', () => {
      expect(resolveBooleanLabel('Visibility', true)).toBe('PUBLIC')
      expect(resolveBooleanLabel('Visibility', false)).toBe('PRIVATE')
    })

    it('State → STALE / FRESH', () => {
      expect(resolveBooleanLabel('State', true)).toBe('STALE')
      expect(resolveBooleanLabel('State', false)).toBe('FRESH')
    })

    it('Payment → PAID / UNPAID', () => {
      expect(resolveBooleanLabel('Payment', true)).toBe('PAID')
      expect(resolveBooleanLabel('Payment', false)).toBe('UNPAID')
    })

    it('Settlement → SETTLED / DISPUTED', () => {
      expect(resolveBooleanLabel('Settlement', true)).toBe('SETTLED')
      expect(resolveBooleanLabel('Settlement', false)).toBe('DISPUTED')
    })

    it('Billing → BILLABLE / NON_BILLABLE', () => {
      expect(resolveBooleanLabel('Billing', true)).toBe('BILLABLE')
      expect(resolveBooleanLabel('Billing', false)).toBe('NON_BILLABLE')
    })

    it('Refund → REFUNDED / NON_REFUNDABLE', () => {
      expect(resolveBooleanLabel('Refund', true)).toBe('REFUNDED')
      expect(resolveBooleanLabel('Refund', false)).toBe('NON_REFUNDABLE')
    })

    it('Tax → TAXABLE / EXEMPT', () => {
      expect(resolveBooleanLabel('Tax', true)).toBe('TAXABLE')
      expect(resolveBooleanLabel('Tax', false)).toBe('EXEMPT')
    })

    it('Credit → CREDIT / DEBIT', () => {
      expect(resolveBooleanLabel('Credit', true)).toBe('CREDIT')
      expect(resolveBooleanLabel('Credit', false)).toBe('DEBIT')
    })

    it('Transaction → CAPTURED / VOIDED', () => {
      expect(resolveBooleanLabel('Transaction', true)).toBe('CAPTURED')
      expect(resolveBooleanLabel('Transaction', false)).toBe('VOIDED')
    })

    it('Publication → PUBLISHED / DRAFT', () => {
      expect(resolveBooleanLabel('Publication', true)).toBe('PUBLISHED')
      expect(resolveBooleanLabel('Publication', false)).toBe('DRAFT')
    })

    it('Published → PUBLISHED / DRAFT', () => {
      expect(resolveBooleanLabel('Published', true)).toBe('PUBLISHED')
      expect(resolveBooleanLabel('Published', false)).toBe('DRAFT')
    })

    it('Curation → FEATURED / STANDARD', () => {
      expect(resolveBooleanLabel('Curation', true)).toBe('FEATURED')
      expect(resolveBooleanLabel('Curation', false)).toBe('STANDARD')
    })

    it('Archiving → ARCHIVED / LIVE', () => {
      expect(resolveBooleanLabel('Archiving', true)).toBe('ARCHIVED')
      expect(resolveBooleanLabel('Archiving', false)).toBe('LIVE')
    })

    it('Moderation → FLAGGED / CLEAN', () => {
      expect(resolveBooleanLabel('Moderation', true)).toBe('FLAGGED')
      expect(resolveBooleanLabel('Moderation', false)).toBe('CLEAN')
    })

    it('Copyright → PUBLIC DOMAIN / COPYRIGHTED', () => {
      expect(resolveBooleanLabel('Copyright', true)).toBe('PUBLIC DOMAIN')
      expect(resolveBooleanLabel('Copyright', false)).toBe('COPYRIGHTED')
    })

    it('Sensitivity → SENSITIVE / GENERAL', () => {
      expect(resolveBooleanLabel('Sensitivity', true)).toBe('SENSITIVE')
      expect(resolveBooleanLabel('Sensitivity', false)).toBe('GENERAL')
    })

    it('Delivery → DELIVERED / UNDELIVERED', () => {
      expect(resolveBooleanLabel('Delivery', true)).toBe('DELIVERED')
      expect(resolveBooleanLabel('Delivery', false)).toBe('UNDELIVERED')
    })

    it('Engagement → OPENED / UNOPENED', () => {
      expect(resolveBooleanLabel('Engagement', true)).toBe('OPENED')
      expect(resolveBooleanLabel('Engagement', false)).toBe('UNOPENED')
    })

    it('Subscription → OPT IN / OPT OUT', () => {
      expect(resolveBooleanLabel('Subscription', true)).toBe('OPT IN')
      expect(resolveBooleanLabel('Subscription', false)).toBe('OPT OUT')
    })

    it('Priority → URGENT / NORMAL', () => {
      expect(resolveBooleanLabel('Priority', true)).toBe('URGENT')
      expect(resolveBooleanLabel('Priority', false)).toBe('NORMAL')
    })

    it('Reachability → REACHABLE / BOUNCED', () => {
      expect(resolveBooleanLabel('Reachability', true)).toBe('REACHABLE')
      expect(resolveBooleanLabel('Reachability', false)).toBe('BOUNCED')
    })

    it('Stock → IN STOCK / OUT OF STOCK', () => {
      expect(resolveBooleanLabel('Stock', true)).toBe('IN STOCK')
      expect(resolveBooleanLabel('Stock', false)).toBe('OUT OF STOCK')
    })

    it('Condition → NEW / USED', () => {
      expect(resolveBooleanLabel('Condition', true)).toBe('NEW')
      expect(resolveBooleanLabel('Condition', false)).toBe('USED')
    })

    it('Allocation → ASSIGNED / UNASSIGNED', () => {
      expect(resolveBooleanLabel('Allocation', true)).toBe('ASSIGNED')
      expect(resolveBooleanLabel('Allocation', false)).toBe('UNASSIGNED')
    })

    it('Usage → OCCUPIED / VACANT', () => {
      expect(resolveBooleanLabel('Usage', true)).toBe('OCCUPIED')
      expect(resolveBooleanLabel('Usage', false)).toBe('VACANT')
    })

    it('Hardware → ONLINE / OFFLINE', () => {
      expect(resolveBooleanLabel('Hardware', true)).toBe('ONLINE')
      expect(resolveBooleanLabel('Hardware', false)).toBe('OFFLINE')
    })

    it('Movement → STATIONARY / IN_TRANSIT', () => {
      expect(resolveBooleanLabel('Movement', true)).toBe('STATIONARY')
      expect(resolveBooleanLabel('Movement', false)).toBe('IN_TRANSIT')
    })
  })

  describe('IS_ prefix stripping', () => {
    it('IS_ACTIVE → ACTIVE / INACTIVE', () => {
      expect(resolveBooleanLabel('IS_ACTIVE', true)).toBe('ACTIVE')
      expect(resolveBooleanLabel('IS_ACTIVE', false)).toBe('INACTIVE')
    })

    it('is_enabled → ENABLED / DISABLED (lowercase prefix)', () => {
      expect(resolveBooleanLabel('is_enabled', true)).toBe('ENABLED')
      expect(resolveBooleanLabel('is_enabled', false)).toBe('DISABLED')
    })

    it('IS_STATUS → SUCCESS / FAILED', () => {
      expect(resolveBooleanLabel('IS_STATUS', true)).toBe('SUCCESS')
      expect(resolveBooleanLabel('IS_STATUS', false)).toBe('FAILED')
    })

    it('IS_UNKNOWN → TRUE / FALSE fallback', () => {
      expect(resolveBooleanLabel('IS_UNKNOWN', true)).toBe('TRUE')
      expect(resolveBooleanLabel('IS_UNKNOWN', false)).toBe('FALSE')
    })
  })

  describe('partial / contains match', () => {
    it('PAYMENT_STATUS → contains "payment" (longer) → PAID / UNPAID', () => {
      // "payment" (7 chars) > "status" (6 chars) — payment wins
      expect(resolveBooleanLabel('PAYMENT_STATUS', true)).toBe('PAID')
      expect(resolveBooleanLabel('PAYMENT_STATUS', false)).toBe('UNPAID')
    })

    it('user_enabled_flag → contains "enabled" → ENABLED / DISABLED', () => {
      expect(resolveBooleanLabel('user_enabled_flag', true)).toBe('ENABLED')
      expect(resolveBooleanLabel('user_enabled_flag', false)).toBe('DISABLED')
    })

    it('subscription_active → contains "subscription" (longer) → OPT IN / OPT OUT', () => {
      // "subscription" (12 chars) > "active" (6 chars) — subscription wins
      expect(resolveBooleanLabel('subscription_active', true)).toBe('OPT IN')
      expect(resolveBooleanLabel('subscription_active', false)).toBe('OPT OUT')
    })

    it('IS_USER_ACTIVE → strips IS_, then contains "active" → ACTIVE / INACTIVE', () => {
      expect(resolveBooleanLabel('IS_USER_ACTIVE', true)).toBe('ACTIVE')
      expect(resolveBooleanLabel('IS_USER_ACTIVE', false)).toBe('INACTIVE')
    })

    it('picks longest keyword when multiple keywords match', () => {
      // "authentication" contains "authentication" (14 chars) and "active" (6 chars) — "authentication" wins
      expect(resolveBooleanLabel('authentication_active', true)).toBe('AUTHENTICATED')
      expect(resolveBooleanLabel('authentication_active', false)).toBe('ANONYMOUS')
    })
  })

  describe('fallback', () => {
    it('unknown column → TRUE / FALSE', () => {
      expect(resolveBooleanLabel('some_random_column', true)).toBe('TRUE')
      expect(resolveBooleanLabel('some_random_column', false)).toBe('FALSE')
    })

    it('empty column name → TRUE / FALSE', () => {
      expect(resolveBooleanLabel('', true)).toBe('TRUE')
      expect(resolveBooleanLabel('', false)).toBe('FALSE')
    })

    it('flag → TRUE / FALSE (short word, no match)', () => {
      expect(resolveBooleanLabel('flag', true)).toBe('TRUE')
      expect(resolveBooleanLabel('flag', false)).toBe('FALSE')
    })
  })
})
