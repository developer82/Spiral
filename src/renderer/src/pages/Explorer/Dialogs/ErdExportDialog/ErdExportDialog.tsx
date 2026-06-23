import { useState } from 'react'
import { Square, CircleDot, Grid2X2 } from 'lucide-react'
import type { ErdBackground } from '../../ErdCanvas/ErdCanvas'
import BaseDialog from '../../../../components/BaseDialog/BaseDialog'
import './ErdExportDialog.css'
import Button from '../../../../components/Button/Button'

export interface ErdExportOptions {
  backgroundColor: string
  transparent: boolean
  grid: ErdBackground
  includeStats: boolean
}

interface ErdExportDialogProps {
  open: boolean
  databaseName: string
  currentGrid: ErdBackground
  onConfirm: (opts: ErdExportOptions) => void
  onCancel: () => void
}

export default function ErdExportDialog({
  open,
  databaseName,
  currentGrid,
  onConfirm,
  onCancel
}: ErdExportDialogProps) {
  const [backgroundColor, setBackgroundColor] = useState('#ffffff')
  const [transparent, setTransparent] = useState(false)
  const [grid, setGrid] = useState<ErdBackground>(currentGrid)
  const [includeStats, setIncludeStats] = useState(true)

  if (!open) return null

  function handleConfirm(): void {
    onConfirm({ backgroundColor, transparent, grid, includeStats })
  }

  const filename = databaseName ? `${databaseName}-erd.png` : 'erd-export.png'

  return (
    <BaseDialog
      title="Export as PNG"
      onClose={onCancel}
      maxWidth="420px"
      zIndex={200}
      footerSpaceBetween
      footer={
        <>
          <span className="erd-export-dialog__footer-filename">{filename}</span>
          <div className="dialog__footer-right">
            <Button
              variant="ghost"
              onClick={onCancel}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
            >
              Export
            </Button>
          </div>
        </>
      }
    >
      <div className="dialog__scroll-area">
        {/* Background */}
        <div className="erd-export-dialog__section">
          <span className="erd-export-dialog__section-label">Background</span>
          <div className="erd-export-dialog__section-row">
            <label className="erd-export-dialog__color-row">
              <input
                type="color"
                className="erd-export-dialog__color-input"
                value={backgroundColor}
                disabled={transparent}
                onChange={(e) => setBackgroundColor(e.target.value)}
                aria-label="Background color"
              />
              <span className="erd-export-dialog__color-label">
                {transparent ? 'Transparent' : backgroundColor}
              </span>
            </label>
            <label className="erd-export-dialog__checkbox-row">
              <input
                type="checkbox"
                className="erd-export-dialog__checkbox"
                checked={transparent}
                onChange={(e) => setTransparent(e.target.checked)}
                aria-label="Transparent background"
              />
              <span className="erd-export-dialog__checkbox-label">Transparent</span>
            </label>
          </div>
        </div>

        {/* Grid */}
        <div className="erd-export-dialog__section">
          <span className="erd-export-dialog__section-label">Grid</span>
          <div className="erd-export-dialog__section-row">
            <button
              type="button"
              className={`erd-export-dialog__grid-btn${grid === 'none' ? ' erd-export-dialog__grid-btn--active' : ''}`}
              onClick={() => setGrid('none')}
            >
              <Square size={14} />
              <span>None</span>
            </button>
            <button
              type="button"
              className={`erd-export-dialog__grid-btn${grid === 'dots' ? ' erd-export-dialog__grid-btn--active' : ''}`}
              onClick={() => setGrid('dots')}
            >
              <CircleDot size={14} />
              <span>Dots</span>
            </button>
            <button
              type="button"
              className={`erd-export-dialog__grid-btn${grid === 'grid' ? ' erd-export-dialog__grid-btn--active' : ''}`}
              onClick={() => setGrid('grid')}
            >
              <Grid2X2 size={14} />
              <span>Grid</span>
            </button>
          </div>
        </div>

        {/* Summary */}
        <div className="erd-export-dialog__section">
          <span className="erd-export-dialog__section-label">Summary</span>
          <div className="erd-export-dialog__section-row">
            <label className="erd-export-dialog__checkbox-row">
              <input
                type="checkbox"
                className="erd-export-dialog__checkbox"
                checked={includeStats}
                onChange={(e) => setIncludeStats(e.target.checked)}
                aria-label="Include database summary"
              />
              <span className="erd-export-dialog__checkbox-label">
                Include database summary (tables, columns, relations, indexes)
              </span>
            </label>
          </div>
        </div>
      </div>
    </BaseDialog>
  )
}
