import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'
import type { MedicationRequest, ServiceRequest } from '../../../shared/api/encountersApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from './medicationDraft'
import { clinicalAiTreatmentKey, type AiOrderReviewCommand, type ServicePlanDraft } from './orderDraftTypes'
import { resolveDispensableOptions } from './dispensableOptions'
import { calculatePackageQuantity } from './medicationQuantity'

// Resolve a one-shot AI command against the live catalog before adding editable drafts.
export function useAiOrderReview({ encounter, busy, readOnly, aiOrderReview, api,
  onAiOrderReviewConsumed, onAiOrdersPrepared, medicationDrafts, serviceDrafts, medications, services,
  allergies, setMedicationDrafts, setServiceDrafts, setValidationError, setSuccessToast }: {
  encounter: Encounter
  busy: boolean
  readOnly: boolean
  aiOrderReview?: AiOrderReviewCommand | null
  api: RhnApi
  onAiOrderReviewConsumed?: () => void
  onAiOrdersPrepared?: () => void
  medicationDrafts: MedicationPlanDraft[]
  serviceDrafts: ServicePlanDraft[]
  medications: MedicationRequest[]
  services: ServiceRequest[]
  allergies: AllergyIntolerance[]
  setMedicationDrafts: Dispatch<SetStateAction<MedicationPlanDraft[]>>
  setServiceDrafts: Dispatch<SetStateAction<ServicePlanDraft[]>>
  setValidationError: (message: string) => void
  setSuccessToast: (message: string) => void
}) {
  const reviewState = useRef({ encounterId: encounter.id, busy, readOnly, onAiOrderReviewConsumed, onAiOrdersPrepared,
    medicationDrafts, serviceDrafts, medications, services, allergies })
  reviewState.current = { encounterId: encounter.id, busy, readOnly, onAiOrderReviewConsumed, onAiOrdersPrepared,
    medicationDrafts, serviceDrafts, medications, services, allergies }
  useEffect(() => {
    if (!aiOrderReview || aiOrderReview.encounterId !== encounter.id) return
    let cancelled = false
    const canReview = () => !cancelled && reviewState.current.encounterId === aiOrderReview.encounterId
      && !reviewState.current.busy && !reviewState.current.readOnly
    if (!canReview()) {
      setValidationError('当前医嘱区正在处理其他操作，请稍后重试。')
      reviewState.current.onAiOrderReviewConsumed?.()
      return
    }
    void (async () => {
      const existing = new Set([
        ...reviewState.current.medicationDrafts.map((value) => `MEDICATION:${value.request.catalogItemId}`),
        ...reviewState.current.serviceDrafts.map((value) => `${value.serviceType}:${value.catalogItemId}`),
        ...reviewState.current.medications.filter((value) => value.status !== 'CANCELLED')
          .map((value) => `MEDICATION:${value.catalogItemId}`),
        ...reviewState.current.services.filter((value) => value.status !== 'CANCELLED')
          .map((value) => `${value.serviceType}:${value.catalogItemId}`),
      ])
      const selected = [...new Map(aiOrderReview.items.map((item) => [clinicalAiTreatmentKey(item), item])).values()]
        .filter((item) => !existing.has(clinicalAiTreatmentKey(item)))
      const resolved = await Promise.all(selected.map(async (item) => {
        if (item.type === 'MEDICATION') {
          const matches = await api.encounters.orderableMedications(encounter.id, item.code)
          const medication = matches.find((value) => String(value.id) === String(item.medicationId)
            && value.products.some((product) => String(product.id) === String(item.catalogItemId))
            && Number(value.availablePackageQuantity) > 0)
          if (!medication) return { item, error: '已不在本次可用药品目录中' }
          const raw = { ...medication,
            products: medication.products.filter((product) => String(product.id) === String(item.catalogItemId)) }
          const options = resolveDispensableOptions(raw, encounter.organizationId)
          const product = item.orderDraft
            ? options.find((option) => option.itemPackage?.id === item.orderDraft?.packageId) : options[0]
          if (!product) return { item, error: '未配置可发药产品、包装或有效价格' }
          const doseValue = Number(item.orderDraft ? item.orderDraft.doseValue : raw.defaultDose)
          const doseUnit = item.orderDraft ? item.orderDraft.doseUnit : raw.defaultDoseUnit || raw.preparationUnit
          const routeCode = item.orderDraft ? item.orderDraft.routeCode : raw.defaultRoute
          const frequencyCode = item.orderDraft ? item.orderDraft.frequencyCode : raw.defaultFrequency
          const durationValue = item.orderDraft?.durationValue
          if (!Number.isFinite(doseValue) || !(doseValue > 0) || !doseUnit?.trim() || !routeCode || !frequencyCode) {
            return { item, error: '目录缺少默认剂量、途径或频次，请手工检索后补全' }
          }
          const [activeRoutes, activeFrequencies] = await Promise.all([
            api.masterData.activeMedicationRoutes('OUTPATIENT'),
            api.masterData.activeOrderFrequencies(encounter.organizationId, encounter.departmentId, 'OUTPATIENT', 'MEDICATION'),
          ])
          if (!activeRoutes.some((value) => value.code === routeCode)
            || !activeFrequencies.some((value) => value.code === frequencyCode)) {
            return { item, error: '用药途径或频次已失效，请重新选择' }
          }
          if (durationValue !== undefined && (!Number.isFinite(durationValue) || durationValue <= 0)) {
            return { item, error: '用药天数须大于 0' }
          }
          const routeExecutionType = activeRoutes.find((value) => value.code === routeCode)?.executionType
          if (raw.sdMedicationType === 'HERBAL' || routeExecutionType === 'INFUSION') {
            return { item, error: '草药或输液需手工核对剂数、服法或输液分组' }
          }
          const allergyHit = reviewState.current.allergies.some((allergy) => allergy.assertionType === 'ALLERGY'
            && allergy.categoryCode === 'DRUG' && (allergy.allergenId
              ? raw.allergenConceptIds?.includes(allergy.allergenId)
              : allergy.substanceCode?.toLowerCase() === raw.code.toLowerCase()))
          if (allergyHit) return { item, error: '命中已知药物过敏，需手工开立并填写理由' }
          const drugAllergies = reviewState.current.allergies.filter((allergy) => allergy.assertionType === 'ALLERGY'
            && allergy.categoryCode === 'DRUG')
          const allergyReviewRecorded = reviewState.current.allergies.some((allergy) =>
            allergy.assertionType === 'NO_KNOWN_ALLERGY' || allergy.assertionType === 'NO_KNOWN_DRUG_ALLERGY')
            || drugAllergies.length > 0
          const hasSafetyAlert = drugAllergies.length > 0 || Boolean(raw.skinTestRequired || raw.antimicrobial)
          const quantity = item.orderDraft?.quantity ?? calculatePackageQuantity({ medication: raw, doseValue, doseUnit, frequencyCode,
            durationValue, selectedPackage: product, frequencies: activeFrequencies })?.quantity
          if (quantity == null) return { item, error: '当前频次无法自动推算总量，请手动填写开药总量' }
          if (!Number.isFinite(quantity) || quantity <= 0) return { item, error: '请填写有效的开药总量' }
          if (quantity > Number(raw.availablePackageQuantity)) return { item, error: '当前可用库存不足' }
          const draft: MedicationPlanDraft = {
            id: globalThis.crypto.randomUUID(), sequence: Date.now(), editorMode: 'regular',
            quantityManuallySet: item.orderDraft?.quantity != null,
            categoryCode: raw.sdMedicationType, medicationName: raw.name, medicationCode: raw.code,
            preparationSpec: raw.preparationSpec, productName: product.product.name,
            productSpec: product.itemPackage?.packageSpec || product.label,
            manufacturerName: product.product.manufacturerName, unitPrice: product.price,
            currencyCode: product.currencyCode,
            routeName: activeRoutes.find((value) => value.code === routeCode)?.name,
            routeExecutionType,
            stockSiteName: raw.stockSiteName, availablePackageQuantity: raw.availablePackageQuantity,
            packageUnitName: raw.packageUnitName,
            skinTestRequired: Boolean(raw.skinTestRequired),
            skinTestResultValidityHours: raw.skinTestResultValidityHours,
            antimicrobial: Boolean(raw.antimicrobial),
            sdAntimicrobialLevelText: raw.sdAntimicrobialLevelText,
            allergenConceptIds: raw.allergenConceptIds,
            request: { medicationId: raw.id, catalogItemId: product.product.id, packageId: product.itemPackage?.id,
              doseValue, doseUnit, routeCode, frequencyCode, quantity, quantityUnit: product.unitCode,
              durationValue, durationUnit: durationValue === undefined ? undefined : 'd',
              medicationInstruction: item.orderDraft ? item.orderDraft.instruction || undefined : product.product.instruction || undefined,
              substitutionAllowed: true, selfProvided: false,
              allergyReviewConfirmed: allergyReviewRecorded || !hasSafetyAlert,
              priceType: product.priceType, pricingRequired: true, reason: 'AI 治疗建议，待医生核对' },
          }
          return { item, medicationDraft: draft }
        }
        const matches = await api.masterData.searchServices(item.code, item.type, 'ACTIVE', encounter.organizationId, 0, 100)
        const today = new Date().toLocaleDateString('sv-SE')
        const valid = (from?: string, to?: string) => (!from || from <= today) && (!to || to >= today)
        const raw = matches.content.find((value) => String(value.id) === String(item.catalogItemId)
          && value.sdStatus === 'ACTIVE' && value.orderable && ['COMMON', 'OUTPATIENT'].includes(value.sdUsageType)
          && valid(value.validFrom, value.validTo) && value.organizationAdoption?.organizationId === encounter.organizationId
          && value.organizationAdoption.sdStatus === 'ACTIVE' && value.organizationAdoption.orderable
          && value.organizationAdoption.executable && valid(value.organizationAdoption.validFrom, value.organizationAdoption.validTo))
        if (!raw) return { item, error: '已不在本次可用诊疗目录中' }
        const activePrice = raw.prices?.filter((price) => price.sdStatus === 'ACTIVE' && price.sdPriceType === 'SALE'
          && (!price.organizationId || price.organizationId === encounter.organizationId)
          && valid(price.validFrom, price.validTo)).sort((left, right) =>
            Number(Boolean(right.organizationId)) - Number(Boolean(left.organizationId)))[0]
        const quantity = item.orderDraft?.quantity ?? 1
        if (!Number.isFinite(quantity) || quantity <= 0) return { item, error: '请填写有效的项目总量' }
        const serviceDraft: ServicePlanDraft = {
          id: globalThis.crypto.randomUUID(), sequence: Date.now(), serviceType: raw.sdServiceType,
          catalogItemId: raw.id, itemCode: raw.code, itemName: raw.name, quantity, unitCode: raw.unitCode,
          clinicalDescription: item.orderDraft?.instruction ?? (item.rationale || undefined), unitPrice: activePrice?.price,
          currencyCode: activePrice?.currencyCode,
        }
        return { item, serviceDraft }
      }))
      if (!canReview()) return
      const medicationAdditions = resolved.flatMap((value) => value.medicationDraft ? [value.medicationDraft] : [])
      const serviceAdditions = resolved.flatMap((value) => value.serviceDraft ? [value.serviceDraft] : [])
      if (medicationAdditions.length) setMedicationDrafts((current) => [...current, ...medicationAdditions])
      if (serviceAdditions.length) setServiceDrafts((current) => [...current, ...serviceAdditions])
      const acceptedKeys = resolved.filter((value) => value.medicationDraft || value.serviceDraft)
        .map((value) => clinicalAiTreatmentKey(value.item))
      const failures = resolved.filter((value) => value.error)
      if (acceptedKeys.length) {
        setSuccessToast(`已将 ${acceptedKeys.length} 项 AI 建议转为待确认医嘱，可直接逐项编辑或统一审核开立。`)
        aiOrderReview.onCompleted?.(acceptedKeys)
        if (!failures.length) reviewState.current.onAiOrdersPrepared?.()
      }
      setValidationError(failures.length ? failures.map((value) => `${value.item.name}：${value.error}`).join('；') : '')
    })().catch(() => {
      if (canReview()) setValidationError('部分目录读取失败，请重试或在医嘱区检索。')
    }).finally(() => {
      if (!cancelled) reviewState.current.onAiOrderReviewConsumed?.()
    })
    return () => { cancelled = true }
    // The review is a one-shot command. Mutable editor state is checked again after the catalog query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiOrderReview?.id, encounter.id, api])

}
