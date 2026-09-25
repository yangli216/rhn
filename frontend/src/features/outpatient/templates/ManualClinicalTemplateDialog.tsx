import { useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { DiseaseConcept, MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import type { OutpatientNoteTemplate, OutpatientNoteTemplateContent, OutpatientNoteTemplateScope } from '../../../shared/api/outpatientNoteTemplatesApi'
import type {
  CompiledPlanMedicationItem, CompiledPlanServiceItem, OutpatientPlanTask,
  OutpatientPlanTemplate, OutpatientPlanTemplateScope,
} from '../../../shared/api/outpatientPlanTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import {
  Alert, Button, ClinicalResourceSearch, Dialog, FormField, Icon, Select, StatusBadge,
  type ClinicalResourceOption,
} from '../../../shared/ui'
import { errorMessage } from '../../../shared/api/httpClient'
import { noteTemplateFields } from '../record/NoteTemplateBar'

type TemplateKind = 'NOTE' | 'PLAN'

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const noteHasContent = noteTemplateFields.some(({ key }) => noteContent[key]?.trim())
  const valid = name.trim() && (kind === 'NOTE' ? noteHasContent : diagnoses.length > 0)

  const addDiagnosis = (option?: ClinicalResourceOption<DiseaseConcept>) => {
    const item = option?.raw
    if (!item || diagnoses.some((value) => value.code === item.code)) return
    setDiagnoses((current) => [...current, {
      conceptId: item.id,
      diagnosisDomain: item.sdDiagnosisDomain,
      code: item.code,
      display: item.display,
      type: current.length ? 'SECONDARY' : 'PRIMARY',
    }])
  }

  const addMedication = (option?: ClinicalResourceOption<MedicationKnowledge>) => {
    const item = option?.raw
    if (!item || medications.some((value) => value.medicationId === item.id)) return
    const product = item.products?.find((value) => value.orderable && value.organizationAdoption?.catalogItemId)
    if (!product?.organizationAdoption?.catalogItemId) {
      setError(`药品“${item.name}”尚未匹配当前机构可开立目录，不能加入模板。`)
      return
    }
    const itemPackage = product.packages?.find((value) => value.defaultDispense && value.sdStatus === 'ACTIVE')
      || product.packages?.find((value) => value.sdStatus === 'ACTIVE')
    setError('')
    setMedications((current) => [...current, {
      medicationId: item.id,
      catalogItemId: product.organizationAdoption!.catalogItemId,
      packageId: itemPackage?.id,
      medicationName: item.name,
      preparationSpec: item.preparationSpec,
      doseValue: item.defaultDose,
      doseUnit: item.defaultDoseUnit,
      routeCode: item.defaultRoute,
      frequencyCode: item.defaultFrequency,
      durationValue: 3,
      durationUnit: 'd',
      quantity: 1,
      quantityUnit: itemPackage?.unitName || item.preparationUnit || '盒',
      substitutionAllowed: true,
      selfProvided: false,
      pricingRequired: true,
    }])
  }

  const addService = (option?: ClinicalResourceOption<ServiceCatalogItem>) => {
    const item = option?.raw
    const catalogItemId = item?.organizationAdoption?.catalogItemId
    if (!item || !catalogItemId || services.some((value) => value.catalogItemId === catalogItemId)) {
      if (item && !catalogItemId) setError(`项目“${item.name}”尚未匹配当前机构目录，不能加入模板。`)
      return
    }
    setError('')
    setServices((current) => [...current, {
      catalogItemId,
      itemCode: item.organizationAdoption?.localCode || item.code,
      itemName: item.organizationAdoption?.localName || item.name,
      serviceType: normalizeServiceType(item.sdServiceType),
      quantity: 1,
      unitCode: item.unitCode || '次',
      pricingRequired: true,
    }])
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
    description={kind === 'NOTE'
      ? '直接维护可复用病历段落，不包含诊断和医嘱。'
      : '诊断、药品和检验检查必须从标准目录选择，保存后可直接被医生站识别。'}
    size="xwide" closeOnBackdrop={false} onClose={() => !saving && onClose()}
    footer={<>
      <Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
      <Button busy={saving} disabled={!valid} onClick={() => void save()}>保存模板</Button>
    </>}>
    {error && <Alert>{error}</Alert>}
    <div className="manual-template-dialog">
      <div className="ui-form-grid">
        <FormField label="模板名称" required><input value={name} maxLength={100}
          onChange={(event) => setName(event.target.value)} placeholder="输入便于识别的模板名称" /></FormField>
        <FormField label="使用范围"><Select value={kind === 'NOTE' ? noteScope : planScope} clearable={false}
          options={kind === 'NOTE'
            ? [{ value: 'PERSONAL', label: '仅本人' }, { value: 'DEPARTMENT', label: '本科室' }]
            : [{ value: 'PERSONAL', label: '仅本人' }, { value: 'DEPARTMENT', label: '本科室' }, { value: 'HOSPITAL', label: '全院' }]}
          onChange={(value) => kind === 'NOTE'
            ? setNoteScope(value as OutpatientNoteTemplateScope)
            : setPlanScope(value as OutpatientPlanTemplateScope)} /></FormField>
        <FormField className="ui-form-span-2" label="模板说明"><textarea value={description} maxLength={500}
          onChange={(event) => setDescription(event.target.value)} placeholder="适用场景、使用提醒等" /></FormField>
      </div>

      {kind === 'NOTE' ? <div className="manual-template-note-grid">
        {noteTemplateFields.map(({ key, label }) => <FormField key={key} label={label}>
          <textarea value={noteContent[key] || ''} rows={key === 'chiefComplaint' ? 2 : 4}
            onChange={(event) => setNoteContent((current) => ({ ...current, [key]: event.target.value }))}
            placeholder={`输入可复用的${label}内容`} />
        </FormField>)}
      </div> : <div className="manual-template-plan-grid">
        <ManualSection title={`标准诊断 (${diagnoses.length})`}>
          <ClinicalResourceSearch<DiseaseConcept> api={api} resource="diagnosis" value={undefined}
            aria-label="添加标准诊断" placeholder="检索 ICD-10 标准诊断" onChange={addDiagnosis} />
          {diagnoses.map((item, index) => <div className="manual-template-row" key={`${item.code}-${index}`}>
            <div><strong>{item.display}</strong><small>{item.code}</small></div>
            <div className="manual-template-row__actions">
              <StatusBadge tone={index === 0 ? 'warning' : 'neutral'}>{index === 0 ? '主要诊断' : '次要诊断'}</StatusBadge>
              <Button size="sm" variant="text" aria-label={`移除诊断 ${item.display}`}
                onClick={() => setDiagnoses((current) => current.filter((_, target) => target !== index)
                  .map((value, target) => ({ ...value, type: target === 0 ? 'PRIMARY' : 'SECONDARY' })))}><Icon name="close" /></Button>
            </div>
          </div>)}
        </ManualSection>

        <ManualSection title={`机构药品 (${medications.length})`}>
          <ClinicalResourceSearch<MedicationKnowledge> api={api} resource="medication" organizationId={organizationId}
            value={undefined} aria-label="添加机构药品" placeholder="检索机构可开立药品" onChange={addMedication} />
          {medications.map((item, index) => <div className="manual-template-row is-medication" key={`${item.medicationId}-${index}`}>
            <div className="manual-template-row__identity"><strong>{item.medicationName}</strong><small>{item.preparationSpec || '规格未维护'}</small></div>
            <input aria-label={`${item.medicationName} 单次剂量`} type="number" min="0" step="0.01" value={item.doseValue ?? ''}
              placeholder="剂量" onChange={(event) => updateAt(setMedications, index, { doseValue: numberOrUndefined(event.target.value) })} />
            <input aria-label={`${item.medicationName} 剂量单位`} value={item.doseUnit || ''} placeholder="单位"
              onChange={(event) => updateAt(setMedications, index, { doseUnit: event.target.value })} />
            <input aria-label={`${item.medicationName} 给药途径`} value={item.routeCode || ''} placeholder="途径"
              onChange={(event) => updateAt(setMedications, index, { routeCode: event.target.value })} />
            <input aria-label={`${item.medicationName} 频次`} value={item.frequencyCode || ''} placeholder="频次"
              onChange={(event) => updateAt(setMedications, index, { frequencyCode: event.target.value })} />
            <input aria-label={`${item.medicationName} 疗程`} type="number" min="0" step="1" value={item.durationValue ?? ''}
              placeholder="疗程" onChange={(event) => updateAt(setMedications, index, { durationValue: numberOrUndefined(event.target.value) })} />
            <input aria-label={`${item.medicationName} 数量`} type="number" min="0.01" step="1" value={item.quantity}
              placeholder="数量" onChange={(event) => updateAt(setMedications, index, { quantity: Number(event.target.value) || 1 })} />
            <Button size="sm" variant="text" aria-label={`移除药品 ${item.medicationName}`}
              onClick={() => setMedications((current) => current.filter((_, target) => target !== index))}><Icon name="close" /></Button>
          </div>)}
        </ManualSection>

        <ManualSection title={`检验 / 检查 / 治疗 (${services.length})`}>
          <ClinicalResourceSearch<ServiceCatalogItem> api={api} resource="service" organizationId={organizationId}
            value={undefined} aria-label="添加诊疗项目" placeholder="检索机构诊疗项目" onChange={addService} />
          {services.map((item, index) => <div className="manual-template-row is-service" key={`${item.catalogItemId}-${index}`}>
            <div className="manual-template-row__identity"><strong>{item.itemName}</strong><small>{item.itemCode}</small></div>
            <StatusBadge tone="neutral">{item.serviceType === 'LABORATORY' ? '检验' : item.serviceType === 'EXAMINATION' ? '检查' : '治疗'}</StatusBadge>
            <input aria-label={`${item.itemName} 数量`} type="number" min="0.01" step="1" value={item.quantity}
              onChange={(event) => updateAt(setServices, index, { quantity: Number(event.target.value) || 1 })} />
            <input aria-label={`${item.itemName} 临床要求`} value={item.clinicalDescription || ''} placeholder="临床要求（可选）"
              onChange={(event) => updateAt(setServices, index, { clinicalDescription: event.target.value })} />
            <Button size="sm" variant="text" aria-label={`移除项目 ${item.itemName}`}
              onClick={() => setServices((current) => current.filter((_, target) => target !== index))}><Icon name="close" /></Button>
          </div>)}
        </ManualSection>

        {!!tasks.length && <ManualSection title={`已有辅助任务 (${tasks.length})`}>
          {tasks.map((item, index) => <div className="manual-template-row" key={`${item.kind}-${index}`}>
            <div><strong>{item.text}</strong><small>{item.kind}</small></div>
            <Button size="sm" variant="text" aria-label={`移除任务 ${item.text}`}
              onClick={() => setTasks((current) => current.filter((_, target) => target !== index))}><Icon name="close" /></Button>
          </div>)}
        </ManualSection>}
      </div>}
    </div>
  </Dialog>
}

function ManualSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="manual-template-section"><h3>{title}</h3>{children}</section>
}

function updateAt<T>(setter: Dispatch<SetStateAction<T[]>>, index: number, patch: Partial<T>) {
  setter((current) => current.map((item, target) => target === index ? { ...item, ...patch } : item))
}

function numberOrUndefined(value: string) {
  return value === '' ? undefined : Number(value)
}

function normalizeServiceType(value: string): CompiledPlanServiceItem['serviceType'] {
  return value === 'LABORATORY' || value === 'EXAMINATION' || value === 'TREATMENT' ? value : 'OTHER'
}
