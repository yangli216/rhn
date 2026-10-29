import { useEffect, useMemo, useState } from 'react'
import './outpatient-plan-templates.css'
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
import { requireNoteTemplateList, templateApiScope } from './templateApplicationReceipt'
import { saveMaintainedNote, saveMaintainedPlan } from './maintainedTemplateSave'
import { copyOrderSetInput, rethrowTemplateSaveError, templateTypeHint, templateTypeLabel } from './orderSetTemplate'
import { useTemplateApplication } from './useTemplateApplication'
import { rebaseAnnotations } from '../record/recordAnnotations'
import { recordTextFields } from '../../../shared/api/recordAnnotations'
import { AnnotatedRecordField } from '../record/AnnotatedRecordField'
import { RecordAnnotationLegend } from '../record/RecordAnnotationLegend'

type TemplateKind = 'NOTE' | 'PLAN' | 'ORDER_SET'
const auxiliaryTaskKinds = new Set<OutpatientPlanTask['kind']>(['EDUCATION', 'FOLLOW_UP', 'CONDITION'])

export function ManualClinicalTemplateDialog({ api, organizationId, kind, editingNote, editingPlan, copyFrom, onClose, onSaved }: {
  api: RhnApi
  organizationId?: string
  kind: TemplateKind
  editingNote?: OutpatientNoteTemplate | null
  /** 编辑诊疗方案或医嘱组套；ORDER_SET 与 PLAN 共用同一入参。 */
  editingPlan?: OutpatientPlanTemplate | null
  /** 复制为我的：以该医嘱组套的药品与项目为初始内容新建，范围固定从“我的”开始。 */
  copyFrom?: OutpatientPlanTemplate | null
  onClose: () => void
  onSaved: (value: OutpatientNoteTemplate | OutpatientPlanTemplate) => void
}) {
  const noteEditing = kind === 'NOTE' ? editingNote : null
  const planEditing = kind !== 'NOTE' ? editingPlan : null
  const orderSet = kind === 'ORDER_SET'
  const copySeed = useMemo(() => orderSet && !editingPlan && copyFrom ? copyOrderSetInput(copyFrom) : undefined,
    [copyFrom, editingPlan, orderSet])
  const [name, setName] = useState(noteEditing?.name || planEditing?.name || copySeed?.name || '')
  const [description, setDescription] = useState(noteEditing?.description || planEditing?.description || copySeed?.description || '')
  const [noteScope, setNoteScope] = useState<OutpatientNoteTemplateScope>(noteEditing?.scopeType || 'PERSONAL')
  const [planScope, setPlanScope] = useState<OutpatientPlanTemplateScope>(planEditing?.scopeType || 'PERSONAL')
  const [noteContent, setNoteContent] = useState<OutpatientNoteTemplateContent>(noteEditing?.content || {})
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>(planEditing?.diagnoses || [])
  const [medications, setMedications] = useState<CompiledPlanMedicationItem[]>(planEditing?.medications || copySeed?.medications || [])
  const [services, setServices] = useState<CompiledPlanServiceItem[]>(planEditing?.services || copySeed?.services || [])
  const [tasks, setTasks] = useState<OutpatientPlanTask[]>(planEditing?.tasks || [])
  const [noteTemplateId, setNoteTemplateId] = useState(planEditing?.noteTemplateId || '')
  const [directory, setDirectory] = useState<{ api: RhnApi; data?: OutpatientNoteTemplate[]; error?: string }>()
  const [reload, setReload] = useState(0)
  const noteTemplates = useMemo(() => directory?.api === api ? directory.data ?? [] : [], [api, directory])
  const notesReady = directory?.api === api && Array.isArray(directory.data)
  const notesError = directory?.api === api ? directory.error : undefined
  const operation = useTemplateApplication(JSON.stringify([templateApiScope(api), organizationId, kind,
    noteEditing?.id, noteEditing?.revision, planEditing?.id, planEditing?.revision]), false,
    () => JSON.stringify([name, description, noteScope, planScope, noteContent, diagnoses, medications, services, tasks, noteTemplateId]),
    '当前会话或模板内容已变化，未确认本次保存；远端可能已保存，请先查询核实。')
  const saving = operation.pending
  const [error, setError] = useState('')

  const [clinicalValidation, setClinicalValidation] = useState(planEditing?.medications.length || copySeed?.medications.length ? '用法字典尚未确认' : '')

  const noteHasContent = recordTextFields.some(key => noteContent[key]?.trim())
  const valid = name.trim() && (kind === 'NOTE' ? noteHasContent
    : orderSet ? medications.length + services.length > 0 && !clinicalValidation : diagnoses.length > 0 && !clinicalValidation)
  const compatibleNoteTemplates = useMemo(() => noteTemplates.filter((value) =>
    planScope === 'PERSONAL' || planScope === 'DEPARTMENT' && value.scopeType === 'DEPARTMENT'),
  [noteTemplates, planScope])
  const selectedPlanNoteTemplate = noteTemplates.find((value) => value.id === noteTemplateId)
  const auxiliaryTasks = tasks.map((task, index) => ({ task, index }))
    .filter(({ task }) => auxiliaryTaskKinds.has(task.kind))

  useEffect(() => {
    if (kind !== 'PLAN') return
    let active = true
    setDirectory({ api })
    void api.outpatientNoteTemplates.list('', 'GENERAL_PRACTICE').then((values) => {
      const data = requireNoteTemplateList(values, 'GENERAL_PRACTICE')
      if (active) setDirectory({ api, data })
    }).catch(cause => { if (active) setDirectory({ api, error: errorMessage(cause) }) })
    return () => { active = false }
  }, [api, kind, reload])

  const changePlanScope = (value: string) => {
    const next = value as OutpatientPlanTemplateScope
    setPlanScope(next)
    if (next === 'HOSPITAL' || next === 'DEPARTMENT' && selectedPlanNoteTemplate?.scopeType === 'PERSONAL') {
      setNoteTemplateId('')
    }
  }

  const save = () => {
    if (!valid) return
    setError('')
    void operation.run(async () => {
      if (kind === 'NOTE') return saveMaintainedNote(api, {
        scopeType: noteScope, name, description, specialtyCode: noteEditing?.specialtyCode ?? 'GENERAL_PRACTICE',
        sortOrder: noteEditing?.sortOrder ?? 0, content: noteContent,
      }, noteEditing)
      if (orderSet) return saveMaintainedPlan(api, {
        templateKind: 'ORDER_SET', scopeType: planScope, name, description,
        sourceType: planEditing ? planEditing.sourceType : 'MANUAL', sortOrder: planEditing?.sortOrder ?? 0,
        diagnoses: [], medications, services, tasks: [],
      }, planEditing).catch(rethrowTemplateSaveError)
      if (noteTemplateId && (!notesReady || !compatibleNoteTemplates.some(note => note.id === noteTemplateId))) {
        throw new Error('配套病历模板尚未确认或已不可用，请重新加载核对。')
      }
      return saveMaintainedPlan(api, {
        scopeType: planScope, name, description, noteTemplateId: noteTemplateId || undefined,
        sourceType: planEditing ? planEditing.sourceType : 'MANUAL', guidelineReference: planEditing?.guidelineReference,
        sortOrder: planEditing?.sortOrder ?? 0, diagnoses, medications, services, tasks,
      }, planEditing).catch(rethrowTemplateSaveError)
    }, onSaved)
  }

  return <Dialog
    title={`${noteEditing || planEditing ? '编辑' : '新建'}${templateTypeLabel(kind)}`}
    eyebrow="人工维护 · 标准目录"
    description={kind === 'NOTE' ? '直接维护可复用病历段落，不包含诊断和医嘱。'
      : orderSet ? `${templateTypeHint('ORDER_SET')}；只包含药品和诊疗项目，带入时医生可逐行取消勾选。` : undefined}
    size="xwide" className={kind !== 'NOTE' ? 'manual-plan-template-dialog' : 'manual-note-template-dialog'}
    closeOnBackdrop={false} onClose={() => !saving && onClose()}
    footer={<>
      <Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
      <Button busy={saving} disabled={!valid} onClick={() => void save()}>保存模板</Button>
    </>}>
    {(error || operation.error) && <Alert>{error || operation.error}</Alert>}
    <div inert={saving} className={`manual-template-dialog ${kind !== 'NOTE' ? 'is-plan' : 'is-note'}`}>
      <div className={`ui-form-grid ${kind !== 'NOTE' ? 'manual-template-plan-meta' : ''}`}>
        <FormField label="模板名称" required><input value={name} maxLength={100}
          onChange={(event) => setName(event.target.value)} placeholder="输入便于识别的模板名称" /></FormField>
        <FormField label="使用范围"><Select value={kind === 'NOTE' ? noteScope : planScope} clearable={false}
          options={kind === 'NOTE'
            ? [{ value: 'PERSONAL', label: '我的' }, { value: 'DEPARTMENT', label: '科室' }]
            : [{ value: 'PERSONAL', label: '我的' }, { value: 'DEPARTMENT', label: '科室' }, { value: 'HOSPITAL', label: '全院' }]}
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

      {kind === 'NOTE' ? <div className="manual-template-note-editor">
        <div className="manual-template-note-grid">
          {noteTemplateFields.map(({ key, label }) => <FormField key={key} label={label}>
            <AnnotatedRecordField field={key} showAnnotations annotations={noteContent.annotations ?? []}
              value={noteContent[key] || ''} rows={key === 'chiefComplaint' ? 2 : 4}
              onValueChange={(value) => setNoteContent((current) => ({ ...current, [key]: value,
                annotations: rebaseAnnotations(key, current[key] ?? '', value, current.annotations ?? []) }))}
              placeholder={`输入可复用的${label}内容`} />
          </FormField>)}
        </div>
        {(noteContent.annotations?.length ?? 0) > 0 && <RecordAnnotationLegend />}
      </div> : orderSet ? <div className="manual-template-plan-grid">
        <PlanTemplateClinicalEditor api={api} organizationId={organizationId} mode="ORDER_SET"
          diagnoses={diagnoses} setDiagnoses={setDiagnoses}
          medications={medications} setMedications={setMedications}
          services={services} setServices={setServices} onError={setError} onValidationChange={setClinicalValidation} />
      </div> : <div className="manual-template-plan-grid">
        <section className="plan-template-note-link">
          <div className="plan-template-note-link__copy">
            <strong>配套病历模板</strong>
            <small>可选；医生站调入方案时一并带入病历段落、诊断和医嘱草稿。</small>
          </div>
          <Select aria-label="配套病历模板" value={noteTemplateId} searchable clearable
            disabled={planScope === 'HOSPITAL' || !notesReady}
            placeholder={planScope === 'HOSPITAL' ? '全院方案暂不支持关联病历模板' : '选择病历模板（可选）'}
            options={compatibleNoteTemplates.map((value) => ({
              value: value.id,
              label: value.name,
              secondaryText: `${value.scopeType === 'PERSONAL' ? '我的' : '科室'} · ${noteTemplateFields.filter(({ key }) => value.content[key]?.trim()).length} 个段落`,
            }))}
            onChange={setNoteTemplateId} />
          {!notesReady && (notesError
            ? <Alert duration={null}>病历模板加载失败：{notesError}
              <Button variant="text" onClick={() => setReload(value => value + 1)}>重新加载病历模板</Button></Alert>
            : <div role="status" className="doctor-plan-pool-notice">正在核对病历模板目录…</div>)}
          {noteTemplateId && notesReady && !selectedPlanNoteTemplate && <Alert duration={null}>配套病历模板已不可用，请重新选择或明确取消关联。</Alert>}
          <div className="plan-template-note-link__summary">
            {selectedPlanNoteTemplate
              ? <><StatusBadge tone="info">已关联</StatusBadge><span>{noteTemplateFields.filter(({ key }) => selectedPlanNoteTemplate.content[key]?.trim()).map(({ label }) => label).join('、')}</span></>
              : noteTemplateId ? <span>关联状态待核实。</span> : <span>{planScope === 'HOSPITAL' ? '病历模板目前仅支持个人或科室范围。' : '不关联时，方案仅包含诊断与医嘱。'}</span>}
          </div>
        </section>
        <PlanTemplateClinicalEditor api={api} organizationId={organizationId}
          diagnoses={diagnoses} setDiagnoses={setDiagnoses}
          medications={medications} setMedications={setMedications}
          services={services} setServices={setServices} onError={setError} onValidationChange={setClinicalValidation} />
        {!!auxiliaryTasks.length && <Panel className="manual-template-tasks" aria-label="辅助任务">
          <PanelHead title="辅助任务" meta={`${auxiliaryTasks.length} 项`} />
          <div className="manual-template-tasks__list">
            {auxiliaryTasks.map(({ task, index }) => <div className="manual-template-task" key={`${task.kind}-${index}`}>
              <StatusBadge tone={task.status === 'UNMATCHED' ? 'warning' : 'neutral'}>{planTaskKindLabel[task.kind]}</StatusBadge>
              <input aria-label={`${planTaskKindLabel[task.kind]}任务内容`} value={task.text} maxLength={500}
                onChange={(event) => setTasks((current) => current.map((value, target) =>
                  target === index ? { ...value, text: event.target.value } : value))} />
              <Button type="button" variant="text" aria-label={`移除任务 ${task.text}`}
                onClick={() => setTasks((current) => current.filter((_, target) => target !== index))}>移除</Button>
            </div>)}
          </div>
        </Panel>}
      </div>}
    </div>
  </Dialog>
}
