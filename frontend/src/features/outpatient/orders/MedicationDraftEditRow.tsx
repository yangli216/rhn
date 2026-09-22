import { useDraftRowInteractions } from './useDraftRowInteractions'
import { resolveFrequencyTimesPerDay } from './medicationQuantity'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useRef, useState } from 'react'
import type { ActiveOrderFrequency } from '../../../shared/api/masterDataApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { SkinTestWorkItem } from '../../../shared/api/treatmentApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { Button, Icon, Popconfirm, Select, StatusBadge } from '../../../shared/ui'
import type { MedicationPlanDraft } from './medicationDraft'
import { formatPackageUnit, resolveExecutingDepartment, formatUnitPrice } from './orderPresentation'
import { newAdministrationGroupKey } from './administrationGroups'
import { OrderTypeBadge } from './OrderRowDecorations'
import { numberValue, continueDraftOnEnter, focusControlAfterSelection } from './orderEditorControls'

export function MedicationDraftEditRow({ value, routeOptions, frequencyOptions, routeExecutionTypes,
  administrationGroupOptions, frequencies, onSave, onCancel, onRemove, onAppendToGroup, currentDept,
  encounter, api, allergies, skinTests }: {
  value: MedicationPlanDraft
  routeOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  frequencyOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  routeExecutionTypes: Map<string, 'NONE' | 'ADMINISTRATION' | 'INFUSION'>
  administrationGroupOptions: Array<{ value: string; label: string; secondaryText: string; searchKeywords: string[] }>
  frequencies?: ActiveOrderFrequency[]
  onSave: (value: MedicationPlanDraft) => void
  onCancel: () => void
  onRemove: () => void
  onAppendToGroup?: (value: MedicationPlanDraft) => void
  currentDept?: string
  encounter?: Encounter
  api?: RhnApi
  allergies?: AllergyIntolerance[]
  skinTests?: { data?: SkinTestWorkItem[] }
}) {
  const [doseValue, setDoseValue] = useState<number | ''>(value.request.doseValue ?? '')
  const [routeCode, setRouteCode] = useState(value.request.routeCode)
  const [frequencyCode, setFrequencyCode] = useState(value.request.frequencyCode)
  const [durationValue, setDurationValue] = useState<number | ''>(value.request.durationValue ?? '')
  const [quantity, setQuantity] = useState(value.request.quantity)
  const [instruction, setInstruction] = useState(value.request.medicationInstruction ?? '')
  const [administrationGroupKey, setAdministrationGroupKey] = useState(value.administrationGroupKey)

  // 皮试与安全核对状态
  const [skinTestExempt, setSkinTestExempt] = useState(Boolean(value.request.skinTestExempt))
  const [skinTestExemptReason, setSkinTestExemptReason] = useState(value.request.skinTestExemptReason ?? '')
  const [exemptEvidenceEventId, setExemptEvidenceEventId] = useState(value.request.exemptEvidenceEventId)
  const [allergyOverrideReason, setAllergyOverrideReason] = useState(value.request.allergyOverrideReason ?? '')

  const executionType = routeExecutionTypes.get(routeCode || '') || value.routeExecutionType
  const valid = Number(doseValue) > 0 && Boolean(routeCode) && Boolean(frequencyCode) && Number(quantity) > 0
  const spec = value.productSpec || value.preparationSpec
  const mfr = value.manufacturerName
  const isManualQuantityRef = useRef(value.quantityManuallySet === true)

  // 药品知识库查询（若当前草稿上未缓存皮试相关字段，异步补充查询）
  const medQuery = useQuery({
    queryKey: ['medicationKnowledge', value.request.medicationId],
    queryFn: async () => {
      if (!api || !encounter || !value.request.medicationId) return null
      const res = await api.masterData.medications(value.medicationName || value.medicationCode, '', 'ACTIVE', encounter.organizationId)
      return res.find((m) => m.id === value.request.medicationId) || res[0] || null
    },
    enabled: Boolean(api && encounter && value.request.medicationId && value.skinTestRequired === undefined),
  })

  const isSkinTest = Boolean(
    value.skinTestRequired ||
    medQuery.data?.skinTestRequired ||
    value.request.skinTestExempt ||
    value.request.skinTestExemptReason
  )

  const recentNegativeSkinTests = useQuery({
    queryKey: ['recentNegativeSkinTests', encounter?.residentId, value.request.medicationId],
    queryFn: () => (isSkinTest && value.request.medicationId && encounter?.residentId && api)
      ? api.treatments.validNegativeSkinTests(
          encounter.residentId,
          value.request.medicationId,
          value.skinTestResultValidityHours ?? medQuery.data?.skinTestResultValidityHours
        )
      : Promise.resolve([]),
    enabled: Boolean(isSkinTest && value.request.medicationId && encounter?.residentId && api),
  })
  const recentNegativeItem = (recentNegativeSkinTests.data ?? [])[0]

  const hasPositiveSkinTest = Boolean(
    (skinTests?.data ?? []).some((item) => item.medicationId === value.request.medicationId && item.status === 'POSITIVE')
  )

  const drugAllergies = useMemo(
    () => (allergies ?? []).filter((allergy) => allergy.assertionType === 'ALLERGY' && allergy.categoryCode === 'DRUG'),
    [allergies]
  )
  const allergenConceptIds = value.allergenConceptIds ?? medQuery.data?.allergenConceptIds
  const isAllergyHit = drugAllergies.some((allergy) => allergy.allergenId
    ? allergenConceptIds?.includes(allergy.allergenId)
    : allergy.substanceCode?.toLowerCase() === value.medicationCode?.toLowerCase())
  const matchedAllergies = drugAllergies.filter((allergy) => allergy.allergenId
    ? allergenConceptIds?.includes(allergy.allergenId)
    : allergy.substanceCode?.toLowerCase() === value.medicationCode?.toLowerCase())
  const hasKnownAllergies = drugAllergies.length > 0

  const isAntimicrobial = Boolean(value.antimicrobial ?? medQuery.data?.antimicrobial)
  const antimicrobialLevelText = value.sdAntimicrobialLevelText || medQuery.data?.sdAntimicrobialLevelText

  const hasSafetyAlert = drugAllergies.length > 0 || isSkinTest || isAntimicrobial

  const recalculateCurrentQuantity = (nextDose: number | '', nextFreq: string, nextDur: number | '') => {
    if (isManualQuantityRef.current) return
    const origDose = Number(value.request.doseValue) || 1
    const origFreq = resolveFrequencyTimesPerDay(frequencies, value.request.frequencyCode)
    const origDur = Number(value.request.durationValue) || 1
    const curDose = Number(nextDose) || origDose
    const curFreq = resolveFrequencyTimesPerDay(frequencies, nextFreq)
    const curDur = Number(nextDur) || origDur
    const doseRatio = curDose / origDose
    if (origFreq === null || curFreq === null) return
    const scheduleRatio = (curFreq * curDur) / (origFreq * origDur)
    const totalRatio = doseRatio * scheduleRatio
    if (totalRatio > 0) {
      setQuantity(Math.max(1, Math.round(value.request.quantity * totalRatio)))
    }
  }

  const hasSavedRef = useRef(false)
  const isRemovingRef = useRef(false)
  const isAppendingRef = useRef(false)
  const getUpdatedDraft = (): MedicationPlanDraft => ({
    ...value,
    quantityManuallySet: isManualQuantityRef.current,
    productSpec: spec,
    manufacturerName: mfr,
    administrationGroupKey,
    routeName: routesDataName(routeCode),
    routeExecutionType: executionType,
    skinTestRequired: isSkinTest,
    antimicrobial: isAntimicrobial,
    sdAntimicrobialLevelText: antimicrobialLevelText,
    allergenConceptIds,
    request: {
      ...value.request,
      doseValue: Number(doseValue),
      routeCode,
      frequencyCode,
      durationValue: durationValue === '' ? undefined : Number(durationValue),
      quantity: Number(quantity),
      medicationInstruction: instruction.trim(),
      skinTestExempt,
      skinTestExemptReason: skinTestExempt
        ? (skinTestExemptReason.trim() || '周期内已有阴性结果（有效时间内）')
        : undefined,
      exemptEvidenceEventId: skinTestExempt ? exemptEvidenceEventId : undefined,
      allergyOverrideReason: allergyOverrideReason.trim() || undefined,
    },
  })

  const save = () => {
    if (hasSavedRef.current || isRemovingRef.current || isAppendingRef.current) return
    hasSavedRef.current = true
    if (valid) {
      onSave(getUpdatedDraft())
    } else {
      onCancel()
    }
  }

  const handleAppendToGroup = () => {
    if (hasSavedRef.current || isRemovingRef.current) return
    hasSavedRef.current = true
    const updated = getUpdatedDraft()
    onSave(updated)
    onAppendToGroup?.(updated)
  }

  function routesDataName(code?: string) {
    if (!code) return ''
    return routeOptions.find((item) => item.value === code)?.label ?? code
  }

  const { rowRef, handleBlur, handleKeyDown } = useDraftRowInteractions({
    save,
    cancel: () => { hasSavedRef.current = true; onCancel() },
    ignoreInteraction: () => isRemovingRef.current || isAppendingRef.current,
  })

  return (
    <div
      ref={rowRef}
      className="doctor-unified-draft-editor-wrap"
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    >
      <div
        className="doctor-unified-inline-composer is-draft-editor"
        role="row"
        aria-label={`编辑待确认医嘱 ${value.medicationName}`}
      >
        <div className="doctor-inline-order-static-type">
          <OrderTypeBadge type={value.editorMode === 'herbal' ? 'HERBAL' : value.categoryCode} />
        </div>
        <div
          className="doctor-inline-order-static-resource"
          title={`${value.productName || value.medicationName}${spec ? ` (${spec})` : ''}${mfr ? ` · ${mfr}` : ''}`}
        >
          <div className="doctor-draft-edit-resource-wrap">
            {(executionType === 'INFUSION' || Boolean(administrationGroupKey)) && (
              <div className="doctor-draft-group-selector">
                <Select
                  id={`draft-group-${value.id}`}
                  aria-label="编辑输液分组"
                  value={administrationGroupKey || ''}
                  clearable={false}
                  searchable={false}
                  options={[{ value: '__NEW__', label: '新组' }, ...administrationGroupOptions]}
                  onChange={(next) => setAdministrationGroupKey(next === '__NEW__' ? newAdministrationGroupKey() : next)}
                  onSelectionCommit={() => focusControlAfterSelection(`draft-frequency-${value.id}`)}
                />
              </div>
            )}
            <div className="doctor-draft-resource-text">
              <strong>{value.productName || value.medicationName}</strong>
              {(spec || mfr) && (
                <div className="doctor-unified-order-subtext">
                  {spec && <span>{spec}</span>}
                  {spec && mfr && <span className="doctor-subtext-divider">/</span>}
                  {mfr && <span>{mfr}</span>}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="doctor-inline-order-directions-group">
          <div className="doctor-inline-order-field doctor-inline-order-dose">
            <div className="doctor-entry-input-unit">
              <input
                id={`draft-dose-${value.id}`}
                aria-label="编辑单次剂量"
                type="number"
                min="0"
                step="0.01"
                autoFocus
                value={doseValue}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const next = numberValue(event.target.value)
                  setDoseValue(next)
                  recalculateCurrentQuantity(next, frequencyCode || '', durationValue)
                }}
                onKeyDown={(event) => continueDraftOnEnter(event, `draft-route-${value.id}`)}
              />
              <small>{value.request.doseUnit}</small>
            </div>
          </div>
          <div className="doctor-inline-order-field doctor-inline-order-route">
            <Select
              id={`draft-route-${value.id}`}
              aria-label="编辑给药途径"
              value={routeCode}
              openOnFocus
              onChange={(next) => {
                setRouteCode(next)
                if (routeExecutionTypes.get(next) === 'INFUSION' && !administrationGroupKey) {
                  setAdministrationGroupKey(newAdministrationGroupKey())
                }
              }}
              onSelectionCommit={() => focusControlAfterSelection(`draft-frequency-${value.id}`)}
              showValue
              placeholder="途径"
              options={routeOptions}
            />
          </div>
          <div className="doctor-inline-order-field doctor-inline-order-frequency">
            <Select
              id={`draft-frequency-${value.id}`}
              aria-label="编辑频次"
              value={frequencyCode}
              openOnFocus
              onChange={(next) => {
                setFrequencyCode(next)
                recalculateCurrentQuantity(doseValue, next, durationValue)
              }}
              onSelectionCommit={() => focusControlAfterSelection(`draft-duration-${value.id}`)}
              showValue
              placeholder="频次"
              options={frequencyOptions}
            />
          </div>
          <div className="doctor-inline-order-field doctor-inline-order-duration">
            <div className="doctor-entry-input-unit">
              <input
                id={`draft-duration-${value.id}`}
                aria-label="编辑疗程"
                type="number"
                min="1"
                value={durationValue}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                  const next = numberValue(event.target.value)
                  setDurationValue(next)
                  recalculateCurrentQuantity(doseValue, frequencyCode || '', next)
                }}
                onKeyDown={(event) => continueDraftOnEnter(event, `draft-quantity-${value.id}`)}
              />
              <small>{value.request.durationUnit || '天'}</small>
            </div>
          </div>
        </div>
        <div className="doctor-inline-order-field doctor-inline-order-quantity">
          <div className="doctor-entry-input-unit">
            <input
              id={`draft-quantity-${value.id}`}
              aria-label="编辑总量"
              type="number"
              min="0.01"
              step="0.01"
              value={quantity}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                isManualQuantityRef.current = true
                setQuantity(Number(event.target.value))
              }}
              onKeyDown={(event) => continueDraftOnEnter(event, `draft-instruction-${value.id}`)}
            />
            <small>{formatPackageUnit(undefined, value.request.quantityUnit)}</small>
          </div>
        </div>
        <div className="doctor-inline-order-static doctor-inline-order-dept">
          <span className="doctor-direction-chip is-dept">
            {resolveExecutingDepartment(
              {
                kind: 'medication',
                type: value.categoryCode,
                stockSiteName: value.stockSiteName,
              },
              currentDept
            )}
          </span>
        </div>
        <div className="doctor-inline-order-field doctor-inline-order-instruction">
          <input
            id={`draft-instruction-${value.id}`}
            aria-label="编辑用药嘱托"
            value={instruction}
            placeholder="用药嘱托"
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setInstruction(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
                event.preventDefault()
                save()
              }
            }}
          />
        </div>
        <div className="doctor-inline-order-static doctor-inline-order-price">
          {formatUnitPrice(value.unitPrice, value.currencyCode)}
        </div>
        <div className="doctor-inline-order-status">
          <StatusBadge tone="warning">编辑中</StatusBadge>
        </div>
        <div className="doctor-inline-order-actions">
          {(executionType === 'INFUSION' || Boolean(administrationGroupKey)) && onAppendToGroup && (
            <Button
              size="sm"
              variant="secondary"
              onMouseDown={() => {
                isAppendingRef.current = true
              }}
              onClick={handleAppendToGroup}
              title="向该输液组追加药品"
            >
              + 同组
            </Button>
          )}
          <Popconfirm
            title={`确认移除“${value.productName || value.medicationName || '该药品'}”？`}
            okText="移除"
            okVariant="danger"
            onConfirm={onRemove}
          >
            <Button
              size="sm"
              variant="text"
              onMouseDown={() => {
                isRemovingRef.current = true
              }}
            >
              移除
            </Button>
          </Popconfirm>
        </div>
      </div>

      {hasSafetyAlert && (
        <div className="doctor-unified-order-subrow doctor-unified-order-safety is-warning is-compact" role="row">
          <div className="doctor-safety-content is-compact">
            <span className="doctor-safety-badge-title">用药风险提醒：</span>
            {isAllergyHit && (
              <span className="doctor-safety-tag is-danger">
                <Icon name="warning" /> 命中患者药物过敏：{matchedAllergies.map((item) => item.substanceDisplay).join('、')}
              </span>
            )}
            {!isAllergyHit && hasKnownAllergies && (
              <span className="doctor-safety-tag is-warning">
                患者既往药物过敏：{drugAllergies.map((item) => item.substanceDisplay).join('、')}
              </span>
            )}
            {isSkinTest && (
              <span
                className={`doctor-safety-tag ${hasPositiveSkinTest ? 'is-danger' : skinTestExempt ? 'is-exempt' : 'is-skintest'}`}
              >
                <Icon name={hasPositiveSkinTest ? 'warning' : 'info'} />
                {hasPositiveSkinTest
                  ? '严正警示：患者当前药品皮试结果为【阳性】，禁止开立！'
                  : skinTestExempt
                  ? `已免做皮试：${skinTestExemptReason || '符合免试规则'}`
                  : '需皮试药品（默认派发皮试任务）'}
              </span>
            )}
            {isSkinTest && !hasPositiveSkinTest && (
              <div className="doctor-skintest-exempt-inline">
                {recentNegativeItem && !skinTestExempt && (
                  <span className="doctor-skintest-evidence-inline">
                    <span className="doctor-evidence-badge">历史阴性</span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSkinTestExempt(true)
                        setSkinTestExemptReason(`周期内皮试阴性有效（引用记录 #${recentNegativeItem.eventId}）`)
                        setExemptEvidenceEventId(recentNegativeItem.eventId)
                      }}
                    >
                      一键引用免试
                    </Button>
                  </span>
                )}
                <label className="doctor-exempt-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(skinTestExempt)}
                    onChange={(e) => {
                      const checked = e.target.checked
                      setSkinTestExempt(checked)
                      if (checked) {
                        setSkinTestExemptReason((curr) => curr || '周期内已有阴性结果（有效时间内）')
                      } else {
                        setSkinTestExemptReason('')
                        setExemptEvidenceEventId(undefined)
                      }
                    }}
                  />
                  <span>免做皮试</span>
                </label>
                {skinTestExempt && (
                  <div className="doctor-exempt-reason-select">
                    <Select
                      value={skinTestExemptReason || '周期内已有阴性结果（有效时间内）'}
                      options={[
                        { value: '周期内已有阴性结果（有效时间内）', label: '周期内已有阴性结果（有效时间内）' },
                        { value: '同批号连续用药', label: '同批号连续用药' },
                        { value: '外院有效皮试结果证明', label: '外院有效皮试结果证明' },
                        { value: '患者既往近期规则耐受使用', label: '患者既往近期规则耐受使用' },
                        { value: '其他临床裁量免试', label: '其他临床裁量免试' },
                      ]}
                      searchable={false}
                      clearable={false}
                      onChange={(val) => setSkinTestExemptReason(val)}
                    />
                  </div>
                )}
              </div>
            )}
            {isAntimicrobial && (
              <span className="doctor-safety-tag is-antimicrobial">
                抗菌药物{antimicrobialLevelText ? ` · ${antimicrobialLevelText}` : ''}
              </span>
            )}
            {isAllergyHit && (
              <input
                aria-label="继续开立理由"
                value={allergyOverrideReason}
                placeholder="命中已知过敏，请输入继续开立理由"
                onChange={(event) => setAllergyOverrideReason(event.target.value)}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
