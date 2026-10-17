import type { ClinicalAiDraftContext } from '../../../shared/api/clinicalAiApi'
import { canExpandRecord, hasRecordNarrative } from './recordExpansion'

export type CopilotNextStepKind = 'RECORD' | 'DIAGNOSIS' | 'ORDERS'

export interface CopilotNextStep {
  kind: CopilotNextStepKind
  /** Short tag shown on the AI pill. */
  tag: string
  /** One-line hint and the action label shown at the top of the hub. */
  hint: string
  action: string
}

/**
 * The single most useful next AI step for the visit as it stands, so the copilot stays present after the chief
 * complaint expansion without popping anything up. Returns undefined while the short-chief-complaint expansion
 * shortcut is still on offer (it owns that moment) or when nothing is left to suggest.
 * `hasOrders` is undefined when order state is unknown, which skips the order hint rather than guessing.
 */
export function copilotNextStep(
  context: Pick<ClinicalAiDraftContext, 'chiefComplaint' | 'presentIllness' | 'diagnoses'>,
  hasOrders?: boolean,
  scene?: string,
): CopilotNextStep | undefined {
  if (!context.chiefComplaint?.trim() || canExpandRecord(context)) return undefined
  if (!hasRecordNarrative(context)) {
    return { kind: 'RECORD', tag: '补全病历', hint: '主诉已写，现病史等段落还空着', action: 'AI 补全病历' }
  }
  if (context.diagnoses.length === 0) {
    return { kind: 'DIAGNOSIS', tag: '待定诊断', action: 'AI 推荐诊断',
      hint: scene === 'REPORT_FOLLOW_UP' ? '报告已回，可结合结果确认诊断' : '病历已成形，可依据病历推荐诊断' }
  }
  if (hasOrders === false) {
    return { kind: 'ORDERS', tag: '待开医嘱', action: 'AI 推荐医嘱',
      hint: scene === 'REPORT_FOLLOW_UP' ? '依据报告结果，可推荐用药与复查' : '诊断已定，可按诊断推荐药品与检查检验' }
  }
  return undefined
}
