import { describe, it, expect } from 'vitest'
import { parseSedScript } from '../parseSedScript'

describe('parseSedScript', () => {
  it('returns null for empty string', () => {
    expect(parseSedScript('')).toBeNull()
  })

  it('returns null for plain SQL without SED header', () => {
    expect(parseSedScript('SELECT 1')).toBeNull()
  })

  it('returns null when SED: on is not the first line', () => {
    const sql = 'SELECT 1\n-- SED: on\n-- - [ ] task'
    expect(parseSedScript(sql)).toBeNull()
  })

  it('detects SED: on (case-insensitive)', () => {
    const sql = '-- sed: on\n-- - [ ] Create table\nCREATE TABLE t (id INT)'
    expect(parseSedScript(sql)).not.toBeNull()
  })

  it('detects SED: ON (uppercase)', () => {
    const sql = '-- SED: ON\n-- - [ ] step\nSELECT 1'
    expect(parseSedScript(sql)).not.toBeNull()
  })

  it('parses a single task', () => {
    const sql = [
      '-- SED: on',
      '-- - [ ] Create temp table',
      'CREATE TABLE #temp (id INT)',
      'INSERT INTO #temp VALUES (1)'
    ].join('\n')
    const result = parseSedScript(sql)
    expect(result).not.toBeNull()
    expect(result!.tasks).toHaveLength(1)
    expect(result!.tasks[0].label).toBe('Create temp table')
    expect(result!.tasks[0].sql).toContain('CREATE TABLE #temp')
    expect(result!.tasks[0].sql).toContain('INSERT INTO #temp')
  })

  it('parses multiple tasks', () => {
    const sql = [
      '-- SED: on',
      '-- - [ ] Step one',
      'SELECT 1',
      '-- - [ ] Step two',
      'SELECT 2',
      '-- - [ ] Step three',
      'SELECT 3'
    ].join('\n')
    const result = parseSedScript(sql)
    expect(result!.tasks).toHaveLength(3)
    expect(result!.tasks[0].label).toBe('Step one')
    expect(result!.tasks[1].label).toBe('Step two')
    expect(result!.tasks[2].label).toBe('Step three')
  })

  it('assigns sequential string ids', () => {
    const sql = [
      '-- SED: on',
      '-- - [ ] A',
      'SELECT 1',
      '-- - [ ] B',
      'SELECT 2'
    ].join('\n')
    const result = parseSedScript(sql)!
    expect(result.tasks[0].id).toBe('0')
    expect(result.tasks[1].id).toBe('1')
  })

  it('ignores preamble SQL before first checkbox', () => {
    const sql = [
      '-- SED: on',
      '-- some preamble comment',
      'USE MyDatabase',
      '-- - [ ] Actual task',
      'SELECT 1'
    ].join('\n')
    const result = parseSedScript(sql)!
    expect(result.tasks).toHaveLength(1)
    expect(result.tasks[0].sql).not.toContain('USE MyDatabase')
  })

  it('returns null when SED: on present but no checkboxes found', () => {
    const sql = '-- SED: on\nSELECT 1\n-- just a comment'
    expect(parseSedScript(sql)).toBeNull()
  })

  it('trims leading whitespace from script before checking header', () => {
    const sql = '\n  \n-- SED: on\n-- - [ ] Task\nSELECT 1'
    expect(parseSedScript(sql)).not.toBeNull()
  })

  it('non-checkbox comment lines become text items, not task sql', () => {
    const sql = [
      '-- SED: on',
      '-- - [ ] Setup',
      '-- This is a section comment',
      'CREATE TABLE t (id INT)'
    ].join('\n')
    const result = parseSedScript(sql)!
    // Comment is NOT in the task sql
    expect(result.tasks[0].sql).not.toContain('This is a section comment')
    expect(result.tasks[0].sql).toContain('CREATE TABLE t (id INT)')
    // Comment IS in a text item after the task item
    const textItems = result.items.filter((i) => i.type === 'text')
    expect(textItems.some((i) => i.type === 'text' && i.content.includes('This is a section comment'))).toBe(true)
  })

  it('trims leading/trailing whitespace from task sql', () => {
    const sql = ['-- SED: on', '-- - [ ] Task', '', 'SELECT 1', ''].join('\n')
    const result = parseSedScript(sql)!
    expect(result.tasks[0].sql).toBe('SELECT 1')
  })

  it('supports checkbox with extra spaces in syntax', () => {
    const sql = '-- SED: on\n--  -  [  ]  My Task\nSELECT 1'
    const result = parseSedScript(sql)!
    expect(result.tasks[0].label).toBe('My Task')
  })

  // ── items ordering ────────────────────────────────────────────────────────

  it('emits preamble text before first task item', () => {
    const sql = [
      '-- SED: on',
      '-- ## Phase 1',
      '-- Setup the environment',
      '-- - [ ] Create table',
      'SELECT 1'
    ].join('\n')
    const result = parseSedScript(sql)!
    expect(result.items[0]).toMatchObject({ type: 'text' })
    expect(result.items[0].type === 'text' && result.items[0].content).toContain('## Phase 1')
    expect(result.items[1]).toMatchObject({ type: 'task', label: 'Create table' })
  })

  it('emits text between tasks in correct order', () => {
    const sql = [
      '-- SED: on',
      '-- - [ ] Task A',
      'SELECT 1',
      '-- Separator note',
      '-- - [ ] Task B',
      'SELECT 2'
    ].join('\n')
    const result = parseSedScript(sql)!
    expect(result.items[0]).toMatchObject({ type: 'task', label: 'Task A' })
    expect(result.items[1]).toMatchObject({ type: 'text' })
    expect(result.items[2]).toMatchObject({ type: 'task', label: 'Task B' })
  })

  it('emits task items with matching ids into items array', () => {
    const sql = [
      '-- SED: on',
      '-- - [ ] First',
      'SELECT 1',
      '-- - [ ] Second',
      'SELECT 2'
    ].join('\n')
    const result = parseSedScript(sql)!
    const taskItems = result.items.filter((i) => i.type === 'task')
    expect(taskItems).toHaveLength(2)
    expect(taskItems[0]).toMatchObject({ type: 'task', id: '0', label: 'First' })
    expect(taskItems[1]).toMatchObject({ type: 'task', id: '1', label: 'Second' })
  })

  it('multi-line preamble comment becomes single text item', () => {
    const sql = [
      '-- SED: on',
      '-- ## Header',
      '-- Line two',
      '-- - [ ] Task',
      'SELECT 1'
    ].join('\n')
    const result = parseSedScript(sql)!
    const textItems = result.items.filter((i) => i.type === 'text')
    expect(textItems).toHaveLength(1)
    expect(textItems[0].type === 'text' && textItems[0].content).toContain('## Header')
    expect(textItems[0].type === 'text' && textItems[0].content).toContain('Line two')
  })
})
