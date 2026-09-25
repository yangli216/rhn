import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent, OutpatientNoteTemplateScope } from '../../../shared/api/outpatientNoteTemplatesApi'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Icon, Select, type SelectOption } from '../../../shared/ui'

export type NoteTemplateField = keyof OutpatientNoteTemplateContent
export const noteTemplateFields: Array<{ key: NoteTemplateField; label: string }> = [
  { key: 'chiefComplaint', label: '主诉' },
  { key: 'presentIllness', label: '现病史' },
  { key: 'medicalHistory', label: '既往史' },
  { key: 'physicalExam', label: '查体所见' },
  { key: 'treatmentPlan', label: '诊疗计划' },
]

export function mergeNoteTemplateContent(current: OutpatientNoteTemplateContent,
  template: OutpatientNoteTemplateContent, fields: Set<NoteTemplateField>, overwrite: boolean) {
  const next = { ...current }
  fields.forEach((key) => {
    const incoming = template[key]?.trim()
    if (incoming && (overwrite || !current[key]?.trim())) next[key] = incoming
  })
  return next
}

export function NoteTemplateBar({ api, disabled, currentContent, onApply, showApply = true }: {
  api: Pick<RhnApi, 'outpatientNoteTemplates'>
  disabled: boolean
  currentContent: () => OutpatientNoteTemplateContent
  onApply: (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => void
  showApply?: boolean
}) {
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [applyOpen, setApplyOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<OutpatientNoteTemplateScope>('PERSONAL')
  const [checked, setChecked] = useState<Set<NoteTemplateField>>(new Set())
  const [overwrite, setOverwrite] = useState(false)
  const [notice, setNotice] = useState('')
  const templates = useQuery({
    queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE'],
    queryFn: () => api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'),
    enabled: showApply,
  })
  const selected = templates.data?.find((value) => value.id === selectedId)
  useEffect(() => {
    if (!selectedId && templates.data?.length) setSelectedId(templates.data[0].id)
    if (selectedId && templates.data && !templates.data.some((value) => value.id === selectedId)) {
      setSelectedId(templates.data[0]?.id ?? '')
    }
  }, [selectedId, templates.data])
  const save = useMutation({
    mutationFn: () => api.outpatientNoteTemplates.create({
      scopeType: scope, name: name.trim(), description: description.trim() || undefined,
      specialtyCode: 'GENERAL_PRACTICE', content: currentContent(),
    }),
    onSuccess: async (value) => {
      setSaveOpen(false); setName(''); setDescription(''); setSelectedId(value.id)
      setNotice(`已保存${value.scopeType === 'PERSONAL' ? '个人' : '科室'}病历模板“${value.name}”。`)
      await queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    },
  })
  const apply = useMutation({
    mutationFn: (value: OutpatientNoteTemplate) => api.outpatientNoteTemplates.use(value.id),
    onSuccess: (value) => {
      onApply(value, checked, overwrite); setApplyOpen(false)
      setNotice(`已调入“${value.name}”的 ${checked.size} 个病历段落，请核对后保存。`)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    },
  })
  const fieldsInTemplate = (value: OutpatientNoteTemplate) => new Set<NoteTemplateField>(
    noteTemplateFields.filter(({ key }) => Boolean(value.content[key]?.trim())).map(({ key }) => key),
  )
  const openApply = () => {
    const value = selected ?? templates.data?.[0]
    if (value) setSelectedId(value.id)
    setChecked(value ? fieldsInTemplate(value) : new Set())
    setOverwrite(false); setApplyOpen(true)
  }
  const selectForApply = (id: string) => {
    setSelectedId(id)
    setNotice('')
    const value = templates.data?.find((template) => template.id === id)
    setChecked(value ? fieldsInTemplate(value) : new Set())
  }
  const toggleField = (key: NoteTemplateField) => setChecked((current) => {
    const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next
  })
  const templateOptions: SelectOption[] = useMemo(() => (
    templates.data?.length
      ? templates.data.map((value) => ({
          value: value.id,
          label: `${value.scopeType === 'PERSONAL' ? '个人' : '科室'} · ${value.name}`,
        }))
      : [{ value: '', label: '暂无模板' }]
  ), [templates.data])

  return <div className="doctor-note-template-bar">
    <div>
      {showApply && <Button size="sm" type="button" variant="secondary" disabled={disabled}
        onClick={openApply}>调入病历模板</Button>}
      <Button size="sm" type="button" variant="text" disabled={disabled}
        onClick={() => setSaveOpen(true)}>存为病历模板</Button>
    </div>
    {showApply && templates.isPending && <small>正在加载模板…</small>}
    {notice && <span>{notice}</span>}
    {saveOpen && <Dialog title="保存病历模板" eyebrow="门诊病历 · 书写效率"
      description="仅保存主诉、现病史、既往史、查体所见和诊疗计划；患者信息、生命体征、诊断及医嘱不会进入模板。"
      onClose={() => !save.isPending && setSaveOpen(false)} footer={<>
        <Button variant="secondary" disabled={save.isPending} onClick={() => setSaveOpen(false)}>取消</Button>
        <Button busy={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>确认保存</Button>
      </>}>
      <div className="ui-form-grid">
        <FormField label="模板名称" required><input value={name} maxLength={100}
          onChange={(event) => setName(event.target.value)} placeholder="如：高血压常规复诊病历" /></FormField>
        <FormField label="使用范围"><select value={scope}
          onChange={(event) => setScope(event.target.value as OutpatientNoteTemplateScope)}>
          <option value="PERSONAL">仅本人</option><option value="DEPARTMENT">本科室</option>
        </select></FormField>
        <FormField className="ui-form-span-2" label="模板说明"><textarea value={description} maxLength={500}
          onChange={(event) => setDescription(event.target.value)} placeholder="适用场景和书写提醒（可选）" /></FormField>
      </div>
      <div className="doctor-note-template-facts">
        {noteTemplateFields.map(({ key, label }) => {
          const isFilled = Boolean(currentContent()[key]?.trim())
          return <span key={key} className={isFilled ? 'is-ready' : ''}>
            <Icon name={isFilled ? 'check' : 'close'} className="ui-icon-inline" /> {label}
          </span>
        })}
      </div>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
    </Dialog>}
    {showApply && applyOpen && <Dialog title="调入病历模板" eyebrow="门诊病历"
      description="选择模板和需要调入的段落；确认后只修改当前页面草稿，不会自动保存或签署病历。"
      closeOnBackdrop={false} onClose={() => !apply.isPending && setApplyOpen(false)} footer={<>
        <Button variant="secondary" disabled={apply.isPending} onClick={() => setApplyOpen(false)}>取消</Button>
        <Button busy={apply.isPending} disabled={!selected || checked.size === 0}
          onClick={() => selected && apply.mutate(selected)}>确认调入</Button>
      </>}>
      <div className="doctor-note-template-picker">
        <span>选择模板</span>
        <Select
          className="doctor-note-template-select"
          aria-label="选择调入模板"
          value={selectedId}
          options={templateOptions}
          clearable={false}
          searchable={templateOptions.length > 5}
          disabled={apply.isPending || !templates.data?.length}
          placeholder="请选择模板"
          onChange={selectForApply}
        />
        <small>{selected
          ? selected.description || `${selected.scopeType === 'PERSONAL' ? '个人' : '科室'}模板 · 已使用 ${selected.useCount} 次`
          : templates.isPending ? '正在加载模板…' : '暂无可用病历模板，可先取消并使用“存为模板”创建。'}</small>
      </div>
      {templates.error && <Alert>{errorMessage(templates.error)}</Alert>}
      <label className="doctor-note-template-mode"><input type="checkbox" checked={overwrite}
        disabled={!selected || apply.isPending}
        onChange={(event) => setOverwrite(event.target.checked)} />
        <span><strong>覆盖所选字段已有内容</strong><small>未勾选时只填充当前为空的段落。</small></span></label>
      <div className="doctor-note-template-preview">
        {selected && noteTemplateFields.filter(({ key }) => selected.content[key]?.trim()).map(({ key, label }) => <label key={key}>
          <input type="checkbox" checked={checked.has(key)} onChange={() => toggleField(key)} />
          <span><strong>{label}</strong><small>{selected.content[key]}</small></span>
        </label>)}
      </div>
      {apply.error && <Alert>{errorMessage(apply.error)}</Alert>}
    </Dialog>}
  </div>
}
