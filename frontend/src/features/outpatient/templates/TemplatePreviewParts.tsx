import { useEffect, useRef, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { OutpatientNoteTemplate } from '../../../shared/api/outpatientNoteTemplatesApi'
import { StatusBadge } from '../../../shared/ui'
import { noteTemplateFields, type NoteTemplateField } from '../record/NoteTemplateBar'

/** 支持“部分选中”的复选框，用于整组勾选。 */
export function TriStateCheckbox({ checked, indeterminate, disabled, label, onChange }: {
  checked: boolean; indeterminate: boolean; disabled?: boolean; label: string; onChange: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = indeterminate && !checked }, [checked, indeterminate])
  return <input ref={ref} type="checkbox" aria-label={label} checked={checked} disabled={disabled} onChange={onChange} />
}

/** 预览区标题：病历 / 诊断 / 医嘱三区共用，右侧给出已选数量或用途提示。 */
export function PreviewZone({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return <section className="doctor-plan-zone" aria-label={title}>
    <header className="doctor-plan-zone__head"><strong>{title}</strong>{meta && <small>{meta}</small>}</header>
    {children}
  </section>
}

/** 医嘱来源分组头：方案自有 / 组套名；整组勾选只作用于可勾选且非重复的行。 */
export function OrderGroupBar({ title, total, selected, selectable, disabled, onToggle, hint }: {
  title: string; total: number; selected: number; selectable: number; disabled?: boolean; onToggle: () => void; hint?: string
}) {
  return <div className="doctor-plan-order-group">
    <label>
      <TriStateCheckbox label={`整组勾选 ${title}`} checked={selectable > 0 && selected >= selectable}
        indeterminate={selected > 0 && selected < selectable} disabled={disabled || selectable === 0} onChange={onToggle} />
      <strong>{title}</strong>
    </label>
    <small>已选 {selected} / 共 {total} 项{hint ? `；${hint}` : ''}</small>
  </div>
}

/** 行状态：重复（默认不勾选）、校验失败（不可勾选，显示原因）。 */
export function RowFlags({ duplicate, lockedReason }: { duplicate?: boolean; lockedReason?: string }) {
  if (!duplicate && !lockedReason) return null
  return <span className="doctor-plan-row-flags">
    {lockedReason && <StatusBadge tone="danger">不可带入</StatusBadge>}
    {duplicate && <StatusBadge tone="warning">重复</StatusBadge>}
    {lockedReason && <small className="doctor-plan-item-subtext">{lockedReason}</small>}
  </span>
}

/** 病历模板段落勾选与“覆盖 / 仅填空”开关；病历模板与方案配套病历共用，合并规则由 mergeNoteTemplateContent 决定。 */
export function NotePreviewSection({ note, checked, setChecked, overwrite, setOverwrite, disabled, hint }: {
  note: OutpatientNoteTemplate
  checked: Set<NoteTemplateField>
  setChecked: Dispatch<SetStateAction<Set<NoteTemplateField>>>
  overwrite: boolean
  setOverwrite: (value: boolean) => void
  disabled?: boolean
  hint?: string
}) {
  const fields = noteTemplateFields.filter(({ key }) => note.content[key]?.trim())
  return <>
    <label className="doctor-note-template-mode">
      <input type="checkbox" checked={overwrite} disabled={disabled} onChange={(event) => setOverwrite(event.target.checked)} />
      <span><strong>覆盖所选段落已有内容</strong><small>默认只填充当前为空的病历段落，避免覆盖医生已书写内容。</small></span>
    </label>
    <div className="doctor-plan-detail-section">
      <div className="doctor-plan-detail-section__title">选择带入的病历段落 ({checked.size}){hint ? ` · ${hint}` : ''}</div>
      <div className="doctor-note-template-preview is-workspace">
        {fields.map(({ key, label }) => (
          <label key={key} className={checked.has(key) ? undefined : 'is-row-unchecked'}>
            <input type="checkbox" checked={checked.has(key)} disabled={disabled}
              onChange={() => setChecked((current) => {
                const next = new Set(current)
                if (next.has(key)) next.delete(key); else next.add(key)
                return next
              })} />
            <span><strong>{label}</strong><small>{note.content[key]}</small></span>
          </label>
        ))}
      </div>
    </div>
  </>
}

export function filledNoteFields(note: OutpatientNoteTemplate | null | undefined) {
  return new Set<NoteTemplateField>(note ? noteTemplateFields.filter(({ key }) => Boolean(note.content[key]?.trim())).map(({ key }) => key) : [])
}
