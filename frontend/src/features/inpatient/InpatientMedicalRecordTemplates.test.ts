import { describe, expect, it } from 'vitest'
import { compileTemplate } from '@yangl/canvas-editor/dist/canvas-editor.es.js'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import { createInpatientDocumentTemplate, inpatientDocumentDefinitions } from './InpatientMedicalRecordTemplates'

const episode: InpatientEpisode = {
  id: '100', revision: 0, episodeNo: 'IP202608300001', status: 'ADMITTED',
  residentId: '200', residentName: '住院模板测试居民', healthRecordNo: 'HR001', gender: 'FEMALE',
  birthDate: '1988-02-03', organizationId: '300', departmentId: '400', departmentName: '综合病区',
  encounterId: '500', encounterNo: 'IPE202608300001', bedId: '600', bedNo: '01床',
  admittedAt: '2026-08-30T08:00:00+08:00',
}

describe('住院 Canvas Editor 核心病历模板', () => {
  it.each(inpatientDocumentDefinitions)('可编译 $label 模板并携带住院上下文', (definition) => {
    const schema = createInpatientDocumentTemplate(definition, episode, '基层医疗机构')
    const data = compileTemplate(schema)

    expect(schema.id).toBe(definition.templateId)
    expect(schema.version).toBe(definition.templateVersion)
    expect(data.main.length).toBeGreaterThan(10)
    expect(JSON.stringify(data.main)).toContain('住院模板测试居民')
    expect(JSON.stringify(data.main)).toContain('IP202608300001')
  })

  it('locks patient context and provides the required doctor-facing sections', () => {
    const admission = createInpatientDocumentTemplate(inpatientDocumentDefinitions[0], episode, '基层医疗机构')
    const serialized = JSON.stringify(admission)

    expect(serialized).toContain('"id":"patientName"')
    expect(serialized).toContain('"readonly":true')
    expect(serialized).toContain('诊断分析与鉴别诊断')
    expect(serialized).toContain('辅助检查')
    expect(serialized).toContain('"id":"chiefComplaint"')
    expect(serialized).toContain('"required":true')
  })

  it('gives every progress-note template a recording date and clinically useful structure', () => {
    const first = inpatientDocumentDefinitions.find((item) => item.type === 'INPATIENT_FIRST_PROGRESS_NOTE')!
    const daily = inpatientDocumentDefinitions.find((item) => item.type === 'INPATIENT_DAILY_PROGRESS_NOTE')!
    const firstSchema = JSON.stringify(createInpatientDocumentTemplate(first, episode, '基层医疗机构'))
    const dailySchema = JSON.stringify(createInpatientDocumentTemplate(daily, episode, '基层医疗机构'))

    expect(firstSchema).toContain('"id":"recordedAt"')
    expect(firstSchema).toContain('诊断依据与鉴别诊断')
    expect(firstSchema).toContain('病情与风险评估')
    expect(dailySchema).toContain('"id":"recordedAt"')
    expect(dailySchema).toContain('治疗反应与医嘱调整')
    expect(dailySchema).toContain('沟通记录')
  })
})
