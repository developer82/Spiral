import './monacoSetup'
import { useRef, useEffect, useLayoutEffect, useCallback, useState, forwardRef, useImperativeHandle } from 'react'
import MonacoEditor, { type OnMount, type BeforeMount } from '@monaco-editor/react'
import type * as Monaco from 'monaco-editor'
import { EyeOff } from 'lucide-react'
import Menu, { type MenuItem } from '../../../components/Menu/Menu'
import { defineMonacoThemes, resolveMonacoTheme } from './monacoThemes'
import type { QueryContextInfo } from './queryContextUtils'

export type { QueryContextInfo }

export interface QueryEditorHandle {
  getSelectedText: () => string
  focus: () => void
}

interface QueryEditorProps {
  value: string
  onChange: (value: string) => void
  visible: boolean
  language?: string
  onExecute?: () => void
  onToggleResults?: () => void
  queryContext?: QueryContextInfo
}

const handleBeforeMount: BeforeMount = (monaco) => {
  defineMonacoThemes(monaco)
}

const QueryEditor = forwardRef<QueryEditorHandle, QueryEditorProps>(function QueryEditor(
  { value, onChange, visible, language = 'sql', onExecute, onToggleResults, queryContext },
  ref
): React.JSX.Element {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null)
  const [dismissed, setDismissed] = useState(false)
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null)

  const contextMenuItems: MenuItem[] = [
    { id: 'dismiss', label: 'Dismiss', icon: <EyeOff size={13} />, onClick: () => setDismissed(true) }
  ]

  const handleContextMenu = useCallback((e: React.MouseEvent): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }, [])
  const monacoApiRef = useRef<{ editor: { setTheme: (theme: string) => void } } | null>(null)
  const onExecuteRef = useRef(onExecute)
  const onToggleResultsRef = useRef(onToggleResults)
  // Stable ref for onChange — avoids re-subscribing to Monaco's model content event on every render
  const onChangeRef = useRef(onChange)
  // React 19: ref.current must not be written during render; sync via useLayoutEffect instead
  useLayoutEffect(() => {
    onExecuteRef.current = onExecute
    onToggleResultsRef.current = onToggleResults
    onChangeRef.current = onChange
  })
  // Tracks the last value that came from user typing so external changes can be detected
  const lastInternalValueRef = useRef(value)

  useImperativeHandle(ref, () => ({
    getSelectedText(): string {
      const editor = editorRef.current
      if (!editor) return ''
      const selection = editor.getSelection()
      if (!selection || selection.isEmpty()) return ''
      return editor.getModel()?.getValueInRange(selection).trim() ?? ''
    },
    focus(): void {
      editorRef.current?.focus()
    }
  }))

  // Keep the editor theme in sync with the app theme. The resolved theme id lives
  // on <html data-theme>, so observe it directly — this also covers the 'system'
  // theme, which SettingsContext resolves to a concrete id on that attribute.
  useEffect(() => {
    const applyTheme = (): void => {
      monacoApiRef.current?.editor.setTheme(resolveMonacoTheme())
    }
    const observer = new MutationObserver(applyTheme)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    return () => observer.disconnect()
  }, [])

  // Apply external value changes (e.g. Format SQL, file open) to the editor imperatively.
  // Skips values that already originated from the user typing to avoid resetting cursor position.
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    const model = editor.getModel()
    if (!model || value === model.getValue()) return
    lastInternalValueRef.current = value
    editor.setValue(value)
  }, [value])

  // Stable callback — never changes reference, so @monaco-editor/react never re-subscribes
  // to the onDidChangeModelContent event on re-renders.
  const handleChange = useCallback((val: string | undefined): void => {
    const v = val ?? ''
    lastInternalValueRef.current = v
    onChangeRef.current(v)
  }, [])

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoApiRef.current = monaco
    editor.addCommand(monaco.KeyCode.F5, () => {
      onExecuteRef.current?.()
    })
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyR, () => {
      onToggleResultsRef.current?.()
    })

    const domNode = editor.getDomNode()
    if (domNode) {
      const handleDragOver = (e: DragEvent): void => {
        if (e.dataTransfer?.types.includes('text/plain')) {
          e.preventDefault()
          e.stopPropagation()
          e.dataTransfer.dropEffect = 'copy'
        }
      }

      const handleDrop = (e: DragEvent): void => {
        const text = e.dataTransfer?.getData('text/plain')
        if (!text) return
        e.preventDefault()
        e.stopPropagation()
        const target = editor.getTargetAtClientPoint(e.clientX, e.clientY)
        const position = target?.position
        if (!position) return
        editor.executeEdits('drag-insert', [
          {
            range: new monaco.Range(
              position.lineNumber,
              position.column,
              position.lineNumber,
              position.column
            ),
            text
          }
        ])
        editor.focus()
      }

      domNode.addEventListener('dragover', handleDragOver)
      domNode.addEventListener('drop', handleDrop)
    }
  }

  return (
    <div className={`query-editor${visible ? '' : ' query-editor--hidden'}`}>
      <MonacoEditor
        language={language}
        defaultValue={value}
        theme={resolveMonacoTheme()}
        beforeMount={handleBeforeMount}
        onChange={handleChange}
        onMount={handleMount}
        options={{
          lineNumbers: 'on',
          lineNumbersMinChars: 4,
          minimap: { enabled: false },
          fontSize: 16,
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          renderLineHighlight: 'line',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          padding: { top: 12, bottom: 12 },
          useShadowDOM: false
        }}
      />
      {queryContext && !dismissed && (
        <div
          className="query-editor__context-panel"
          onContextMenu={handleContextMenu}
          aria-label="Query context"
        >
          <div className="query-editor__context-row">
            <span className="query-editor__context-label">Provider</span>
            <span className="query-editor__context-value" title={queryContext.providerLabel}>
              {queryContext.providerLabel}
            </span>
          </div>
          <div className="query-editor__context-row">
            <span className="query-editor__context-label">Connection</span>
            <span className="query-editor__context-value" title={queryContext.connectionName}>
              {queryContext.connectionName}
            </span>
          </div>
          {queryContext.database !== null && (
            <div className="query-editor__context-row">
              <span className="query-editor__context-label">Database</span>
              <span className="query-editor__context-value" title={queryContext.database}>
                {queryContext.database}
              </span>
            </div>
          )}
          {queryContext.objectName !== null && (
            <div className="query-editor__context-row">
              <span className="query-editor__context-label">{queryContext.objectLabel}</span>
              <span className="query-editor__context-value" title={queryContext.objectName}>
                {queryContext.objectName}
              </span>
            </div>
          )}
          <div className="query-editor__context-row">
            <span className="query-editor__context-label">Syntax</span>
            <span className="query-editor__context-value">{queryContext.syntaxLabel}</span>
          </div>
        </div>
      )}
      <Menu
        items={contextMenuItems}
        position={menuPos}
        onClose={() => setMenuPos(null)}
      />
    </div>
  )
})

export default QueryEditor
