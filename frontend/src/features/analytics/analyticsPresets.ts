import type { SavedPage } from '../../shared/api/analysisPagesApi'

export const SYSTEM_PRESET_PAGES: SavedPage[] = [
  {
    id: 'preset-outpatient-reg-trend',
    spec: {
      title: '门诊挂号按日趋势',
      template: 'TREND',
      metrics: ['M1', 'M2'],
      dimension: 'DAY',
      scope: 'AUTHORIZED',
      period: { kind: 'LAST_30_DAYS' },
      limit: 30,
      measures: [
        {
          code: 'M1',
          name: '挂号总量',
          source: 'REGISTRATION',
          sourceVersion: 1,
          aggregate: 'COUNT',
          field: 'registrationId',
          filters: [],
        },
        {
          code: 'M2',
          name: '退号量',
          source: 'REGISTRATION',
          sourceVersion: 1,
          aggregate: 'COUNT',
          field: 'registrationId',
          filters: [{ field: 'status', operator: 'EQ', values: ['CANCELLED'] }],
        },
      ],
    },
    savedAt: '2026-09-01T00:00:00Z',
    version: 1,
    archived: false,
  },
  {
    id: 'preset-outpatient-reg-dept',
    spec: {
      title: '门诊挂号科室分布',
      template: 'RANKING',
      metrics: ['M1'],
      dimension: 'DEPARTMENT',
      scope: 'AUTHORIZED',
      period: { kind: 'LAST_30_DAYS' },
      limit: 20,
      measures: [
        {
          code: 'M1',
          name: '挂号总量',
          source: 'REGISTRATION',
          sourceVersion: 1,
          aggregate: 'COUNT',
          field: 'registrationId',
          filters: [],
        },
      ],
    },
    savedAt: '2026-09-01T00:00:00Z',
    version: 1,
    archived: false,
  },
  {
    id: 'preset-outpatient-workload-dept',
    spec: {
      title: '门诊就诊科室分布',
      template: 'RANKING',
      metrics: ['M1'],
      dimension: 'DEPARTMENT',
      scope: 'AUTHORIZED',
      period: { kind: 'LAST_30_DAYS' },
      limit: 20,
      measures: [
        {
          code: 'M1',
          name: '就诊人次',
          source: 'ENCOUNTER',
          sourceVersion: 1,
          aggregate: 'COUNT',
          field: 'encounterId',
          filters: [],
        },
      ],
    },
    savedAt: '2026-09-01T00:00:00Z',
    version: 1,
    archived: false,
  },
  {
    id: 'preset-outpatient-order-dept',
    spec: {
      title: '门诊药品医嘱科室分布',
      template: 'RANKING',
      metrics: ['M1'],
      dimension: 'DEPARTMENT',
      scope: 'AUTHORIZED',
      period: { kind: 'LAST_30_DAYS' },
      limit: 20,
      measures: [
        {
          code: 'M1',
          name: '药品医嘱条数',
          source: 'ORDER',
          sourceVersion: 1,
          aggregate: 'COUNT',
          field: 'orderId',
          filters: [
            { field: 'status', operator: 'EQ', values: ['ACTIVE'] },
            { field: 'kind', operator: 'EQ', values: ['MEDICATION'] },
          ],
        },
      ],
    },
    savedAt: '2026-09-01T00:00:00Z',
    version: 1,
    archived: false,
  },
]

export function isPresetPage(id: string | null | undefined): boolean {
  if (!id) return false
  return id.startsWith('preset-')
}
