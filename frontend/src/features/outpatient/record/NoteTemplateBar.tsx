import { anchorAnnotations, templateAnnotations } from './recordAnnotations'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { OutpatientNoteTemplateContent, OutpatientNoteTemplateScope } from '../../../shared/api/outpatientNoteTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { IconFilePlus, IconTemplate } from '@tabler/icons-react'
import { Button, Dialog, FormField, Icon, IconActionButton, Select } from '../../../shared/ui'

import { useTemplateApplication } from '../templates/useTemplateApplication'
import { requireCreatedNoteReceipt, templateApiScope } from '../templates/templateApplicationReceipt'
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

/**
 * 病历区模板条：“套用模板”打开统一模板抽屉（purpose=RECORD，在抽屉里按段落勾选、选择覆盖或仅填空）；
 * “存为模板”仍在此保存当前病历段落。
 */
export function NoteTemplateBar({ api, disabled, currentContent, contextKey, defaultName, onOpenLibrary }: {
  api: Pick<RhnApi, 'outpatientNoteTemplates'>
  disabled: boolean
  contextKey: string
  currentContent: () => OutpatientNoteTemplateContent
  /** 打开统一模板抽屉；不提供时不显示“套用模板”。 */
  onOpenLibrary?: () => void
  /** Suggested template name when saving, e.g. the primary diagnosis. */
  defaultName?: string
}) {
  const queryClient = useQueryClient()
  const [saveOpen, setSaveOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<OutpatientNoteTemplateScope>('PERSONAL')
  const [notice, setNotice] = useState('')
  const save = useTemplateApplication(JSON.stringify([templateApiScope(api), contextKey, saveOpen, name, description, scope]),
    disabled || !saveOpen, () => JSON.stringify(currentContent()),
    '当前就诊、病历或保存设置已变化，本次回执未用于当前页面；远端保存可能已完成，请先查询模板核实。')
  function saveTemplate() {
    void save.run(async () => {
      const input = prepareNoteTemplateSave({ scopeType: scope, name, description, specialtyCode: 'GENERAL_PRACTICE',
        content: structuredClone(currentContent()) })
      return requireCreatedNoteReceipt(await api.outpatientNoteTemplates.create(input), input)
    }, value => {
      setSaveOpen(false); setName(''); setDescription('')
      setNotice(`已保存病历模板“${value.name}”（${value.scopeType === 'PERSONAL' ? '我的' : '科室'}）。`)
      void queryClient.invalidateQueries({ queryKey: ['outpatient-note-templates'] })
    })
  }

  return <div className="doctor-note-template-bar">
    <div>
      {/* 标题栏操作统一为图标按钮（与打印等一致），提示由共用 Tooltip 呈现。 */}
      {onOpenLibrary && <IconActionButton label="套用模板" title="套用模板" icon={<IconTemplate />}
        disabled={disabled} onClick={onOpenLibrary} />}
      <IconActionButton label="存为模板" title="存为模板" icon={<IconFilePlus />} disabled={disabled}
        onClick={() => { setNotice(''); save.reject(''); setName((current) => current.trim() ? current : defaultName ?? ''); setSaveOpen(true) }} />
    </div>
    {notice && <span role="status">{notice}</span>}
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
          clearable={false} options={[{ value: 'PERSONAL', label: '我的' }, { value: 'DEPARTMENT', label: '科室' }]}
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
  </div>
}
