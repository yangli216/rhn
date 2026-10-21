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
  /** `result` keeps the popover open after a change so the outcome and its one-step undo stay where the doctor is looking. */
  const [active, setActive] = useState<{ mark: TextAnnotation; baseline: string; left: number; top: number
    result?: { after: string; message: string } } | null>(null)
  const firstQuick = useRef<HTMLButtonElement>(null)
  const field = useRef<HTMLDivElement>(null)
  /** Undo re-renders the mark, so focus returns to it by position once it is back. */
  const refocusMark = useRef<number | null>(null)
  const marks = showAnnotations ? annotations.filter((mark) => mark.start >= 0 && value.startsWith(mark.text, mark.start)) : []
  const canEdit = !disabled && !readOnly
  const options = active && canEdit && !active.result ? (quickActions?.(active.mark.text) ?? []) : []
  const preview = marks.length > 0 && !editing
  useEffect(() => { if (editing) editor.current?.focus() }, [editing])
  useEffect(() => { if (active) (firstQuick.current ?? popup.current)?.focus() }, [active])
  useEffect(() => {
    if (refocusMark.current === null) return
    const mark = field.current?.querySelector<HTMLButtonElement>(`[data-mark-start="${refocusMark.current}"]`)
    if (mark) { mark.focus(); refocusMark.current = null }
  })
  useEffect(() => {
    if (!active) return
    // The controlled value may lag onChange by one render; only an unrelated edit closes the popover.
    const known = active.result ? value === active.baseline || value === active.result.after : value === active.baseline
    if (!known || !showAnnotations) setActive(null)
  }, [value, active, showAnnotations])
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
  const replace = (text: string, message: string) => {
    if (!active || active.result || !canEdit || active.baseline !== value) return
    const mark = active.mark
    const after = value.slice(0, mark.start) + text + value.slice(mark.start + mark.text.length)
    onValueChange(after)
    setActive({ ...active, result: { after, message } })
  }
  const undo = () => {
    if (!active?.result) return
    onValueChange(active.baseline)
    refocusMark.current = active.mark.start
    setActive(null)
  }
  let cursor = 0
  const parts = marks.flatMap((mark, index) => {
    if (mark.start < cursor) return []
    const plain = value.slice(cursor, mark.start)
    cursor = mark.start + mark.text.length
    return [plain, <button key={index} type="button" className={`ui-text-annotation is-${mark.tone}`} data-mark-start={mark.start}
      aria-label={`${mark.text}：${mark.label}`} title={[mark.label, mark.description].filter(Boolean).join('：')}
      aria-haspopup="dialog" onClick={(event) => {
        event.stopPropagation()
        trigger.current = event.currentTarget
        const rect = event.currentTarget.getBoundingClientRect()
        setActive({ mark, baseline: value, left: Math.max(8, Math.min(rect.left, window.innerWidth - 368)),
          top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 260)) })
      }}>{mark.text}</button>]
  })
  return <div ref={field} className="ui-annotated-field">
    {preview ? <div id={controlId} role="textbox" aria-multiline="true" aria-readonly="true"
      aria-label={props['aria-label']} aria-describedby={props['aria-describedby']} tabIndex={disabled ? -1 : 0}
      className={`ui-annotated-preview ${className || ''}`} onClick={editAll}
      onKeyDown={(event) => { if (event.target === event.currentTarget && event.key === 'Enter') { event.preventDefault(); editAll() } }}>
      {parts}{value.slice(cursor)}
    </div> : <textarea {...props} id={controlId} className={className} ref={editor} value={value}
      disabled={disabled} readOnly={readOnly} onChange={(event) => onValueChange(event.target.value)}
      onFocus={(event) => { setEditing(true); props.onFocus?.(event) }}
      onBlur={(event) => { props.onBlur?.(event); setEditing(false) }} />}
    {active && createPortal(<div ref={popup} role="dialog" aria-modal="false" aria-label={active.mark.label}
      className="ui-annotation-popover" tabIndex={-1} style={{ left: active.left, top: active.top }}>
      <div className="ui-annotation-popover__heading"><strong>{active.mark.label}</strong>
        <IconButton icon="close" label="关闭标记详情" onClick={() => setActive(null)} /></div>
      <div className="ui-annotation-popover__body">
        {active.mark.description && <p>{active.mark.description}</p>}
        {!canEdit && <p>{active.mark.text}</p>}
      </div>
      {canEdit && active.result && <div className="ui-annotation-popover__actions">
        <span className="ui-annotation-popover__result" role="status">{active.result.message}</span>
        <Button size="sm" variant="text" onClick={undo}>撤销</Button>
      </div>}
      {canEdit && !active.result && <div className="ui-annotation-popover__actions">
        <div className="ui-annotation-popover__quick">
          {options.map((option, index) => <Button key={option.nextText} ref={index === 0 ? firstQuick : undefined} size="sm"
            variant="secondary" onClick={() => replace(option.nextText, `已${option.label.replace(/^改为：/, '改为「')}」`)}>{option.label}</Button>)}
        </div>
        <Button size="sm" variant="text" onClick={() => replace('', '已删除这句')}>删除这句</Button>
      </div>}
    </div>, document.body)}
  </div>
}
