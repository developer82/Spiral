import { describe, test, expect } from 'vitest'
import { buildKeyTree, countLeafNodes } from '../redisKeyTree'
import type { RedisKeyEntry } from '../../../../../../preload/index.d'

function key(keyName: string, type: RedisKeyEntry['type'] = 'string'): RedisKeyEntry {
  return { keyName, type, ttl: -1, sizeBytes: null, valuePreview: '' }
}

describe('buildKeyTree', () => {
  test('empty input returns empty array', () => {
    expect(buildKeyTree([])).toEqual([])
  })

  test('flat keys with no separator stay as key nodes at root', () => {
    const result = buildKeyTree([key('foo'), key('bar'), key('baz')])
    expect(result).toHaveLength(3)
    expect(result.every((n) => n.kind === 'key')).toBe(true)
  })

  test('single key with separator stays flat (no folder)', () => {
    const result = buildKeyTree([key('user:1')])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('key')
    if (result[0].kind === 'key') {
      expect(result[0].displayName).toBe('user:1')
    }
  })

  test('two keys with shared prefix create a folder', () => {
    const result = buildKeyTree([key('user:1'), key('user:2')])
    expect(result).toHaveLength(1)
    expect(result[0].kind).toBe('folder')
    if (result[0].kind === 'folder') {
      expect(result[0].label).toBe('user')
      expect(result[0].children).toHaveLength(2)
    }
  })

  test('children inside folder have correct displayName', () => {
    const result = buildKeyTree([key('user:alice'), key('user:bob')])
    const folder = result[0]
    if (folder.kind !== 'folder') throw new Error('expected folder')
    const names = folder.children.map((c) => (c.kind === 'key' ? c.displayName : null))
    expect(names).toContain('alice')
    expect(names).toContain('bob')
  })

  test('multi-level nesting creates nested folders', () => {
    const result = buildKeyTree([key('a:b:1'), key('a:b:2')])
    expect(result).toHaveLength(1)
    const outer = result[0]
    if (outer.kind !== 'folder') throw new Error('expected folder')
    expect(outer.label).toBe('a')
    expect(outer.children).toHaveLength(1)
    const inner = outer.children[0]
    if (inner.kind !== 'folder') throw new Error('expected inner folder')
    expect(inner.label).toBe('b')
    expect(inner.children).toHaveLength(2)
  })

  test('mixed: grouped and ungrouped keys', () => {
    const result = buildKeyTree([
      key('user:1'),
      key('user:2'),
      key('session:abc'),
      key('config')
    ])
    const folders = result.filter((n) => n.kind === 'folder')
    const leaves = result.filter((n) => n.kind === 'key')
    expect(folders).toHaveLength(1)
    if (folders[0].kind === 'folder') {
      expect(folders[0].label).toBe('user')
    }
    expect(leaves).toHaveLength(2)
    const leafNames = leaves.map((n) => (n.kind === 'key' ? n.displayName : null))
    expect(leafNames).toContain('config')
    expect(leafNames).toContain('session:abc')
  })

  test('folders appear before ungrouped keys', () => {
    // user:1 + user:2 → folder; config → flat key; result = [folder, key]
    const result = buildKeyTree([key('config'), key('user:1'), key('user:2')])
    expect(result).toHaveLength(2)
    expect(result[0].kind).toBe('folder')
    expect(result[1].kind).toBe('key')
    if (result[1].kind === 'key') {
      expect(result[1].displayName).toBe('config')
    }
  })

  test('folder nodes have correct depth', () => {
    const result = buildKeyTree([key('user:1'), key('user:2')])
    const folder = result[0]
    if (folder.kind !== 'folder') throw new Error()
    expect(folder.depth).toBe(0)
    expect(folder.children[0].depth).toBe(1)
  })

  test('multiple folders sorted alphabetically', () => {
    const result = buildKeyTree([
      key('z:1'),
      key('z:2'),
      key('a:1'),
      key('a:2'),
      key('m:1'),
      key('m:2')
    ])
    const labels = result.map((n) => (n.kind === 'folder' ? n.label : null))
    expect(labels).toEqual(['a', 'm', 'z'])
  })

  test('key with exact same name as separator prefix stays flat', () => {
    const result = buildKeyTree([key('user:'), key('user:1'), key('user:2')])
    const folder = result[0]
    if (folder.kind !== 'folder') throw new Error('expected folder')
    // user: has empty remaining after prefix, so it's an ungrouped leaf inside folder
    expect(countLeafNodes(folder)).toBe(3)
  })
})

describe('countLeafNodes', () => {
  test('counts direct key children', () => {
    const result = buildKeyTree([key('user:1'), key('user:2'), key('user:3')])
    const folder = result[0]
    if (folder.kind !== 'folder') throw new Error()
    expect(countLeafNodes(folder)).toBe(3)
  })

  test('counts nested children recursively', () => {
    const result = buildKeyTree([
      key('a:b:1'),
      key('a:b:2'),
      key('a:c:1'),
      key('a:c:2')
    ])
    const folder = result[0]
    if (folder.kind !== 'folder') throw new Error()
    expect(countLeafNodes(folder)).toBe(4)
  })
})
