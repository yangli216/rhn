import type { TriageLevel, TriageGreenChannel } from '../../../shared/api/outpatientTriageApi'
import type { IconName } from '../../../shared/ui'

export interface VitalSignAssessment {
  code: string
  name: string
  value: number | string | undefined
  unit: string
  isCritical: boolean
  isWarning: boolean
  alertMessage?: string
}

export interface TriageLevelPresentation {
  level: TriageLevel
  codeName: string
  label: string
  colorName: string
  badgeTone: 'danger' | 'warning' | 'info' | 'success'
  targetResponseMinutes: number
  description: string
  actionAdvice: string
}

export const TRIAGE_LEVEL_DEFINITIONS: Record<TriageLevel, TriageLevelPresentation> = {
  LEVEL_1_CRITICAL: {
    level: 'LEVEL_1_CRITICAL',
    codeName: 'Ⅰ级',
    label: '濒危 (红色)',
    colorName: 'red',
    badgeTone: 'danger',
    targetResponseMinutes: 0,
    description: '生命体征严重异常，意识障碍或处于休克状态，需要即刻进入抢救室或绿色通道实施紧急复苏。',
    actionAdvice: '立即呼叫急诊抢救团队/开通绿色通道，专人平车护送抢救室！',
  },
  LEVEL_2_URGENT: {
    level: 'LEVEL_2_URGENT',
    codeName: 'Ⅱ级',
    label: '危重 (橙色)',
    colorName: 'orange',
    badgeTone: 'warning',
    targetResponseMinutes: 10,
    description: '存在潜在生命危险或严重病情，生命体征不稳定或剧烈疼痛，需优先接诊安排。',
    actionAdvice: '安排10分钟内优先就诊，密切监测生命体征，备好急救设施。',
  },
  LEVEL_3_ROUTINE_URGENT: {
    level: 'LEVEL_3_ROUTINE_URGENT',
    codeName: 'Ⅲ级',
    label: '急症 (黄色)',
    colorName: 'yellow',
    badgeTone: 'info',
    targetResponseMinutes: 30,
    description: '急性发病但生命体征基本平稳，无即刻生命威胁，需尽快安排诊治（建议30分钟内）。',
    actionAdvice: '安排优先就诊队列，等待区护士定时巡视关注病情变化。',
  },
  LEVEL_4_NON_URGENT: {
    level: 'LEVEL_4_NON_URGENT',
    codeName: 'Ⅳ级',
    label: '非急症 (绿色)',
    colorName: 'green',
    badgeTone: 'success',
    targetResponseMinutes: 60,
    description: '生命体征平稳，属于普通门诊、慢性病复诊或轻微症状患者，正常依序就诊。',
    actionAdvice: '普通门诊排队候诊，常规导医指引。',
  },
}

export const COMMON_SYMPTOM_TAGS = [
  { category: '发热感染', tags: ['发热/发烧', '高热(≥38.5℃)', '恶寒发抖', '咽喉肿痛', '鼻塞流涕'] },
  { category: '心脑血管', tags: ['胸闷胸痛', '心前区压榨感', '突发单侧肢体麻木', '口角歪斜', '言语不清', '心慌心悸', '血压剧烈升高'] },
  { category: '呼吸系统', tags: ['咳嗽咳痰', '喘息气促', '呼吸困难', '咳血/咯血', '胸胁胀痛'] },
  { category: '消化急腹', tags: ['急性剧烈腹痛', '上腹部胀痛', '恶心呕吐', '频繁腹泻', '呕血黑便/便血'] },
  { category: '外伤骨科', tags: ['车祸/高处跌伤', '肢体骨折畸形', '活动受限', '关节扭伤肿痛', '头皮裂伤出血'] },
  { category: '神经精神', tags: ['剧烈头痛', '眩晕视物旋转', '突发晕厥/昏倒', '抽搐抽风', '失眠焦虑'] },
  { category: '妇产儿科', tags: ['小儿发热惊厥', '剧烈下腹撕裂痛', '阴道异常流血', '妊娠期腹痛', '乳腺胀痛'] },
  { category: '其他五官', tags: ['皮疹红斑瘙痒', '眼部红肿剧痛', '视力骤降', '鼻衄不止', '急性牙痛'] },
]

export const GREEN_CHANNEL_OPTIONS: Array<{ key: TriageGreenChannel; label: string; icon: IconName; desc: string }> = [
  { key: 'NONE', label: '无通道', icon: 'check', desc: '正常普通分诊' },
  { key: 'CHEST_PAIN', label: '胸痛中心', icon: 'emergency', desc: '疑似急性冠脉综合征、心肌梗死' },
  { key: 'STROKE', label: '脑卒中中心', icon: 'clinical', desc: '疑似急性缺血性/出血性脑卒中' },
  { key: 'TRAUMA', label: '严重创伤中心', icon: 'emergency', desc: '多发伤、复合外伤及严重大出血' },
  { key: 'HIGH_RISK_MATERNAL', label: '高危孕产妇', icon: 'user', desc: '高危产科先兆子痫、胎盘早剥等' },
  { key: 'CRITICAL_CHILD', label: '危重儿童', icon: 'face', desc: '小儿重症肺炎、热性惊厥等' },
  { key: 'MILITARY_PRIORITY', label: '军人及优抚', icon: 'award', desc: '现役军人、残疾军人、优抚对象' },
  { key: 'ELDERLY', label: '高龄失能老人', icon: 'residents', desc: '80岁以上老人及失能弱势群体' },
]

export interface VitalsInputData {
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  systolic?: number
  diastolic?: number
  oxygenSaturation?: number
  bloodGlucose?: number
  painScore?: number
  consciousness?: string
}

export function assessVitals(vitals: VitalsInputData): {
  assessments: VitalSignAssessment[]
  hasCritical: boolean
  hasWarning: boolean
  criticalMessages: string[]
  suggestedLevel: TriageLevel
  suggestedReason: string
} {
  const assessments: VitalSignAssessment[] = []
  const criticalMessages: string[] = []
  let hasCritical = false
  let hasWarning = false

  // 1. 意识状态
  if (vitals.consciousness && vitals.consciousness !== 'ALERT') {
    hasCritical = true
    const text = {
      VOICE: '对言语有反应 (嗜睡/意识不清)',
      PAIN: '对疼痛有反应 (浅昏迷/昏睡)',
      UNRESPONSIVE: '完全无反应 (深度昏迷)',
    }[vitals.consciousness] || '意识障碍'
    criticalMessages.push(`意识异常: ${text}`)
  }

  // 2. 体温
  if (vitals.temperature != null) {
    const t = vitals.temperature
    const isCrit = t >= 40.0 || t < 35.0
    const isWarn = t >= 38.5 || (t >= 37.3 && t < 38.5)
    if (isCrit) {
      hasCritical = true
      criticalMessages.push(`体温超危象 (${t}℃)`)
    } else if (isWarn) {
      hasWarning = true
    }
    assessments.push({
      code: 'temperature',
      name: '体温',
      value: t,
      unit: '℃',
      isCritical: isCrit,
      isWarning: isWarn && !isCrit,
      alertMessage: isCrit ? '超高热或严重体温过低' : (t >= 38.5 ? '高热(≥38.5℃)' : (t >= 37.3 ? '低中热' : undefined)),
    })
  }

  // 3. 收缩压
  if (vitals.systolic != null) {
    const sbp = vitals.systolic
    const isCrit = sbp >= 180 || sbp < 80
    const isWarn = sbp >= 150 && sbp < 180
    if (isCrit) {
      hasCritical = true
      criticalMessages.push(`收缩压严重异常 (${sbp} mmHg)`)
    } else if (isWarn) {
      hasWarning = true
    }
    assessments.push({
      code: 'systolic',
      name: '收缩压',
      value: sbp,
      unit: 'mmHg',
      isCritical: isCrit,
      isWarning: isWarn && !isCrit,
      alertMessage: sbp >= 180 ? '高血压危象(≥180)' : (sbp < 80 ? '低血压休克风险(<80)' : undefined),
    })
  }

  // 4. 舒张压
  if (vitals.diastolic != null) {
    const dbp = vitals.diastolic
    const isCrit = dbp >= 110 || dbp < 50
    const isWarn = dbp >= 95 && dbp < 110
    if (isCrit) {
      hasCritical = true
      criticalMessages.push(`舒张压严重异常 (${dbp} mmHg)`)
    } else if (isWarn) {
      hasWarning = true
    }
    assessments.push({
      code: 'diastolic',
      name: '舒张压',
      value: dbp,
      unit: 'mmHg',
      isCritical: isCrit,
      isWarning: isWarn && !isCrit,
      alertMessage: dbp >= 110 ? '舒张压危象(≥110)' : (dbp < 50 ? '舒张压过低(<50)' : undefined),
    })
  }

  // 5. 心率/脉搏
  if (vitals.pulseRate != null) {
    const p = vitals.pulseRate
    const isCrit = p > 130 || p < 45
    const isWarn = (p > 100 && p <= 130) || (p >= 45 && p < 55)
    if (isCrit) {
      hasCritical = true
      criticalMessages.push(`心率严重异常 (${p} 次/分)`)
    } else if (isWarn) {
      hasWarning = true
    }
    assessments.push({
      code: 'pulseRate',
      name: '脉搏/心率',
      value: p,
      unit: '次/分',
      isCritical: isCrit,
      isWarning: isWarn && !isCrit,
      alertMessage: p > 130 ? '心动过速危急' : (p < 45 ? '严重心动过缓' : undefined),
    })
  }

  // 6. 呼吸频率
  if (vitals.respiratoryRate != null) {
    const r = vitals.respiratoryRate
    const isCrit = r > 30 || r < 8
    const isWarn = r > 24 && r <= 30
    if (isCrit) {
      hasCritical = true
      criticalMessages.push(`呼吸严重异常 (${r} 次/分)`)
    } else if (isWarn) {
      hasWarning = true
    }
    assessments.push({
      code: 'respiratoryRate',
      name: '呼吸',
      value: r,
      unit: '次/分',
      isCritical: isCrit,
      isWarning: isWarn && !isCrit,
      alertMessage: r > 30 ? '呼吸急促危象' : (r < 8 ? '呼吸抑制风险' : undefined),
    })
  }

  // 7. 血氧饱和度
  if (vitals.oxygenSaturation != null) {
    const spo2 = vitals.oxygenSaturation
    const isCrit = spo2 < 93
    const isWarn = spo2 >= 93 && spo2 < 95
    if (isCrit) {
      hasCritical = true
      criticalMessages.push(`血氧过低 (${spo2}%)`)
    } else if (isWarn) {
      hasWarning = true
    }
    assessments.push({
      code: 'oxygenSaturation',
      name: '血氧饱和度',
      value: spo2,
      unit: '%',
      isCritical: isCrit,
      isWarning: isWarn && !isCrit,
      alertMessage: spo2 < 93 ? '低氧血症(<93%)' : '血氧偏低',
    })
  }

  // 8. 血糖
  if (vitals.bloodGlucose != null) {
    const glu = vitals.bloodGlucose
    const isCrit = glu < 2.8 || glu >= 16.7
    const isWarn = (glu >= 2.8 && glu < 3.9) || (glu >= 11.1 && glu < 16.7)
    if (isCrit) {
      hasCritical = true
      criticalMessages.push(`血糖严重危急 (${glu} mmol/L)`)
    } else if (isWarn) {
      hasWarning = true
    }
    assessments.push({
      code: 'bloodGlucose',
      name: '末梢血糖',
      value: glu,
      unit: 'mmol/L',
      isCritical: isCrit,
      isWarning: isWarn && !isCrit,
      alertMessage: glu < 2.8 ? '重度低血糖危象' : (glu >= 16.7 ? '重度高血糖危象' : undefined),
    })
  }

  // 9. 疼痛
  if (vitals.painScore != null) {
    const pain = vitals.painScore
    const isCrit = pain >= 8
    const isWarn = pain >= 4 && pain < 8
    assessments.push({
      code: 'painScore',
      name: '疼痛评分',
      value: pain,
      unit: '分',
      isCritical: isCrit,
      isWarning: isWarn,
      alertMessage: pain >= 8 ? '剧烈疼痛(≥8分)' : (pain >= 4 ? '中度疼痛' : undefined),
    })
  }

  // 计算推荐分级
  let suggestedLevel: TriageLevel = 'LEVEL_4_NON_URGENT'
  let suggestedReason = '生命体征平稳，无急重症指征'

  if (vitals.consciousness === 'UNRESPONSIVE' || vitals.consciousness === 'PAIN') {
    suggestedLevel = 'LEVEL_1_CRITICAL'
    suggestedReason = `患者呈${vitals.consciousness === 'UNRESPONSIVE' ? '深度昏迷' : '昏睡/浅昏迷'}，立即进入抢救室`
  } else if (hasCritical) {
    suggestedLevel = 'LEVEL_1_CRITICAL'
    suggestedReason = criticalMessages.join('；')
  } else if (vitals.painScore != null && vitals.painScore >= 7) {
    suggestedLevel = 'LEVEL_2_URGENT'
    suggestedReason = '剧烈重度疼痛，需优先处置并持续评估病情变化'
  } else if (hasWarning || (vitals.temperature != null && vitals.temperature >= 38.0)) {
    suggestedLevel = 'LEVEL_3_ROUTINE_URGENT'
    suggestedReason = '生命体征存在预警或急性不适，建议30分钟内优先接诊'
  }

  return {
    assessments,
    hasCritical,
    hasWarning,
    criticalMessages,
    suggestedLevel,
    suggestedReason,
  }
}
