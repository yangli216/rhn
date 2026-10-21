import { useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'

const STORAGE_KEY = 'rhn.doctor.recordWidth'
const MIN_RECORD = 416
const MIN_ASIDE = 480
const KEY_STEP = 24

function readStoredWidth() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch { return null }
}

/** The doctor's preferred record column width in px; null keeps the responsive default. */
export function useRecordColumnWidth() {
  const [width, setWidth] = useState<number | null>(readStoredWidth)
  const persist = (next: number | null) => {
    try {
      if (next === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, String(Math.round(next)))
    } catch { /* Storage may be unavailable; the width still applies for this session. */ }
  }
  return { width, setWidth, persist }
}

/** Drag (or arrow keys) between the record and the diagnosis/orders column; double-click restores the default. */
export function RecordColumnSplitter({ containerRef, columnRef, width, setWidth, persist }: {
  containerRef: RefObject<HTMLElement | null>
  columnRef: RefObject<HTMLElement | null>
  width: number | null
  setWidth: (width: number | null) => void
  persist: (width: number | null) => void
}) {
  const [dragging, setDragging] = useState(false)
  const bounds = () => {
    const container = containerRef.current?.getBoundingClientRect()
    return container ? { left: container.left, max: Math.max(MIN_RECORD, container.width - MIN_ASIDE) } : null
  }
  const clamp = (value: number, max: number) => Math.round(Math.min(max, Math.max(MIN_RECORD, value)))
  const current = () => width ?? columnRef.current?.getBoundingClientRect().width ?? MIN_RECORD
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const box = bounds()
    if (box) setWidth(clamp(event.clientX - box.left, box.max))
  }
  const end = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    setDragging(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    persist(width)
  }
  const key = (event: KeyboardEvent<HTMLDivElement>) => {
    const box = bounds()
    if (!box) return
    const delta = event.key === 'ArrowLeft' ? -KEY_STEP : event.key === 'ArrowRight' ? KEY_STEP : 0
    if (delta) {
      event.preventDefault()
      const next = clamp(current() + delta, box.max)
      setWidth(next); persist(next)
    } else if (event.key === 'Home' || event.key === 'Enter') {
      event.preventDefault()
      setWidth(null); persist(null)
    }
  }
  const box = bounds()
  return <div className={`doctor-record-splitter${dragging ? ' is-dragging' : ''}`} role="separator" aria-orientation="vertical"
    aria-label="调整病历宽度" title="拖动调整病历宽度，双击恢复默认" tabIndex={0}
    aria-valuemin={MIN_RECORD} aria-valuemax={box ? Math.round(box.max) : undefined} aria-valuenow={Math.round(current())}
    onPointerDown={(event) => {
      if (event.button !== 0) return
      event.preventDefault()
      event.currentTarget.setPointerCapture?.(event.pointerId)
      setDragging(true)
    }}
    onPointerMove={move} onPointerUp={end} onPointerCancel={end}
    onDoubleClick={() => { setWidth(null); persist(null) }}
    onKeyDown={key} />
}
