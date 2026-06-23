import { useState, useMemo, useCallback } from 'react'
import { Search, TableProperties } from 'lucide-react'
import type { ErdTable } from '../../erd.types'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import './AddTablesDialog.css'
import Button from '../../../../components/Button/Button'

interface AddTablesDialogProps {
  tables: ErdTable[]
  onAdd: (tables: ErdTable[]) => void
  onClose: () => void
}

export default function AddTablesDialog({ tables, onAdd, onClose }: AddTablesDialogProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const tableId = (t: ErdTable): string => `${t.schema}.${t.name}`

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return tables
    return tables.filter(
      (t) => t.name.toLowerCase().includes(q) || t.schema.toLowerCase().includes(q)
    )
  }, [tables, searchQuery])

  const toggleTable = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const handleSelectAll = useCallback(() => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(tableId)))
    }
  }, [filtered, selectedIds.size])

  const handleAdd = useCallback(() => {
    const toAdd = tables.filter((t) => selectedIds.has(tableId(t)))
    onAdd(toAdd)
    onClose()
  }, [tables, selectedIds, onAdd, onClose])

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((t) => selectedIds.has(tableId(t)))

  const countLabel = selectedIds.size > 0 ? `${selectedIds.size} selected` : ''
  const addLabel = `Add${selectedIds.size > 0 ? ` ${selectedIds.size}` : ''} Table${selectedIds.size !== 1 ? 's' : ''}`

  return (
    <BaseDialog
      title="Add Tables"
      icon={<TableProperties size={16} style={{ color: 'var(--color-primary)' }} />}
      onClose={onClose}
      maxWidth="360px"
      zIndex={200}
      ariaLabel="Add tables to diagram"
      footerSpaceBetween
      footer={
        <>
          <span className="add-tables-dialog__footer-count">{countLabel}</span>
          <div className="dialog__footer-right">
            <Button
              variant="ghost"
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAdd}
              disabled={selectedIds.size === 0}
            >
              {addLabel}
            </Button>
          </div>
        </>
      }
    >
      {/* Search — sits directly in dialog body, not in scroll-area */}
      <div className="add-tables-dialog__search-wrap">
        <Search size={13} className="add-tables-dialog__search-icon" />
        <input
          className="add-tables-dialog__search"
          type="text"
          placeholder="Filter tables…"
          value={searchQuery}
          aria-label="Filter tables"
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
        />
      </div>

      {/* List */}
      <div className="add-tables-dialog__list" role="list">
        {filtered.length === 0 ? (
          <div className="add-tables-dialog__empty">No tables match your search</div>
        ) : (
          <>
            <label
              className="add-tables-dialog__item add-tables-dialog__item--select-all"
              role="listitem"
            >
              <input
                type="checkbox"
                className="add-tables-dialog__checkbox"
                checked={allFilteredSelected}
                onChange={handleSelectAll}
                aria-label="Select all filtered tables"
              />
              <span className="add-tables-dialog__item-name add-tables-dialog__item-name--all">
                Select all ({filtered.length})
              </span>
            </label>
            <div className="add-tables-dialog__divider" />
            {filtered.map((t) => {
              const id = tableId(t)
              return (
                <label key={id} className="add-tables-dialog__item" role="listitem">
                  <input
                    type="checkbox"
                    className="add-tables-dialog__checkbox"
                    checked={selectedIds.has(id)}
                    onChange={() => toggleTable(id)}
                    aria-label={`${t.schema}.${t.name}`}
                  />
                  <span className="add-tables-dialog__item-schema">{t.schema}.</span>
                  <span className="add-tables-dialog__item-name">{t.name}</span>
                </label>
              )
            })}
          </>
        )}
      </div>
    </BaseDialog>
  )
}
