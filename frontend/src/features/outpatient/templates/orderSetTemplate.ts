import {
  outpatientPlanTemplateScopeLabel,
  type CompiledPlanMedicationItem, type CompiledPlanServiceItem, type OutpatientPlanTemplate, type OutpatientPlanTemplateKind,
  type OutpatientPlanTemplateScope, type SaveOutpatientPlanTemplateInput,
} from '../../../shared/api/outpatientPlanTemplatesApi'
import { errorMessage } from '../../../shared/api/httpClient'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'

/** 医生可见的模板类型名称与新建时的一句话说明（docs/architecture/临床模板库融合设计.md 第 7.1.1 节）。 */
export type ClinicalTemplateType = 'PLAN' | 'ORDER_SET' | 'NOTE'
export function templateTypeLabel(type: ClinicalTemplateType): string {
  return type === 'PLAN' ? '诊疗方案' : type === 'ORDER_SET' ? '医嘱组套' : '病历模板'
}
export function templateTypeHint(type: ClinicalTemplateType): string {
  return type === 'PLAN' ? '病历、诊断、医嘱一整套，按诊断推荐'
    : type === 'ORDER_SET' ? '一次开一组药品或检查治疗' : '快速填写病历段落'
}
/** 页签与筛选的固定顺序。 */
export const templateTypeOrder: ClinicalTemplateType[] = ['PLAN', 'ORDER_SET', 'NOTE']

export const templateScopeLabel = outpatientPlanTemplateScopeLabel
export const templateScopeTone = (scope: OutpatientPlanTemplateScope) =>
  scope === 'PERSONAL' ? 'neutral' as const : scope === 'DEPARTMENT' ? 'info' as const : 'success' as const
/** 主数据旧组合的固定标注：全院范围，由医务科维护，医生端只读。 */
export const legacyOrderSetOwnerLabel = '全院 · 由医务科维护'

export const isOrderSetTemplate = (template: Pick<OutpatientPlanTemplate, 'templateKind'>) => template.templateKind === 'ORDER_SET'
/** 缺省按诊疗方案处理（旧响应不带 templateKind）。 */
export const templateKindOf = (template: Pick<OutpatientPlanTemplate, 'templateKind'>): OutpatientPlanTemplateKind =>
  template.templateKind ?? 'PROTOCOL'

function saveErrorText(code: unknown): string | undefined {
  switch (code) {
    case 'ORDER_SET_CONTENT_INVALID': return '医嘱组套只能包含药品和诊疗项目，不能带诊断、任务或病历关联。'
    case 'ORDER_SET_EMPTY': return '医嘱组套至少需要一条药品或诊疗项目。'
    case 'CLINICAL_TEMPLATE_KIND_INVALID': return '模板类型创建后不能修改，请新建所需类型的模板。'
    case 'PLAN_TEMPLATE_EXECUTION_DEPARTMENT_INVALID': return '所选执行科室不可用（已停用、已过期或不属于当前机构），请重新选择。'
    default: return undefined
  }
}

/** 按错误编码给出提示，不依赖后端中文 message；未识别的编码沿用通用错误文案。 */
export function templateSaveErrorMessage(error: unknown): string {
  return saveErrorText((error as { code?: unknown } | null)?.code) ?? errorMessage(error)
}

/** 保存失败时转成带编码提示的 Error，供 useTemplateApplication 等按 Error 展示的调用方使用。 */
export function rethrowTemplateSaveError(error: unknown): never {
  const text = saveErrorText((error as { code?: unknown } | null)?.code)
  if (text) throw new Error(text)
  throw error
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined && field !== null)) as T
}

/** 医嘱草稿药品行 → 组套药品行（只取模板输入需要的字段，行默认勾选）。 */
export function medicationDraftToTemplateItem(draft: MedicationPlanDraft): CompiledPlanMedicationItem {
  const request = draft.request
  if (!request.medicationId?.trim()) throw new Error(`药品“${draft.medicationName}”缺少药品标识，不能存为组套。`)
  return compact({
    medicationId: request.medicationId, catalogItemId: request.catalogItemId, packageId: request.packageId,
    medicationName: draft.medicationName, preparationSpec: draft.preparationSpec,
    doseValue: request.doseValue, doseUnit: request.doseUnit, routeCode: request.routeCode,
    frequencyCode: request.frequencyCode, durationValue: request.durationValue, durationUnit: request.durationUnit,
    quantity: request.quantity, quantityUnit: request.quantityUnit,
    substitutionAllowed: request.substitutionAllowed, selfProvided: request.selfProvided,
    medicationInstruction: request.medicationInstruction?.trim() || undefined,
    priceType: request.priceType, pricingRequired: request.pricingRequired, reason: request.reason,
    defaultSelected: true,
  }) as CompiledPlanMedicationItem
}

/**
 * 医嘱草稿项目行 → 组套项目行。草稿上的执行科室通常是接诊科室的默认值，不写入共享组套，
 * 避免把某个科室固化给其他科室；需要固定执行科室时在临床模板库编辑组套。
 */
export function serviceDraftToTemplateItem(draft: ServicePlanDraft): CompiledPlanServiceItem {
  if (!draft.catalogItemId?.trim() || !draft.itemCode?.trim()) throw new Error(`项目“${draft.itemName}”缺少目录标识，不能存为组套。`)
  return compact({
    catalogItemId: draft.catalogItemId, itemCode: draft.itemCode, itemName: draft.itemName,
    serviceType: draft.serviceType as CompiledPlanServiceItem['serviceType'],
    quantity: draft.quantity, unitCode: draft.unitCode,
    clinicalDescription: draft.clinicalDescription?.trim() || undefined,
    priceType: 'SALE', pricingRequired: true, reason: '门诊诊疗申请', defaultSelected: true,
  }) as CompiledPlanServiceItem
}

/** 把选中的草稿行转换为 ORDER_SET 保存入参；后续校验与回执核对仍由 saveMaintainedPlan 完成。 */
export function draftsToOrderSetInput(medications: MedicationPlanDraft[], services: ServicePlanDraft[],
  meta: { name: string; scopeType: OutpatientPlanTemplateScope; description?: string }): SaveOutpatientPlanTemplateInput {
  return {
    templateKind: 'ORDER_SET', scopeType: meta.scopeType, name: meta.name.trim(),
    description: meta.description?.trim() || undefined, sourceType: 'MANUAL',
    diagnoses: [], tasks: [],
    medications: medications.map(medicationDraftToTemplateItem),
    services: services.map(serviceDraftToTemplateItem),
  }
}

/** 复制为我的：沿用药品与项目内容，去掉行标识，范围改为“我的”。 */
export function copyOrderSetInput(source: OutpatientPlanTemplate): SaveOutpatientPlanTemplateInput {
  return {
    templateKind: 'ORDER_SET', scopeType: 'PERSONAL', name: `${source.name}（副本）`.slice(0, 100),
    description: source.description, sourceType: 'MANUAL', diagnoses: [], tasks: [],
    medications: source.medications.map(({ lineId: _lineId, ...item }) => item as CompiledPlanMedicationItem),
    services: source.services.map(item => ({ ...item })),
  }
}
