import type { ITemplateSchema } from '@yangl/canvas-editor'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'

export type InpatientDocumentType =
  | 'INPATIENT_ADMISSION_RECORD'
  | 'INPATIENT_FIRST_PROGRESS_NOTE'
  | 'INPATIENT_DAILY_PROGRESS_NOTE'
  | 'INPATIENT_DISCHARGE_RECORD'

export interface InpatientDocumentDefinition {
  type: InpatientDocumentType
  label: string
  templateId: string
  templateVersion: string
}

export const inpatientDocumentDefinitions: InpatientDocumentDefinition[] = [
  { type: 'INPATIENT_ADMISSION_RECORD', label: '入院记录', templateId: 'rhn-inpatient-admission', templateVersion: '1.1.0' },
  { type: 'INPATIENT_FIRST_PROGRESS_NOTE', label: '首次病程', templateId: 'rhn-inpatient-first-progress', templateVersion: '1.1.0' },
  { type: 'INPATIENT_DAILY_PROGRESS_NOTE', label: '日常病程', templateId: 'rhn-inpatient-daily-progress', templateVersion: '1.1.0' },
  { type: 'INPATIENT_DISCHARGE_RECORD', label: '出院记录', templateId: 'rhn-inpatient-discharge', templateVersion: '1.1.0' },
]

const field = (id: string, label: string, type: 'text' | 'textarea' | 'date' = 'textarea',
  placeholder = `请输入${label}`, required = false, defaultValue?: string, readonly = false) => ({
  id, label, type, placeholder, required, defaultValue, readonly,
  width: type === 'textarea' ? 520 : 180,
})

const section = (title: string, fields: ReturnType<typeof field>[]) => ({
  type: 'section' as const,
  title,
  blocks: fields.map((value) => ({
    type: 'paragraph' as const,
    segments: [{ type: 'field' as const, field: value }],
  })),
})

function localDate(value = new Date().toISOString()) {
  const date = new Date(value)
  const pad = (part: number) => `${part}`.padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function ageOf(birthDate?: string) {
  if (!birthDate) return ''
  const birth = new Date(`${birthDate}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth()
    || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1
  return age >= 0 ? `${age}岁` : ''
}

function baseBlocks(episode: InpatientEpisode): ITemplateSchema['blocks'] {
  return [{
    type: 'fieldRow' as const,
    fields: [
      { ...field('patientName', '姓名', 'text', '', false, episode.residentName, true), width: 130 },
      { ...field('hospitalNo', '住院号', 'text', '', false, episode.episodeNo, true), width: 175 },
      { ...field('department', '科室', 'text', '', false, episode.departmentName, true), width: 110 },
    ],
  }, {
    type: 'fieldRow' as const,
    fields: [
      { ...field('bedNo', '床号', 'text', '', false, episode.bedNo ?? '', true), width: 70 },
      { ...field('gender', '性别', 'text', '', false,
        episode.gender === 'MALE' ? '男' : episode.gender === 'FEMALE' ? '女' : '未知', true), width: 55 },
      { ...field('age', '年龄', 'text', '', false, ageOf(episode.birthDate), true), width: 65 },
    ],
  }, {
    type: 'fieldRow' as const,
    fields: [
      { ...field('admittedAt', '入院日期', 'date', '', false, localDate(episode.admittedAt), true), width: 110 },
      { ...field('ward', '病区', 'text', '', false, episode.wardName ?? episode.departmentName, true), width: 135 },
    ],
  }]
}

export function createInpatientDocumentTemplate(
  definition: InpatientDocumentDefinition,
  episode: InpatientEpisode,
  organizationName: string,
): ITemplateSchema {
  const common = {
    version: definition.templateVersion,
    id: definition.templateId,
    name: definition.label,
    description: `${organizationName}${definition.label}`,
    layout: {
      pageSize: 'A4' as const,
      defaultFont: 'SimSun',
      defaultFontSize: 14,
      textareaWidth: 520,
      margins: [70, 88, 70, 88] as [number, number, number, number],
      pageDecorations: { variables: { hospitalName: organizationName, documentTitle: definition.label } },
    },
  }
  const blocks = baseBlocks(episode)
  if (definition.type === 'INPATIENT_ADMISSION_RECORD') {
    blocks.push(
      section('主诉', [field('chiefComplaint', '主诉', 'textarea', '主要症状及持续时间', true)]),
      section('现病史', [field('presentIllness', '现病史', 'textarea', '围绕主诉记录起病、演变、诊疗经过及一般情况', true)]),
      section('既往史', [
        field('pastHistory', '既往史'),
        field('allergyHistory', '过敏史', 'textarea', '药物、食物及其他过敏史'),
      ]),
      section('个人史、婚育史与家族史', [
        field('personalHistory', '个人史'),
        field('marriageAndReproductiveHistory', '婚育史'),
        field('familyHistory', '家族史'),
      ]),
      section('体格检查', [
        field('vitalSigns', '生命体征', 'textarea', '体温、脉搏、呼吸、血压及一般情况'),
        field('physicalExamination', '体格检查', 'textarea', '按系统记录阳性体征和有鉴别意义的阴性体征', true),
      ]),
      section('辅助检查', [field('auxiliaryExaminations', '辅助检查', 'textarea', '记录入院前及入院后的重要检查结果')]),
      section('初步诊断', [field('admissionDiagnosis', '初步诊断', 'textarea', '按主次列出诊断', true)]),
      section('诊断分析与鉴别诊断', [field('diagnosticReasoning', '诊断分析与鉴别诊断')]),
      section('诊疗计划', [field('carePlan', '诊疗计划', 'textarea', '记录检查、治疗、护理及风险处置计划', true)]),
    )
  } else if (definition.type === 'INPATIENT_FIRST_PROGRESS_NOTE') {
    blocks.push(
      section('记录时间', [field('recordedAt', '记录时间', 'date', '', true, localDate())]),
      section('病例特点', [field('caseCharacteristics', '病例特点', 'textarea', '概括病史、查体及辅助检查特点', true)]),
      section('诊断依据与鉴别诊断', [
        field('diagnosisBasis', '诊断依据', 'textarea', '逐项说明主要诊断依据', true),
        field('differentialDiagnosis', '鉴别诊断', 'textarea', '说明需要鉴别的疾病及依据'),
      ]),
      section('病情与风险评估', [field('riskAssessment', '病情与风险评估', 'textarea', '记录病情分级、主要风险及预警事项')]),
      section('诊疗计划', [field('carePlan', '诊疗计划', 'textarea', '列出检查、治疗、护理与观察计划', true)]),
    )
  } else if (definition.type === 'INPATIENT_DAILY_PROGRESS_NOTE') {
    blocks.push(
      section('记录日期', [field('recordedAt', '记录日期', 'date', '', true, localDate())]),
      section('病情变化', [field('conditionChanges', '病情变化', 'textarea', '记录症状、体征和主要诉求的变化', true)]),
      section('查体与检查结果', [field('examinationAndResults', '查体与检查结果', 'textarea', '记录重点查体及新回报的检验检查结果')]),
      section('病情评估', [field('assessment', '病情评估', 'textarea', '说明当前诊断、疗效、风险及需要处理的问题', true)]),
      section('治疗反应与医嘱调整', [field('treatmentResponse', '治疗反应与医嘱调整')]),
      section('当日计划', [field('plan', '当日计划', 'textarea', '记录后续检查、治疗、护理与观察安排', true)]),
      section('沟通记录', [field('communication', '沟通记录', 'textarea', '记录与患者或家属沟通的重点内容')]),
    )
  } else {
    blocks.push(
      section('住院日期', [
        field('admissionDate', '入院日期', 'date', '', false, localDate(episode.admittedAt), true),
        field('dischargeDate', '出院日期', 'date', '', false,
          episode.dischargedAt ? localDate(episode.dischargedAt) : undefined, Boolean(episode.dischargedAt)),
      ]),
      section('入院情况', [field('admissionSummary', '入院情况')]),
      section('入院诊断', [field('admissionDiagnosis', '入院诊断', 'textarea', '按主次列出入院诊断', true)]),
      section('诊疗经过', [field('hospitalCourse', '诊疗经过', 'textarea', '概括重要检查、治疗、病情变化及转归', true)]),
      section('出院诊断', [field('dischargeDiagnosis', '出院诊断', 'textarea', '按主次列出出院诊断', true)]),
      section('出院情况', [field('dischargeCondition', '出院情况')]),
      section('出院带药', [field('dischargeMedication', '出院带药', 'textarea', '记录药品、用法用量与疗程')]),
      section('出院医嘱与随访', [field('dischargeInstructions', '出院医嘱与随访', 'textarea', '记录饮食活动、复诊时间、风险提示及随访计划', true)]),
    )
  }
  return { ...common, blocks } as ITemplateSchema
}
