import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { OutpatientPlanTemplate, OutpatientPlanTemplateMedication, OutpatientPlanTemplateService } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'

/** 统一模板抽屉的打开用途：决定默认类型、默认勾选的区段。 */
export type TemplatePurpose = 'RECORD' | 'ORDERS' | 'DIAGNOSIS'
export type LibraryKind = 'PLAN' | 'ORDER_SET' | 'NOTE'
export type LibraryKindFilter = 'ALL' | LibraryKind

/** 医嘱录入框检索选中新医嘱组套后，请求抽屉预选该组套；nonce 保证同一组套再次请求也能重新定位。 */
export interface OrderSetPreselect { id: string; nonce: number }

/** 带入预览的三个区：病历、诊断、医嘱。 */
export type PreviewSection = 'record' | 'diagnosis' | 'orders'

export function defaultKindFilter(purpose: TemplatePurpose): LibraryKindFilter {
  return purpose === 'DIAGNOSIS' ? 'PLAN' : 'ALL'
}

/** “全部”视图下按用途排列的类型优先级（也是默认选中项的候选顺序）。 */
export function kindPreference(purpose: TemplatePurpose): LibraryKind[] {
  return purpose === 'RECORD' ? ['NOTE', 'PLAN', 'ORDER_SET']
    : purpose === 'ORDERS' ? ['ORDER_SET', 'PLAN', 'NOTE'] : ['PLAN', 'ORDER_SET', 'NOTE']
}

/** 打开时默认勾选哪些区；其余区可展开后手工勾选。DIAGNOSIS 保持整套带入。 */
export function defaultSections(purpose: TemplatePurpose): Record<PreviewSection, boolean> {
  return purpose === 'RECORD' ? { record: true, diagnosis: false, orders: false }
    : purpose === 'ORDERS' ? { record: false, diagnosis: false, orders: true }
      : { record: true, diagnosis: true, orders: true }
}

export function purposeLabel(purpose: TemplatePurpose) {
  return purpose === 'RECORD' ? '病历书写' : purpose === 'ORDERS' ? '开立医嘱' : '诊断与方案'
}

/** “全部”视图的用途过滤：病历用途只留病历模板与含病历的方案；医嘱用途只留组套与含医嘱的方案。 */
export function planRelevantTo(purpose: TemplatePurpose, plan: Pick<OutpatientPlanTemplate, 'noteTemplateId' | 'medications' | 'services'>) {
  return purpose === 'RECORD' ? Boolean(plan.noteTemplateId)
    : purpose === 'ORDERS' ? plan.medications.length + plan.services.length > 0 : true
}
export function kindRelevantTo(purpose: TemplatePurpose, kind: LibraryKind) {
  return purpose === 'RECORD' ? kind !== 'ORDER_SET' : purpose === 'ORDERS' ? kind !== 'NOTE' : true
}

export const planMedicationKey = (item: Pick<OutpatientPlanTemplateMedication, 'lineId' | 'medicationId'>, index: number) =>
  item.lineId || `${item.medicationId}-${index}`
export const planServiceKey = (item: Pick<OutpatientPlanTemplateService, 'catalogItemId' | 'itemCode'>, index: number) =>
  `${item.catalogItemId || item.itemCode || ''}-${index}`
export const groupMemberKey = (member: { id: string }) => member.id

/** 与当前医嘱草稿比对的重复键：药品 medicationId + catalogItemId，项目 catalogItemId。 */
export const medicationDuplicateKey = (item: { medicationId?: string; catalogItemId?: string }) =>
  `M|${item.medicationId ?? ''}|${item.catalogItemId ?? ''}`
export const serviceDuplicateKey = (item: { catalogItemId?: string }) => `S|${item.catalogItemId ?? ''}`

export function draftOrderKeys(medications: MedicationPlanDraft[], services: ServicePlanDraft[]) {
  return new Set([...medications.map(item => medicationDuplicateKey(item.request)),
    ...services.map(item => serviceDuplicateKey(item))])
}

export const diagnosisCodeSet = (diagnoses: Pick<DiagnosisInput, 'code'>[]) =>
  new Set(diagnoses.map(item => item.code.toUpperCase()))

/** 行级状态：locked 为校验失败（不可勾选），duplicate 为与当前草稿重复（默认不勾选）。 */
export interface RowFlags { duplicate: boolean; lockedReason?: string }

export const rowFailureKey = (kind: LibraryKind, id: string, revision: number, rowKey: string) =>
  `${kind}|${id}|${revision}|${rowKey}`

/**
 * 方案 / 医嘱组套默认勾选：按用途取区，排除“已有”诊断、重复医嘱、已确认失效的行，以及模板设定为不默认勾选的行。
 * 医嘱组套只有医嘱，不受用途影响，医嘱区始终默认勾选。
 */
export function initialPlanChecks(plan: OutpatientPlanTemplate, purpose: TemplatePurpose, diagnoses: DiagnosisInput[],
  draftKeys: ReadonlySet<string>, failures: ReadonlyMap<string, string>) {
  const sections = plan.templateKind === 'ORDER_SET' ? { ...defaultSections(purpose), orders: true } : defaultSections(purpose)
  const existing = diagnosisCodeSet(diagnoses)
  const failed = (key: string) => failures.has(rowFailureKey('PLAN', plan.id, plan.revision, key))
  return {
    diagnoses: new Set(sections.diagnosis ? plan.diagnoses.filter(item => !existing.has(item.code.toUpperCase())).map(item => item.code) : []),
    medications: new Set(sections.orders ? plan.medications
      .map((item, index) => ({ key: planMedicationKey(item, index), item }))
      .filter(({ key, item }) => item.defaultSelected !== false && !draftKeys.has(medicationDuplicateKey(item)) && !failed(key))
      .map(({ key }) => key) : []),
    services: new Set(sections.orders ? plan.services
      .map((item, index) => ({ key: planServiceKey(item, index), item }))
      .filter(({ key, item }) => item.defaultSelected !== false && !draftKeys.has(serviceDuplicateKey(item)) && !failed(key))
      .map(({ key }) => key) : []),
    recordSelected: sections.record,
  }
}

export function initialGroupChecks(group: ItemGroup, draftKeys: ReadonlySet<string>, failures: ReadonlyMap<string, string>) {
  return new Set(group.members
    .filter(member => !draftKeys.has(serviceDuplicateKey(member))
      && !failures.has(rowFailureKey('ORDER_SET', group.id, group.revision, groupMemberKey(member))))
    .map(groupMemberKey))
}

export function groupMatchesKeyword(group: ItemGroup, keyword: string) {
  return group.name.toLowerCase().includes(keyword) || group.code.toLowerCase().includes(keyword)
    || group.members.some(member => member.itemName.toLowerCase().includes(keyword) || member.itemCode.toLowerCase().includes(keyword))
}
