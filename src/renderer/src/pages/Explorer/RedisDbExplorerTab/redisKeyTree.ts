import type { RedisKeyEntry } from '../../../../../preload/index.d'

export type FolderNode = {
  kind: 'folder'
  prefix: string
  label: string
  children: TreeNode[]
  depth: number
}

export type KeyNode = {
  kind: 'key'
  entry: RedisKeyEntry
  displayName: string
  depth: number
}

export type TreeNode = FolderNode | KeyNode

export function buildKeyTree(keys: RedisKeyEntry[], separator = ':'): TreeNode[] {
  return buildLevel(keys, '', 0, separator)
}

function buildLevel(
  keys: RedisKeyEntry[],
  prefix: string,
  depth: number,
  separator: string
): TreeNode[] {
  const groups = new Map<string, RedisKeyEntry[]>()
  const ungrouped: RedisKeyEntry[] = []

  for (const key of keys) {
    const remaining = key.keyName.slice(prefix.length)
    const sepIdx = remaining.indexOf(separator)
    if (sepIdx === -1) {
      ungrouped.push(key)
    } else {
      const groupPrefix = prefix + remaining.slice(0, sepIdx) + separator
      const existing = groups.get(groupPrefix)
      if (existing) {
        existing.push(key)
      } else {
        groups.set(groupPrefix, [key])
      }
    }
  }

  const nodes: TreeNode[] = []

  for (const [groupPrefix, groupKeys] of groups) {
    if (groupKeys.length === 1) {
      ungrouped.push(groupKeys[0])
    } else {
      const label = groupPrefix.slice(prefix.length, -separator.length)
      nodes.push({
        kind: 'folder',
        prefix: groupPrefix,
        label,
        children: buildLevel(groupKeys, groupPrefix, depth + 1, separator),
        depth
      })
    }
  }

  nodes.sort((a, b) => {
    if (a.kind === 'folder' && b.kind === 'folder') return a.label.localeCompare(b.label)
    return 0
  })

  for (const entry of ungrouped) {
    nodes.push({
      kind: 'key',
      entry,
      displayName: entry.keyName.slice(prefix.length) || entry.keyName,
      depth
    })
  }

  return nodes
}

export function countLeafNodes(node: FolderNode): number {
  let count = 0
  for (const child of node.children) {
    if (child.kind === 'folder') count += countLeafNodes(child)
    else count++
  }
  return count
}
