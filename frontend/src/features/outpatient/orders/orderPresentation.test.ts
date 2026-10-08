import { describe, expect, it } from 'vitest'
import { formatServiceExecution, resolveExecutingDepartment, summarizeExecutingDepartments } from './orderPresentation'

describe('execution destination facts', () => {
  it.each(['HERBAL', 'WESTERN', 'CHINESE_PATENT', undefined])('does not assign a pharmacy based on %s', type => {
    expect(resolveExecutingDepartment({ kind: 'medication', type }, '全科医疗科')).toBe('发药药房待确认')
  })
  it.each([
    ['LABORATORY', '血常规'], ['EXAMINATION', '胸部 CT'], ['EXAMINATION', '腹部彩超'],
    ['EXAMINATION', '心电图'], ['EXAMINATION', '胃镜'], ['PATHOLOGY', '活检'], ['TREATMENT', '输液'],
  ])('does not assign a department based on %s / %s', (type, itemName) => {
    expect(resolveExecutingDepartment({ kind: 'service', type, itemName }, '全科医疗科')).toBe('执行科室待确认')
  })
  it('shows explicit self-provided medication without inventing a dispensing pharmacy', () => {
    expect(resolveExecutingDepartment({ kind: 'medication', selfProvided: true, stockSiteName: null })).toBe('患者自备，无需药房发药')
  })
  it('preserves actual pharmacy and department names, including those unrelated to the item type', () => {
    expect(resolveExecutingDepartment({ kind: 'medication', type: 'HERBAL', stockSiteName: '  综合药房一部 ' })).toBe('综合药房一部')
    expect(resolveExecutingDepartment({ kind: 'service', type: 'LABORATORY', performerDepartmentId: '98648483543646209',
      performerDepartmentName: ' 医技中心二部 ' })).toBe('医技中心二部')
    expect(resolveExecutingDepartment({ kind: 'service', performerDepartmentId: '98648483543646209' }))
      .toBe('科室编号：98648483543646209（名称待确认）')
    expect(resolveExecutingDepartment({ kind: 'medication', stockSiteName: ' ' })).toBe('发药药房待确认')
  })
  it('does not hide mixed or partially unknown destinations behind a single category heading', () => {
    expect(summarizeExecutingDepartments([
      { kind: 'medication', stockSiteName: '综合药房' }, { kind: 'medication', stockSiteName: '综合药房' },
      { kind: 'medication', stockSiteName: '院外药房' }, { kind: 'medication' },
    ])).toBe('综合药房 / 院外药房 / 发药药房待确认')
  })
  it('describes only known service types, without inventing an execution location or workflow', () => {
    expect(formatServiceExecution('TREATMENT')).toBe('治疗项目')
    expect(formatServiceExecution('EXAMINATION')).toBe('检查项目')
    expect(formatServiceExecution(undefined)).toBe('项目类型待确认')
    expect(formatServiceExecution('UNKNOWN')).toBe('项目类型待确认')
  })
})
