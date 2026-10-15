import { describe, expect, it } from 'vitest'
import {
  EXAM_MODALITIES,
  matchExamTemplateByItemName,
  recommendExamModality,
} from './nationalStandardExamCatalog'

describe('nationalStandardExamCatalog (WS 445.11-2014 & Modality Standards)', () => {
  it('covers core national modalities with standard preparation and contraindication guides', () => {
    const codes = EXAM_MODALITIES.map((m) => m.code)
    expect(codes).toContain('DR')
    expect(codes).toContain('CT')
    expect(codes).toContain('MR')
    expect(codes).toContain('US')
    expect(codes).toContain('ECG')
    expect(codes).toContain('ES')

    const mr = EXAM_MODALITIES.find((m) => m.code === 'MR')!
    expect(mr.contraindicationGuide).toContain('心脏起搏器')
    expect(mr.contraindicationGuide).toContain('金属异物')

    const us = EXAM_MODALITIES.find((m) => m.code === 'US')!
    expect(us.preparationGuide).toContain('空腹8小时以上')
    expect(us.preparationGuide).toContain('憋尿充盈膀胱')
  })

  it('matches appropriate structured template by item name', () => {
    const chestTpl = matchExamTemplateByItemName('胸部正侧位DR摄片')
    expect(chestTpl).toBeDefined()
    expect(chestTpl?.bodyPart).toBe('胸部')
    expect(chestTpl?.defaultConclusion).toContain('心肺膈正常')

    const ctHeadTpl = matchExamTemplateByItemName('急诊头颅CT平扫')
    expect(ctHeadTpl).toBeDefined()
    expect(ctHeadTpl?.bodyPart).toBe('颅脑')
    expect(ctHeadTpl?.procedureMethod).toContain('横断轴位平扫')

    const ecgTpl = matchExamTemplateByItemName('常规12导联心电图')
    expect(ecgTpl).toBeDefined()
    expect(ecgTpl?.defaultConclusion).toContain('正常心电图')
  })

  it('recommends correct modality metadata by keyword', () => {
    expect(recommendExamModality('腹部彩色超声检查').code).toBe('US')
    expect(recommendExamModality('腹部CT增强扫描').code).toBe('CT')
    expect(recommendExamModality('头颅核磁共振MRI平扫').code).toBe('MR')
    expect(recommendExamModality('常规心电图检查').code).toBe('ECG')
    expect(recommendExamModality('无痛电子胃镜检查').code).toBe('ES')
  })
})
