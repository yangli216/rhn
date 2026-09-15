import { describe, expect, it } from 'vitest'
import { dateRange, understand, type PilotQuery } from './pilotModel'
const now = new Date(2026, 0, 15)
const base: PilotQuery = { metric:'REGISTERED', dimension:'DAY', scope:'CURRENT', ...dateRange('30',now) }
describe('local analysis interpretation', () => {
  it('resolves previous calendar month over year boundary',()=>{
    const next=understand('上个月各科室诊毕人次，折线图',base,'BAR',now)
    expect(next.query).toEqual({metric:'COMPLETED',dimension:'DEPARTMENT',scope:'AUTHORIZED',startDate:'2025-12-01',endDate:'2025-12-31'})
    expect(next.chart).toBe('LINE')
  })
  it('retains scope and metric for a view-only followup',()=>{
    const next=understand('改成柱状图',base,'LINE',now)
    expect(next.query).toEqual(base);expect(next.chart).toBe('BAR')
  })
  it('handles explicit dates and rate before cancellation count',()=>{
    expect(understand('2026-01-01至2026-01-10，按日看退号率',base,'BAR',now).query)
      .toMatchObject({metric:'CANCELLATION_RATE',startDate:'2026-01-01',endDate:'2026-01-10'})
  })
  it('does not turn unknown metrics or ambiguous dates into silent defaults',()=>{
    for(const text of ['复诊率','门诊收入','上周挂号','2026-01-01挂号','随便看看','按医生看挂号','昨天发生的退号','最近0天挂号','住院人次']) expect(()=>understand(text,base,'BAR',now)).toThrow()
  })
})
