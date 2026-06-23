export interface SyncableComparisonItemLike {
  category: string
  changeType: string
}

const EXECUTABLE_ITEM_KEYS = new Set([
  'tables:added',
  'tables:removed',
  'views:added',
  'views:removed',
  'views:modified',
  'storedProcedures:added',
  'storedProcedures:removed',
  'storedProcedures:modified'
])

const UNSAFE_CATEGORIES = new Set(['securityUsers', 'securityRoles', 'securitySchemas'])
const DATA_CATEGORIES = new Set(['rows'])

export interface ComparisonItemSyncState {
  isExecutable: boolean
  skipReason?: string
}

export function getComparisonItemSyncState(
  item: SyncableComparisonItemLike
): ComparisonItemSyncState {
  if (EXECUTABLE_ITEM_KEYS.has(`${item.category}:${item.changeType}`)) {
    return { isExecutable: true }
  }

  if (item.changeType === 'unsupported') {
    return {
      isExecutable: false,
      skipReason: 'Change type is unsupported — no script available'
    }
  }

  if (UNSAFE_CATEGORIES.has(item.category)) {
    return {
      isExecutable: false,
      skipReason: 'Security object changes require manual review and are not auto-scripted'
    }
  }

  if (DATA_CATEGORIES.has(item.category)) {
    return {
      isExecutable: false,
      skipReason: 'Row-level data changes are not included in sync scripts'
    }
  }

  return {
    isExecutable: false,
    skipReason: `Auto-scripting for ${item.category}/${item.changeType} is not yet supported`
  }
}