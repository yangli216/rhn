import type { ReceptionSceneAssessment } from './receptionSceneAssessment'

/** Focus text for generating the report follow-up record from the reports the patient brought back. */
export function buildReportFollowUpPrompt(scene: Pick<ReceptionSceneAssessment, 'reportHighlights' | 'followUpOf'>) {
  const earlier = scene.followUpOf?.diagnoses.length ? `上次就诊诊断：${scene.followUpOf.diagnoses.join('、')}。` : ''
  const findings = scene.reportHighlights.length ? `异常结果：${scene.reportHighlights.join('；')}。` : '本次报告未见异常项。'
  return `看检查检验结果复诊。${earlier}${findings}结合报告评估并确认诊断，给出下一步用药或复查建议。`
}
