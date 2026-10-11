export const decisionScenes = {
  ASSISTANT_RECOMMENDATIONS: '辅诊目录核查', PLAN_COMPILATION: '智能建方目录核查', OUTPATIENT_TRIAGE: '预检分诊辅助',
}
export const decisionModes = { DISABLED: '关闭', SHADOW: '旁路观察', ASSIST: '人工辅助' }
export const decisionOutcomes = {
  MODE_DISABLED: '总开关关闭', SCENE_DISABLED: '场景未启用', CONFIGURATION_INCOMPLETE: '配置不完整',
  NOT_TRIGGERED: '尚无持久化触发记录', RECORDED: '已有运行记录', DISABLED: '未启用',
  CANDIDATE_SCOPE_INVALID: '候选范围无效', CANDIDATE_LIMIT: '候选超出上限', NO_INPUT: '资料未采集',
  SHADOW: '旁路完成', APPLIED: '匹配完成', ASSIST: '辅助完成', UNCERTAIN: '存在不确定建议',
  UNCONFIRMED_MATCH: '匹配未确定', DECISION_FAILED: '决策失败', FAILED: '决策失败', UNEXPECTED_ERROR: '异常回退',
}
export const decisionComparisons = { COMPARABLE: '可比较', MANUAL_REVIEW: '原流程需人工核对', NOT_APPLICABLE: '本次不可比较' }
export const decisionVerdicts = { APPROPRIATE: '建议适当', INAPPROPRIATE: '建议不适当', UNCERTAIN: '资料不足／暂无法研判' }
export const medicationEvaluationDecisions = { PASS: '未记录需处理项', WARN: '提醒核对', REQUIRE_OVERRIDE: '需填写理由', BLOCK: '阻止提交', UNAVAILABLE: '不可评价' }
export const labelOf = (labels: Record<string, string>, value?: string | null) => value ? labels[value] ?? value : '—'
export const observationTime = (value?: string | null) => value ? new Date(value).toLocaleString() : '—'
export function observationRange(days = 7) {
  const to = new Date(), from = new Date(to)
  from.setDate(from.getDate() - days + 1)
  const date = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`
  return { from: date(from), to: date(to) }
}
export function observationDates(from: string, to: string) {
  const end = new Date(`${to}T00:00:00`)
  end.setDate(end.getDate() + 1)
  return { from: new Date(`${from}T00:00:00`).toISOString(), to: end.toISOString() }
}
