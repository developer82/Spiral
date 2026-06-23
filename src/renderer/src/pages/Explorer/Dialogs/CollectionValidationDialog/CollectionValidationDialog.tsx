import '../../MonacoEditor/monacoSetup'
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, Loader, ChevronLeft, ChevronRight } from 'lucide-react'
import MonacoEditor, { type BeforeMount } from '@monaco-editor/react'
import type { GenerateMongoValidationRulesResult, GetMongoValidationResult, SaveMongoValidationResult, TestMongoValidationResult } from '../../../../../../preload/index.d'
import './CollectionValidationDialog.css'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import ErrorBox from '../../../../components/ErrorBox/ErrorBox'
import Button from '../../../../components/Button/Button'

// ── Monaco themes ─────────────────────────────────────────────────────────────

const DARK_THEME = 'spiral-dark'
const LIGHT_THEME = 'spiral-light'

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme(DARK_THEME, {
    base: 'vs-dark', inherit: true, rules: [],
    colors: { 'editor.background': '#1a1a1a', 'editorGutter.background': '#141414' }
  })
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: 'vs', inherit: true, rules: [],
    colors: { 'editor.background': '#ffffff', 'editorGutter.background': '#e8e8e8' }
  })
}

function resolveMonacoTheme(): string {
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-theme') === 'light' ? LIGHT_THEME : DARK_THEME
  }
  return DARK_THEME
}

// ── JSON syntax highlight ─────────────────────────────────────────────────────

const JSON_TOKEN_RE = /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g

function JsonHighlight({ json }: { json: string }): React.JSX.Element {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const re = new RegExp(JSON_TOKEN_RE.source, 'g')
  while ((match = re.exec(json)) !== null) {
    if (match.index > lastIndex) parts.push(json.slice(lastIndex, match.index))
    const token = match[0]
    let cls: string
    if (token.trimEnd().endsWith(':')) cls = 'json-hl-key'
    else if (token.startsWith('"')) cls = 'json-hl-string'
    else if (token === 'true' || token === 'false') cls = 'json-hl-bool'
    else if (token === 'null') cls = 'json-hl-null'
    else cls = 'json-hl-number'
    parts.push(<span key={match.index} className={cls}>{token}</span>)
    lastIndex = re.lastIndex
  }
  if (lastIndex < json.length) parts.push(json.slice(lastIndex))
  return <>{parts}</>
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ValidationAction = 'warn' | 'error' | 'errorAndLog'
type ValidationLevel = 'off' | 'moderate' | 'strict'

const PAGE_SIZE = 20

interface TestResults {
  passed: string[]
  failed: string[]
}

// ── Paginated doc list ────────────────────────────────────────────────────────

interface DocListProps {
  docs: string[]
  page: number
  onPageChange: (page: number) => void
  emptyLabel: string
  prevLabel: string
  nextLabel: string
}

function DocList({ docs, page, onPageChange, emptyLabel, prevLabel, nextLabel }: DocListProps): React.JSX.Element {
  const totalPages = Math.max(1, Math.ceil(docs.length / PAGE_SIZE))
  const slice = docs.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  if (docs.length === 0) {
    return <div className="val-dialog__result-empty">{emptyLabel}</div>
  }

  return (
    <>
      <div className="val-dialog__result-list">
        {slice.map((doc, i) => (
          <div key={i} className="val-dialog__result-doc">
            <JsonHighlight json={doc} />
          </div>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="val-dialog__result-pagination">
          <Button
              variant="secondary"
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
          >
            <ChevronLeft size={12} />
            {prevLabel}
          </Button>
          <span>{page + 1} / {totalPages}</span>
          <Button
              variant="secondary"
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
          >
            {nextLabel}
            <ChevronRight size={12} />
          </Button>
        </div>
      )}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface CollectionValidationDialogProps {
  connectionId: string
  databaseName: string
  collectionName: string
  onClose: () => void
}

export default function CollectionValidationDialog({
  connectionId,
  databaseName,
  collectionName,
  onClose
}: CollectionValidationDialogProps): React.JSX.Element {
  const { t } = useTranslation()

  const [validatorJson, setValidatorJson] = useState<string>('{}')
  const [validationAction, setValidationAction] = useState<ValidationAction>('error')
  const [validationLevel, setValidationLevel] = useState<ValidationLevel>('strict')
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<TestResults | null>(null)
  const [passedPage, setPassedPage] = useState(0)
  const [failedPage, setFailedPage] = useState(0)

  useEffect(() => {
    void (async () => {
      setIsLoading(true)
      setError(null)
      const result: GetMongoValidationResult = await window.api.database.getMongoValidation(
        connectionId,
        databaseName,
        collectionName
      )
      setIsLoading(false)
      if (result.status === 'error') {
        setError(result.message)
        return
      }
      const { validator, validationAction: action, validationLevel: level } = result.definition
      setValidatorJson(JSON.stringify(validator, null, 2))
      const actionVal = (action === 'warn' || action === 'error' || action === 'errorAndLog') ? action : 'error'
      const levelVal = (level === 'off' || level === 'moderate' || level === 'strict') ? level : 'strict'
      setValidationAction(actionVal)
      setValidationLevel(levelVal)
    })()
  }, [connectionId, databaseName, collectionName])

  async function handleGenerateRules(): Promise<void> {
    setIsGenerating(true)
    setError(null)
    const result: GenerateMongoValidationRulesResult = await window.api.database.generateMongoValidationRules(
      connectionId,
      databaseName,
      collectionName
    )
    setIsGenerating(false)
    if (result.status === 'error') { setError(result.message); return }
    setValidatorJson(result.validatorJson)
  }

  async function handleTestRules(): Promise<void> {
    setIsTesting(true)
    setError(null)
    let validator: Record<string, unknown>
    try {
      validator = JSON.parse(validatorJson) as Record<string, unknown>
    } catch {
      setError('Invalid JSON in editor')
      setIsTesting(false)
      return
    }
    const result: TestMongoValidationResult = await window.api.database.testMongoValidation(
      connectionId,
      databaseName,
      collectionName,
      validator
    )
    setIsTesting(false)
    if (result.status === 'error') { setError(result.message); return }
    setTestResults({ passed: result.passed, failed: result.failed })
    setPassedPage(0)
    setFailedPage(0)
  }

  async function handleSave(): Promise<void> {
    let validator: Record<string, unknown>
    try {
      validator = JSON.parse(validatorJson) as Record<string, unknown>
    } catch {
      setError('Invalid JSON: cannot save')
      return
    }
    setIsSaving(true)
    setError(null)
    const result: SaveMongoValidationResult = await window.api.database.saveMongoValidation(
      connectionId,
      databaseName,
      collectionName,
      validator,
      validationAction,
      validationLevel
    )
    setIsSaving(false)
    if (result.status === 'error') { setError(result.message); return }
    onClose()
  }

  const footer = (
    <>
      <Button
              variant="secondary"
        onClick={onClose}
        disabled={isSaving}
      >
        {t('explorer.collectionValidation.cancelButton')}
      </Button>
      <Button
              variant="primary"
        onClick={() => { void handleSave() }}
        disabled={isSaving || isLoading}
      >
        {isSaving
          ? <><Loader size={13} className="dialog__spinner" />{t('explorer.collectionValidation.savingButton')}</>
          : t('explorer.collectionValidation.saveButton')
        }
      </Button>
    </>
  )

  return (
    <BaseDialog
      title={t('explorer.collectionValidation.dialogTitle', { collection: collectionName })}
      icon={<ShieldCheck size={16} />}
      onClose={onClose}
      closeDisabled={isSaving}
      width="min(1200px, calc(100vw - 3.3rem))"
      maxWidth="min(1200px, calc(100vw - 3.3rem))"
      height="700px"
      minWidth="600px"
      minHeight="500px"
      footer={footer}
    >
      {error && <ErrorBox error={error} />}

      <div className="val-dialog__controls">
        <div className="val-dialog__controls-left">
          <div className="val-dialog__control-group">
            <label className="val-dialog__control-label">
              {t('explorer.collectionValidation.actionLabel')}
            </label>
            <select
              className="val-dialog__select"
              value={validationAction}
              onChange={(e) => setValidationAction(e.target.value as ValidationAction)}
              disabled={isLoading}
            >
              <option value="warn">{t('explorer.collectionValidation.actionWarn')}</option>
              <option value="error">{t('explorer.collectionValidation.actionError')}</option>
              <option value="errorAndLog">{t('explorer.collectionValidation.actionErrorAndLog')}</option>
            </select>
          </div>
          <div className="val-dialog__control-group">
            <label className="val-dialog__control-label">
              {t('explorer.collectionValidation.levelLabel')}
            </label>
            <select
              className="val-dialog__select"
              value={validationLevel}
              onChange={(e) => setValidationLevel(e.target.value as ValidationLevel)}
              disabled={isLoading}
            >
              <option value="off">{t('explorer.collectionValidation.levelOff')}</option>
              <option value="moderate">{t('explorer.collectionValidation.levelModerate')}</option>
              <option value="strict">{t('explorer.collectionValidation.levelStrict')}</option>
            </select>
          </div>
        </div>
        <Button
              variant="secondary"
          onClick={() => { void handleGenerateRules() }}
          disabled={isGenerating || isLoading}
        >
          {isGenerating
            ? <><Loader size={13} className="dialog__spinner" />{t('explorer.collectionValidation.generatingButton')}</>
            : t('explorer.collectionValidation.generateRulesButton')
          }
        </Button>
      </div>

      <div className="val-dialog__editor-wrap">
        <MonacoEditor
          language="json"
          theme={resolveMonacoTheme()}
          value={validatorJson}
          onChange={(v) => setValidatorJson(v ?? '{}')}
          beforeMount={handleBeforeMount}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            readOnly: isLoading
          }}
        />
      </div>

      <div className="val-dialog__test-bar">
        <Button
              variant="secondary"
          onClick={() => { void handleTestRules() }}
          disabled={isTesting || isLoading}
        >
          {isTesting
            ? <><Loader size={13} className="dialog__spinner" />{t('explorer.collectionValidation.testingButton')}</>
            : t('explorer.collectionValidation.testButton')
          }
        </Button>
        {testResults && (
          <span style={{ fontSize: 'var(--font-xs)', color: 'var(--color-muted)' }}>
            {testResults.passed.length} passed · {testResults.failed.length} failed
          </span>
        )}
      </div>

      {testResults && (
        <div className="val-dialog__test-results">
          <div className="val-dialog__result-panel">
            <div className="val-dialog__result-header val-dialog__result-header--passed">
              {t('explorer.collectionValidation.passedHeader')} ({testResults.passed.length})
            </div>
            <DocList
              docs={testResults.passed}
              page={passedPage}
              onPageChange={setPassedPage}
              emptyLabel={t('explorer.collectionValidation.noResults')}
              prevLabel={t('explorer.collectionValidation.prevPage')}
              nextLabel={t('explorer.collectionValidation.nextPage')}
            />
          </div>
          <div className="val-dialog__result-panel">
            <div className="val-dialog__result-header val-dialog__result-header--failed">
              {t('explorer.collectionValidation.failedHeader')} ({testResults.failed.length})
            </div>
            <DocList
              docs={testResults.failed}
              page={failedPage}
              onPageChange={setFailedPage}
              emptyLabel={t('explorer.collectionValidation.noResults')}
              prevLabel={t('explorer.collectionValidation.prevPage')}
              nextLabel={t('explorer.collectionValidation.nextPage')}
            />
          </div>
        </div>
      )}
    </BaseDialog>
  )
}
