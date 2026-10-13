import type { DiagnosticObservation, DiagnosticReport } from '../../../shared/api/diagnosticsApi'

export type ChronicSafetySeverity = 'CRITICAL' | 'WARNING' | 'SAFE'

export type ChronicSafetyRuleCode =
  | 'HYPERKALEMIA_RISK'
  | 'RENAL_RISK'
  | 'HEPATIC_RISK'
  | 'MONITORING_OVERDUE'
  | 'STABLE_METRICS'

export type LogicalLabIntentCode =
  | 'INTENT_ELECTROLYTES'
  | 'INTENT_RENAL_PANEL'
  | 'INTENT_LIVER_PANEL'
  | 'INTENT_HBA1C'

export interface SuggestedLabRecommendation {
  intentCode: LogicalLabIntentCode
  displayTitle: string
  reason: string
}

export interface ChronicSafetyAlert {
  id: string
  ruleCode: ChronicSafetyRuleCode
  severity: ChronicSafetySeverity
  title: string
  detail: string
  relatedMedication?: string
  relatedObservation?: {
    name: string
    value: string
    unit?: string
    range?: string
    effectiveAt: string
  }
  suggestedAction?: string
}

export interface ChronicSafetyAssessment {
  overallStatus: ChronicSafetySeverity
  alerts: ChronicSafetyAlert[]
  hasCriticalBlockers: boolean
  summary: string
  suggestedLabOrderNames: string[]
  suggestedLabIntents: SuggestedLabRecommendation[]
}

export interface MedicationReferenceItem {
  medicationCode?: string
  medicationName: string
  genericName?: string
  categoryCode?: string
  atcCode?: string
  pharmacologicalClass?: string
}

export interface ChronicSafetyPolicyConfig {
  reportLookbackDays: number
  monitoringOverdueDays: number
  hba1cOverdueDays: number
  hepaticElevationMultiple: number
  renalEgfrThreshold: number
}

export const DEFAULT_CHRONIC_SAFETY_CONFIG: ChronicSafetyPolicyConfig = {
  reportLookbackDays: 90,
  monitoringOverdueDays: 180,
  hba1cOverdueDays: 180,
  hepaticElevationMultiple: 3.0,
  renalEgfrThreshold: 45,
}

const DAY_MS = 86_400_000

// Structured Drug Class Definitions combining ATC, Pharmacological Classes and Common Generic / Brand Names
interface DrugClassDefinition {
  classKey: 'ACEI_ARB' | 'METFORMIN_SGLT2' | 'STATIN' | 'DIABETES_GENERIC' | 'HYPERTENSION_GENERIC'
  atcPrefixes: string[]
  genericKeywords: string[]
  brandNames: string[]
}

const CHRONIC_DRUG_CLASSES: DrugClassDefinition[] = [
  {
    classKey: 'ACEI_ARB',
    // C09A: ACE inhibitors, C09C: ARBs, C09D/C09B: ARB/ACEI combinations with diuretics/CCB, C03DA: Aldosterone antagonists
    atcPrefixes: ['C09A', 'C09B', 'C09C', 'C09D', 'C03DA'],
    genericKeywords: [
      '普利', '沙坦', '螺内酯', '依普利酮', '氨苯蝶啶', '阿米洛利',
      '依那普利', '贝那普利', '福辛普利', '卡托普利', '培哚普利', '雷米普利',
      '氯沙坦', '缬沙坦', '厄贝沙坦', '替米沙坦', '坎地沙坦', '奥美沙坦',
    ],
    brandNames: ['代文', '安博维', '安博诺', '科素亚', '倍博特', '傲坦', '美卡素', '洛汀新'],
  },
  {
    classKey: 'METFORMIN_SGLT2',
    // A10BA: Biguanides, A10BK: SGLT2 inhibitors, A10BD: Oral blood glucose lowering drug combinations
    atcPrefixes: ['A10BA', 'A10BK', 'A10BD'],
    genericKeywords: [
      '二甲双胍', '达格列净', '恩格列净', '卡格列净', '艾托格列净', '恒格列净',
    ],
    brandNames: ['格华止', '安达唐', '欧唐静', '怡可安'],
  },
  {
    classKey: 'STATIN',
    // C10AA: HMG CoA reductase inhibitors, C10BA: HMG CoA reductase inhibitors in combination
    atcPrefixes: ['C10AA', 'C10BA'],
    genericKeywords: [
      '他汀', '阿托伐他汀', '瑞舒伐他汀', '辛伐他汀', '匹伐他汀', '普伐他汀', '氟伐他汀',
    ],
    brandNames: ['立普妥', '可定', '舒降之', '美百乐镇', '冠爽'],
  },
  {
    classKey: 'DIABETES_GENERIC',
    atcPrefixes: ['A10'],
    genericKeywords: [
      '二甲双胍', '格列', '列净', '阿卡波糖', '伏格列波糖', '胰岛素',
      '利拉鲁肽', '司美格鲁肽', '度拉糖肽', '西格列汀', '维格列汀', '沙格列汀',
    ],
    brandNames: ['格华止', '拜唐苹', '安达唐', '欧唐静', '诺和泰', '捷诺维'],
  },
  {
    classKey: 'HYPERTENSION_GENERIC',
    atcPrefixes: ['C02', 'C03', 'C07', 'C08', 'C09'],
    genericKeywords: [
      '地平', '普利', '沙坦', '洛尔', '利尿', '螺内酯', '氢氯噻嗪', '吲达帕胺',
      '硝苯地平', '氨氯地平', '非洛地平', '美托洛尔', '比索洛尔', '卡维地洛',
    ],
    brandNames: ['络活喜', '拜新同', '波依定', '倍他乐克', '康忻', '寿比山'],
  },
]

function matchesDrugClass(item: MedicationReferenceItem, classKey: DrugClassDefinition['classKey']): boolean {
  const def = CHRONIC_DRUG_CLASSES.find((c) => c.classKey === classKey)
  if (!def) return false

  // 1. ATC code match
  if (item.atcCode) {
    const atc = item.atcCode.trim().toUpperCase()
    if (def.atcPrefixes.some((prefix) => atc.startsWith(prefix))) return true
  }

  // 2. Category code or pharmacological class match
  const classText = `${item.categoryCode ?? ''} ${item.pharmacologicalClass ?? ''}`.toUpperCase()
  if (def.atcPrefixes.some((prefix) => classText.includes(prefix))) return true

  // 3. Name & Generic name matching
  const searchStr = `${item.medicationName} ${item.genericName ?? ''}`.toLowerCase()
  if (def.genericKeywords.some((kw) => searchStr.includes(kw.toLowerCase()))) return true
  if (def.brandNames.some((brand) => searchStr.includes(brand.toLowerCase()))) return true

  return false
}

// Helper to extract numeric value cleanly
function getObsNumericValue(obs: DiagnosticObservation): number | undefined {
  if (typeof obs.valueNumber === 'number' && Number.isFinite(obs.valueNumber)) {
    return obs.valueNumber
  }
  if (typeof obs.valueString === 'string') {
    const parsed = Number.parseFloat(obs.valueString)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

// Find observation matching predicate, sorted from newest to oldest
function findRecentObservation(
  reports: DiagnosticReport[],
  matcher: (obs: DiagnosticObservation) => boolean,
  sinceMs: number
): { obs: DiagnosticObservation; report: DiagnosticReport } | undefined {
  const matches: { obs: DiagnosticObservation; report: DiagnosticReport; time: number }[] = []

  for (const report of reports) {
    if (report.status !== 'FINAL' && report.status !== 'CORRECTED') continue
    const reportTime = Date.parse(report.issuedAt)
    if (!Number.isFinite(reportTime) || reportTime < sinceMs) continue

    for (const obs of report.observations) {
      if (obs.status === 'CANCELLED') continue
      if (matcher(obs)) {
        const obsTime = Date.parse(obs.effectiveAt) || reportTime
        matches.push({ obs, report, time: obsTime })
      }
    }
  }

  matches.sort((a, b) => b.time - a.time)
  return matches[0]
}

export function assessChronicMedicationSafety({
  medications,
  reports = [],
  policy = DEFAULT_CHRONIC_SAFETY_CONFIG,
  now = Date.now(),
}: {
  medications: MedicationReferenceItem[]
  reports?: DiagnosticReport[]
  policy?: Partial<ChronicSafetyPolicyConfig>
  now?: number
}): ChronicSafetyAssessment {
  const config: ChronicSafetyPolicyConfig = { ...DEFAULT_CHRONIC_SAFETY_CONFIG, ...policy }
  const alerts: ChronicSafetyAlert[] = []
  const suggestedLabIntents: SuggestedLabRecommendation[] = []

  const lookbackMs = config.reportLookbackDays * DAY_MS
  const overdueMs = config.monitoringOverdueDays * DAY_MS
  const hba1cOverdueMs = config.hba1cOverdueDays * DAY_MS

  // Drug Class Flags based on ATC and comprehensive nomenclature
  const hasAceiOrArb = medications.some((m) => matchesDrugClass(m, 'ACEI_ARB'))
  const hasMetforminOrSglt2 = medications.some((m) => matchesDrugClass(m, 'METFORMIN_SGLT2'))
  const hasStatin = medications.some((m) => matchesDrugClass(m, 'STATIN'))
  const hasDiabetesMed = medications.some((m) => matchesDrugClass(m, 'DIABETES_GENERIC'))
  const hasHypertensionMed = medications.some((m) => matchesDrugClass(m, 'HYPERTENSION_GENERIC'))

  // 1. Hyperkalemia Check (K+) - past reportLookbackDays
  if (hasAceiOrArb) {
    const kMatch = findRecentObservation(
      reports,
      (obs) => {
        const code = obs.observationCode.toUpperCase()
        const name = obs.observationName
        return (code === 'K' || code === 'K+' || code === 'POTASSIUM' || code === 'SERUM_K')
          || (/钾/.test(name) && !/尿/.test(name))
      },
      now - lookbackMs
    )

    if (kMatch) {
      const val = getObsNumericValue(kMatch.obs)
      const hasHighInterpretation = ['H', 'HH', 'CRITICAL', 'PANIC'].includes(
        kMatch.obs.interpretationCode?.toUpperCase() ?? ''
      )
      const exceedsRange = kMatch.obs.referenceRangeHigh != null && val !== undefined
        ? val > kMatch.obs.referenceRangeHigh
        : false

      // Trigger if LIS explicitly marked High/Critical, or if value exceeds report's range (or guideline 5.3)
      const isElevated = val !== undefined && (hasHighInterpretation || exceedsRange || val > 5.3)

      if (isElevated && val !== undefined) {
        const rangeText = kMatch.obs.referenceRangeHigh != null
          ? `${kMatch.obs.referenceRangeLow ?? 3.5}-${kMatch.obs.referenceRangeHigh}`
          : '3.5-5.3'

        alerts.push({
          id: 'alert-k-elevated',
          ruleCode: 'HYPERKALEMIA_RISK',
          severity: 'CRITICAL',
          title: '高钾血症风险警示',
          detail: `近期血清钾检测为 ${val} ${kMatch.obs.unitCode ?? 'mmol/L'}（参考区间 ${rangeText}），合用普利/沙坦类或保钾利尿剂可能加重高钾血症，需警惕恶性心律失常风险。`,
          relatedMedication: medications.find((m) => matchesDrugClass(m, 'ACEI_ARB'))?.medicationName,
          relatedObservation: {
            name: kMatch.obs.observationName,
            value: String(val),
            unit: kMatch.obs.unitCode,
            range: rangeText,
            effectiveAt: kMatch.obs.effectiveAt,
          },
          suggestedAction: '建议复查电解质或调整降压方案',
        })

        suggestedLabIntents.push({
          intentCode: 'INTENT_ELECTROLYTES',
          displayTitle: '血清电解质测定',
          reason: '血钾偏高需复查排查高钾血症',
        })
      }
    }
  }

  // 2. Renal Risk Check (eGFR & Creatinine) - past reportLookbackDays
  if (hasMetforminOrSglt2) {
    const crMatch = findRecentObservation(
      reports,
      (obs) => {
        const code = obs.observationCode.toUpperCase()
        const name = obs.observationName
        return (code === 'CR' || code === 'CREA' || code === 'CREATININE')
          || (/肌酐/.test(name) && !/尿/.test(name))
      },
      now - lookbackMs
    )

    const egfrMatch = findRecentObservation(
      reports,
      (obs) => {
        const code = obs.observationCode.toUpperCase()
        const name = obs.observationName
        return code === 'EGFR' || /肾小球滤过率|egfr/i.test(name)
      },
      now - lookbackMs
    )

    const egfrVal = egfrMatch ? getObsNumericValue(egfrMatch.obs) : undefined
    const crVal = crMatch ? getObsNumericValue(crMatch.obs) : undefined

    const hasEgfrImpaired = egfrVal !== undefined && egfrVal < config.renalEgfrThreshold
    const hasCrHighInterpretation = crMatch?.obs.interpretationCode
      && ['H', 'HH', 'CRITICAL', 'PANIC'].includes(crMatch.obs.interpretationCode.toUpperCase())
    const hasCrExceedsRange = crMatch?.obs.referenceRangeHigh != null && crVal !== undefined
      ? crVal > crMatch.obs.referenceRangeHigh * 1.25
      : false

    const isRenalImpaired = hasEgfrImpaired || hasCrHighInterpretation || hasCrExceedsRange

    if (isRenalImpaired) {
      alerts.push({
        id: 'alert-renal-impaired',
        ruleCode: 'RENAL_RISK',
        severity: 'CRITICAL',
        title: '肾功能减退用药风险',
        detail: egfrVal !== undefined
          ? `近期估算肾小球滤过率 (eGFR) 为 ${egfrVal} mL/min/1.73m² (< ${config.renalEgfrThreshold})，二甲双胍/SGLT2i 需根据肾功能减量或暂停使用。`
          : `近期血肌酐为 ${crVal} ${crMatch?.obs.unitCode ?? 'μmol/L'}（高于参考上限 ${crMatch?.obs.referenceRangeHigh ?? ''}），提示肾功能减退，需评估降糖方案。`,
        relatedMedication: medications.find((m) => matchesDrugClass(m, 'METFORMIN_SGLT2'))?.medicationName,
        relatedObservation: egfrMatch && egfrVal !== undefined ? {
          name: egfrMatch.obs.observationName,
          value: String(egfrVal),
          unit: egfrMatch.obs.unitCode ?? 'mL/min',
          effectiveAt: egfrMatch.obs.effectiveAt,
        } : crMatch && crVal !== undefined ? {
          name: crMatch.obs.observationName,
          value: String(crVal),
          unit: crMatch.obs.unitCode,
          range: `${crMatch.obs.referenceRangeLow ?? ''}-${crMatch.obs.referenceRangeHigh ?? ''}`,
          effectiveAt: crMatch.obs.effectiveAt,
        } : undefined,
        suggestedAction: '建议复查肾功能并评估降糖药剂量',
      })

      suggestedLabIntents.push({
        intentCode: 'INTENT_RENAL_PANEL',
        displayTitle: '肾功能全套 (含eGFR)',
        reason: '肾功能指标异常需评估用药安全性',
      })
    }
  }

  // 3. Hepatic Risk Check (ALT / AST) - past reportLookbackDays
  if (hasStatin) {
    const altMatch = findRecentObservation(
      reports,
      (obs) => {
        const code = obs.observationCode.toUpperCase()
        const name = obs.observationName
        return (code === 'ALT' || code === 'GPT') || /丙氨酸氨基转移酶|谷丙转氨酶/.test(name)
      },
      now - lookbackMs
    )

    if (altMatch) {
      const altVal = getObsNumericValue(altMatch.obs)
      const rangeHigh = altMatch.obs.referenceRangeHigh
      const exceedsMultiple = rangeHigh != null && altVal !== undefined
        ? altVal >= rangeHigh * config.hepaticElevationMultiple
        : altVal !== undefined && altVal >= 150

      if (exceedsMultiple && altVal !== undefined) {
        alerts.push({
          id: 'alert-alt-elevated',
          ruleCode: 'HEPATIC_RISK',
          severity: 'CRITICAL',
          title: '肝酶异常用药警示',
          detail: `近期 ALT 检测为 ${altVal} ${altMatch.obs.unitCode ?? 'U/L'}，超过正常参考上限 ${rangeHigh ?? ''} 的 ${config.hepaticElevationMultiple} 倍，服用他汀类药物存在活动性肝损伤风险，建议暂停或减量。`,
          relatedMedication: medications.find((m) => matchesDrugClass(m, 'STATIN'))?.medicationName,
          relatedObservation: {
            name: altMatch.obs.observationName,
            value: String(altVal),
            unit: altMatch.obs.unitCode,
            range: rangeHigh != null ? `< ${rangeHigh}` : undefined,
            effectiveAt: altMatch.obs.effectiveAt,
          },
          suggestedAction: '建议复查肝功能，必要时调减他汀剂量',
        })

        suggestedLabIntents.push({
          intentCode: 'INTENT_LIVER_PANEL',
          displayTitle: '肝功能常规检测',
          reason: '转氨酶显著偏高需监测肝脏损伤',
        })
      }
    }
  }

  // 4. Monitoring Overdue Reminders (> monitoringOverdueDays)
  if (hasHypertensionMed || hasDiabetesMed) {
    const renalTestRecent = findRecentObservation(
      reports,
      (obs) => /肌酐|尿素|肾功能|egfr/i.test(obs.observationName)
        || ['CR', 'CREA', 'EGFR'].includes(obs.observationCode.toUpperCase()),
      now - overdueMs
    )

    if (!renalTestRecent) {
      alerts.push({
        id: 'alert-renal-overdue',
        ruleCode: 'MONITORING_OVERDUE',
        severity: 'WARNING',
        title: '随访监测超期提示',
        detail: `患者近 ${config.monitoringOverdueDays} 天未见肾功能与电解质化验记录，长期慢病用药建议定期随访监测器官功能。`,
        suggestedAction: '建议开立【肾功能+电解质】随访化验',
      })

      if (!suggestedLabIntents.some((i) => i.intentCode === 'INTENT_RENAL_PANEL')) {
        suggestedLabIntents.push({
          intentCode: 'INTENT_RENAL_PANEL',
          displayTitle: '肾功能+电解质',
          reason: '超期未监测慢病器官功能',
        })
      }
    }
  }

  if (hasDiabetesMed) {
    const hba1cRecent = findRecentObservation(
      reports,
      (obs) => /糖化|hba1c/i.test(obs.observationName) || obs.observationCode.toUpperCase() === 'HBA1C',
      now - hba1cOverdueMs
    )

    if (!hba1cRecent) {
      alerts.push({
        id: 'alert-hba1c-overdue',
        ruleCode: 'MONITORING_OVERDUE',
        severity: 'WARNING',
        title: '糖化血红蛋白超期提示',
        detail: `患者近 ${config.hba1cOverdueDays} 天未查糖化血红蛋白 (HbA1c)，建议本次复查以评估近 3 个月血糖综合达标情况。`,
        suggestedAction: '建议开立【糖化血红蛋白测定】',
      })

      suggestedLabIntents.push({
        intentCode: 'INTENT_HBA1C',
        displayTitle: '糖化血红蛋白 (HbA1c)',
        reason: '超期未监测中长期血糖达标情况',
      })
    }
  }

  // 5. Normal/Stable state
  const hasCritical = alerts.some((a) => a.severity === 'CRITICAL')
  const hasWarning = alerts.some((a) => a.severity === 'WARNING')

  if (!hasCritical && !hasWarning) {
    alerts.push({
      id: 'alert-stable',
      ruleCode: 'STABLE_METRICS',
      severity: 'SAFE',
      title: '指标核查通过',
      detail: '近期相关化验指标处于平稳状态，未发现明显慢病用药禁忌冲突。',
    })
  }

  const overallStatus: ChronicSafetySeverity = hasCritical ? 'CRITICAL' : hasWarning ? 'WARNING' : 'SAFE'
  const summary = hasCritical
    ? `存在 ${alerts.filter((a) => a.severity === 'CRITICAL').length} 项用药高危警示，需医生核实处理`
    : hasWarning
    ? `指标基本平稳，但有 ${alerts.filter((a) => a.severity === 'WARNING').length} 项随访化验超期建议`
    : '近期化验指标平稳，符合慢病安全续方标准'

  return {
    overallStatus,
    alerts,
    hasCriticalBlockers: hasCritical,
    summary,
    suggestedLabOrderNames: Array.from(new Set(suggestedLabIntents.map((i) => i.displayTitle))),
    suggestedLabIntents,
  }
}
