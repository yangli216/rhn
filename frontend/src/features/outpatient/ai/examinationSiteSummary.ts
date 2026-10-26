import type { ClinicalAiExaminationSitePlan } from '../../../shared/api/clinicalAiApi'

/**
 * AI 检查候选的一行摘要：已预填部位（上下级推断的标“待核对”）、未对应部位，以及部位全部确定时的预计费用。
 * 没有部位解析结果时为空。
 */
export function examinationSiteSummary(plan: ClinicalAiExaminationSitePlan | null | undefined) {
  if (!plan) return undefined
  const sites = plan.bodySites.map(site => site.requiresReview ? `${site.name}（待核对）` : site.name).join('、')
  const parts = [
    sites && `部位：${sites}`,
    plan.unresolvedSites.length ? `未对应：${plan.unresolvedSites.join('、')}` : '',
    plan.resolution === 'UNRESOLVED' && !plan.unresolvedSites.length ? '请选择检查部位' : '',
    plan.chargePreview?.totalAmount != null ? `预计 ¥${plan.chargePreview.totalAmount.toFixed(2)}` : '',
  ].filter(Boolean)
  return parts.length ? parts.join(' · ') : undefined
}
