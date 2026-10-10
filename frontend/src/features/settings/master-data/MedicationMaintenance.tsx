import { loadAttributeMaintenance } from "../ItemAttributeValueEditor";
import { saveMasterDataAttributes } from "../saveMasterDataAttributes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import type { Organization } from "../../../shared/model";
import { errorMessage, type Manufacturer, type MedicationInput, type MedicationKnowledge, type RhnApi, type ActiveOrderFrequency, type MedicationRoute, type StandardMedicationDetail, type StandardMedicationSpecification } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, FormField, Icon, LoadingState, Select, StatusBadge, Tooltip } from "../../../shared/ui";
import { type DictionaryMap, today, DataFormDialog, optionalText, text, optionalNumber, checked, FormSection, FormGrid, StaticSelectControl, SelectField, Checkboxes, Checkbox, StaticSelectField } from './masterDataShared'
import { ProductDialog } from './ProductMaintenance'
import { validateAttributeChanges, DynamicItemAttributesSection } from './AttributeMaintenance'

export function standardMedicationDraft(entry: StandardMedicationDetail, spec: StandardMedicationSpecification): Partial<MedicationInput> {
  const amount = spec.strength.kind === 'AMOUNT_PER_PRESENTATION' && spec.strength.computable
    && spec.presentationUnit ? spec.strength.numerator : null
  return {
    standardSpecificationId: spec.id, code: spec.id, name: entry.name + (spec.substanceQualifier ? `（${spec.substanceQualifier}）` : ''),
    aliasName: entry.innName || undefined, sdMedicationType: entry.medicationType,
    sdDoseForm: spec.doseForm, preparationSpec: spec.specification,
    preparationUnit: spec.presentationUnit || undefined,
    strengthValue: amount ? Number(amount.value) : undefined, strengthUnit: amount?.unit,
  }
}

export function StandardMedicationSetupDialog({ api, entry, spec, organization, dictionaries, manufacturers,
  frequencies, routes, onClose, onComplete }: {
  api: RhnApi; entry: StandardMedicationDetail; spec: StandardMedicationSpecification; organization: Organization;
  dictionaries: DictionaryMap; manufacturers: Manufacturer[]; frequencies: ActiveOrderFrequency[]; routes: MedicationRoute[];
  onClose: () => void; onComplete: (medication: MedicationKnowledge) => void | Promise<unknown>
}) {
  const [medication, setMedication] = useState<MedicationKnowledge>()
  const [priorId, setPriorId] = useState('')
  const existing = useQuery({queryKey:['master-data-standard-setup', organization.id, spec.id],
    queryFn: () => api.masterData.standardMedicationCandidates(spec.id, organization.id),
    staleTime: 0, gcTime: 0, refetchOnWindowFocus: false})
  if (existing.isPending || existing.isFetching || existing.error) return <Dialog title="建立本院药品" onClose={onClose}>
    {existing.isPending || existing.isFetching ? <LoadingState /> : <><Alert>{errorMessage(existing.error)}</Alert>
      <Button onClick={() => void existing.refetch()}>重试</Button></>}
  </Dialog>
  const candidates = existing.data ?? []
  const prior = candidates.length === 1 ? candidates[0] : candidates.find(item => item.id === priorId)
  if (!medication && candidates.length > 1 && !prior) return <Dialog title="关联已有药品档案" onClose={onClose}>
    <p>发现多个同规格药品，请选择要关联的档案，避免重复建档。已有产品的档案优先复用。</p>
    {candidates.map(item => <Button key={item.id} variant="secondary" onClick={() => setPriorId(item.id)}>
      {item.name} · {item.preparationSpec} · {item.code} · {item.products.length} 个产品
    </Button>)}
  </Dialog>
  if (!medication) return <MedicationDialog key={prior?.id ?? spec.id} api={api} organization={organization} dictionaries={dictionaries}
    frequencies={frequencies} routes={routes} value={prior} initialValue={standardMedicationDraft(entry, spec)}
    onClose={onClose} onSave={async (input) => {
      const saved = await api.masterData.saveStandardMedication(spec.id, input, organization.id, prior)
      setMedication(saved)
    }} />
  return <ProductDialog medication={medication} manufacturers={manufacturers} organization={organization}
    dictionaries={dictionaries} onClose={onClose} onSave={async input => {
      await api.masterData.createProductSetup(input)
      await onComplete(medication)
    }} />
}

export function MedicationDialog({
  api,
  organization,
  dictionaries,
  frequencies,
  routes,
  value,
  initialValue,
  onClose,
  onSave,
}: {
  api?: RhnApi
  organization?: Organization
  dictionaries: DictionaryMap
  frequencies: ActiveOrderFrequency[]
  routes: MedicationRoute[]
  value?: MedicationKnowledge
  initialValue?: Partial<MedicationInput>
  onClose: () => void
  onSave: (input: MedicationInput) => void | Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const [attrValues, setAttrValues] = useState<Record<string, string>>({})
  const maintenanceQuery = useQuery({
    queryKey: ['master-data-item-attributes', 'MEDICATION', value?.id, today()],
    queryFn: () => loadAttributeMaintenance(api!, 'MEDICATION', value!.id, today()),
    enabled: Boolean(api && value?.id),
    staleTime: 60 * 1000,
  })

  const attributeRequests = useRef(new Map<string, string>())
  const [attributeProgress, setAttributeProgress] = useState('')
  const saveAttributes = async () => {
    if (!api || !value?.id || !maintenanceQuery.data) return
    await queryClient.cancelQueries({ queryKey: ['master-data-item-attributes', 'MEDICATION', value.id, today()], exact: true })
    await saveMasterDataAttributes({ api, subjectType: 'MEDICATION', targetId: value.id,
      organizationId: organization?.id, maintenance: maintenanceQuery.data, values: attrValues,
      date: today(), requests: attributeRequests.current,
      onConfirmed: (attribute, snapshot) => {
        queryClient.setQueryData(['master-data-item-attributes', 'MEDICATION', value.id, today()], snapshot)
        setAttrValues((current) => { const next = { ...current }; delete next[attribute.definitionId]; return next })
        setAttributeProgress(`扩展属性“${attribute.name}”已保存，主档尚待保存；已保存属性不会因其他步骤失败而回滚。`)
      },
    })
  }

  const initial = value ?? initialValue
  const standardId = initialValue?.standardSpecificationId ?? value?.standardReference?.specificationId
  const standardLocked = Boolean(standardId)
  const [medicationType, setMedicationType] = useState(initial?.sdMedicationType ?? 'WESTERN')
  const [antimicrobial, setAntimicrobial] = useState(initial?.antimicrobial ?? false)
  const [antimicrobialLevel, setAntimicrobialLevel] = useState(initial?.sdAntimicrobialLevel ?? 'NON_RESTRICTED')
  const [antimicrobialOutpatientAllowed, setAntimicrobialOutpatientAllowed] = useState(
    initial?.antimicrobialOutpatientAllowed ?? true)
  const [antimicrobialConsultationRequired, setAntimicrobialConsultationRequired] = useState(
    initial?.antimicrobialConsultationRequired ?? false)
  const [antimicrobialEmergencyAllowed, setAntimicrobialEmergencyAllowed] = useState(
    initial?.antimicrobialEmergencyAllowed ?? false)
  const [skinTestRequired, setSkinTestRequired] = useState(initial?.skinTestRequired ?? false)
  const [defaultFrequency, setDefaultFrequency] = useState(initial?.defaultFrequency ?? '')
  const [defaultRoute, setDefaultRoute] = useState(initial?.defaultRoute ?? '')
  const [preparationSpec, setPreparationSpec] = useState(initial?.preparationSpec ?? '')
  const [preparationUnit, setPreparationUnit] = useState(initial?.preparationUnit ?? '')
  const [strengthValue, setStrengthValue] = useState(initial?.strengthValue ? String(initial.strengthValue) : '')
  const [strengthUnit, setStrengthUnit] = useState(initial?.strengthUnit ?? '')
  const [defaultDoseUnit, setDefaultDoseUnit] = useState(initial?.defaultDoseUnit ?? '')
  const [specTouched, setSpecTouched] = useState(Boolean(initial?.preparationSpec))

  const western = medicationType === 'WESTERN'
  const chinesePatent = medicationType === 'CHINESE_PATENT'
  const herbal = medicationType === 'HERBAL'
  const vaccine = medicationType === 'VACCINE'
  const knownType = western || chinesePatent || herbal || vaccine
  const typeName = dictionaries.BD_MEDICATION_TYPE.find((item) => item.code === medicationType)?.name ?? medicationType
  const doseFormLabel = herbal ? '饮片 / 颗粒形态' : vaccine ? '疫苗制剂类型' : '剂型'
  const specificationLabel = herbal ? '炮制规格' : vaccine ? '剂量规格' : '制剂规格'
  const unitLabel = herbal ? '调剂单位' : vaccine ? '接种单位' : '制剂单位'
  const typeDescription = western
    ? '维护结构化含量、默认用法及抗菌药、皮试等西药安全属性。'
    : chinesePatent
      ? '维护剂型、含量和默认用法；不展示西药专属的抗菌药等级与皮试属性。'
      : herbal
        ? '维护饮片形态、炮制规格、调剂单位与煎服建议；基原、产地和炮制方法从“类型扩展属性”维护。'
        : vaccine
          ? '维护剂量规格、接种单位、途径与冷链储藏；免疫程序、目标疾病和适龄范围从“类型扩展属性”维护。'
          : '当前药品类型尚未建立维护规则，请先完善类型配置。'

  const generateSpec = (strVal: string, strUnit: string, prepUnit: string) => {
    const val = strVal.trim()
    const su = strUnit.trim()
    const pu = prepUnit.trim()
    if (!val && !su) return ''
    if (val && su && pu) return `${val}${su}/${pu}`
    if (val && su) return `${val}${su}`
    return ''
  }

  const handleStrengthValueChange = (val: string) => {
    setStrengthValue(val)
    if (!specTouched) {
      setPreparationSpec(generateSpec(val, strengthUnit, preparationUnit))
    }
  }

  const handleStrengthUnitChange = (unit: string) => {
    setStrengthUnit(unit)
    if (!specTouched) {
      setPreparationSpec(generateSpec(strengthValue, unit, preparationUnit))
    }
  }

  const handlePreparationUnitChange = (unit: string) => {
    setPreparationUnit(unit)
    if (!specTouched) {
      setPreparationSpec(generateSpec(strengthValue, strengthUnit, unit))
    }
  }

  const doseUnitCandidates = Array.from(new Set([
    strengthUnit?.trim(),
    preparationUnit?.trim(),
    herbal ? 'g' : undefined,
    herbal ? '剂' : undefined,
    vaccine ? '剂' : undefined,
  ].filter(Boolean) as string[]))

  const effectiveDoseUnit = (defaultDoseUnit && doseUnitCandidates.includes(defaultDoseUnit))
    ? defaultDoseUnit
    : (doseUnitCandidates[0] ?? defaultDoseUnit)

  return <DataFormDialog title={value ? '编辑通用药品知识' : initialValue ? '建立本院药品 · 1/2 药品属性' : '新增通用药品知识'} eyebrow="药品知识层" onClose={onClose}
    size="xwide" className="medication-knowledge-dialog"
    description="通用药品知识不包含厂家和价格信息，产品、包装与机构目录在后续层级维护。"
    onSubmit={async (form) => {
      if (api && value?.id) {
        if (!maintenanceQuery.isSuccess) throw new Error('扩展属性尚未加载成功，请重试后保存')
        validateAttributeChanges(maintenanceQuery.data, attrValues)
      }
      const storageType = optionalText(form, 'sdStorageType')
      if (storageType && !dictionaries.BD_STORAGE_TYPE?.some((item) => item.code === storageType)) {
        throw new Error('储藏方式不在当前有效字典中，请重新选择或维护字典')
      }
      await saveAttributes()
      await onSave({ standardSpecificationId: standardId, code: (initial?.code || text(form, 'code')).trim(), name: text(form, 'name'), aliasName: optionalText(form, 'aliasName'),
        sdMedicationType: medicationType, sdDoseForm: standardLocked ? initialValue?.sdDoseForm ?? initial?.sdDoseForm : optionalText(form, 'sdDoseForm'),
        preparationSpec: optionalText(form, 'preparationSpec') || preparationSpec || undefined,
        preparationUnit: optionalText(form, 'preparationUnit') || preparationUnit || undefined,
        strengthValue: herbal ? undefined : (optionalNumber(form, 'strengthValue') ?? (strengthValue ? Number(strengthValue) : undefined)),
        strengthUnit: herbal ? undefined : (optionalText(form, 'strengthUnit') || strengthUnit || undefined),
        sdStorageType: optionalText(form, 'sdStorageType'),
        prescriptionDrug: checked(form, 'prescriptionDrug'), essentialDrug: checked(form, 'essentialDrug'),
        antimicrobial: western && antimicrobial,
        sdAntimicrobialLevel: western && antimicrobial ? antimicrobialLevel : undefined,
        antimicrobialOutpatientAllowed: western && antimicrobial ? antimicrobialOutpatientAllowed : undefined,
        antimicrobialConsultationRequired: western && antimicrobial ? antimicrobialConsultationRequired : undefined,
        antimicrobialEmergencyAllowed: western && antimicrobial ? antimicrobialEmergencyAllowed : undefined,
        antimicrobialMaxDays: western && antimicrobial && antimicrobialOutpatientAllowed
          ? optionalNumber(form, 'antimicrobialMaxDays') : undefined,
        skinTestRequired: western && skinTestRequired,
        skinTestMethod: western && skinTestRequired
          ? optionalText(form, 'skinTestMethod') as MedicationInput['skinTestMethod'] : undefined,
        skinTestSolutionMode: western && skinTestRequired
          ? optionalText(form, 'skinTestSolutionMode') as MedicationInput['skinTestSolutionMode'] : undefined,
        skinTestObservationMinutes: western && skinTestRequired ? optionalNumber(form, 'skinTestObservationMinutes') : undefined,
        skinTestResultValidityHours: western && skinTestRequired ? optionalNumber(form, 'skinTestResultValidityHours') : undefined,
        skinTestInstructions: western && skinTestRequired ? optionalText(form, 'skinTestInstructions') : undefined,
        defaultDose: optionalNumber(form, 'defaultDose'),
        defaultDoseUnit: optionalNumber(form, 'defaultDose') === undefined ? undefined : effectiveDoseUnit || optionalText(form, 'defaultDoseUnit'),
        defaultRoute: defaultRoute || undefined,
        defaultFrequency: vaccine ? undefined : defaultFrequency || undefined,
        chronicDiseaseDrug: (western || chinesePatent) && checked(form, 'chronicDiseaseDrug'),
        singleOrder: checked(form, 'singleOrder'),
        sdStatus: initial?.sdStatus ?? 'ACTIVE' })
      setAttributeProgress('')
    }}>
    {attributeProgress && <Alert tone="warning">{attributeProgress}</Alert>}
    {standardLocked && <Alert tone="info">已关联标准规格 {standardId}，剂型、规格及已定义含量沿用标准目录。默认用量仅用于录入，不代表安全上限。</Alert>}
    <FormSection title="药品身份" description="药品类型决定可维护的业务属性，创建后不可直接修改；类型调整需新建主档并处理替代关系。">
      <FormGrid columns={4}>
        <FormField label="通用药品编码" required><input name="code" defaultValue={initial?.code} disabled={Boolean(value)} readOnly={Boolean(initialValue)}
          placeholder="如 MED_AMOXICILLIN" autoFocus={!value} required /></FormField>
        <FormField label="通用名称" required><input name="name" defaultValue={initial?.name}
          placeholder="录入药品通用名称" required /></FormField>
        <FormField label="别名"><input name="aliasName" defaultValue={initial?.aliasName}
          placeholder="如历史名称或常用简称" /></FormField>
        <FormField label={value ? '药品类型（创建后不可修改）' : '药品类型'} required>
          <StaticSelectControl name="sdMedicationType" value={medicationType}
            onChange={(next) => { setMedicationType(next); if (next !== 'WESTERN') setAntimicrobial(false) }}
            options={dictionaries.BD_MEDICATION_TYPE.map((item) => ({ value: item.code, label: item.name }))}
            placeholder="请选择药品类型" disabled={Boolean(value) || standardLocked} required />
        </FormField>
        <SelectField name="sdDoseForm" label={doseFormLabel} values={dictionaries.BD_DOSE_FORM}
          defaultValue={initialValue?.sdDoseForm ?? initial?.sdDoseForm ?? 'TABLET'} disabled={standardLocked} />
        <FormField className="medication-knowledge-dialog__spec" label={specificationLabel} hint="单方制剂推荐按「含量+单位/制剂单位」自动生成；复合制剂可手动录入（如 400mg:57mg/片、5mg/2.5ml 或 复方）。">
          <div className="master-data-spec-field">
            <input name="preparationSpec" value={preparationSpec} readOnly={standardLocked}
              onChange={(e) => { setPreparationSpec(e.target.value); setSpecTouched(true) }}
              placeholder={herbal ? '如 净制、切片' : vaccine ? '如 0.5ml/支' : '如 500mg/片 或 400mg:57mg/片'} />
            {!standardLocked && !herbal && (strengthValue || strengthUnit) && (
              <Tooltip content="根据当前含量、含量单位与制剂单位重新生成规格">
                <Button variant="secondary" className="master-data-spec-gen-btn"
                  aria-label="根据当前含量重新生成制剂规格"
                  onClick={() => {
                    const gen = generateSpec(strengthValue, strengthUnit, preparationUnit)
                    setPreparationSpec(gen)
                    setSpecTouched(false)
                  }}>
                  <Icon name="refresh" />生成规格
                </Button>
              </Tooltip>
            )}
          </div>
        </FormField>
      </FormGrid>
    </FormSection>
    <FormSection title={`${typeName}属性`} description={typeDescription}>
      <FormGrid columns={4}>
        <FormField label={unitLabel} required={Boolean(initialValue)} hint={value?.products?.length ? '已被厂家产品使用，最小单位禁止修改。' : undefined}><input name="preparationUnit" value={preparationUnit} required={Boolean(initialValue)}
          readOnly={Boolean(value?.products?.length) || standardLocked && Boolean(initialValue?.preparationUnit ?? value?.standardReference?.presentationUnit)}
          onChange={(e) => handlePreparationUnitChange(e.target.value)}
          placeholder={herbal ? 'g、袋' : vaccine ? '支、剂' : '片、粒、支'} /></FormField>
        {!herbal && <><FormField label={vaccine ? '每剂含量' : '结构化含量'}><input name="strengthValue" type="number" min="0" step="any"
          value={strengthValue} readOnly={standardLocked && Boolean(initialValue?.strengthValue ?? value?.strengthValue)} onChange={(e) => handleStrengthValueChange(e.target.value)}
          placeholder={vaccine ? '如 0.5' : '如 500'} /></FormField>
        <FormField label={vaccine ? '每剂含量单位' : '含量单位'}><input name="strengthUnit" value={strengthUnit} readOnly={standardLocked && Boolean(initialValue?.strengthUnit ?? value?.strengthUnit)}
          onChange={(e) => handleStrengthUnitChange(e.target.value)}
          placeholder={vaccine ? 'ml、IU' : 'mg、g、IU'} /></FormField></>}
        <FormField label="默认给药途径"><Select name="defaultRoute" value={defaultRoute}
          onChange={setDefaultRoute} placeholder="请选择给药途径"
          options={routes.map((route) => ({ value: route.code, label: route.name,
            secondaryText: route.code, searchKeywords: [route.code, route.name] }))} /></FormField>
        {!vaccine && <FormField label={herbal ? '默认服用频次' : '默认频次'}><Select name="defaultFrequency"
          value={defaultFrequency} onChange={setDefaultFrequency} placeholder="请选择医嘱频次"
          options={frequencies.map((frequency) => ({ value: frequency.code, label: frequency.name,
            secondaryText: `${frequency.code}${frequency.executionTimes.length ? ` · ${frequency.executionTimes.join('/')}` : ''}` }))} /></FormField>}
        <SelectField name="sdStorageType" label={vaccine ? '冷链 / 储藏方式' : '储藏方式'}
          values={dictionaries.BD_STORAGE_TYPE}
          defaultValue={initial?.sdStorageType} required={false} />
        <FormField label="默认剂量"><input name="defaultDose" type="number" min="0" step="any"
          defaultValue={initial?.defaultDose} placeholder="如 0.5" /></FormField>
        <FormField label="默认剂量单位" hint="严格限制只能从「含量单位」或「制剂单位」中二选一，杜绝脏数据。">
          {doseUnitCandidates.length > 0 ? <Select name="defaultDoseUnit" value={effectiveDoseUnit}
            onChange={setDefaultDoseUnit} searchable={false} clearable={false}
            options={doseUnitCandidates.map((u) => {
                const isStrength = u === strengthUnit?.trim()
                const isPrep = u === preparationUnit?.trim()
                const roleTag = isStrength && isPrep ? '含量/制剂同单位' : isStrength ? '含量单位' : isPrep ? '制剂单位' : '标准单位'
                return { value: u, label: `${u}（${roleTag}）` }
              })} /> : (
            <input name="defaultDoseUnit" value={defaultDoseUnit}
              onChange={(e) => setDefaultDoseUnit(e.target.value)}
              placeholder="请先在上方填写制剂单位或含量单位" />
          )}
        </FormField>
        <Checkboxes title="安全与管理属性" className="span-full">
          <Checkbox name="prescriptionDrug" label="处方药" defaultChecked={initial?.prescriptionDrug ?? true} />
          <Checkbox name="essentialDrug" label="基本药物" defaultChecked={initial?.essentialDrug} />
          {western && <Checkbox name="antimicrobial" label="抗菌药物" checked={antimicrobial}
            onChange={(checkedValue) => setAntimicrobial(checkedValue)} />}
          {western && <Checkbox name="skinTestRequired" label="需要皮试" checked={skinTestRequired}
            onChange={setSkinTestRequired} />}
          {(western || chinesePatent) && <Checkbox name="chronicDiseaseDrug" label="慢病用药" defaultChecked={initial?.chronicDiseaseDrug} />}
          <Checkbox name="singleOrder" label="允许单开" defaultChecked={initial?.singleOrder ?? true} />
        </Checkboxes>
      </FormGrid>
    </FormSection>
    {western && antimicrobial && <FormSection title="抗菌药物临床应用管控"
      description="分级决定医师处方资质与前置审核强度；特殊使用级抗菌药物门诊默认严禁开立。">
      <FormGrid columns={4}>
        <FormField label="抗菌药物管理级别" required><Select name="sdAntimicrobialLevel" value={antimicrobialLevel}
          searchable={false} clearable={false}
          onChange={(next) => {
            setAntimicrobialLevel(next)
            if (next === 'SPECIAL') { setAntimicrobialOutpatientAllowed(false); setAntimicrobialConsultationRequired(true) }
          }} options={dictionaries.BD_ANTIMICROBIAL_LEVEL.map((item) => ({ value: item.code, label: item.name }))} /></FormField>
        <FormField label="门诊单次处方疗程上限 (天)" hint={antimicrobialOutpatientAllowed ? '常规处方最长天数（如 7 天）' : '特殊使用级或非门诊用药不适用'}>
          <input name="antimicrobialMaxDays" type="number" min={1} max={90}
            defaultValue={initial?.antimicrobialMaxDays ?? 7}
            disabled={!antimicrobialOutpatientAllowed}
            placeholder={antimicrobialOutpatientAllowed ? '如 7' : '门诊禁用'} />
        </FormField>
        <FormField className="span-2" label="处方资质要求" hint={
          antimicrobialLevel === 'SPECIAL'
            ? '特殊使用级：副高及以上专业技术职务医师开具，门诊禁止使用，需抗感染专家/药师会诊。'
            : antimicrobialLevel === 'RESTRICTED'
              ? '限制使用级：中级及以上专业技术职务医师开具，门诊按指征慎用。'
              : '非限制使用级：初级及以上职称医师均可开具，门诊临床常用抗菌药物。'
        }>
          <div className="master-data-qualification-field">
            <StatusBadge tone={antimicrobialLevel === 'SPECIAL' ? 'danger' : antimicrobialLevel === 'RESTRICTED' ? 'warning' : 'neutral'}>
              {antimicrobialLevel === 'SPECIAL' ? '副高及以上' : antimicrobialLevel === 'RESTRICTED' ? '中级及以上' : '初级及以上'}
            </StatusBadge>
            <span className="master-data-qualification-field__text">
              {antimicrobialLevel === 'SPECIAL' ? '需会诊审批 · 门诊严禁' : antimicrobialLevel === 'RESTRICTED' ? '门诊按指征慎用' : '门诊临床常用'}
            </span>
          </div>
        </FormField>
        <Checkboxes title="处方准入与审批规则" className="span-full">
          <Checkbox name="antimicrobialOutpatientAllowed" label="允许门诊常规开立" checked={antimicrobialOutpatientAllowed}
            onChange={setAntimicrobialOutpatientAllowed} disabled={antimicrobialLevel === 'SPECIAL'} />
          <Checkbox name="antimicrobialConsultationRequired" label="需专科会诊 / 事前审批"
            checked={antimicrobialConsultationRequired} onChange={setAntimicrobialConsultationRequired}
            disabled={antimicrobialLevel === 'SPECIAL'} />
          <Checkbox name="antimicrobialEmergencyAllowed" label="急危重症允许越级使用 (单日应急)"
            checked={antimicrobialEmergencyAllowed} onChange={setAntimicrobialEmergencyAllowed} />
        </Checkboxes>
      </FormGrid>
    </FormSection>}
    {western && skinTestRequired && <FormSection title="皮试临床执行规则 (敏感试验)"
      description="请明确维护完整方案；方案随医嘱生成快照，皮试执行须与快照一致。">
      <FormGrid columns={4}>
        <StaticSelectField name="skinTestMethod" label="皮试给药方式" defaultValue={initial?.skinTestMethod ?? ''}
          searchable={false} options={[{ value: 'INTRADERMAL', label: '皮内试验' },
            { value: 'PRICK', label: '点刺试验' }, { value: 'OTHER', label: '其他方式' }]} />
        <StaticSelectField name="skinTestSolutionMode" label="皮试液制备方式"
          defaultValue={initial?.skinTestSolutionMode ?? ''} searchable={false}
          options={[{ value: 'DILUTED_SOLUTION', label: '稀释配制皮试液' },
            { value: 'ORIGINAL_SOLUTION', label: '原液直接试验' }]} />
        <FormField label="皮试观察等待时长 (分钟)" required>
          <input name="skinTestObservationMinutes" type="number" min={1} max={120}
            defaultValue={initial?.skinTestObservationMinutes ?? ''} placeholder="如 20" required />
        </FormField>
        <FormField label="阴性结果有效期 (小时)" required>
          <input name="skinTestResultValidityHours" type="number" min={1} max={8760}
            defaultValue={initial?.skinTestResultValidityHours ?? ''} placeholder="如 24" required />
        </FormField>
        <FormField label="皮试液配制浓度与操作要点" className="span-full"><textarea name="skinTestInstructions" rows={2}
          defaultValue={initial?.skinTestInstructions} placeholder="如：稀释配制浓度（如青霉素 500U/ml）、试验推注剂量（0.1ml）、注射部位及阴阳性判定或复试要求" /></FormField>
      </FormGrid>
    </FormSection>}
    {!knownType && <Alert>当前药品类型尚未建立专属模板，本次仅按通用字段维护；请在扩展属性配置中补充类型规则。</Alert>}
    {value?.id && (
      <DynamicItemAttributesSection
        api={api}
        maintenance={maintenanceQuery.data}
        organization={organization}
        values={attrValues}
        onChange={(defId, val) => setAttrValues((prev) => ({ ...prev, [defId]: val }))}
        isLoading={maintenanceQuery.isPending}
        hasError={maintenanceQuery.isError}
        onRetry={() => void maintenanceQuery.refetch()}
      />
    )}
  </DataFormDialog>
}
