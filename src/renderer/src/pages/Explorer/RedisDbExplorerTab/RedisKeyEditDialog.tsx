import { useState, useEffect } from 'react'
import { Pencil, Trash2, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import BaseDialog from '../../../components/BaseDialog/BaseDialog'
import ConfirmDialog from '../../../components/ConfirmDialog/ConfirmDialog'
import type {
  RedisKeyType,
  RedisKeyFullValue,
  GetRedisKeyValueResult
} from '../../../../../preload/index.d'
import './RedisKeyEditDialog.css'
import Button from '../../../components/Button/Button'

interface RedisKeyEditDialogProps {
  connectionId: string
  dbIndex: number
  keyName?: string
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}

export default function RedisKeyEditDialog({
  connectionId,
  dbIndex,
  keyName,
  onClose,
  onSaved,
  onDeleted
}: RedisKeyEditDialogProps): React.JSX.Element {
  const { t } = useTranslation()
  const isNew = keyName === undefined
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>(isNew ? 'loaded' : 'loading')
  const [error, setError] = useState<string | null>(null)
  const [keyType, setKeyType] = useState<RedisKeyType>('string')
  const [ttl, setTtl] = useState<number>(-1)
  const [value, setValue] = useState<RedisKeyFullValue>({ type: 'string', value: '' })
  const [newKeyName, setNewKeyName] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (isNew) return
    void window.api.database
      .getRedisKeyValue(connectionId, String(dbIndex), keyName)
      .then((result: GetRedisKeyValueResult) => {
        if (result.status === 'error') {
          setError(result.message)
          setLoadState('error')
          return
        }
        setKeyType(result.type)
        setTtl(result.ttl)
        setValue(result.value)
        setLoadState('loaded')
      })
  }, [connectionId, dbIndex, keyName, isNew])

  function handleTypeChange(newType: RedisKeyType): void {
    setKeyType(newType)
    switch (newType) {
      case 'string': setValue({ type: 'string', value: '' }); break
      case 'list': setValue({ type: 'list', items: [] }); break
      case 'set': setValue({ type: 'set', members: [] }); break
      case 'zset': setValue({ type: 'zset', members: [] }); break
      case 'hash': setValue({ type: 'hash', fields: [] }); break
    }
  }

  async function handleSave(): Promise<void> {
    setSaving(true)
    try {
      const result = await window.api.database.saveRedisKey(connectionId, String(dbIndex), {
        keyName: isNew ? newKeyName : keyName!,
        type: keyType,
        ttl,
        value
      })
      if (result.status === 'error') {
        setError(result.message)
        return
      }
      onSaved()
      onClose()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(): Promise<void> {
    setDeleting(true)
    try {
      const result = await window.api.database.deleteRedisKey(connectionId, String(dbIndex), keyName!)
      if (result.status === 'error') {
        setError(result.message)
        setDeleteConfirm(false)
        return
      }
      onDeleted()
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  function renderValueEditor(): React.JSX.Element {
    if (loadState === 'loading') {
      return <div className="redis-edit__loading">{t('common.loading', 'Loading…')}</div>
    }
    if (loadState === 'error') {
      return <div className="redis-edit__error">{error ?? t('redisKeyEdit.loadError')}</div>
    }

    switch (value.type) {
      case 'string':
        return (
          <textarea
            className="redis-edit__textarea"
            value={value.value}
            onChange={(e) => setValue({ type: 'string', value: e.target.value })}
            spellCheck={false}
          />
        )

      case 'list':
        return (
          <div className="redis-edit__list-editor">
            {value.items.map((item, idx) => (
              <div key={idx} className="redis-edit__list-row">
                <span className="redis-edit__list-index">{idx + 1}</span>
                <input
                  className="redis-edit__list-input"
                  value={item}
                  onChange={(e) => {
                    const items = [...value.items]
                    items[idx] = e.target.value
                    setValue({ type: 'list', items })
                  }}
                />
                <button
                  type="button"
                  className="redis-edit__row-btn redis-edit__row-btn--danger"
                  onClick={() => {
                    const items = value.items.filter((_, i) => i !== idx)
                    setValue({ type: 'list', items })
                  }}
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="redis-edit__add-btn"
              onClick={() => setValue({ type: 'list', items: [...value.items, ''] })}
            >
              <Plus size={12} /> {t('explorer.redisKeyEdit.addItem')}
            </button>
          </div>
        )

      case 'set':
        return (
          <div className="redis-edit__list-editor">
            {value.members.map((member, idx) => (
              <div key={idx} className="redis-edit__list-row">
                <input
                  className="redis-edit__list-input"
                  value={member}
                  onChange={(e) => {
                    const members = [...value.members]
                    members[idx] = e.target.value
                    setValue({ type: 'set', members })
                  }}
                />
                <button
                  type="button"
                  className="redis-edit__row-btn redis-edit__row-btn--danger"
                  onClick={() => {
                    const members = value.members.filter((_, i) => i !== idx)
                    setValue({ type: 'set', members })
                  }}
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="redis-edit__add-btn"
              onClick={() => setValue({ type: 'set', members: [...value.members, ''] })}
            >
              <Plus size={12} /> {t('explorer.redisKeyEdit.addMember')}
            </button>
          </div>
        )

      case 'zset':
        return (
          <div className="redis-edit__list-editor">
            <div className="redis-edit__zset-header">
              <span>{t('explorer.redisKeyEdit.member')}</span>
              <span>{t('explorer.redisKeyEdit.score')}</span>
              <span />
            </div>
            {value.members.map((entry, idx) => (
              <div key={idx} className="redis-edit__zset-row">
                <input
                  className="redis-edit__list-input"
                  value={entry.member}
                  onChange={(e) => {
                    const members = [...value.members]
                    members[idx] = { ...members[idx], member: e.target.value }
                    setValue({ type: 'zset', members })
                  }}
                />
                <input
                  className="redis-edit__score-input"
                  type="number"
                  value={entry.score}
                  onChange={(e) => {
                    const members = [...value.members]
                    members[idx] = { ...members[idx], score: parseFloat(e.target.value) || 0 }
                    setValue({ type: 'zset', members })
                  }}
                />
                <button
                  type="button"
                  className="redis-edit__row-btn redis-edit__row-btn--danger"
                  onClick={() => {
                    const members = value.members.filter((_, i) => i !== idx)
                    setValue({ type: 'zset', members })
                  }}
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="redis-edit__add-btn"
              onClick={() =>
                setValue({ type: 'zset', members: [...value.members, { member: '', score: 0 }] })
              }
            >
              <Plus size={12} /> {t('explorer.redisKeyEdit.addMember')}
            </button>
          </div>
        )

      case 'hash':
        return (
          <div className="redis-edit__list-editor">
            <div className="redis-edit__hash-header">
              <span>{t('explorer.redisKeyEdit.field')}</span>
              <span>{t('explorer.redisKeyEdit.value')}</span>
              <span />
            </div>
            {value.fields.map((entry, idx) => (
              <div key={idx} className="redis-edit__hash-row">
                <input
                  className="redis-edit__list-input"
                  value={entry.field}
                  onChange={(e) => {
                    const fields = [...value.fields]
                    fields[idx] = { ...fields[idx], field: e.target.value }
                    setValue({ type: 'hash', fields })
                  }}
                />
                <input
                  className="redis-edit__list-input"
                  value={entry.value}
                  onChange={(e) => {
                    const fields = [...value.fields]
                    fields[idx] = { ...fields[idx], value: e.target.value }
                    setValue({ type: 'hash', fields })
                  }}
                />
                <button
                  type="button"
                  className="redis-edit__row-btn redis-edit__row-btn--danger"
                  onClick={() => {
                    const fields = value.fields.filter((_, i) => i !== idx)
                    setValue({ type: 'hash', fields })
                  }}
                  title="Remove"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="redis-edit__add-btn"
              onClick={() =>
                setValue({ type: 'hash', fields: [...value.fields, { field: '', value: '' }] })
              }
            >
              <Plus size={12} /> {t('explorer.redisKeyEdit.addField')}
            </button>
          </div>
        )

      case 'stream':
        return (
          <div className="redis-edit__stream">
            <p className="redis-edit__stream-note">{t('explorer.redisKeyEdit.streamReadOnly')}</p>
            <div className="redis-edit__stream-entries">
              {value.entries.map((entry) => (
                <div key={entry.id} className="redis-edit__stream-entry">
                  <div className="redis-edit__stream-id">{entry.id}</div>
                  <div className="redis-edit__stream-fields">
                    {Object.entries(entry.fields).map(([k, v]) => (
                      <div key={k} className="redis-edit__stream-field">
                        <span className="redis-edit__stream-field-key">{k}:</span>
                        <span>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {value.totalLength > value.entries.length && (
                <div className="redis-edit__stream-more">
                  …and {value.totalLength - value.entries.length} more entries
                </div>
              )}
            </div>
          </div>
        )
    }
  }

  return (
    <>
      <BaseDialog
        title={isNew ? t('explorer.redisKeyEdit.newTitle', 'New Key') : `${t('explorer.redisKeyEdit.title')}: ${keyName}`}
        icon={<Pencil size={14} />}
        onClose={onClose}
        width="600px"
        maxWidth="90vw"
        height="560px"
        maxHeight="90vh"
        zIndex={110}
        footer={
          loadState === 'loaded' ? (
            <div className={`redis-edit__footer${isNew ? ' redis-edit__footer--new' : ''}`}>
              {!isNew && (
                <Button
              variant="danger"
                  onClick={() => setDeleteConfirm(true)}
                  disabled={deleting || saving}
                >
                  <Trash2 size={13} /> {t('explorer.redisKeyEdit.delete')}
                </Button>
              )}
              <div className="redis-edit__footer-right">
                <Button
              variant="ghost"
                  onClick={onClose}
                  disabled={saving}
                >
                  {t('explorer.redisKeyEdit.cancel')}
                </Button>
                <Button
              variant="primary"
                  onClick={() => void handleSave()}
                  disabled={saving || keyType === 'stream' || (isNew && !newKeyName.trim())}
                >
                  {saving ? t('common.saving', 'Saving…') : t('explorer.redisKeyEdit.save')}
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        <div className="redis-edit__body">
          <div className="redis-edit__meta">
            <div className="redis-edit__meta-row">
              <label className="redis-edit__meta-label" htmlFor="redis-edit-keyname">Key</label>
              {isNew ? (
                <input
                  id="redis-edit-keyname"
                  className="redis-edit__keyname-input"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder={t('explorer.redisKeyEdit.keyNamePlaceholder', 'Enter key name')}
                  autoFocus
                  spellCheck={false}
                />
              ) : (
                <span className="redis-edit__meta-value">{keyName}</span>
              )}
            </div>
            <div className="redis-edit__meta-row">
              <span className="redis-edit__meta-label">Type</span>
              {isNew ? (
                <select
                  className="redis-edit__type-select"
                  value={keyType}
                  onChange={(e) => handleTypeChange(e.target.value as RedisKeyType)}
                >
                  <option value="string">string</option>
                  <option value="list">list</option>
                  <option value="set">set</option>
                  <option value="zset">zset</option>
                  <option value="hash">hash</option>
                </select>
              ) : (
                <span className={`redis-type-badge redis-type-badge--${keyType}`}>{keyType}</span>
              )}
            </div>
            {loadState === 'loaded' && (
              <div className="redis-edit__meta-row">
                <label className="redis-edit__meta-label" htmlFor="redis-edit-ttl">
                  {t('explorer.redisKeyEdit.ttlLabel')}
                </label>
                <input
                  id="redis-edit-ttl"
                  className="redis-edit__ttl-input"
                  type="number"
                  value={ttl}
                  min={-1}
                  onChange={(e) => setTtl(parseInt(e.target.value, 10) || -1)}
                  disabled={keyType === 'stream'}
                />
                <span className="redis-edit__ttl-hint">
                  {ttl === -1
                    ? t('explorer.redisKeyEdit.ttlNoExpiry')
                    : t('explorer.redisKeyEdit.ttlSeconds')}
                </span>
              </div>
            )}
          </div>
          {error && loadState !== 'error' && (
            <div className="redis-edit__save-error">{error}</div>
          )}
          <div className="redis-edit__value-area">{renderValueEditor()}</div>
        </div>
      </BaseDialog>

      {deleteConfirm && (
        <ConfirmDialog
          title={t('explorer.redisKeyEdit.deleteConfirmTitle')}
          message={t('explorer.redisKeyEdit.deleteConfirmMessage', { keyName })}
          variant="danger"
          confirmLabel={t('explorer.redisKeyEdit.delete')}
          onConfirm={() => void handleDelete()}
          onClose={() => setDeleteConfirm(false)}
        />
      )}
    </>
  )
}
