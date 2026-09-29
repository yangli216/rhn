import { useEffect, useMemo, useState } from 'react'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent, OutpatientNoteTemplateScope } from '../../../shared/api/outpatientNoteTemplatesApi'
import type {
  CompiledPlanMedicationItem, CompiledPlanServiceItem, OutpatientPlanTask,
  OutpatientPlanTemplate, OutpatientPlanTemplateScope,
} from '../../../shared/api/outpatientPlanTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import {
  Alert, Button, Dialog, FormField, Panel, PanelHead, Select, StatusBadge,
} from '../../../shared/ui'
import { errorMessage } from '../../../shared/api/httpClient'
import { noteTemplateFields } from '../record/NoteTemplateBar'
import { PlanTemplateClinicalEditor } from './PlanTemplateClinicalEditor'
import { planTaskKindLabel } from './planTaskPresentation'

type TemplateKind = 'NOTE' | 'PLAN'
const auxiliaryTaskKinds = new Set<OutpatientPlanTask['kind']>(['EDUCATION', 'FOLLOW_UP', 'CONDITION'])

export function ManualClinicalTemplateDialog({ api, organizationId, kind, editingNote, editingPlan, onClose, onSaved }: {
  api: RhnApi
  organizationId?: string
  kind: TemplateKind
  editingNote?: OutpatientNoteTemplate | null
  editingPlan?: OutpatientPlanTemplate | null
  onClose: () => void
  onSaved: (value: OutpatientNoteTemplate | OutpatientPlanTemplate) => void
}) {
  const noteEditing = kind === 'NOTE' ? editingNote : null
  const planEditing = kind === 'PLAN' ? editingPlan : null
  const [name, setName] = useState(noteEditing?.name || planEditing?.name || '')
  const [description, setDescription] = useState(noteEditing?.description || planEditing?.description || '')
  const [noteScope, setNoteScope] = useState<OutpatientNoteTemplateScope>(noteEditing?.scopeType || 'PERSONAL')
  const [planScope, setPlanScope] = useState<OutpatientPlanTemplateScope>(planEditing?.scopeType || 'PERSONAL')
  const [noteContent, setNoteContent] = useState<OutpatientNoteTemplateContent>(noteEditing?.content || {})
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>(planEditing?.diagnoses || [])
  const [medications, setMedications] = useState<CompiledPlanMedicationItem[]>(planEditing?.medications || [])
  const [services, setServices] = useState<CompiledPlanServiceItem[]>(planEditing?.services || [])
  const [tasks, setTasks] = useState<OutpatientPlanTask[]>(planEditing?.tasks || [])
  const [noteTemplateId, setNoteTemplateId] = useState(planEditing?.noteTemplateId || '')
  const [noteTemplates, setNoteTemplates] = useState<OutpatientNoteTemplate[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const noteHasContent = noteTemplateFields.some(({ key }) => noteContent[key]?.trim())
  const valid = name.trim() && (kind === 'NOTE' ? noteHasContent : diagnoses.length > 0)
  const compatibleNoteTemplates = useMemo(() => noteTemplates.filter((value) =>
    planScope === 'PERSONAL' || planScope === 'DEPARTMENT' && value.scopeType === 'DEPARTMENT'),
  [noteTemplates, planScope])
  const selectedPlanNoteTemplate = noteTemplates.find((value) => value.id === noteTemplateId)
  const auxiliaryTasks = tasks.map((task, index) => ({ task, index }))
    .filter(({ task }) => auxiliaryTaskKinds.has(task.kind))

  useEffect(() => {
    if (kind !== 'PLAN') return
    let active = true
    void api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE').then((values) => {
      if (active) setNoteTemplates(values)
    }).catch(() => undefined)
    return () => { active = false }
  }, [api, kind])

  const changePlanScope = (value: string) => {
    const next = value as OutpatientPlanTemplateScope
    setPlanScope(next)
    if (next === 'HOSPITAL' || next === 'DEPARTMENT' && selectedPlanNoteTemplate?.scopeType === 'PERSONAL') {
      setNoteTemplateId('')
    }
  }

  const save = async () => {
    if (!valid) return
    setSaving(true)
    setError('')
    try {
      if (kind === 'NOTE') {
        const input = {
          scopeType: noteScope,
          name: name.trim(),
          description: description.trim() || undefined,
          specialtyCode: 'GENERAL_PRACTICE',
          content: noteContent,
        }
        const saved = noteEditing
          ? await api.outpatientNoteTemplates.update(noteEditing.id, { ...input, expectedRevision: noteEditing.revision })
          : await api.outpatientNoteTemplates.create(input)
        onSaved(saved)
      } else {
        const input = {
          scopeType: planScope,
          name: name.trim(),
          description: description.trim() || undefined,
          noteTemplateId: noteTemplateId || undefined,
          diagnoses,
          medications,
          services,
          tasks,
        }
        const saved = planEditing
          ? await api.outpatientPlanTemplates.update(planEditing.id, { ...input, expectedRevision: planEditing.revision })
          : await api.outpatientPlanTemplates.create({ ...input, sourceType: 'MANUAL' })
        onSaved(saved)
      }
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return <Dialog
    title={`${noteEditing || planEditing ? '编辑' : '新建'}${kind === 'NOTE' ? '病历模板' : '诊疗方案'}`}
    eyebrow="人工维护 · 标准目录"
    description={kind === 'NOTE' ? '直接维护可复用病历段落，不包含诊断和医嘱。' : undefined}
    size="xwide" className={kind === 'PLAN' ? 'manual-plan-template-dialog' : ''}
    closeOnBackdrop={false} onClose={() => !saving && onClose()}
    footer={<>
      <Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
      <Button busy={saving} disabled={!valid} onClick={() => void save()}>保存模板</Button>
    </>}>
    {error && <Alert>{error}</Alert>}
    <div className={`manual-template-dialog ${kind === 'PLAN' ? 'is-plan' : ''}`}>
      <div className={`ui-form-grid ${kind === 'PLAN' ? 'manual-template-plan-meta' : ''}`}>
        <FormField label="模板名称" required><input value={name} maxLength={100}
          onChange={(event) => setName(event.target.value)} placeholder="输入便于识别的模板名称" /></FormField>
        <FormField label="使用范围"><Select value={kind === 'NOTE' ? noteScope : planScope} clearable={false}
          options={kind === 'NOTE'
            ? [{ value: 'PERSONAL', label: '仅本人' }, { value: 'DEPARTMENT', label: '本科室' }]
            : [{ value: 'PERSONAL', label: '仅本人' }, { value: 'DEPARTMENT', label: '本科室' }, { value: 'HOSPITAL', label: '全院' }]}
          onChange={(value) => kind === 'NOTE'
            ? setNoteScope(value as OutpatientNoteTemplateScope)
            : changePlanScope(value)} /></FormField>
        <FormField className={kind === 'NOTE' ? 'ui-form-span-2' : ''} label="模板说明">
          {kind === 'NOTE' ? <textarea value={description} maxLength={500}
            onChange={(event) => setDescription(event.target.value)} placeholder="适用场景、使用提醒等" />
            : <input value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)}
              placeholder="适用场景、使用提醒等" />}
        </FormField>
      </div>

      {kind === 'NOTE' ? <div className="manual-template-note-grid">
        {noteTemplateFields.map(({ key, label }) => <FormField key={key} label={label}>
          <textarea value={noteContent[key] || ''} rows={key === 'chiefComplaint' ? 2 : 4}
            onChange={(event) => setNoteContent((current) => ({ ...current, [key]: event.target.value }))}
            placeholder={`输入可复用的${label}内容`} />
        </FormField>)}
      </div> : <div className="manual-template-plan-grid">
        <section className="plan-template-note-link">
          <div className="plan-template-note-link__copy">
            <strong>配套病历模板</strong>
            <small>可选；医生站调入方案时一并带入病历段落、诊断和医嘱草稿。</small>
          </div>
          <Select aria-label="配套病历模板" value={noteTemplateId} searchable clearable
            disabled={planScope === 'HOSPITAL'}
            placeholder={planScope === 'HOSPITAL' ? '全院方案暂不支持关联病历模板' : '选择病历模板（可选）'}
            options={compatibleNoteTemplates.map((value) => ({
              value: value.id,
              label: value.name,
              secondaryText: `${value.scopeType === 'PERSONAL' ? '个人' : '科室'} · ${noteTemplateFields.filter(({ key }) => value.content[key]?.trim()).length} 个段落`,
            }))}
            onChange={setNoteTemplateId} />
          <div className="plan-template-note-link__summary">
            {selectedPlanNoteTemplate
              ? <><StatusBadge tone="info">已关联</StatusBadge><span>{noteTemplateFields.filter(({ key }) => selectedPlanNoteTemplate.content[key]?.trim()).map(({ label }) => label).join('、')}</span></>
              : <span>{planScope === 'HOSPITAL' ? '病历模板目前仅支持个人或科室范围。' : '不关联时，方案仅包含诊断与医嘱。'}</span>}
          </div>
        </section>
        <PlanTemplateClinicalEditor api={api} organizationId={organizationId}
          diagnoses={diagnoses} setDiagnoses={setDiagnoses}
          medications={medications} setMedications={setMedications}
          services={services} setServices={setServices} onError={setError} />
        {!!auxiliaryTasks.length && <Panel className="manual-template-tasks" aria-label="辅助任务">
          <PanelHead title="辅助任务" meta={`${auxiliaryTasks.length} 项`} />
          <div className="manual-template-tasks__list">
            {auxiliaryTasks.map(({ task, index }) => <div className="manual-template-task" key={`${task.kind}-${index}`}>
              <StatusBadge tone={task.status === 'UNMATCHED' ? 'warning' : 'neutral'}>{planTaskKindLabel[task.kind]}</StatusBadge>
              <input aria-label={`${planTaskKindLabel[task.kind]}任务内容`} value={task.text} maxLength={500}
                onChange={(event) => setTasks((current) => current.map((value, target) =>
                  target === index ? { ...value, text: event.target.value } : value))} />
              <Button type="button" size="sm" variant="text" aria-label={`移除任务 ${task.text}`}
                onClick={() => setTasks((current) => current.filter((_, target) => target !== index))}>移除</Button>
            </div>)}
          </div>
        </Panel>}
      </div>}
    </div>
  </Dialog>
}
