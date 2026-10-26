import { useState, useRef, type ReactNode, type PointerEvent, type KeyboardEvent } from 'react'
import { Dialog } from '../../../shared/ui'

const STORAGE_KEY = 'rhn.clinicalKnowledgePanel.width'
const DEFAULT_WIDTH = 576 // 36rem
const MIN_WIDTH = 448 // 28rem
const KEY_STEP = 32

function readStoredWidth(): number | null {
  try {
    const val = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(val) && val >= MIN_WIDTH ? val : null
  } catch {
    return null
  }
}

export function ClinicalKnowledgePanel({ title, label = '临床知识库', onClose, children, footer }: {
  title: string
  label?: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const [width, setWidth] = useState<number | null>(readStoredWidth)
  const [dragging, setDragging] = useState(false)
  const dragStartRef = useRef<{ startX: number; startWidth: number } | null>(null)

  const persist = (next: number | null) => {
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, String(Math.round(next)))
    } catch {
      /* ignore */
    }
  }

  const getMaxWidth = () => {
    return typeof window !== 'undefined' ? Math.max(MIN_WIDTH, window.innerWidth - 64) : 1200
  }

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const dialogEl = e.currentTarget.closest<HTMLDivElement>('.clinical-knowledge-panel')
    const currentWidth = dialogEl ? dialogEl.getBoundingClientRect().width : (width ?? DEFAULT_WIDTH)
    dragStartRef.current = {
      startX: e.clientX,
      startWidth: currentWidth,
    }
    setDragging(true)
  }

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || !dragStartRef.current) return
    const { startX, startWidth } = dragStartRef.current
    const delta = startX - e.clientX
    const nextWidth = Math.round(Math.min(getMaxWidth(), Math.max(MIN_WIDTH, startWidth + delta)))
    setWidth(nextWidth)
  }

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    dragStartRef.current = null
    e.currentTarget.releasePointerCapture?.(e.pointerId)
    persist(width)
  }

  const handleDoubleClick = () => {
    setWidth(null)
    persist(null)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const curWidth = width ?? DEFAULT_WIDTH
    const maxW = getMaxWidth()
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const next = Math.min(maxW, curWidth + KEY_STEP)
      setWidth(next)
      persist(next)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = Math.max(MIN_WIDTH, curWidth - KEY_STEP)
      setWidth(next)
      persist(next)
    } else if (e.key === 'Home' || e.key === 'Enter') {
      e.preventDefault()
      handleDoubleClick()
    }
  }

  return (
    <Dialog
      title={title}
      eyebrow={label}
      onClose={onClose}
      presentation="panel"
      className={`clinical-knowledge-panel${dragging ? ' is-resizing' : ''}`}
      style={width ? { width: `${width}px`, maxWidth: 'calc(100vw - 32px)' } : undefined}
      enterNavigation={false}
      footer={footer}
    >
      <div
        className={`clinical-knowledge-panel__resizer${dragging ? ' is-dragging' : ''}`}
        role="separator"
        aria-orientation="vertical"
        aria-label="拖动调整临床知识库面板宽度"
        title="按住向左/向右拖拽调整面板宽度，双击恢复默认大小"
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      />
      <div className="clinical-knowledge-panel__body">{children}</div>
    </Dialog>
  )
}
