import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Button, IconButton } from './index'
import './annotated-textarea.css'

export interface TextAnnotation {
  start: number
  text: string
  /** Short status title shown in the popover heading; the caller owns its wording. */
  label: string
  description?: string
  /** Lets the caller map a mark back to its source record. */
  key?: string
  tone: 'source' | 'variable' | 'important' | 'conflict'
}
export interface AnnotatedTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'children'> {
  value: string
  onValueChange: (value: string) => void
  annotations: TextAnnotation[]
  showAnnotations?: boolean
  /** Wording alternatives for a mark's text; offered only while the field is editable. */
  quickActions?: (markText: string) => Array<{ label: string; nextText: string }>
}

/** Marks render only authoritative text. Editing and copying always operate on the same string. */
export function AnnotatedTextarea({ value, onValueChange, annotations, showAnnotations = true, quickActions,
  id, className, disabled, readOnly, ...props }: AnnotatedTextareaProps) {
  const generatedId = useId()
  const controlId = id || generatedId
  const editor = useRef<HTMLTextAreaElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [active, setActive] = useState<{ mark: TextAnnotation; baseline: string; left: number; top: number } | null>(null)
  const firstQuick = useRef<HTMLButtonElement>(null)
  /** One-step undo of the last quick wording change; the hint disappears on its own. */
  const [undo, setUndo] = useState<{ before: string; after: string; to: string } | null>(null)
  const marks = showAnnotations ? annotations.filter((mark) => mark.start >= 0 && value.startsWith(mark.text, mark.start)) : []
  const canEdit = !disabled && !readOnly
  const options = active && canEdit ? (quickActions?.(active.mark.text) ?? []) : []
  const preview = marks.length > 0 && !editing
  useEffect(() => { if (editing) editor.current?.focus() }, [editing])
  useEffect(() => { if (active) (firstQuick.current ?? popup.current)?.focus() }, [active])
  useEffect(() => {
    if (!undo) return
    // The controlled value may lag onChange by one render; only an unrelated edit retires the hint.
    if (value !== undo.before && value !== undo.after) { setUndo(null); return }
    const timer = window.setTimeout(() => setUndo(null), 6000)
    return () => window.clearTimeout(timer)
  }, [undo, value])
  useEffect(() => { if (active && (active.baseline !== value || !showAnnotations)) setActive(null) }, [value, active, showAnnotations])
  useEffect(() => {
    if (!active) return
    const dismiss = (event: MouseEvent) => {
      if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setActive(null)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); setActive(null); trigger.current?.focus() }
    }
    const moved = () => setActive(null)
    const scrolled = (event: Event) => {
      if (event.target instanceof Node && popup.current?.contains(event.target)) return
      moved()
    }
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', moved)
    window.addEventListener('scroll', scrolled, true)
    return () => {
      document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', key)
      window.removeEventListener('resize', moved); window.removeEventListener('scroll', scrolled, true)
    }
  }, [active])
  const editAll = () => {
    if (canEdit && !window.getSelection()?.toString()) setEditing(true)
  }
  const replace = (text: string) => {
    if (!active || !canEdit || active.baseline !== value) return
    const mark = active.mark
    onValueChange(value.slice(0, mark.start) + text + value.slice(mark.start + mark.text.length))
    setActive(null)
  }
  const apply = (option: { label: string; nextText: string }) => {
    if (!active || !canEdit || active.baseline !== value) return
    const mark = active.mark
    const next = value.slice(0, mark.start) + option.nextText + value.slice(mark.start + mark.text.length)
    onValueChange(next)
    setUndo({ before: value, after: next, to: option.label.replace(/^改为：/, '') })
    setActive(null)
  }
  let cursor = 0
  const parts = marks.flatMap((mark, index) => {
    if (mark.start < cursor) return []
    const plain = value.slice(cursor, mark.start)
    cursor = mark.start + mark.text.length
    return [plain, <button key={index} type="button" className={`ui-text-annotation is-${mark.tone}`}
      aria-label={`${mark.text}：${mark.label}`} title={[mark.label, mark.description].filter(Boolean).join('：')}
      aria-haspopup="dialog" onClick={(event) => {
        event.stopPropagation()
        trigger.current = event.currentTarget
        const rect = event.currentTarget.getBoundingClientRect()
        setActive({ mark, baseline: value, left: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
          top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 260)) })
      }}>{mark.text}</button>]
  })
  return <div className="ui-annotated-field">
    {preview ? <div id={controlId} role="textbox" aria-multiline="true" aria-readonly="true"
      aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} tabIndex={disabled ? -1 : 0}
      className={`ui-annotated-preview ${className || ''}`} onClick={editAll}
      onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); editAll() } }}>
      {parts}{value.slice(cursor)}
    </div> : <textarea {...props} id={controlId} className={className} ref={editor} value={value}
      disabled={disabled} readOnly={readOnly} onChange={(event) => onValueChange(event.target.value)}
      onFocus={(event) => { setEditing(true); props.onFocus?.(event) }}
      onBlur={(event) => { props.onBlur?.(event); setEditing(false) }} />}
    {undo && <div className="ui-annotation-undo" role="status">已改为「{undo.to}」
      <Button size="sm" variant="text" onClick={() => { onValueChange(undo.before); setUndo(null) }}>撤销</Button></div>}
    {active && createPortal(<div ref={popup} role="dialog" aria-modal="false" aria-label={active.mark.label}
      className="ui-annotation-popover" tabIndex={-1} style={{ left: active.left, top: active.top }}>
      <div className="ui-annotation-popover__heading"><strong>{active.mark.label}</strong>
        <IconButton icon="close" label="关闭标记详情" onClick={() => setActive(null)} /></div>
      <div className="ui-annotation-popover__body">
        {active.mark.description && <p>{active.mark.description}</p>}
        {!canEdit && <p>{active.mark.text}</p>}
      </div>
      {canEdit && <div className="ui-annotation-popover__actions">
        <div className="ui-annotation-popover__quick">
          {options.map((option, index) => <Button key={option.nextText} ref={index === 0 ? firstQuick : undefined} size="sm"
            variant="secondary" onClick={() => apply(option)}>{option.label}</Button>)}
        </div>
        <Button size="sm" variant="text" onClick={() => replace('')}>删除这句</Button>
      </div>}
    </div>, document.body)}
  </div>
}
