import { useEffect, useId, useRef, useState, type TextareaHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Button, FormField } from './index'
import './annotated-textarea.css'

export interface TextAnnotation {
  start: number
  text: string
  label: string
  description?: string
  tone: 'source' | 'variable' | 'important' | 'conflict'
}
export interface AnnotatedTextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange' | 'children'> {
  value: string
  onValueChange: (value: string) => void
  annotations: TextAnnotation[]
  showAnnotations?: boolean
}

/** Marks render only authoritative text. Editing and copying always operate on the same string. */
export function AnnotatedTextarea({ value, onValueChange, annotations, showAnnotations = true,
  id, className, disabled, readOnly, ...props }: AnnotatedTextareaProps) {
  const generatedId = useId()
  const controlId = id || generatedId
  const editor = useRef<HTMLTextAreaElement>(null)
  const popup = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const [editing, setEditing] = useState(false)
  const [active, setActive] = useState<{ mark: TextAnnotation; baseline: string; left: number; top: number } | null>(null)
  const [replacement, setReplacement] = useState('')
  const marks = showAnnotations ? annotations.filter((mark) => mark.start >= 0 && value.startsWith(mark.text, mark.start)) : []
  const canEdit = !disabled && !readOnly
  const preview = marks.length > 0 && !editing
  useEffect(() => { if (editing) editor.current?.focus() }, [editing])
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
    document.addEventListener('mousedown', dismiss)
    document.addEventListener('keydown', key)
    window.addEventListener('resize', moved)
    window.addEventListener('scroll', moved, true)
    return () => {
      document.removeEventListener('mousedown', dismiss); document.removeEventListener('keydown', key)
      window.removeEventListener('resize', moved); window.removeEventListener('scroll', moved, true)
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
        setReplacement(mark.text)
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
    {active && createPortal(<div ref={popup} role="dialog" aria-modal="false" aria-label={active.mark.label}
      className="ui-annotation-popover" style={{ left: active.left, top: active.top }}>
      <div className="ui-annotation-popover__heading"><strong>{active.mark.label}</strong>
        <Button size="sm" variant="text" onClick={() => setActive(null)}>关闭</Button></div>
      {active.mark.description && <p>{active.mark.description}</p>}
      {canEdit ? <><FormField label="调整此处文字"><textarea value={replacement} rows={2}
        maxLength={props.maxLength} onChange={(event) => setReplacement(event.target.value)} /></FormField>
        <div className="ui-annotation-popover__actions">
          <Button size="sm" variant="text" onClick={() => replace('')}>移除</Button>
          <Button size="sm" onClick={() => replace(replacement)}>应用修改</Button>
        </div></> : <p>{active.mark.text}</p>}
    </div>, document.body)}
  </div>
}
