import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'
import './outpatient-plan-templates.css'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { ClinicalMedicationStandards, DiseaseConcept, MedicationKnowledge, ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import type { CompiledPlanMedicationItem, CompiledPlanServiceItem } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import {
  Button, ClinicalResourceSearch, EditableCell, EditableRow, EditableTable, Icon, Panel, PanelHead,
  RemoteSearchSelect, Select, StatusBadge, UnitNumberInput, tableCellClass,
  type ClinicalResourceOption, type RemoteSearchOption,
} from '../../../shared/ui'
import { diagnosisKey, moveDiagnosis, normalizeDiagnosisOrder } from '../record/clinicalRecordDraft'

type OrderKind = 'MEDICATION' | 'SERVICE'

export function PlanTemplateClinicalEditor({ api, organizationId, diagnoses, setDiagnoses, medications,
  setMedications, services, setServices, onError }: {
  api: RhnApi
  organizationId?: string
  diagnoses: DiagnosisInput[]
  setDiagnoses: Dispatch<SetStateAction<DiagnosisInput[]>>
  medications: CompiledPlanMedicationItem[]
  setMedications: Dispatch<SetStateAction<CompiledPlanMedicationItem[]>>
  services: CompiledPlanServiceItem[]
  setServices: Dispatch<SetStateAction<CompiledPlanServiceItem[]>>
  onError: (message: string) => void
}) {
  const [diagnosisDomain, setDiagnosisDomain] = useState('')
  const [orderKind, setOrderKind] = useState<OrderKind>('MEDICATION')
  const [standards, setStandards] = useState<ClinicalMedicationStandards>()

  useEffect(() => {
    if (typeof api.masterData.clinicalMedicationStandards !== 'function') return
    let active = true
    void api.masterData.clinicalMedicationStandards().then((value) => {
      if (active) setStandards(value)
    }).catch(() => undefined)
    return () => { active = false }
  }, [api])

  const loadMedications = useCallback(async (query: string): Promise<RemoteSearchOption<MedicationKnowledge>[]> => {
    const page = await api.masterData.searchMedications(query.trim(), '', 'ACTIVE', '', 0, 30)
    return page.content.map((item) => ({
      value: item.id,
      label: item.name,
      code: item.code,
      description: [item.preparationSpec, item.sdDoseFormText].filter(Boolean).join(' · '),
      tags: [item.sdMedicationTypeText],
      raw: item,
    }))
  }, [api])

  const loadServices = useCallback(async (query: string): Promise<RemoteSearchOption<ServiceCatalogItem>[]> => {
    const page = await api.masterData.searchServices(query.trim(), '', 'ACTIVE', organizationId || '', 0, 30)
    return page.content.map((item) => {
      const adopted = Boolean(item.organizationAdoption?.catalogItemId)
      return {
        value: item.organizationAdoption?.catalogItemId || item.id,
        label: item.organizationAdoption?.localName || item.name,
        code: item.organizationAdoption?.localCode || item.code,
        description: adopted ? `${item.sdServiceTypeText} · ${item.unitCode || '单位未维护'}` : '当前机构尚未采用',
        tags: [item.sdServiceTypeText],
        raw: item,
        disabled: !adopted,
      }
    })
  }, [api, organizationId])

  const addDiagnosis = (option?: ClinicalResourceOption<DiseaseConcept>) => {
    const item = option?.raw
    if (!item) return
    if (diagnoses.some((value) => value.conceptId === item.id
      || (value.diagnosisDomain === item.sdDiagnosisDomain && value.code === item.code))) {
      onError('该诊断已经录入。')
      return
    }
    onError('')
    setDiagnoses((current) => normalizeDiagnosisOrder([...current, {
      conceptId: item.id,
      diagnosisDomain: item.sdDiagnosisDomain,
      code: item.code,
      display: item.display,
      type: 'SECONDARY',
    }]))
  }

  const addMedication = (option?: RemoteSearchOption<MedicationKnowledge>) => {
    const item = option?.raw
    if (!item) return
    if (medications.some((value) => value.medicationId === item.id)) {
      onError(`药品“${item.name}”已经加入方案。`)
      return
    }
    onError('')
    setMedications((current) => [...current, {
      medicationId: item.id,
      medicationName: item.name,
      preparationSpec: item.preparationSpec,
      doseValue: item.defaultDose,
      doseUnit: item.defaultDoseUnit,
      routeCode: item.defaultRoute,
      frequencyCode: item.defaultFrequency,
      durationValue: 3,
      durationUnit: 'd',
      quantity: 1,
      quantityUnit: item.preparationUnit || '盒',
      substitutionAllowed: true,
      selfProvided: false,
      pricingRequired: false,
    }])
  }

  const addService = (option?: RemoteSearchOption<ServiceCatalogItem>) => {
    const item = option?.raw
    const catalogItemId = item?.organizationAdoption?.catalogItemId
    if (!item || !catalogItemId) {
      if (item) onError(`项目“${item.name}”尚未匹配当前机构目录，不能加入方案。`)
      return
    }
    if (services.some((value) => value.catalogItemId === catalogItemId)) {
      onError(`项目“${item.name}”已经加入方案。`)
      return
    }
    onError('')
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

  const moveDiagnosisByOffset = (key: string, offset: number) => setDiagnoses((current) => {
    const sourceIndex = current.findIndex((item) => diagnosisKey(item) === key)
    const target = current[sourceIndex + offset]
    return target ? moveDiagnosis(current, key, diagnosisKey(target)) : normalizeDiagnosisOrder(current)
  })

  const makePrimary = (key: string) => setDiagnoses((current) => {
    const first = current[0]
    return first ? moveDiagnosis(current, key, diagnosisKey(first)) : current
  })

  const routeOptions = standards?.routes.map((value) => ({ value: value.code, label: value.name })) ?? []
  const frequencyOptions = standards?.frequencies.map((value) => ({ value: value.code, label: value.name })) ?? []
  const doseUnitOptions = standards?.doseUnits.map((value) => ({ value: value.code, label: value.display })) ?? []

  return <div className="plan-template-clinical-editor">
    <Panel className="plan-template-entry-section">
      <PanelHead title="诊断" meta={<StatusBadge tone={diagnoses.length ? 'info' : 'warning'}>{diagnoses.length} 项</StatusBadge>} />
      <div className="plan-template-entry-section__body">
        <div className="plan-template-diagnosis-composer">
          <Select aria-label="诊断类型" value={diagnosisDomain} clearable={false} searchable={false}
            options={[
              { value: '', label: '全部类型' },
              { value: 'WESTERN_MEDICINE', label: '西医诊断' },
              { value: 'TCM_DISEASE', label: '中医病名' },
              { value: 'TCM_SYNDROME', label: '中医证候' },
            ]}
            onChange={setDiagnosisDomain} />
          <ClinicalResourceSearch<DiseaseConcept> api={api} resource="diagnosis" value={undefined}
            aria-label="添加标准诊断" placeholder={diagnoses.length ? '检索并连续添加次要诊断' : '检索并添加主要诊断'}
            filterResult={(item) => !diagnosisDomain || item.sdDiagnosisDomain === diagnosisDomain}
            onChange={addDiagnosis} />
        </div>

        <div className="plan-template-diagnosis-list" role="table" aria-label="方案诊断列表">
          <div className="plan-template-diagnosis-row is-head" role="row">
            <span>类型</span><span>诊断名称与 ICD 编码</span><span>主次</span><span>操作</span>
          </div>
          {!diagnoses.length && <div className="plan-template-entry-empty">请先检索并添加至少一项主要诊断</div>}
          {diagnoses.map((item, index) => {
            const key = diagnosisKey(item)
            return <div className={`plan-template-diagnosis-row ${index === 0 ? 'is-primary' : ''}`} role="row" key={key}>
              <span className="plan-template-diagnosis-domain">{diagnosisDomainLabel(item.diagnosisDomain)}</span>
              <span className="plan-template-entry-identity"><strong>{item.display}</strong><small>{item.code}</small></span>
              <span><StatusBadge tone={index === 0 ? 'warning' : 'neutral'}>{index === 0 ? '主要诊断' : `次要 #${index}`}</StatusBadge></span>
              <span className="plan-template-row-actions">
                <Button type="button" size="sm" variant="text" disabled={index === 0} title="上移"
                  aria-label={`上移诊断 ${item.display}`} onClick={() => moveDiagnosisByOffset(key, -1)}><Icon name="chevron-up" /></Button>
                <Button type="button" size="sm" variant="text" disabled={index === diagnoses.length - 1} title="下移"
                  aria-label={`下移诊断 ${item.display}`} onClick={() => moveDiagnosisByOffset(key, 1)}><Icon name="chevron-down" /></Button>
                {index > 0 && <Button type="button" size="sm" variant="text" onClick={() => makePrimary(key)}>设为主要</Button>}
                <Button type="button" size="sm" variant="text" aria-label={`移除诊断 ${item.display}`}
                  onClick={() => setDiagnoses((current) => normalizeDiagnosisOrder(current.filter((value) => diagnosisKey(value) !== key)))}>
                  移除
                </Button>
              </span>
            </div>
          })}
        </div>
      </div>
    </Panel>

    <Panel className="plan-template-entry-section">
      <PanelHead title="医嘱" meta={<StatusBadge tone="info">{medications.length + services.length} 项</StatusBadge>} />
      <div className="plan-template-entry-section__body">
        <div className="plan-template-order-composer">
          <Select aria-label="医嘱类型" value={orderKind} clearable={false} searchable={false}
            options={[{ value: 'MEDICATION', label: '药品' }, { value: 'SERVICE', label: '检验 / 检查 / 治疗' }]}
            onChange={(value) => setOrderKind(value as OrderKind)} />
          {orderKind === 'MEDICATION'
            ? <RemoteSearchSelect<MedicationKnowledge> value={undefined} loadOptions={loadMedications}
              aria-label="模板医嘱检索" placeholder="检索模板通用药品（名称 / 编码 / 拼音）"
              searchPlaceholder="输入药品名称、编码或拼音码" onChange={addMedication} />
            : <RemoteSearchSelect<ServiceCatalogItem> value={undefined} loadOptions={loadServices}
              aria-label="模板医嘱检索" placeholder="检索当前机构诊疗项目"
              searchPlaceholder="输入项目名称、编码或拼音码" onChange={addService} />}
        </div>
        <div className="plan-template-order-source-hint" role="note">
          <Icon name="info" />
          <span>{orderKind === 'MEDICATION'
            ? '模板药品来自通用主数据，应用方案时再校验机构目录、库存与价格。'
            : '仅可加入当前机构已采用的检验、检查和治疗项目。'}</span>
        </div>

        <div className="plan-template-order-list">
          {!medications.length && !services.length && <div className="plan-template-entry-empty">检索并选择医嘱后，可在列表内继续完善用法与数量</div>}
          {!!(medications.length || services.length) && <EditableTable className="plan-template-order-table" aria-label="方案医嘱列表">
            <colgroup>
              <col className="plan-template-order-table__type" />
              <col className="plan-template-order-table__name" />
              <col className="plan-template-order-table__dose" />
              <col className="plan-template-order-table__route" />
              <col className="plan-template-order-table__frequency" />
              <col className="plan-template-order-table__duration" />
              <col className="plan-template-order-table__quantity" />
              <col className="plan-template-order-table__instruction" />
              <col className="plan-template-order-table__actions" />
            </colgroup>
            <thead><tr>
              <th className={tableCellClass('status')}>类型</th>
              <th>医嘱名称</th>
              <th>单次剂量</th>
              <th>途径</th>
              <th>频次</th>
              <th>疗程</th>
              <th>开立数量</th>
              <th>嘱托 / 临床要求</th>
              <th className={tableCellClass('actions')}>操作</th>
            </tr></thead>
            <tbody>
              {medications.map((item, index) => <MedicationTemplateRow key={`${item.medicationId || 'med'}-${index}`}
                item={item} index={index} doseUnitOptions={doseUnitOptions}
                routeOptions={routeOptions} frequencyOptions={frequencyOptions} setMedications={setMedications} />)}
              {services.map((item, index) => <ServiceTemplateRow key={`${item.catalogItemId}-${index}`}
                item={item} index={index} setServices={setServices} />)}
            </tbody>
          </EditableTable>}
        </div>
      </div>
    </Panel>
  </div>
}

function MedicationTemplateRow({ item, index, doseUnitOptions, routeOptions, frequencyOptions, setMedications }: {
  item: CompiledPlanMedicationItem
  index: number
  doseUnitOptions: { value: string; label: string }[]
  routeOptions: { value: string; label: string }[]
  frequencyOptions: { value: string; label: string }[]
  setMedications: Dispatch<SetStateAction<CompiledPlanMedicationItem[]>>
}) {
  const name = item.medicationName || '未命名药品'
  const routeLabel = optionLabel(routeOptions, item.routeCode)
  const frequencyLabel = optionLabel(frequencyOptions, item.frequencyCode)
  return <EditableRow className="plan-template-order-row" tabIndex={0} aria-label={`编辑模板医嘱 ${name}`}
    title="单击编辑医嘱" onClick={(event) => {
      if (!(event.target as Element).closest('button, input, [role="combobox"]')) focusFirstEditableField(event.currentTarget)
    }} onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        focusFirstEditableField(event.currentTarget)
      }
    }}>
    <td className={tableCellClass('status')}><StatusBadge tone="info">药品</StatusBadge></td>
    <td><span className="plan-template-entry-identity"><strong>{name}</strong><small>{item.preparationSpec || '规格未维护'}</small></span></td>
    <EditableCell display={numberWithUnit(item.doseValue, doseUnitLabel(doseUnitOptions, item.doseUnit))}>
      <UnitNumberInput aria-label={`${name} 单次剂量`} min="0" step="0.01" value={item.doseValue ?? ''}
        unit={item.doseUnit || ''} units={withCurrentOption(doseUnitOptions, item.doseUnit)}
        onValueChange={(value) => updateAt(setMedications, index, { doseValue: numberOrUndefined(value) })}
        onUnitChange={(value) => updateAt(setMedications, index, { doseUnit: value })} />
    </EditableCell>
    <EditableCell display={routeLabel}>
      <Select aria-label={`${name} 给药途径`} value={item.routeCode || ''}
        options={withCurrentOption(routeOptions, item.routeCode)} placeholder="请选择"
        onChange={(value) => updateAt(setMedications, index, { routeCode: value })} />
    </EditableCell>
    <EditableCell display={frequencyLabel}>
      <Select aria-label={`${name} 频次`} value={item.frequencyCode || ''}
        options={withCurrentOption(frequencyOptions, item.frequencyCode)} placeholder="请选择"
        onChange={(value) => updateAt(setMedications, index, { frequencyCode: value })} />
    </EditableCell>
    <EditableCell display={numberWithUnit(item.durationValue, durationUnitLabel(item.durationUnit))}>
      <UnitNumberInput aria-label={`${name} 疗程`} min="0" step="1" value={item.durationValue ?? ''}
        unit={item.durationUnit || 'd'} units={durationUnitOptions}
        onValueChange={(value) => updateAt(setMedications, index, { durationValue: numberOrUndefined(value) })}
        onUnitChange={(value) => updateAt(setMedications, index, { durationUnit: value })} />
    </EditableCell>
    <EditableCell display={numberWithUnit(item.quantity, item.quantityUnit)}>
      <UnitNumberInput aria-label={`${name} 数量`} min="0.01" step="1" value={item.quantity}
        unit={item.quantityUnit || ''}
        onValueChange={(value) => updateAt(setMedications, index, { quantity: positiveNumber(value) })}
        onUnitChange={(value) => updateAt(setMedications, index, { quantityUnit: value })} />
    </EditableCell>
    <EditableCell display={item.medicationInstruction} placeholder="无">
      <input className="ui-field__control" aria-label={`${name} 用药嘱托`} value={item.medicationInstruction || ''}
        placeholder="选填" maxLength={500}
        onChange={(event) => updateAt(setMedications, index, { medicationInstruction: event.target.value })} />
    </EditableCell>
    <td className={tableCellClass('actions')}><Button type="button" size="sm" variant="text"
      aria-label={`移除药品 ${name}`} onClick={() => setMedications((current) => current.filter((_, target) => target !== index))}>移除</Button></td>
  </EditableRow>
}

function ServiceTemplateRow({ item, index, setServices }: {
  item: CompiledPlanServiceItem
  index: number
  setServices: Dispatch<SetStateAction<CompiledPlanServiceItem[]>>
}) {
  const name = item.itemName || '未命名项目'
  return <EditableRow className="plan-template-order-row" tabIndex={0} aria-label={`编辑模板医嘱 ${name}`}
    title="单击编辑医嘱" onClick={(event) => {
      if (!(event.target as Element).closest('button, input, [role="combobox"]')) focusFirstEditableField(event.currentTarget)
    }} onKeyDown={(event) => {
      if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault()
        focusFirstEditableField(event.currentTarget)
      }
    }}>
    <td className={tableCellClass('status')}><StatusBadge tone="neutral">{serviceTypeLabel(item.serviceType)}</StatusBadge></td>
    <td><span className="plan-template-entry-identity"><strong>{name}</strong><small>{item.itemCode || '编码未维护'}</small></span></td>
    <td>—</td><td>—</td><td>—</td><td>—</td>
    <EditableCell display={numberWithUnit(item.quantity, item.unitCode)}>
      <UnitNumberInput aria-label={`${name} 数量`} min="0.01" step="1" value={item.quantity}
        unit={item.unitCode || ''}
        onValueChange={(value) => updateAt(setServices, index, { quantity: positiveNumber(value) })}
        onUnitChange={(value) => updateAt(setServices, index, { unitCode: value })} />
    </EditableCell>
    <EditableCell display={item.clinicalDescription} placeholder="无">
      <input className="ui-field__control" aria-label={`${name} 临床要求`} value={item.clinicalDescription || ''}
        placeholder="选填，例如空腹、检查部位" maxLength={500}
        onChange={(event) => updateAt(setServices, index, { clinicalDescription: event.target.value })} />
    </EditableCell>
    <td className={tableCellClass('actions')}><Button type="button" size="sm" variant="text"
      aria-label={`移除项目 ${name}`} onClick={() => setServices((current) => current.filter((_, target) => target !== index))}>移除</Button></td>
  </EditableRow>
}

const durationUnitOptions = [{ value: 'd', label: '天' }, { value: 'w', label: '周' }, { value: 'm', label: '月' }]

function focusFirstEditableField(row: HTMLTableRowElement) {
  row.querySelector<HTMLElement>('[data-editable-cell] input, [data-editable-cell] button[role="combobox"]')?.focus()
}

function updateAt<T>(setter: Dispatch<SetStateAction<T[]>>, index: number, patch: Partial<T>) {
  setter((current) => current.map((item, target) => target === index ? { ...item, ...patch } : item))
}

function numberOrUndefined(value: string) {
  return value === '' ? undefined : Number(value)
}

function positiveNumber(value: string) {
  const number = Number(value)
  return number > 0 ? number : 1
}

function withCurrentOption(options: { value: string; label: string }[], current?: string) {
  if (!current || options.some((value) => value.value === current)) return options
  return [{ value: current, label: current }, ...options]
}

function optionLabel(options: { value: string; label: string }[], value?: string) {
  return options.find((option) => option.value === value)?.label || value || ''
}

function doseUnitLabel(options: { value: string; label: string }[], value?: string) {
  return optionLabel(options, value)
}

function durationUnitLabel(value?: string) {
  return optionLabel(durationUnitOptions, value || 'd')
}

function numberWithUnit(value?: number, unit?: string) {
  return value === undefined || value === null ? '' : `${value}${unit ? ` ${unit}` : ''}`
}

function diagnosisDomainLabel(value?: string) {
  if (value === 'TCM_DISEASE') return '中医病名'
  if (value === 'TCM_SYNDROME') return '中医证候'
  return '西医诊断'
}

function normalizeServiceType(value: string): CompiledPlanServiceItem['serviceType'] {
  return value === 'LABORATORY' || value === 'EXAMINATION' || value === 'TREATMENT' ? value : 'OTHER'
}

function serviceTypeLabel(value?: CompiledPlanServiceItem['serviceType']) {
  if (value === 'LABORATORY') return '检验'
  if (value === 'EXAMINATION') return '检查'
  if (value === 'TREATMENT') return '治疗'
  return '诊疗'
}
