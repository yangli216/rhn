import { useEffect, useRef, type PropsWithChildren, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'

/** Nonmodal reference surface. Business content owns its heading and close action. */
export function AnchoredPanel({ label, anchorRect, onClose, className = '', children }: PropsWithChildren<{
  label: string; anchorRect: DOMRect | null; onClose: () => void; className?: string
}>) {
  const surface = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  useEffect(() => { close.current = onClose }, [onClose])
  useEffect(() => {
    const outside = (event: MouseEvent) => {
      if (surface.current && !surface.current.contains(event.target as Node)) close.current()
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    // Delay registration so the opening pointer event cannot immediately close it.
    const timer = window.setTimeout(() => document.addEventListener('mousedown', outside), 0)
    document.addEventListener('keydown', escape)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  const width = 450, margin = 12
  const position: CSSProperties = anchorRect ? {
    position: 'fixed', width,
    left: Math.max(margin, Math.min(anchorRect.left - 120, window.innerWidth - width - margin)),
    top: window.innerHeight - anchorRect.bottom < 250 && anchorRect.top > 250
      ? Math.max(margin, anchorRect.top - 340) : anchorRect.bottom + 6,
  } : { position: 'fixed', top: '15%', left: '50%', transform: 'translate(-50%, 0)' }
  return createPortal(<div ref={surface} role="dialog" aria-modal="false" aria-label={label}
    className={className} style={position}>{children}</div>, document.body)
}
