import type { PageResult, PageSpec, PlanMeasure } from '../../shared/api/analysisPagesApi'
import type { DateRange } from '../../shared/utils/dateRange'

export function workloadSpec(dateRange: DateRange, scope: PageSpec['scope']): PageSpec {
  const measures: PlanMeasure[] = [
    { code: 'M1', name: '登记就诊人次', source: 'ENCOUNTER', sourceVersion: 1,
      aggregate: 'COUNT', field: 'encounterId', filters: [] },
    { code: 'M2', name: '去重就诊患者数', source: 'ENCOUNTER', sourceVersion: 1,
      aggregate: 'COUNT_DISTINCT', field: 'patientId', filters: [] },
    ...(['MEDICATION', 'SERVICE'] as const).map((kind, i): PlanMeasure => ({
      code: `M${i + 3}`, name: kind === 'MEDICATION' ? '有效药品医嘱' : '有效服务医嘱',
      source: 'ORDER', sourceVersion: 1, aggregate: 'COUNT', field: 'orderId',
      filters: [{ field: 'status', operator: 'EQ', values: ['ACTIVE'] },
        { field: 'kind', operator: 'EQ', values: [kind] }],
    })),
  ]
  // LIST keeps all department groups; independently ranked series can omit different departments.
  return { title: '门诊就诊与医疗工作量', template: 'LIST', dimension: 'DEPARTMENT',
    metrics: measures.map((m) => m.code), measures, scope, limit: 100,
    period: { kind: 'FIXED', startDate: dateRange.from, endDate: dateRange.to } }
}

export function workloadData(result: Pick<PageResult, 'series'>) {
  const series = ['M1', 'M2', 'M3', 'M4'].map((code) => result.series.find((s) => s.code === code))
  if (result.series.length && series.some((s) => !s)) throw new Error('工作量统计指标不完整')
  const labels = new Map<string, string>()
  const values = series.map((s) => {
    if (s && (!Number.isFinite(s.total) || s.total < 0)) throw new Error('工作量统计数据无效')
    return new Map(s?.points.map((p) => {
      if (!Number.isFinite(p.value) || p.value < 0) throw new Error('工作量统计数据无效')
      labels.set(p.key, p.label)
      return [p.key, p.value]
    }))
  })
  const list = [...labels].map(([deptId, deptName]) => {
    const [encounterCount, patientCount, medOrderCount, serviceOrderCount] = values.map((m) => m.get(deptId) ?? 0)
    const totalOrderCount = medOrderCount + serviceOrderCount
    return { deptId, deptName, encounterCount, patientCount, medOrderCount, serviceOrderCount,
      totalOrderCount, avgOrdersPerEncounter: encounterCount > 0 ? totalOrderCount / encounterCount : null }
  }).filter((row) => row.encounterCount > 0 || row.totalOrderCount > 0 || row.patientCount > 0)
    .sort((a, b) => b.encounterCount - a.encounterCount || a.deptId.localeCompare(b.deptId))
  return { list, totalEnc: series[0]?.total ?? 0,
    // A patient visiting multiple departments counts once in the overall DISTINCT total.
    totalPat: series[1]?.total ?? 0, totalMedOrders: series[2]?.total ?? 0,
    totalOrders: (series[2]?.total ?? 0) + (series[3]?.total ?? 0) }
}
