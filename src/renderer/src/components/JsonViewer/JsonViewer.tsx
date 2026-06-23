import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import Menu, { type MenuItem } from '../Menu/Menu'
import './JsonViewer.css'

type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[]

export interface JsonViewerProps {
  /** Raw JSON string to display. */
  json: string
  /** Apply syntax colour classes (keys, strings, numbers, booleans, null). Default: true. */
  syntaxHighlighting?: boolean
  /** Allow collapsing/expanding object and array nodes. Default: true. */
  collapsible?: boolean
  /** Start with every expandable node open. Applies only when collapsible=true. Default: false. */
  expandAllByDefault?: boolean
  /** When copying the full JSON (no text selection), format it with indentation. Default: true. */
  copyFormatted?: boolean
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function collectExpandablePaths(value: JsonValue, path: string): string[] {
  if (value === null || typeof value !== 'object') return []
  if (Array.isArray(value)) {
    if (value.length === 0) return []
    const paths: string[] = [path]
    value.forEach((item, i) => paths.push(...collectExpandablePaths(item, `${path}[${i}]`)))
    return paths
  }
  const entries = Object.entries(value as Record<string, JsonValue>)
  if (entries.length === 0) return []
  const paths: string[] = [path]
  entries.forEach(([k, v]) => paths.push(...collectExpandablePaths(v, `${path}.${k}`)))
  return paths
}

function getInitialExpanded(json: string, collapsible: boolean, expandAllByDefault: boolean): Set<string> {
  if (!collapsible || !expandAllByDefault) return new Set()
  try {
    return new Set(collectExpandablePaths(JSON.parse(json) as JsonValue, 'root'))
  } catch {
    return new Set()
  }
}

function extractErrorLocation(
  error: SyntaxError,
  jsonStr: string
): { line: number; col: number } | null {
  // Modern Chrome/Edge: "…at position N"
  const posMatch = error.message.match(/at position (\d+)/i)
  if (posMatch) {
    const charPos = parseInt(posMatch[1], 10)
    let line = 1
    let col = 1
    for (let i = 0; i < charPos && i < jsonStr.length; i++) {
      if (jsonStr[i] === '\n') {
        line++
        col = 1
      } else {
        col++
      }
    }
    return { line, col }
  }
  // Firefox: "JSON.parse: … at line N column M"
  const lineColMatch = error.message.match(/line (\d+).*column (\d+)/i)
  if (lineColMatch) {
    return { line: parseInt(lineColMatch[1], 10), col: parseInt(lineColMatch[2], 10) }
  }
  return null
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
}

// ─── component ────────────────────────────────────────────────────────────────

export default function JsonViewer({
  json,
  syntaxHighlighting = true,
  collapsible = true,
  expandAllByDefault = false,
  copyFormatted = true
}: JsonViewerProps): JSX.Element {
  const { t } = useTranslation()
  const containerRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() =>
    getInitialExpanded(json, collapsible, expandAllByDefault)
  )

  // Reset expansion whenever the json input changes.
  useEffect(() => {
    setExpandedPaths(getInitialExpanded(json, collapsible, expandAllByDefault))
    // Intentionally depend only on json so that toggling collapsible/expandAllByDefault
    // at runtime does not forcibly reset the user's manual expand/collapse state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [json])

  const parseResult = useMemo(() => {
    try {
      return { ok: true as const, value: JSON.parse(json) as JsonValue }
    } catch (e) {
      return { ok: false as const, error: e as SyntaxError }
    }
  }, [json])

  const allExpandablePaths = useMemo<string[]>(() => {
    if (!collapsible || !parseResult.ok) return []
    return collectExpandablePaths(parseResult.value, 'root')
  }, [collapsible, parseResult])

  const togglePath = useCallback((path: string) => {
    setExpandedPaths(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleExpandAll = useCallback(() => {
    if (!parseResult.ok) return
    setExpandedPaths(new Set(collectExpandablePaths(parseResult.value, 'root')))
    setContextMenu(null)
  }, [parseResult])

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set())
    setContextMenu(null)
  }, [])

  const handleCopy = useCallback(() => {
    const selection = window.getSelection()?.toString() ?? ''
    if (selection.length > 0) {
      navigator.clipboard.writeText(selection)
    } else if (parseResult.ok) {
      const text = copyFormatted
        ? JSON.stringify(parseResult.value, null, 2)
        : JSON.stringify(parseResult.value)
      navigator.clipboard.writeText(text)
    } else {
      navigator.clipboard.writeText(json)
    }
    setContextMenu(null)
  }, [json, parseResult, copyFormatted])

  const menuItems = useMemo<MenuItem[]>(() => {
    const items: MenuItem[] = [{ id: 'copy', label: t('jsonViewer.copy'), onClick: handleCopy }]
    if (collapsible && parseResult.ok && allExpandablePaths.length > 1) {
      const hasExpanded = expandedPaths.size > 0
      const hasCollapsed = allExpandablePaths.some(p => !expandedPaths.has(p))
      if (hasExpanded || hasCollapsed) {
        items.push({ id: 'sep1', separator: true })
        if (hasCollapsed) {
          items.push({ id: 'expand-all', label: t('jsonViewer.expandAll'), onClick: handleExpandAll })
        }
        if (hasExpanded) {
          items.push({ id: 'collapse-all', label: t('jsonViewer.collapseAll'), onClick: handleCollapseAll })
        }
      }
    }
    return items
  }, [t, handleCopy, collapsible, parseResult.ok, handleExpandAll, handleCollapseAll, expandedPaths, allExpandablePaths])

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  // ── render helpers (defined inside component to close over state) ──────────

  function renderPrimitive(value: string | number | boolean | null): JSX.Element {
    if (value === null) {
      return <span className={syntaxHighlighting ? 'json-viewer__null' : undefined}>null</span>
    }
    if (typeof value === 'boolean') {
      return (
        <span className={syntaxHighlighting ? 'json-viewer__boolean' : undefined}>
          {String(value)}
        </span>
      )
    }
    if (typeof value === 'number') {
      return (
        <span className={syntaxHighlighting ? 'json-viewer__number' : undefined}>{value}</span>
      )
    }
    // string
    return (
      <span className={syntaxHighlighting ? 'json-viewer__string' : undefined}>
        &quot;{escapeString(value)}&quot;
      </span>
    )
  }

  function renderKey(key: string): JSX.Element {
    return (
      <span className={syntaxHighlighting ? 'json-viewer__key' : undefined}>
        &quot;{key}&quot;
      </span>
    )
  }

  /**
   * Render one entry (key-value pair for objects, bare value for arrays).
   * displayKey is null for array items (no key prefix is rendered).
   */
  function renderEntry(
    displayKey: string | null,
    value: JsonValue,
    path: string,
    isLast: boolean
  ): JSX.Element {
    const comma = !isLast ? <span className="json-viewer__comma">,</span> : null
    const keyPrefix =
      displayKey !== null ? (
        <>
          {renderKey(displayKey)}
          <span className="json-viewer__colon">: </span>
        </>
      ) : null

    // ── primitives ──────────────────────────────────────────────────────────
    if (value === null || typeof value !== 'object') {
      return (
        <div key={path} className="json-viewer__line">
          {keyPrefix}
          {renderPrimitive(value as string | number | boolean | null)}
          {comma}
        </div>
      )
    }

    const isArray = Array.isArray(value)
    const arrayLen = isArray ? (value as JsonValue[]).length : 0
    const objectEntries = isArray ? [] : Object.entries(value as Record<string, JsonValue>)
    const isEmpty = isArray ? arrayLen === 0 : objectEntries.length === 0
    const openBrace = isArray ? '[' : '{'
    const closeBrace = isArray ? ']' : '}'
    const braceClass = syntaxHighlighting ? 'json-viewer__brace' : undefined

    // ── empty containers: render inline as {} or [] ─────────────────────────
    if (isEmpty) {
      return (
        <div key={path} className="json-viewer__line">
          {keyPrefix}
          <span className={braceClass}>
            {openBrace}
            {closeBrace}
          </span>
          {comma}
        </div>
      )
    }

    const isExpanded = !collapsible || expandedPaths.has(path)

    // ── collapsed ────────────────────────────────────────────────────────────
    if (!isExpanded) {
      const typeHint = isArray ? `Array (${arrayLen})` : 'Object'
      return (
        <div key={path} className="json-viewer__line">
          {keyPrefix}
          <button
            className="json-viewer__toggle-btn"
            onClick={() => togglePath(path)}
            aria-expanded={false}
            aria-label={`Expand ${typeHint}`}
          >
            <ChevronRight size={10} className="json-viewer__chevron" />
          </button>
          <span className="json-viewer__type-hint">{typeHint}</span>
          {comma}
        </div>
      )
    }

    // ── expanded ─────────────────────────────────────────────────────────────
    const childEntries = isArray
      ? (value as JsonValue[]).map((v, i) => ({
          childKey: null as null,
          v,
          childPath: `${path}[${i}]`
        }))
      : objectEntries.map(([k, v]) => ({ childKey: k, v, childPath: `${path}.${k}` }))

    return (
      <div key={path} className="json-viewer__property">
        <div className="json-viewer__line">
          {keyPrefix}
          {collapsible && (
            <button
              className="json-viewer__toggle-btn json-viewer__toggle-btn--expanded"
              onClick={() => togglePath(path)}
              aria-expanded={true}
              aria-label="Collapse"
            >
              <ChevronRight size={10} className="json-viewer__chevron json-viewer__chevron--expanded" />
            </button>
          )}
          <span className={braceClass}>{openBrace}</span>
        </div>

        <div className="json-viewer__indent">
          {childEntries.map(({ childKey, v, childPath }, i) =>
            renderEntry(childKey, v, childPath, i === childEntries.length - 1)
          )}
        </div>

        <div className="json-viewer__line">
          <span className={braceClass}>{closeBrace}</span>
          {comma}
        </div>
      </div>
    )
  }

  /** Render the root JSON value (no key prefix, braces always shown). */
  function renderRoot(value: JsonValue): JSX.Element {
    if (value === null || typeof value !== 'object') {
      return (
        <div className="json-viewer__line">
          {renderPrimitive(value as string | number | boolean | null)}
        </div>
      )
    }

    const isArray = Array.isArray(value)
    const objectEntries = isArray ? [] : Object.entries(value as Record<string, JsonValue>)
    const isEmpty = isArray ? (value as JsonValue[]).length === 0 : objectEntries.length === 0
    const openBrace = isArray ? '[' : '{'
    const closeBrace = isArray ? ']' : '}'
    const braceClass = syntaxHighlighting ? 'json-viewer__brace' : undefined

    if (isEmpty) {
      return (
        <div className="json-viewer__line">
          <span className={braceClass}>
            {openBrace}
            {closeBrace}
          </span>
        </div>
      )
    }

    const childEntries = isArray
      ? (value as JsonValue[]).map((v, i) => ({
          childKey: null as null,
          v,
          childPath: `root[${i}]`
        }))
      : objectEntries.map(([k, v]) => ({ childKey: k, v, childPath: `root.${k}` }))

    return (
      <>
        <div className="json-viewer__line">
          <span className={braceClass}>{openBrace}</span>
        </div>
        <div className="json-viewer__indent">
          {childEntries.map(({ childKey, v, childPath }, i) =>
            renderEntry(childKey, v, childPath, i === childEntries.length - 1)
          )}
        </div>
        <div className="json-viewer__line">
          <span className={braceClass}>{closeBrace}</span>
        </div>
      </>
    )
  }

  // ── output ─────────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="json-viewer" onContextMenu={handleContextMenu}>
      {parseResult.ok ? (
        <div className="json-viewer__content">{renderRoot(parseResult.value)}</div>
      ) : (
        <div className="json-viewer__invalid">
          <div className="json-viewer__error-bar">
            <span className="json-viewer__error-label">{t('jsonViewer.invalidJson')}</span>
            {(() => {
              const loc = extractErrorLocation(parseResult.error, json)
              return loc ? (
                <span className="json-viewer__error-location">
                  {t('jsonViewer.errorAt', { line: loc.line, col: loc.col })}
                </span>
              ) : null
            })()}
          </div>
          <pre className="json-viewer__raw-text">{json}</pre>
        </div>
      )}

      {contextMenu && (
        <Menu items={menuItems} position={contextMenu} onClose={() => setContextMenu(null)} />
      )}
    </div>
  )
}
