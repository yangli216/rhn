import { describe, expect, it } from 'vitest'
import type { PageSeries } from '../../shared/api/analysisPagesApi'
import { workloadData, workloadSpec } from './workloadReportData'

function series(code: string, total: number, points: [string, number][]): PageSeries {
  return { code, name: code, total, unit: '条', definition: '', groupCount: points.length,
    points: points.map(([key, value]) => ({ key, label: key, value })) }
}

describe('workload data', () => {
  it('queries actual patients and both order categories without ranking truncation', () => {
    const spec = workloadSpec({ from: '2026-10-01', to: '2026-10-03' }, 'CURRENT')
    expect(spec.template).toBe('LIST')
    expect(spec.measures?.[1]).toMatchObject({ source: 'ENCOUNTER', aggregate: 'COUNT_DISTINCT', field: 'patientId' })
    expect(spec.measures?.slice(2).map((m) => m.filters)).toEqual([
      [{ field: 'status', operator: 'EQ', values: ['ACTIVE'] }, { field: 'kind', operator: 'EQ', values: ['MEDICATION'] }],
      [{ field: 'status', operator: 'EQ', values: ['ACTIVE'] }, { field: 'kind', operator: 'EQ', values: ['SERVICE'] }],
    ])
  })
  it('joins by department and keeps orders from departments without encounters, without fabricating ratios', () => {
    const data = workloadData({ series: [
      series('M4', 6, [['B', 2], ['C', 4]]), series('M2', 2, [['A', 2], ['B', 1]]),
      series('M1', 4, [['A', 3], ['B', 1]]), series('M3', 8, [['B', 8]]),
    ] })
    expect(data).toMatchObject({ totalEnc: 4, totalPat: 2, totalMedOrders: 8, totalOrders: 14 })
    expect(data.list).toEqual([
      { deptId: 'A', deptName: 'A', encounterCount: 3, patientCount: 2, medOrderCount: 0, serviceOrderCount: 0, totalOrderCount: 0, avgOrdersPerEncounter: 0 },
      { deptId: 'B', deptName: 'B', encounterCount: 1, patientCount: 1, medOrderCount: 8, serviceOrderCount: 2, totalOrderCount: 10, avgOrdersPerEncounter: 10 },
      { deptId: 'C', deptName: 'C', encounterCount: 0, patientCount: 0, medOrderCount: 0, serviceOrderCount: 4, totalOrderCount: 4, avgOrdersPerEncounter: null },
    ])
  })
  it('rejects partial or invalid results and leaves empty results empty', () => {
    expect(() => workloadData({ series: [series('M1', 3, [['A', 3]])] })).toThrow('指标不完整')
    expect(() => workloadData({ series: ['M1', 'M2', 'M3', 'M4'].map((code) => series(code, NaN, [])) })).toThrow('数据无效')
    expect(workloadData({ series: [] })).toEqual({ list: [], totalEnc: 0, totalPat: 0, totalMedOrders: 0, totalOrders: 0 })
  })
})
