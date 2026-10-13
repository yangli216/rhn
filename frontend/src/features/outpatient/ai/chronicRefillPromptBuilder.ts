import type { Encounter } from '../../../shared/model'
import type { ChronicSafetyAssessment } from './chronicSafetyVerification'

export interface ChronicRefillPromptInput {
  encounter: Encounter
  matchedConditions: string[]
  medications: Array<{ medicationName: string; doseAmount?: number; doseUnit?: string; frequencyName?: string }>
  safetyAssessment?: ChronicSafetyAssessment
}

export interface ChronicRefillPromptResult {
  aiFocusPrompt: string
  fallbackChiefComplaint: string
  fallbackPresentIllness: string
}

/**
 * Builds a structured, clinically rich focus prompt for AI record generation,
 * as well as a compliant deterministic fallback for offline/disabled states.
 */
export function buildChronicRefillPrompt({
  encounter,
  matchedConditions,
  medications,
  safetyAssessment,
}: ChronicRefillPromptInput): ChronicRefillPromptResult {
  const conditionStr = matchedConditions.length > 0
    ? matchedConditions.join('、')
    : '慢性病'

  // 1. Vital Signs Evidence
  const vitalsText: string[] = []
  if (encounter.systolic != null && encounter.diastolic != null) {
    vitalsText.push(`本次测血压 ${encounter.systolic}/${encounter.diastolic} mmHg`)
  }

  // 2. Medication Regimen Evidence
  const medSummary = medications.length > 0
    ? `规律口服【${medications.slice(0, 3).map((m) => m.medicationName).join('、')}】等长处方药物治疗`
    : '规律服用既往降压/降糖慢病药物'

  // 3. Safety and Lab Context
  let safetyContext = '近期化验监测指标大致平稳'
  if (safetyAssessment?.hasCriticalBlockers) {
    safetyContext = `近期化验提示注意：${safetyAssessment.alerts.filter((a) => a.severity === 'CRITICAL').map((a) => a.title).join('；')}，需加强随访`
  }

  // 4. Construct AI Focus Prompt
  const aiFocusPrompt = [
    `【慢病复诊规范病历生成指令】`,
    `诊断背景：患者既往明确诊断为【${conditionStr}】。`,
    `用药史：${medSummary}，依从性良好。`,
    vitalsText.length > 0 ? `生命体征：${vitalsText.join('，')}。` : '',
    `化验与安全情况：${safetyContext}。`,
    `本次就诊诉求：患者自诉近期病情控制平稳，无明显不适主诉，要求按原方案续开长期用药。`,
    `请据此生成符合三级医院门诊病历质控规范的主诉与现病史，客观体现既往病程、规律用药遵从性、生命体征及阴性鉴别症状，格式标准严谨。`,
  ].filter(Boolean).join('\n')

  // 5. Construct Deterministic Fallback Draft
  const fallbackChiefComplaint = `${conditionStr}复诊配药`
  const fallbackPresentIllness = [
    `患者既往明确${conditionStr}病史，长期${medSummary}。`,
    vitalsText.length > 0 ? `${vitalsText.join('，')}，` : '',
    `近期无心慌、头晕、胸闷、头痛等特殊不适，病情控制平稳。`,
    `本次慢病门诊复诊，要求遵医嘱原方案续开长期用药。`,
  ].join('')

  return {
    aiFocusPrompt,
    fallbackChiefComplaint,
    fallbackPresentIllness,
  }
}
