import type { Encounter } from '../../../shared/model'
import type { DiagnosticReport, DiagnosticObservation } from '../../../shared/api/diagnosticsApi'
import type { ClinicalAiRecordDraft, ReceptionSceneType } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'

export type { ReceptionSceneType } from '../../../shared/api/clinicalAiApi'

export interface ChronicGroup {
  name: string
  keywords: string[]
  icdPrefixes: string[]
}

export const CHRONIC_GROUPS: ChronicGroup[] = [
  { name: '高血压', keywords: ['高血压'], icdPrefixes: ['I10', 'I11', 'I12', 'I13', 'I15'] },
  { name: '糖尿病', keywords: ['糖尿病'], icdPrefixes: ['E10', 'E11', 'E12', 'E13', 'E14'] },
  { name: '冠心病', keywords: ['冠心病', '冠状动脉粥样硬化', '心绞痛', '心肌缺血'], icdPrefixes: ['I20', 'I25'] },
  { name: '高脂血症', keywords: ['高脂血症', '血脂异常', '高胆固醇血症'], icdPrefixes: ['E78'] },
  { name: '慢性阻塞性肺疾病', keywords: ['慢性阻塞性肺疾病', '慢阻肺', '慢性支气管炎', '肺气肿'], icdPrefixes: ['J41', 'J42', 'J43', 'J44'] },
  { name: '支气管哮喘', keywords: ['支气管哮喘', '哮喘'], icdPrefixes: ['J45'] },
  { name: '高尿酸血症与痛风', keywords: ['高尿酸血症', '痛风'], icdPrefixes: ['E79', 'M10'] },
  { name: '骨质疏松症', keywords: ['骨质疏松'], icdPrefixes: ['M80', 'M81', 'M82'] },
  { name: '慢性心力衰竭', keywords: ['心力衰竭', '心衰'], icdPrefixes: ['I50'] },
  { name: '脑梗死后遗症', keywords: ['脑梗死后遗症', '脑卒中后遗症', '中风后遗症'], icdPrefixes: ['I69'] },
  { name: '慢性肾脏病', keywords: ['慢性肾脏病', '肾功能不全'], icdPrefixes: ['N18'] },
]

export interface ReceptionSceneAssessment {
  scene: ReceptionSceneType
  sceneLabel: string
  badgeTone: 'brand' | 'info' | 'warning' | 'neutral'
  summaryText: string
  matchedConditions: string[]
  reportHighlights: string[]
  selectedReportIds: string[]
  chronicEncounterIds: string[]
}

const DAY = 86_400_000

export function recentHistoryEncounters(encounter: Encounter, history: Encounter[], now = Date.now()) {
  return history.filter((item) => item.id !== encounter.id && item.residentId === encounter.residentId
    && item.status === 'COMPLETED' && Number.isFinite(Date.parse(item.registeredAt))
    && Date.parse(item.registeredAt) >= now - 90 * DAY && Date.parse(item.registeredAt) <= now)
    .sort((a, b) => Date.parse(b.registeredAt) - Date.parse(a.registeredAt)).slice(0, 10)
}

export function isAbnormalObservation(item: DiagnosticObservation): boolean {
  if (item.status === 'CANCELLED') return false
  if (['H', 'HH', 'L', 'LL', 'A', 'AA', 'ABNORMAL', 'POS', 'POSITIVE', 'CRITICAL', 'PANIC']
    .includes(item.interpretationCode?.trim().toUpperCase() ?? '')) return true
  if (/^(阳性|阳性[+＋]|[+＋]{1,4}|positive)$/i.test((item.valueString ?? item.valueCode ?? '').trim())) return true
  if (item.valueNumber == null) return false
  return (item.referenceRangeLow != null && item.valueNumber < item.referenceRangeLow)
    || (item.referenceRangeHigh != null && item.valueNumber > item.referenceRangeHigh)
}

function conditionsFromText(text: string): string[] {
  // A negative clause (including a list such as 否认高血压、糖尿病) is not a diagnosis.
  const positive = text.split(/[，。；;\n]/).filter((part) => !/(否认|无|未患|排除|待排|疑似|家族史|父亲|母亲)/.test(part)).join('；')
  return CHRONIC_GROUPS.filter((group) => group.keywords.some((word) => positive.includes(word))).map((group) => group.name)
}

function conditionsFromDiagnoses(diagnoses: DiagnosisInput[]): string[] {
  return diagnoses.flatMap((diagnosis) => {
    const code = diagnosis.code.trim().toUpperCase()
    return CHRONIC_GROUPS.filter((group) => group.icdPrefixes.some((prefix) => code.startsWith(prefix))
      || group.keywords.some((word) => diagnosis.display.includes(word))).map((group) => group.name)
  })
}

export function assessReceptionScene({ encounter, historyEncounters = [], diagnosticReports = [], currentDraft,
  now = Date.now(),
}: { encounter: Encounter; historyEncounters?: Encounter[]; diagnosticReports?: DiagnosticReport[];
  currentDraft?: Partial<ClinicalAiRecordDraft> & { diagnoses?: DiagnosisInput[] }; now?: number }): ReceptionSceneAssessment {
  const history = recentHistoryEncounters(encounter, historyEncounters, now)
  const recentIds = new Set(history.filter((item) => Date.parse(item.registeredAt) >= now - 14 * DAY).map((item) => item.id))
  const replaced = new Set(diagnosticReports.map((report) => report.replacesReportId).filter(Boolean))
  const eligibleReports = diagnosticReports.filter((report) => report.residentId === encounter.residentId
    && (report.encounterId === encounter.id || recentIds.has(report.encounterId))
    && ['FINAL', 'CORRECTED'].includes(report.status) && !replaced.has(report.id)
    && !diagnosticReports.some((other) => other.requestId === report.requestId
      && other.reportCode === report.reportCode && other.reportVersion > report.reportVersion))
    .sort((a, b) => Date.parse(b.issuedAt) - Date.parse(a.issuedAt)).slice(0, 50)
  const reportHighlights = eligibleReports.flatMap((report) => report.observations.filter(isAbnormalObservation).map((obs) => {
    const direction = obs.valueNumber != null && obs.referenceRangeHigh != null && obs.valueNumber > obs.referenceRangeHigh ? ' ↑'
      : obs.valueNumber != null && obs.referenceRangeLow != null && obs.valueNumber < obs.referenceRangeLow ? ' ↓' : ' 异常'
    return `${report.reportName}：${obs.observationName} ${obs.valueNumber ?? obs.valueString ?? obs.valueCode ?? ''}${obs.unitCode ?? ''}${direction}`
  }))
  const chief = currentDraft?.chiefComplaint || encounter.chiefComplaint || ''
  const intent = [chief, currentDraft?.presentIllness].filter(Boolean).join('；')
  const reportIntent = /(看|咨询|解读|复核).{0,8}(报告|结果|化验单)|(报告|结果).{0,8}(回诊|复诊|咨询)/.test(intent)
  const chronicEncounterIds = history.filter((item) => conditionsFromDiagnoses(item.diagnoses ?? []).length).map((item) => item.id)
  const matchedConditions = [...new Set([
    ...history.flatMap((item) => conditionsFromDiagnoses(item.diagnoses ?? [])),
    ...conditionsFromDiagnoses(currentDraft?.diagnoses ?? encounter.diagnoses ?? []),
    ...conditionsFromText([chief, currentDraft?.medicalHistory].filter(Boolean).join('；')),
  ])]
  const shared = { matchedConditions, chronicEncounterIds, reportHighlights: reportHighlights.slice(0, 5),
    selectedReportIds: eligibleReports.map((report) => report.id) }
  if (eligibleReports.length && (reportHighlights.length || reportIntent)) return {
    ...shared, scene: 'REPORT_FOLLOW_UP', sceneLabel: '报告回诊', badgeTone: 'warning',
    summaryText: `关联 ${eligibleReports.length} 份报告（${[...new Set(eligibleReports.map((r) => r.reportName))].join('、')}），${reportHighlights.length} 项异常需核对。`,
  }
  const refillIntent = /(复诊|配药|续方|开药|慢病随访)/.test(intent)
  const newSymptoms = /(发热|咳嗽|胸痛|胸闷|呼吸困难|腹痛|头痛|头晕|呕吐|外伤|急性|加重|新发)/.test(
    intent.split(/[，。；;\n]/).filter((part) => !/(无|否认|未见)/.test(part)).join('；'))
  if (matchedConditions.length && !newSymptoms && (refillIntent || chronicEncounterIds.length > 0)) return {
    ...shared, scene: 'CHRONIC_REFILL', sceneLabel: '慢病复诊配药', badgeTone: 'info',
    summaryText: `近90天病史提示${matchedConditions.join('、')}；请核对本次复诊范围、控制情况与历史用药。`,
  }
  return { ...shared, scene: 'FIRST_VISIT', sceneLabel: '初诊全科接诊', badgeTone: 'brand',
    summaryText: newSymptoms ? '优先评估本次新发症状，补齐问诊、鉴别诊断与检查建议。'
      : '按常规接诊准备问诊要点与诊断建议，可手动调整场景。' }
}
