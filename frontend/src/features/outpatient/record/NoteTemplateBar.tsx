import { anchorAnnotations, templateAnnotations } from './recordAnnotations'
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent, OutpatientNoteTemplateScope } from '../../../shared/api/outpatientNoteTemplatesApi'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Button, Dialog, FormField, Icon, Select, type SelectOption } from '../../../shared/ui'

import { useTemplateApplication } from '../templates/useTemplateApplication'
import { requireCreatedNoteReceipt, requireUsedNoteReceipt, requireNoteTemplateList, templateApiScope } from '../templates/templateApplicationReceipt'
import { prepareNoteTemplateSave } from '../templates/noteTemplateSaveInput'

export type NoteTemplateField = Exclude<keyof OutpatientNoteTemplateContent, 'annotations'>
export const noteTemplateFields: Array<{ key: Extract<NoteTemplateField, 'chiefComplaint' | 'presentIllness' | 'medicalHistory' | 'physicalExam' | 'healthEducation' | 'followUp'>; label: string }> = [
  { key: 'chiefComplaint', label: '主诉' },
  { key: 'presentIllness', label: '现病史' },
  { key: 'medicalHistory', label: '既往史' },
  { key: 'physicalExam', label: '查体所见' },
  { key: 'healthEducation', label: '健康宣教' },
  { key: 'followUp', label: '随访复诊' },
]

export const clinicalRecordAdditionalFields: Array<{ key: NoteTemplateField; label: string }> = [
  { key: 'healthEducation', label: '健康宣教' },
  { key: 'followUp', label: '随访复诊' },
]

const savedNoteFields = [...noteTemplateFields,
  { key: 'allergyHistory', label: '过敏史补充' },
  { key: 'medicationHistory', label: '用药史' },
  { key: 'auxiliaryExaminations', label: '辅助检查' },
] satisfies Array<{ key: NoteTemplateField; label: string }>


export function mergeNoteTemplateContent(current: OutpatientNoteTemplateContent,
  template: OutpatientNoteTemplateContent, fields: Set<NoteTemplateField>, overwrite: boolean) {
  const next = { ...current }
  const applied = new Set<NoteTemplateField>()
  fields.forEach((key) => {
    if (key === 'treatmentPlan') return
    const incoming = template[key]?.trim()
    if (incoming && (overwrite || !current[key]?.trim())) { next[key] = incoming; applied.add(key) }
  })
  if (applied.size) next.annotations = anchorAnnotations(next, [
    ...(current.annotations ?? []).filter((item) => !applied.has(item.field as NoteTemplateField)),
    ...templateAnnotations(template, template.annotations).filter((item) => applied.has(item.field as NoteTemplateField)),
  ])
  return next
}

export function NoteTemplateBar({ api, disabled, currentContent, onApply, contextKey, showApply = true }: {
  api: Pick<RhnApi, 'outpatientNoteTemplates'>
  disabled: boolean
  contextKey: string
  currentContent: () => OutpatientNoteTemplateContent
  onApply: (template: OutpatientNoteTemplate, fields: Set<NoteTemplateField>, overwrite: boolean) => number
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
    queryKey: ['outpatient-note-templates', 'GENERAL_PRACTICE', templateApiScope(api), contextKey],
    queryFn: async () => requireNoteTemplateList(await api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE'), 'GENERAL_PRACTICE'),
    retry: false,
    enabled: showApply,
  })
  const selected = templates.data?.find((value) => value.id === selectedId)
  const templatesReady = !templates.isFetching && !templates.isError && Array.isArray(templates.data)
  useEffect(() => {
    if (!selectedId && templatesReady && templates.data?.length) setSelectedId(templates.data[0].id)
  }, [selectedId, templatesReady, templates.data])
  const save = useTemplateApplication(JSON.stringify([templateApiScope(api), contextKey, saveOpen, name, description, scope]),
    disabled || !saveOpen, () => JSON.stringify(currentContent()),
    '当前就诊、病历或保存设置已变化，本次回执未用于当前页面；远端保存可能已完成，请先查询模板核实。')
  const apply = useTemplateApplication(JSON.stringify([templateApiScope(api), contextKey, applyOpen, selected,
    [...checked], overwrite]), disabled || !applyOpen, () => JSON.stringify(currentContent()))
  function saveTemplate() {
    void save.run(async () => {
      const input = prepareNoteTemplateSave({ scopeType: scope, name, description, specialtyCode: 'GENERAL_PRACTICE',
        content: structuredClone(currentContent()) })
      return requireCreatedNoteReceipt(await api.outpatientNoteTemplates.create(input), input)
    }, value => {
      setSaveOpen(false); setName(''); setDescription(''); setSelectedId(value.id)
      setNotice(`已保存${value.scopeType === 'PERSONAL' ? '个人' : '科室'}病历模板“${value.name}”。`)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    })
  }
  function applyTemplate() {
    const fields = new Set(checked), replace = overwrite
    void apply.run(async () => {
      if (!templatesReady || !selected || !fields.size) throw new Error('所选病历模板尚未确认，请重新加载核对。')
      const expected = structuredClone(selected)
      return requireUsedNoteReceipt(await api.outpatientNoteTemplates.use(expected.id), expected)
    }, value => {
      const applied = onApply(value, fields, replace)
      if (!Number.isSafeInteger(applied) || applied < 0 || applied > fields.size) {
        throw new Error('病历段落实际带入结果未确认，请核对当前草稿。')
      }
      setNotice(applied ? `已调入“${value.name}”的 ${applied} 个病历段落，请核对后保存。`
        : '所选段落未改变当前病历，保留了已有内容；如需替换，请明确选择覆盖后重新核对。')
      if (applied) setApplyOpen(false)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    })
  }
  const fieldsInTemplate = (value: OutpatientNoteTemplate) => new Set<NoteTemplateField>(
    noteTemplateFields.filter(({ key }) => Boolean(value.content[key]?.trim())).map(({ key }) => key),
  )
  const openApply = () => {
    const value = selected
    if (value) setSelectedId(value.id)
    setChecked(value ? fieldsInTemplate(value) : new Set())
    setNotice(''); apply.reject(''); setOverwrite(false); setApplyOpen(true)
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
      : [{ value: '', label: templatesReady ? '暂无模板' : '模板待确认' }]
  ), [templates.data, templatesReady])

  return <div className="doctor-note-template-bar">
    <div>
      {showApply && <Button size="sm" type="button" variant="secondary" disabled={disabled}
        onClick={openApply}>调入病历模板</Button>}
      <Button size="sm" type="button" variant="text" disabled={disabled}
        onClick={() => { setNotice(''); save.reject(''); setSaveOpen(true) }}>存为病历模板</Button>
    </div>
    {showApply && templates.isPending && <small>正在加载模板…</small>}
    {notice && !applyOpen && <span role="status">{notice}</span>}
    {saveOpen && <Dialog title="保存病历模板" eyebrow="门诊病历 · 书写效率"
      description="保存病历书写段落及来源标记，包括已有的过敏史、用药史、辅助检查、宣教和随访内容；不保存患者身份、生命体征、诊断、医嘱或文字诊疗计划。"
      closeOnBackdrop={false} onClose={() => !save.pending && setSaveOpen(false)} footer={<>
        <Button variant="secondary" disabled={save.pending} onClick={() => setSaveOpen(false)}>取消</Button>
        <Button busy={save.pending} disabled={disabled || !name.trim()} onClick={saveTemplate}>确认保存</Button>
      </>}>
      <div className="ui-form-grid">
        <FormField label="模板名称" required><input value={name} maxLength={100} disabled={save.pending || disabled}
          onChange={(event) => setName(event.target.value)} placeholder="如：高血压常规复诊病历" /></FormField>
        <FormField label="使用范围"><Select aria-label="使用范围" value={scope} disabled={save.pending || disabled}
          clearable={false} options={[{ value: 'PERSONAL', label: '仅本人' }, { value: 'DEPARTMENT', label: '本科室' }]}
          onChange={value => setScope(value as OutpatientNoteTemplateScope)} /></FormField>
        <FormField className="ui-form-span-2" label="模板说明"><textarea value={description} maxLength={500} disabled={save.pending || disabled}
          onChange={(event) => setDescription(event.target.value)} placeholder="适用场景和书写提醒（可选）" /></FormField>
      </div>
      <div className="doctor-note-template-facts">
        {savedNoteFields.map(({ key, label }) => {
          const isFilled = Boolean(currentContent()[key]?.trim())
          return <span key={key} className={isFilled ? 'is-ready' : ''}>
            <Icon name={isFilled ? 'check' : 'close'} className="ui-icon-inline" /> {label}
          </span>
        })}
      </div>
      {save.error && <div role="alert" className="doctor-plan-pool-notice">{save.error}</div>}
    </Dialog>}
    {showApply && applyOpen && <Dialog title="调入病历模板" eyebrow="门诊病历"
      description="选择模板和需要调入的段落；确认后只修改当前页面草稿，不会自动保存或签署病历。"
      closeOnBackdrop={false} onClose={() => !apply.pending && setApplyOpen(false)} footer={<>
        <Button variant="secondary" disabled={apply.pending} onClick={() => setApplyOpen(false)}>取消</Button>
        <Button busy={apply.pending} disabled={disabled || !templatesReady || !selected || checked.size === 0}
          onClick={applyTemplate}>确认调入</Button>
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
          disabled={disabled || apply.pending || !templatesReady || !templates.data?.length}
          placeholder="请选择模板"
          onChange={selectForApply}
        />
        <small>{selected
          ? selected.description || `${selected.scopeType === 'PERSONAL' ? '个人' : '科室'}模板 · 已使用 ${selected.useCount} 次`
          : !templatesReady ? '模板目录尚未确认，请等待加载完成或重试。'
            : selectedId ? '所选模板已不可用。' : '暂无可用病历模板，可先取消并使用“存为模板”创建。'}</small>
      </div>
      {templates.error && <div role="alert" className="doctor-plan-pool-notice">病历模板加载失败：{errorMessage(templates.error)}
        <Button variant="text" onClick={() => void templates.refetch()}>重新加载模板</Button></div>}
      {templatesReady && selectedId && !selected && <div role="alert">所选模板已不可用，请重新选择。</div>}
      <label className="doctor-note-template-mode"><input type="checkbox" checked={overwrite}
        disabled={disabled || !selected || apply.pending || !templatesReady}
        onChange={(event) => setOverwrite(event.target.checked)} />
        <span><strong>覆盖所选字段已有内容</strong><small>未勾选时只填充当前为空的段落。</small></span></label>
      <div className="doctor-note-template-preview">
        {selected && noteTemplateFields.filter(({ key }) => selected.content[key]?.trim()).map(({ key, label }) => <label key={key}>
          <input type="checkbox" disabled={disabled || apply.pending || !templatesReady} checked={checked.has(key)} onChange={() => toggleField(key)} />
          <span><strong>{label}</strong><small>{selected.content[key]}</small></span>
        </label>)}
      </div>
      {apply.error && <div role="alert" className="doctor-plan-pool-notice">{apply.error}</div>}
      {notice && <div role="status" className="doctor-plan-pool-notice">{notice}</div>}
    </Dialog>}
  </div>
}
