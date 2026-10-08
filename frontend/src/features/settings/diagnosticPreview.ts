import type { DiagnosticChargeLine, ExaminationChargePlan, LaboratoryTubePlan } from '../../shared/rhnApi'

function requireChargeLines(lines: DiagnosticChargeLine[]) {
  if (!Array.isArray(lines) || lines.some((line) => !line
    || typeof line.catalogItemId !== 'string' || typeof line.itemName !== 'string'
    || !Number.isFinite(line.quantity) || line.quantity < 0
    || typeof line.separatelyChargeable !== 'boolean'
    || (line.fixedAmount != null && (!Number.isFinite(line.fixedAmount) || line.fixedAmount < 0)))) {
    throw new Error('试算返回的收费明细不完整，请重新试算。')
  }
}

export function requireExaminationPlan(plan: ExaminationChargePlan, serviceId: string) {
  if (!plan || plan.serviceId !== serviceId || !Number.isInteger(plan.siteCount) || plan.siteCount < 0
    || !Number.isInteger(plan.includedSiteCount) || plan.includedSiteCount < 0
    || !Number.isInteger(plan.extraSiteCount) || plan.extraSiteCount < 0) {
    throw new Error('检查试算结果不完整或与当前项目不一致，请重新试算。')
  }
  requireChargeLines(plan.lines)
  return plan
}

export function requireTubePlan(plan: LaboratoryTubePlan) {
  if (!plan || !Array.isArray(plan.groups) || plan.groups.some((group) => !group
    || typeof group.groupCode !== 'string' || !Number.isInteger(group.tubeCount) || group.tubeCount < 0
    || !Array.isArray(group.serviceIds))) {
    throw new Error('分管试算结果不完整，请重新试算。')
  }
  requireChargeLines(plan.chargeLines)
  plan.groups.forEach((group) => requireChargeLines(group.chargeLines))
  return plan
}

export function previewQuantity(raw: string | undefined): number {
  const quantity = raw?.trim() ? Number(raw) : NaN
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('试算数量必须填写大于零的有效数字。')
  return quantity
}

/** fixedAmount is a line total; catalog-priced lines have no amount until actual pricing. */
export function knownChargeTotal(lines: DiagnosticChargeLine[]): number | undefined {
  const billable = lines.filter((line) => line.separatelyChargeable)
  if (billable.some((line) => line.fixedAmount == null)) return undefined
  return billable.reduce((sum, line) => sum + line.fixedAmount!, 0)
}
