import type { PageResult, PageSpec, PlanMeasure } from '../../shared/api/analysisPagesApi'
import type { DateRange } from '../../shared/utils/dateRange'

export function registrationSpecs(dateRange: DateRange, scope: PageSpec['scope']): [PageSpec, PageSpec] {
  const measures: PlanMeasure[] = [
    { code: 'M1', name: '挂号总量', source: 'REGISTRATION', sourceVersion: 1,
      aggregate: 'COUNT', field: 'registrationId', filters: [] },
    { code: 'M2', name: '退号量', source: 'REGISTRATION', sourceVersion: 1,
      aggregate: 'COUNT', field: 'registrationId', filters: [{ field: 'status', operator: 'EQ', values: ['CANCELLED'] }] },
    { code: 'M3', name: '去重挂号患者数', source: 'REGISTRATION', sourceVersion: 1,
      aggregate: 'COUNT_DISTINCT', field: 'patientId', filters: [] },
  ]
  const base = { metrics: measures.map((m) => m.code), scope,
    period: { kind: 'FIXED' as const, startDate: dateRange.from, endDate: dateRange.to }, limit: 100, measures }
  // LIST preserves every department in each series, avoiding independent ranking/truncation of measures.
  return [{ ...base, title: '门诊挂号按日趋势', template: 'TREND', dimension: 'DAY' },
    { ...base, title: '门诊挂号按科室分布', template: 'LIST', dimension: 'DEPARTMENT' }]
}

export function registrationData(result: PageResult) {
  const series = ['M1', 'M2', 'M3'].map((code) => result.series.find((s) => s.code === code))
  if (result.series.length && series.some((s) => !s)) throw new Error('挂号统计指标不完整')
  const [registrations, cancellations, patients] = series
  const cancelByKey = new Map(cancellations?.points.map((p) => [p.key, p.value]))
  const patientByKey = new Map(patients?.points.map((p) => [p.key, p.value]))
  return {
    totalReg: registrations?.total ?? 0,
    totalCancel: cancellations?.total ?? 0,
    // Overall DISTINCT total must not be summed across days or departments.
    totalPat: patients?.total ?? 0,
    points: (registrations?.points ?? []).map((p) => ({
      key: p.key, label: p.label, regCount: p.value,
      cancelCount: cancelByKey.get(p.key) ?? 0,
      patientCount: patientByKey.get(p.key) ?? 0,
    })),
  }
}
