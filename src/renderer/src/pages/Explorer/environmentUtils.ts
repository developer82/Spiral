import type { ConnectionRecord } from './connections.types'
import type { EnvironmentDefinition } from '../Settings/useSettings'

const CLEARLY_READ_ONLY_SQL_PREFIXES = new Set([
  'select',
  'show',
  'describe',
  'desc',
  'explain',
  'pragma',
  'values'
])

const NON_READ_ONLY_STATEMENT_PREFIXES = new Set([
  'insert',
  'update',
  'delete',
  'merge',
  'alter',
  'create',
  'drop',
  'truncate',
  'exec',
  'execute',
  'grant',
  'revoke',
  'deny',
  'call',
  'use'
])

function stripLeadingSqlComments(sql: string): string {
  let remaining = sql.trimStart()

  while (remaining.length > 0) {
    if (remaining.startsWith('--')) {
      const newlineIndex = remaining.indexOf('\n')
      remaining = newlineIndex === -1 ? '' : remaining.slice(newlineIndex + 1).trimStart()
      continue
    }

    if (remaining.startsWith('/*')) {
      const commentEndIndex = remaining.indexOf('*/')
      remaining = commentEndIndex === -1 ? '' : remaining.slice(commentEndIndex + 2).trimStart()
      continue
    }

    break
  }

  return remaining
}

function sanitizeSqlForReadOnlyCheck(sql: string): string {
  let sanitized = ''

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index]
    const next = sql[index + 1]

    if (current === '-' && next === '-') {
      sanitized += '  '
      index += 1
      while (index + 1 < sql.length && sql[index + 1] !== '\n') {
        sanitized += ' '
        index += 1
      }
      continue
    }

    if (current === '/' && next === '*') {
      sanitized += '  '
      index += 1
      while (index + 1 < sql.length) {
        const blockChar = sql[index + 1]
        const blockNext = sql[index + 2]
        sanitized += blockChar === '\n' ? '\n' : ' '
        index += 1
        if (blockChar === '*' && blockNext === '/') {
          sanitized += ' '
          index += 1
          break
        }
      }
      continue
    }

    if (current === '\'' || current === '"') {
      const quote = current
      sanitized += ' '
      while (index + 1 < sql.length) {
        const stringChar = sql[index + 1]
        sanitized += stringChar === '\n' ? '\n' : ' '
        index += 1
        if (stringChar === quote) {
          if (sql[index + 1] === quote) {
            sanitized += ' '
            index += 1
            continue
          }
          break
        }
      }
      continue
    }

    if (current === '[') {
      sanitized += ' '
      while (index + 1 < sql.length) {
        const identifierChar = sql[index + 1]
        sanitized += identifierChar === '\n' ? '\n' : ' '
        index += 1
        if (identifierChar === ']') break
      }
      continue
    }

    sanitized += current
  }

  return sanitized
}

export function resolveConnectionEnvironment(
  connections: ConnectionRecord[],
  environments: EnvironmentDefinition[],
  connectionId: string | null | undefined
): EnvironmentDefinition | null {
  if (!connectionId) return null

  const connection = connections.find((item) => item.id === connectionId)
  if (!connection?.environmentId) return null

  return environments.find((environment) => environment.id === connection.environmentId) ?? null
}

export function canUseInteractiveTablesForConnection(
  connections: ConnectionRecord[],
  environments: EnvironmentDefinition[],
  connectionId: string | null | undefined,
  globalInteractiveTablesEnabled: boolean
): boolean {
  if (!globalInteractiveTablesEnabled) return false
  return !resolveConnectionEnvironment(connections, environments, connectionId)?.critical
}

export function isClearlyReadOnlySql(sql: string): boolean {
  const normalized = sanitizeSqlForReadOnlyCheck(stripLeadingSqlComments(sql)).toLocaleLowerCase()
  const trimmed = normalized.trim()
  if (!trimmed) return true

  const firstToken = trimmed.match(/^[a-z]+/)?.[0]
  if (!firstToken || !CLEARLY_READ_ONLY_SQL_PREFIXES.has(firstToken)) return false

  if (firstToken === 'select' && /\binto\b/.test(trimmed)) return false

  const remainingSql = trimmed.slice(firstToken.length)
  const hasNonReadOnlyFollowUpStatement = remainingSql
    .split(/;|\r?\n/)
    .map((statement) => statement.trim())
    .filter(Boolean)
    .some((statement) => {
      const statementPrefix = statement.match(/^[a-z]+/)?.[0]
      return !!statementPrefix && NON_READ_ONLY_STATEMENT_PREFIXES.has(statementPrefix)
    })

  return !hasNonReadOnlyFollowUpStatement
}