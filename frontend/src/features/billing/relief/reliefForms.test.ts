import { describe, expect, it } from 'vitest'
import type { ReliefPolicy } from '../../../shared/api/reliefApi'
import { emptyPolicyForm, emptyQualification, emptyRule, formFromPolicy, toDraftInput } from './reliefPolicyForm'
import { normalizeDate, parseRosterText, splitLine } from './rosterImport'
import { recordsCsv } from './reliefRecordExport'
import type { ReliefRecord } from '../../../shared/api/reliefApi'

describe('relief policy form', () => {
  it('converts percentages to ratios and drops fields that do not belong to the scope or method', () => {
    const form = emptyPolicyForm('2026-10-18')
    form.code = 'SIGNED'
    form.name = '签约居民减免'
    form.rules = [
      { ...emptyRule(), feeScope: 'ACCOUNTING_CATEGORY', scopeValue: 'EXAM', scopeName: '检查费', method: 'RATIO', percent: '50', amount: '9' },
      { ...emptyRule(), feeScope: 'CATALOG_ITEM', catalogItemId: '88', scopeName: '一般诊疗费', method: 'FREE', periodMaxCount: '2' },
      { ...emptyRule(), feeScope: 'SOURCE_TYPE', scopeValue: 'REGISTRATION', excluded: true, method: 'RATIO', percent: '30' },
    ]
    form.quotaPeriod = 'YEAR'
    form.periodMaxAmount = '500'
    form.qualifications = [{ ...emptyQualification(), source: 'ROSTER', qualificationType: 'FAMILY_DOCTOR_SIGNED' }]

    const { draft, errors } = toDraftInput(form)

    expect(errors).toEqual([])
    expect(draft.rules).toEqual([
      { feeScope: 'ACCOUNTING_CATEGORY', scopeValue: 'EXAM', catalogItemId: undefined, scopeName: undefined, excluded: false,
        method: 'RATIO', ratio: 0.5, amount: undefined, manualMaxAmount: undefined, periodMaxCount: undefined },
      { feeScope: 'CATALOG_ITEM', scopeValue: undefined, catalogItemId: '88', scopeName: '一般诊疗费', excluded: false,
        method: 'FREE', ratio: undefined, amount: undefined, manualMaxAmount: undefined, periodMaxCount: 2 },
      { feeScope: 'SOURCE_TYPE', scopeValue: 'REGISTRATION', catalogItemId: undefined, scopeName: undefined, excluded: true },
    ])
    expect(draft.periodMaxAmount).toBe(500)
    expect(draft.qualifications).toEqual([{ source: 'ROSTER', qualificationType: 'FAMILY_DOCTOR_SIGNED' }])
  })

  it('sends the manual approval threshold only when the policy has a manual rule', () => {
    const form = emptyPolicyForm('2026-10-18')
    form.manualApprovalAmount = '200'
    form.rules = [{ ...emptyRule(), method: 'MANUAL', manualMaxAmount: '500' }]
    expect(toDraftInput(form).draft.manualApprovalAmount).toBe(200)
    form.rules = [{ ...emptyRule(), method: 'FREE' }]
    expect(toDraftInput(form).draft.manualApprovalAmount).toBeUndefined()
  })

  it('reports entry problems before submitting', () => {
    const form = emptyPolicyForm('2026-10-18')
    form.scenes = []
    form.effectiveTo = '2026-01-01'
    form.rules = [
      { ...emptyRule(), method: 'RATIO', percent: '120' },
      { ...emptyRule(), feeScope: 'CATALOG_ITEM', method: 'FIXED_AMOUNT', amount: '' },
    ]
    form.qualifications = [{ ...emptyQualification(), source: 'ATTRIBUTE', minAge: '70', maxAge: '60' }]

    const { errors } = toDraftInput(form)

    expect(errors).toEqual(expect.arrayContaining([
      '请填写政策名称', '请至少选择一个适用结算场景', '失效日期不能早于生效日期', '第 1 条规则减免比例不能超过 100%',
      '第 2 条规则请选择收费项目', '第 2 条规则请填写金额', '第 1 项资格最小年龄不能大于最大年龄',
    ]))
  })

  it('edits the draft when present and otherwise starts from the published version', () => {
    const version = (versionNo: number, ratio: number) => ({
      id: `v${versionNo}`, versionNo, status: versionNo === 1 ? 'PUBLISHED' : 'DRAFT', timing: 'PRE_INSURANCE',
      sponsor: 'HOSPITAL', scope: { organizationIds: ['org-1'], scenes: ['OUTPATIENT'] }, effectiveFrom: '2026-01-01',
      quotaPeriod: 'NONE', qualificationMode: 'ALL', versionNote: `V${versionNo}`,
      rules: [{ feeScope: 'ALL', method: 'RATIO', ratio, excluded: false }],
      qualifications: [{ source: 'ATTRIBUTE', conditions: { minAge: 65, genders: ['1'], coverageTypes: ['310', '390'] } }],
    })
    const policy = { id: 'p1', revision: 3, code: 'AGED', name: '老年人优惠', status: 'ACTIVE', current: version(1, 0.2) } as ReliefPolicy

    const published = formFromPolicy(policy, '2026-10-18')
    expect(published.rules[0].percent).toBe('20')
    expect(published.timing).toBe('PRE_INSURANCE')
    expect(published.qualificationMode).toBe('ALL')
    expect(published.qualifications[0]).toMatchObject({ source: 'ATTRIBUTE', minAge: '65', genders: ['1'], coverageTypes: '310、390' })
    expect(published.organizationIds).toEqual(['org-1'])
    expect(published.versionNote).toBe('')

    const drafted = formFromPolicy({ ...policy, draft: version(2, 0.35) } as ReliefPolicy, '2026-10-18')
    expect(drafted.rules[0].percent).toBe('35')
    expect(drafted.versionNote).toBe('V2')
    expect(toDraftInput(drafted).draft.qualifications?.[0].conditions?.coverageTypes).toEqual(['310', '390'])
  })
})

describe('relief roster import parsing', () => {
  it('reads headed CSV with quoted cells and normalizes dates', () => {
    const parsed = parseRosterText('﻿证件号码,姓名,生效日期,失效日期,依据说明\n'
      + '110101199001011234,张三,2026/1/5,2026年12月31日,"签约, 含家属"\n\n'
      + '110101199001015678,李四,,,\n', '2026-10-18')
    expect(parsed.errors).toEqual([])
    expect(parsed.rows).toEqual([
      { rowNo: 2, identifierValue: '110101199001011234', residentName: '张三', effectiveFrom: '2026-01-05',
        effectiveTo: '2026-12-31', evidence: '签约, 含家属' },
      { rowNo: 4, identifierValue: '110101199001015678', residentName: '李四', effectiveFrom: '2026-10-18' },
    ])
  })

  it('accepts pasted tab-separated rows without a header and flags invalid dates', () => {
    const parsed = parseRosterText('110101199001011234\t张三\t2026-02-30', '2026-10-18')
    expect(parsed.rows[0]).toMatchObject({ identifierValue: '110101199001011234', residentName: '张三', effectiveFrom: '2026-02-30' })
    expect(parsed.errors).toEqual(['第 1 行生效日期“2026-02-30”不是有效日期'])
  })

  it('splits quoted cells and leaves unknown date formats for the server', () => {
    expect(splitLine('"a ""b""",c')).toEqual(['a "b"', 'c'])
    expect(normalizeDate('2026.3.9')).toBe('2026-03-09')
    expect(normalizeDate('明年')).toBe('明年')
    expect(parseRosterText('证件类型,姓名\nNATIONAL_ID,张三', '2026-10-18').errors).toContain('表头缺少“证件号码”列')
  })
})

describe('relief record export', () => {
  it('writes reversals as negative amounts and quotes text that spreadsheets would misread', () => {
    const csv = recordsCsv([
      { id: '1', occurredAt: '2026-10-18T02:00:00Z', settlementNo: 'STL001', residentName: '张三', policyName: '民政救助',
        payerName: '县民政局', baseAmount: 90, reliefAmount: 45, reversal: false, manual: true,
        manualReason: '家庭困难, 收费员核定', manualEvidence: '=证明' },
      { id: '2', occurredAt: '2026-10-18T03:00:00Z', settlementNo: 'STL002', originalSettlementNo: 'STL001',
        residentName: '张三', policyName: '民政救助', baseAmount: 0, reliefAmount: -45, reversal: true, manual: false },
    ] as ReliefRecord[])
    const [header, first, second] = csv.split('\r\n')
    expect(header.split(',').slice(0, 4)).toEqual(['减免时间', '记录类型', '结算单号', '原结算单号'])
    expect(first).toContain('"家庭困难, 收费员核定"')
    expect(first).toContain("'=证明")
    expect(first).toContain(',90.00,45.00,')
    expect(second).toContain('退费冲销,STL002,STL001')
    expect(second).toContain(',,-45.00,')
  })
})
