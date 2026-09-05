import type { ReceptionQueueItem } from '../../../shared/api/schedulingApi'
import type {
  AiPreConsultation,
  EnhancedQueueItem,
  PublicHealthTags,
  QueueCategory,
  ReportSummary,
  TriageLevel,
  VitalsSummary,
} from './queueTypes'

function simpleHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash)
}

function calculateTriage(vitals: VitalsSummary, isEmergency: boolean): { level: TriageLevel; reason?: string } {
  if (isEmergency) {
    return { level: 'LEVEL_1_CRITICAL', reason: '绿色急救通道登记' }
  }
  if (vitals.systolic && vitals.systolic >= 180) {
    return { level: 'LEVEL_1_CRITICAL', reason: `血压危象 (收缩压 ${vitals.systolic} mmHg ≥ 180)` }
  }
  if (vitals.diastolic && vitals.diastolic >= 110) {
    return { level: 'LEVEL_1_CRITICAL', reason: `舒张压危急 (${vitals.diastolic} mmHg ≥ 110)` }
  }
  if (vitals.pulseRate && (vitals.pulseRate > 130 || vitals.pulseRate < 45)) {
    return { level: 'LEVEL_1_CRITICAL', reason: `心率严重异常 (${vitals.pulseRate} 次/分)` }
  }
  if (vitals.spo2 && vitals.spo2 < 93) {
    return { level: 'LEVEL_1_CRITICAL', reason: `血氧饱和度过低 (${vitals.spo2}%)` }
  }
  if (vitals.temperature && vitals.temperature >= 38.5) {
    return { level: 'LEVEL_2_URGENT', reason: `高热 (${vitals.temperature}℃ ≥ 38.5)` }
  }
  if (vitals.systolic && vitals.systolic >= 150) {
    return { level: 'LEVEL_2_URGENT', reason: `血压偏高 (${vitals.systolic}/${vitals.diastolic} mmHg)` }
  }
  return { level: 'LEVEL_3_ROUTINE' }
}

const CLINICAL_PRESETS: Array<{
  ai: AiPreConsultation
  vitals: VitalsSummary
  publicHealth?: PublicHealthTags
  reports?: ReportSummary
  allergies?: string[]
  pastConditions?: string[]
  currentMedications?: string[]
  recentVisits?: string[]
}> = [
  {
    ai: {
      chiefComplaintSummary: '突发枕部搏动性头痛2天，自服降压药控制不佳',
      presentIllnessDraft: '患者于2天前劳累后出现枕部搏动性胀痛，阵发性加重，伴轻度恶心，无喷射性呕吐，无视物旋转。自行口服硝苯地平控释片1片，血压控制欠佳，今为求进一步诊治来院。',
      symptomTags: ['头痛', '恶心', '血压升高'],
      riskFlags: ['高血压危象倾向', '脑血管意外排查'],
    },
    vitals: { systolic: 185, diastolic: 112, temperature: 36.6, pulseRate: 92, spo2: 98 },
    publicHealth: {
      isChronicContracted: true,
      chronicType: 'HYPERTENSION',
      chronicLabel: '原发性高血压III期签约居民',
      followUpOverdue: true,
    },
    reports: {
      totalRequested: 2,
      totalCompleted: 2,
      hasCriticalValue: true,
      hasAbnormalValue: true,
      allReportsReady: true,
      items: [
        { id: 'rep-1', name: '急诊头颅CT平扫', status: 'COMPLETED', summary: '双侧基底节区少许腔隙灶，未见明确急性颅内出血' },
        { id: 'rep-2', name: '急诊电解质五项', status: 'COMPLETED', abnormal: true, critical: true, summary: '血钾 3.1 mmol/L 偏低，钠氯正常' },
      ],
    },
    allergies: ['青霉素类药物过敏（荨麻疹）'],
    pastConditions: ['原发性高血压 6年', '2型糖尿病 3年'],
    currentMedications: ['苯磺酸氨氯地平片 5mg qd', '二甲双胍片 0.5g bid'],
    recentVisits: ['3天前 本院心内科门诊（主诉头晕测压）', '1个月前 社区卫生中心慢病随访'],
  },
  {
    ai: {
      chiefComplaintSummary: '反复咳嗽咳痰4天，伴咽痛低热，无胸痛气促',
      presentIllnessDraft: '患者4天前受凉后出现咳嗽，初为干咳，近2天转为咳黄黏痰，量中等，伴咽部干燥灼痛及低热，最高体温37.8℃，自服板蓝根冲剂无明显好转。',
      symptomTags: ['咳嗽', '黄黏痰', '咽痛', '低热'],
      riskFlags: ['建议查血常规+胸片'],
    },
    vitals: { systolic: 124, diastolic: 78, temperature: 37.4, pulseRate: 78, spo2: 99 },
    publicHealth: {
      isChronicContracted: false,
      followUpOverdue: false,
    },
    allergies: ['头孢克洛过敏'],
    pastConditions: ['过敏性鼻炎 5年'],
    currentMedications: ['氯雷他定片 10mg qn（间断服用）'],
    recentVisits: ['半年前 全科门诊体检'],
  },
  {
    ai: {
      chiefComplaintSummary: '查体发现空腹血糖升高1周，伴口渴多饮',
      presentIllnessDraft: '患者1周前在体检中发现空腹静脉血糖 8.6 mmol/L，近期偶感口干多饮，夜尿由1次增加至2~3次，体重近半年轻度减轻约2kg，无多食易饥。',
      symptomTags: ['血糖升高', '口干多饮', '夜尿增多'],
      riskFlags: ['初发2型糖尿病评估'],
    },
    vitals: { systolic: 132, diastolic: 84, temperature: 36.5, pulseRate: 74, spo2: 98 },
    publicHealth: {
      isChronicContracted: true,
      chronicType: 'DIABETES',
      chronicLabel: '疑似糖尿病签约跟进',
      followUpOverdue: false,
      elderlyExamPending: false,
    },
    reports: {
      totalRequested: 2,
      totalCompleted: 1,
      hasCriticalValue: false,
      hasAbnormalValue: true,
      allReportsReady: false,
      items: [
        { id: 'rep-3', name: '糖化血红蛋白 (HbA1c)', status: 'COMPLETED', abnormal: true, summary: 'HbA1c 7.9% 偏高' },
        { id: 'rep-4', name: '葡萄糖耐量试验 (OGTT)', status: 'PENDING', summary: '标本检验中，预计30分钟出具' },
      ],
    },
    pastConditions: ['脂肪肝 2年'],
    currentMedications: [],
    recentVisits: ['1周前 本中心健康体检'],
  },
  {
    ai: {
      chiefComplaintSummary: '间歇性上腹隐痛不适2周，餐后明显，伴反酸嗳气',
      presentIllnessDraft: '患者2周来无明显诱因反复出现上腹部钝痛，多于进餐后30分钟发生，持续1~2小时逐渐缓解，伴嗳气反酸，无黑便及呕血，饮食尚可。',
      symptomTags: ['上腹痛', '反酸', '餐后痛', '嗳气'],
      riskFlags: ['消化性溃疡待排', 'Hp检查建议'],
    },
    vitals: { systolic: 118, diastolic: 76, temperature: 36.7, pulseRate: 72, spo2: 99 },
    allergies: [],
    pastConditions: ['慢性胃炎 4年'],
    currentMedications: ['奥美拉唑肠溶胶囊 20mg qd'],
    recentVisits: ['1年前 消化内科就诊'],
  },
  {
    ai: {
      chiefComplaintSummary: '劳力性胸闷气短1个月，偶有心前区压榨感',
      presentIllnessDraft: '患者近1月快走或爬楼至3层时出现心前区胸闷、压迫感，伴气短，休息3~5分钟可自行缓解，无肩背部放射痛，无大汗及濒死感。',
      symptomTags: ['劳力性胸闷', '心前区压迫感', '气短'],
      riskFlags: ['冠心病稳定性心绞痛排查', '即刻心电图评估'],
    },
    vitals: { systolic: 148, diastolic: 92, temperature: 36.8, pulseRate: 86, spo2: 97 },
    publicHealth: {
      isChronicContracted: true,
      chronicType: 'MULTIPLE',
      chronicLabel: '冠心病+高血压重点管理居民',
      followUpOverdue: true,
      elderlyExamPending: true,
    },
    reports: {
      totalRequested: 2,
      totalCompleted: 2,
      hasCriticalValue: false,
      hasAbnormalValue: true,
      allReportsReady: true,
      items: [
        { id: 'rep-5', name: '常规12导联心电图', status: 'COMPLETED', abnormal: true, summary: '窦性心律，V4-V6导联ST段轻度水平下移0.05mV，T波低平' },
        { id: 'rep-6', name: '超敏肌钙蛋白I (hs-cTnI)', status: 'COMPLETED', summary: '<0.01 ng/mL 阴性' },
      ],
    },
    allergies: ['磺胺类药物过敏'],
    pastConditions: ['冠心病心绞痛 2年', '高脂血症 5年'],
    currentMedications: ['阿司匹林肠溶片 100mg qd', '阿托伐他汀钙片 20mg qn'],
    recentVisits: ['2周前 心内科门诊配药'],
  },
]

export function enhanceQueueItem(
  rawItem: ReceptionQueueItem,
): EnhancedQueueItem {
  const hash = simpleHash(rawItem.registrationId || rawItem.residentId || rawItem.ticketNo)
  const presetIndex = hash % CLINICAL_PRESETS.length
  const preset = CLINICAL_PRESETS[presetIndex]

  // 计算患者年龄
  const birthYear = rawItem.birthDate ? parseInt(rawItem.birthDate.slice(0, 4), 10) : 1980
  const age = Math.max(1, new Date().getFullYear() - birthYear)

  // 队列分流属性计算
  let queueCategory: QueueCategory = 'INITIAL'
  if (rawItem.status === 'SUSPENDED') {
    queueCategory = 'SUSPENDED'
  } else if (rawItem.status === 'MISSED') {
    queueCategory = 'SKIPPED'
  } else if (rawItem.priority > 0 || age >= 75 || rawItem.registrationSource === 'EMERGENCY' || rawItem.visitType === 'EMERGENCY') {
    queueCategory = 'PRIORITY'
  } else if (rawItem.visitType === 'FOLLOW_UP') {
    queueCategory = 'RETURN_VISIT'
  } else {
    queueCategory = 'INITIAL'
  }

  // 优抚/绿色通道标记
  const isEmergency = rawItem.registrationSource === 'EMERGENCY' || rawItem.visitType === 'EMERGENCY'
  const triage = calculateTriage(preset.vitals, isEmergency)

  // 调度权重得分计算 (值越高，排序越前)
  let queueSortWeight = 1000 - rawItem.sequenceNo
  if (queueCategory === 'PRIORITY') queueSortWeight += 2000
  if (triage.level === 'LEVEL_1_CRITICAL') queueSortWeight += 5000
  if (triage.level === 'LEVEL_2_URGENT') queueSortWeight += 1000
  if (queueCategory === 'RETURN_VISIT' && preset.reports?.allReportsReady) queueSortWeight += 500
  if (queueCategory === 'SKIPPED') queueSortWeight -= 500

  return {
    ...rawItem,
    queueCategory,
    queueSortWeight,
    calledCount: rawItem.callCount ?? 0,
    lastCalledAt: rawItem.calledAt,
    triageLevel: triage.level,
    triageReason: triage.reason,
    vitals: preset.vitals,
    reportSummary: queueCategory === 'RETURN_VISIT' ? (preset.reports ?? {
      totalRequested: 1,
      totalCompleted: 1,
      hasCriticalValue: false,
      hasAbnormalValue: false,
      allReportsReady: true,
      items: [{ id: 'rep-default', name: '常规血检验报告', status: 'COMPLETED', summary: '各项指标在参考范围内' }],
    }) : preset.reports,
    aiPreConsultation: preset.ai,
    publicHealthTags: preset.publicHealth ?? (age >= 65 ? {
      isChronicContracted: true,
      chronicType: 'HYPERTENSION',
      chronicLabel: '65岁以上老年居民体检关怀',
      followUpOverdue: false,
    } : undefined),
    allergies: preset.allergies,
    pastConditions: preset.pastConditions,
    currentMedications: preset.currentMedications,
    recentVisits: preset.recentVisits,
  }
}

export function enhanceQueueList(
  items: ReceptionQueueItem[],
): EnhancedQueueItem[] {
  return items.map(enhanceQueueItem)
}
