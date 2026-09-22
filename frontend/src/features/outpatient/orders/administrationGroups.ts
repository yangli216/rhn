import { calculatePackageQuantity, resolveFrequencyTimesPerDay } from './medicationQuantity'
import type { MedicationRequest } from '../../../shared/api/encountersApi'
import type { ActiveOrderFrequency, MedicationKnowledge } from '../../../shared/api/masterDataApi'
import type { MedicationPlanDraft } from './medicationDraft'
import { resolveDispensableOptions } from './dispensableOptions'

export function syncMedicationDraftGroup(
  currentDrafts: MedicationPlanDraft[],
  savedDraft: MedicationPlanDraft,
  frequencyList: ActiveOrderFrequency[],
  medicationsList?: MedicationKnowledge[],
  orgId?: string | number
): MedicationPlanDraft[] {
  const groupKey = savedDraft.administrationGroupKey
  if (!groupKey) {
    return currentDrafts.map((d) => (d.id === savedDraft.id ? savedDraft : d))
  }

  const isInfusionOrGroup = savedDraft.routeExecutionType === 'INFUSION' || Boolean(groupKey)

  return currentDrafts.map((d) => {
    if (d.id === savedDraft.id) {
      return savedDraft
    }
    // 同组药品且是输液/同组
    if (d.administrationGroupKey === groupKey && isInfusionOrGroup) {
      const nextRouteCode = savedDraft.request.routeCode
      const nextRouteName = savedDraft.routeName
      const nextRouteExecType = savedDraft.routeExecutionType
      const nextFrequencyCode = savedDraft.request.frequencyCode
      const nextDurationValue = savedDraft.request.durationValue
      const nextDurationUnit = savedDraft.request.durationUnit

      const oldFreq = resolveFrequencyTimesPerDay(frequencyList, d.request.frequencyCode)
      const newFreq = resolveFrequencyTimesPerDay(frequencyList, nextFrequencyCode)
      const oldDays = Number(d.request.durationValue) || 1
      const newDays = Number(nextDurationValue) || 1
      const ratio = oldFreq !== null && newFreq !== null ? (newFreq * newDays) / (oldFreq * oldDays) : 1
      let recalculatedQuantity = d.request.quantity
      if (!d.quantityManuallySet && ratio > 0 && Math.abs(ratio - 1) > 0.001) {
        recalculatedQuantity = Math.max(1, Math.round(d.request.quantity * ratio))
      }

      // 如果提供了匹配的药品知识库与包装，执行精确规格折算
      if (!d.quantityManuallySet && medicationsList && medicationsList.length > 0) {
        const medKnowledge = medicationsList.find((m) => m.id === d.request.medicationId)
        const options = medKnowledge ? resolveDispensableOptions(medKnowledge, String(orgId || '')) : []
        const pkg = options.find((opt) => opt.itemPackage?.id === d.request.packageId) ?? options[0]
        if (medKnowledge && pkg) {
          const calc = calculatePackageQuantity({
            medication: medKnowledge,
            doseValue: d.request.doseValue,
            doseUnit: d.request.doseUnit,
            frequencyCode: nextFrequencyCode,
            durationValue: nextDurationValue,
            selectedPackage: pkg,
            frequencies: frequencyList,
          })
          if (calc?.quantity) {
            recalculatedQuantity = calc.quantity
          }
        }
      }

      return {
        ...d,
        routeName: nextRouteName,
        routeExecutionType: nextRouteExecType,
        request: {
          ...d.request,
          routeCode: nextRouteCode,
          frequencyCode: nextFrequencyCode,
          durationValue: nextDurationValue,
          durationUnit: nextDurationUnit,
          quantity: recalculatedQuantity,
        }
      }
    }
    return d
  })
}

export function newAdministrationGroupKey() {
  return `draft:${globalThis.crypto.randomUUID()}`
}

export interface AdministrationGroupDetail {
  key: string
  label: string
  medicationNames: string[]
  routeCode?: string
  frequencyCode?: string
  durationValue?: number
  isRequest: boolean
}

export function buildAdministrationGroups(medications: MedicationRequest[], drafts: MedicationPlanDraft[], currentKey?: string) {
  const labels = new Map<string, string>()
  const requestLabels = new Map<string, string>()
  const draftLabels = new Map<string, string>()
  const groupDetails = new Map<string, AdministrationGroupDetail>()
  let sequence = 0

  const labelFor = (key: string, isRequest = false) => {
    let detail = groupDetails.get(key)
    if (!detail) {
      const label = `IV-${String(++sequence).padStart(2, '0')}`
      detail = {
        key,
        label,
        medicationNames: [],
        isRequest,
      }
      groupDetails.set(key, detail)
      labels.set(key, label)
    }
    return detail.label
  }

  medications.filter((value) => value.status !== 'CANCELLED'
    && value.routeExecutionType === 'INFUSION').forEach((value) => {
    const key = `request:${value.parentRequestId || value.id}`
    const label = labelFor(key, true)
    requestLabels.set(value.id, label)
    const detail = groupDetails.get(key)
    if (detail) {
      detail.medicationNames.push(value.itemName || value.medicationName)
      if (!detail.routeCode) detail.routeCode = value.routeCode
      if (!detail.frequencyCode) detail.frequencyCode = value.frequencyCode
      if (!detail.durationValue) detail.durationValue = value.durationValue
    }
  })

  let latestDraftGroupKey: string | undefined
  drafts.filter((value) => value.routeExecutionType === 'INFUSION' && value.administrationGroupKey)
    .forEach((value) => {
      const key = value.administrationGroupKey!
      const label = labelFor(key, false)
      draftLabels.set(value.id, label)
      latestDraftGroupKey = key
      const detail = groupDetails.get(key)
      if (detail) {
        detail.medicationNames.push(value.productName || value.medicationName)
        if (!detail.routeCode) detail.routeCode = value.request.routeCode
        if (!detail.frequencyCode) detail.frequencyCode = value.request.frequencyCode
        if (!detail.durationValue) detail.durationValue = value.request.durationValue
      }
    })

  if (currentKey) labelFor(currentKey, false)

  const existingGroups = [...groupDetails.values()].filter((g) => g.medicationNames.length > 0)

  return {
    requestLabels,
    draftLabels,
    groupDetails,
    existingGroups,
    latestDraftGroupKey,
    options: [...labels.entries()].map(([value, label]) => {
      const detail = groupDetails.get(value)
      const desc = detail && detail.medicationNames.length > 0
        ? `已含: ${detail.medicationNames.slice(0, 2).join('、')}`
        : (value.startsWith('request:') ? '已开立组' : '本次待确认组')
      return {
        value, label, secondaryText: desc, searchKeywords: [label],
      }
    }),
    currentLabel: currentKey ? labels.get(currentKey) : undefined,
  }
}
