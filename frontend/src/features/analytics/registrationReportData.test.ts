import { describe, expect, it } from 'vitest'
import type { PageResult, PageSeries } from '../../shared/api/analysisPagesApi'
import { registrationData, registrationSpecs } from './registrationReportData'

const series = (code: string, total: number, points: [string, number][]): PageSeries => ({
  code, name: code, total, unit: '人次', definition: '', groupCount: points.length,
  points: points.map(([key, value]) => ({ key, label: key, value })),
})
const result = (values: PageSeries[]) => ({ series: values }) as PageResult

describe('registration report facts', () => {
  it('aligns filtered metrics by key and preserves overall distinct patients', () => {
    const data = registrationData(result([
      series('M1', 30, [['dept-a', 10], ['dept-b', 20]]),
      series('M2', 3, [['dept-b', 3]]),
      series('M3', 12, [['dept-b', 10], ['dept-a', 7]]),
    ]))
    expect(data.totalPat).toBe(12)
    expect(data.points[0]).toMatchObject({ cancelCount: 0, patientCount: 7 })
    expect(data.points[1]).toMatchObject({ cancelCount: 3, patientCount: 10 })
  })
  it('does not create records when the query is empty', () => {
    expect(registrationData(result([]))).toEqual({ totalReg: 0, totalPat: 0, totalCancel: 0, points: [] })
  })
  it('rejects incomplete metric responses instead of guessing', () => {
    expect(() => registrationData(result([series('M1', 100, [])]))).toThrow('指标不完整')
  })
  it('requests actual distinct counts and avoids independent ranking truncation', () => {
    const specs = registrationSpecs({ from: '2026-10-01', to: '2026-10-03' }, 'CURRENT')
    for (const spec of specs) {
      expect(spec.measures?.[2]).toMatchObject({ source: 'REGISTRATION', aggregate: 'COUNT_DISTINCT', field: 'patientId' })
      expect(spec.measures?.[1].filters).toEqual([{ field: 'status', operator: 'EQ', values: ['CANCELLED'] }])
    }
    expect(specs[1].template).toBe('LIST')
  })
})
