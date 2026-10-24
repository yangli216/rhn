import { describe, expect, it } from 'vitest'
import {
  CBC_5PART_INDICATORS,
  LABORATORY_RESULT_PRESETS,
  matchPresetTemplateByTask,
  GLUCOSE_INDICATORS,
  LIVER_PANEL_INDICATORS,
  NATIONAL_STANDARD_LAB_TEMPLATES,
  RENAL_PANEL_INDICATORS,
  URINALYSIS_INDICATORS,
  evaluateIndicatorValue,
  findNationalLabTemplateByCode,
  matchApplicableReferenceRule,
  matchNationalLabTemplateByItemName,
} from './nationalStandardLabCatalog'

describe('nationalStandardLabCatalog (WS/T 404/405 & WS 445.10)', () => {
  it('strictly conforms to backend DiagnosticTemplateValidation rules for all standard lab templates', () => {
    const codePattern = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/

    for (const tpl of NATIONAL_STANDARD_LAB_TEMPLATES) {
      expect(tpl.serviceType).toBe('LABORATORY')
      expect(tpl.content.phrases).toEqual([])
      expect(tpl.content.requiredChecks).toEqual([])
      expect(tpl.content.minimumImages).toBe(0)
      expect(tpl.content.indicators.length).toBeGreaterThan(0)
      expect(tpl.content.indicators.length).toBeLessThanOrEqual(200)

      const indicatorCodes = new Set<string>()
      for (const indicator of tpl.content.indicators) {
        expect(indicator.code).toMatch(codePattern)
        expect(indicatorCodes.has(indicator.code)).toBe(false)
        indicatorCodes.add(indicator.code)

        expect(indicator.name.length).toBeGreaterThan(0)
        expect(indicator.name).toBe(indicator.name.trim())
        expect(['NUMBER', 'STRING', 'CODE']).toContain(indicator.valueType)

        if (indicator.valueType === 'CODE') {
          expect(indicator.allowedCodes.length).toBeGreaterThan(0)
        } else {
          expect(indicator.allowedCodes).toEqual([])
        }

        const ruleCodes = new Set<string>()
        for (const rule of indicator.rules) {
          expect(rule.code).toMatch(codePattern)
          expect(ruleCodes.has(rule.code)).toBe(false)
          ruleCodes.add(rule.code)

          if (rule.gender != null) {
            expect(['1', '2']).toContain(rule.gender)
          }
          if (rule.minimumAgeDays != null && rule.maximumAgeDays != null) {
            expect(rule.maximumAgeDays).toBeGreaterThan(rule.minimumAgeDays)
          }
          if (rule.referenceLow != null && rule.referenceHigh != null) {
            expect(rule.referenceHigh).toBeGreaterThanOrEqual(rule.referenceLow)
          }
          if (rule.criticalLow != null && rule.criticalHigh != null) {
            expect(rule.criticalHigh).toBeGreaterThan(rule.criticalLow)
          }
        }
      }
    }
  })

  it('contains all 5 mandatory core clinical panels with precise item counts', () => {
    expect(CBC_5PART_INDICATORS.length).toBe(24)
    expect(URINALYSIS_INDICATORS.length).toBe(15)
    expect(LIVER_PANEL_INDICATORS.length).toBe(12)
    expect(RENAL_PANEL_INDICATORS.length).toBe(3)
    expect(GLUCOSE_INDICATORS.length).toBe(1)
  })

  it('looks up templates by code and matches by clinical order intent correctly', () => {
    const cbc = findNationalLabTemplateByCode('TPL_LAB_CBC_5PART')
    expect(cbc).toBeDefined()
    expect(cbc?.specimenTubeCode).toBe('TUBE_PURPLE_EDTA')

    expect(matchNationalLabTemplateByItemName('血常规五分类')?.templateCode).toBe('TPL_LAB_CBC_5PART')
    expect(matchNationalLabTemplateByItemName('尿常规分析')?.templateCode).toBe('TPL_LAB_ITEM_25010200100')
    expect(matchNationalLabTemplateByItemName('肝功能检查')?.templateCode).toBe('TPL_LAB_LIVER')
    expect(matchNationalLabTemplateByItemName('肾功能三项')?.templateCode).toBe('TPL_LAB_RENAL')
    expect(matchNationalLabTemplateByItemName('空腹静脉血糖测定')?.templateCode).toBe('TPL_LAB_GLUCOSE')
    expect(matchNationalLabTemplateByItemName('未知无关项目')).toBeUndefined()
  })

  it('correctly matches gender and age specific reference rules', () => {
    const rbc = CBC_5PART_INDICATORS.find((i) => i.code === 'RBC')!
    // 男（gender '1'）
    const maleRule = matchApplicableReferenceRule(rbc.rules, { gender: '1', ageDays: 10000 })
    expect(maleRule?.code).toBe('RBC_MALE')
    expect(maleRule?.referenceLow).toBe(4.30)
    expect(maleRule?.referenceHigh).toBe(5.80)

    // 女（gender '2'）
    const femaleRule = matchApplicableReferenceRule(rbc.rules, { gender: '2', ageDays: 10000 })
    expect(femaleRule?.code).toBe('RBC_FEMALE')
    expect(femaleRule?.referenceLow).toBe(3.80)
    expect(femaleRule?.referenceHigh).toBe(5.10)
  })

  it('accurately evaluates numerical normality, deviations and critical lifeline alerts', () => {
    const wbc = CBC_5PART_INDICATORS.find((i) => i.code === 'WBC')!
    // 正常范围 (3.50 ~ 9.50)
    expect(evaluateIndicatorValue(wbc, 6.5, { ageDays: 10000 }).interpretationCode).toBe('N')
    // 偏高
    expect(evaluateIndicatorValue(wbc, 12.0, { ageDays: 10000 }).interpretationCode).toBe('H')
    // 极高危急 (>25.0)
    const criticalWbc = evaluateIndicatorValue(wbc, 28.5, { ageDays: 10000 })
    expect(criticalWbc.interpretationCode).toBe('HH')
    expect(criticalWbc.isCritical).toBe(true)

    const glu = GLUCOSE_INDICATORS.find((i) => i.code === 'GLU')!
    // 极低危急 (<2.8)
    const lowGlu = evaluateIndicatorValue(glu, 2.1)
    expect(lowGlu.interpretationCode).toBe('LL')
    expect(lowGlu.isCritical).toBe(true)
    // 极高危急 (>22.2)
    const highGlu = evaluateIndicatorValue(glu, 24.0)
    expect(highGlu.interpretationCode).toBe('HH')
    expect(highGlu.isCritical).toBe(true)

    // 定性指标危急值与正常值
    const ket = URINALYSIS_INDICATORS.find((i) => i.code === 'KET')!
    expect(evaluateIndicatorValue(ket, '-').interpretationCode).toBe('N')
    expect(evaluateIndicatorValue(ket, '1+').interpretationCode).toBe('H')
    const criticalKet = evaluateIndicatorValue(ket, '3+')
    expect(criticalKet.interpretationCode).toBe('CRITICAL')
    expect(criticalKet.isCritical).toBe(true)
  })
  it('maps standard codes before names and keeps three-part, single-test and add-on semantics', () => {
    const cbc3 = matchPresetTemplateByTask({ itemCode: '25010101501', itemName: '肝功能检查' })!
    expect(cbc3.content.indicators.map((i) => i.code)).toEqual(expect.arrayContaining(['MID_NUM', 'GRAN_PCT']))
    expect(cbc3.content.indicators.some((i) => ['ALT', 'MONO_NUM', 'EO_NUM'].includes(i.code))).toBe(false)
    const cbc5 = matchPresetTemplateByTask({ itemCode: '25010101500' })!
    expect(cbc5.content.indicators.map((i) => i.code)).toContain('BASO_PCT')
    expect(matchPresetTemplateByTask({ itemCode: '25030500700' })?.content.indicators.map((i) => i.code)).toEqual(['ALT'])
    expect(matchPresetTemplateByTask({ itemCode: '25030700200' })?.content.indicators.map((i) => i.code)).toEqual(['CREA'])
    expect(matchPresetTemplateByTask({ itemCode: '26000000000', itemName: '血常规五分类' })).toBeUndefined()
    expect(matchPresetTemplateByTask({ itemCode: '99999999999', itemName: '血常规五分类' })).toBeUndefined()
    expect(matchNationalLabTemplateByItemName('肾功能四项')).toBeUndefined()
    expect(matchNationalLabTemplateByItemName('尿沉渣专项检查')).toBeUndefined()
  })

  it('does not infer normality from unconfirmed or inapplicable rules', () => {
    const alt = matchPresetTemplateByTask({ itemCode: '25030500700' })!.content.indicators[0]
    expect(evaluateIndicatorValue(alt, '32').interpretationCode).toBeUndefined()
    const rbc = CBC_5PART_INDICATORS.find((i) => i.code === 'RBC')!
    expect(matchApplicableReferenceRule(rbc.rules, { ageDays: 10, gender: '1' })).toBeUndefined()
    expect(matchApplicableReferenceRule(rbc.rules, { ageDays: 10000 })).toBeUndefined()
    for (const template of LABORATORY_RESULT_PRESETS) {
      expect(template.content.indicators.every((indicator) => indicator.rules.every((rule) => rule.criticalLow == null && rule.criticalHigh == null && rule.criticalCodes.length === 0))).toBe(true)
    }
  })

  it('provides sourced adult CBC intervals for three/five-part panels with sex and age conditions', () => {
    const three = matchPresetTemplateByTask({ itemCode: '25010101501' })!
    const rule = (code: string, gender: '1' | '2') => matchApplicableReferenceRule(three.content.indicators.find((i) => i.code === code)!.rules, { gender, ageDays: 51 * 365 })
    expect(rule('WBC', '1')).toMatchObject({ referenceLow: 3.5, referenceHigh: 9.5 })
    expect(rule('HGB', '1')).toMatchObject({ referenceLow: 130, referenceHigh: 175 })
    expect(rule('HGB', '2')).toMatchObject({ referenceLow: 115, referenceHigh: 150 })
    expect(rule('HCT', '1')).toMatchObject({ referenceLow: 40, referenceHigh: 50 })
    expect(rule('HCT', '2')).toMatchObject({ referenceLow: 35, referenceHigh: 45 })
    expect(rule('RDW_CV', '1')).toBeUndefined()
    expect(rule('MID_NUM', '1')).toBeUndefined()
    expect(matchApplicableReferenceRule(three.content.indicators[0].rules, { ageDays: 3650 })).toBeUndefined()
    const single = matchPresetTemplateByTask({ itemCode: '25010100100' })!
    expect(single.content.indicators[0].rules).toEqual(three.content.indicators.find((i) => i.code === 'HGB')!.rules)
  })

})
