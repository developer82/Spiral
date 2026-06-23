import { useState } from 'react'
import { TriangleAlert, Copy } from 'lucide-react'
import BaseDialog from '../BaseDialog/BaseDialog'
import Button from '../Button/Button'
import Menu from '../Menu/Menu'
import type { MenuPosition } from '../Menu/Menu'
import './ErrorDialog.css'

interface ErrorDialogProps {
  title?: string
  error: string
  onClose: () => void
}

export default function ErrorDialog({ title = 'Error', error, onClose }: ErrorDialogProps): React.JSX.Element {
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null)

  function handleCopy(): void {
    const selected = window.getSelection()?.toString()
    void navigator.clipboard.writeText(selected || error)
  }

  function handleContextMenu(e: React.MouseEvent): void {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
  }

  return (
    <>
      <BaseDialog
        title={title}
        icon={<TriangleAlert size={16} style={{ color: '#f87171' }} />}
        onClose={onClose}
        maxWidth="40rem"
        zIndex={120}
        footer={
          <>
            <Button variant="ghost" onClick={handleCopy}>
              <Copy size={13} />
              Copy
            </Button>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </>
        }
      >
        <div className="dialog__scroll-area">
          <pre className="error-dialog__text" onContextMenu={handleContextMenu}>
            {error}
          </pre>
        </div>
      </BaseDialog>

      <Menu
        items={[{ id: 'copy', label: 'Copy', icon: <Copy size={13} />, onClick: handleCopy }]}
        position={menuPos}
        onClose={() => setMenuPos(null)}
      />
    </>
  )
}
