import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { ClinicalMedicationStandardsPanel } from './ClinicalMedicationStandardsPanel'

it('shows structural frequency identities while keeping PRN without a daily rate', async () => {
  const clinicalMedicationStandards = vi.fn().mockResolvedValue({
    version: 'rhn-medication-standards-v1',
    doseUnits: [{ id: 'UCUM:mg', display: '毫克', code: 'mg', dimension: 'MASS', conversionFactor: 0.001, canonicalUnit: 'g' }],
    routes: [{ id: 'oral', code: 'ORAL', name: '口服', systemCode: 'RHN.ROUTE', systemVersion: '1' }],
    frequencies: [
      { scheduleCapability: { status: 'SUPPORTED', explanation: '每日钟点与平均频率分别确认' }, id: 'bid', code: 'BID', name: '每日两次', standard: { conceptId: 'TIMES_PER_DAY:2/1:DAY', interpretation: { kind: 'TIMES_PER_DAY', dailyRateComputable: true, doses: 2, perDays: 1 } } },
      { id: 'prn', code: 'PRN', name: '必要时', standard: { conceptId: 'AS_NEEDED', interpretation: { kind: 'AS_NEEDED', dailyRateComputable: false } } },
    ],
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const medicationStandardReadiness = vi.fn().mockResolvedValue({ inspectedAt: '2026-09-21T00:00:00Z',
    summary: {totalActive: 0, referenceStatuses: {LINKED: 0}, sourceUnverified: 0, conversionUnavailable: 0}, content: [], totalElements: 0, totalPages: 0 })
  const references = vi.fn().mockResolvedValue({ scope: { status: 'ACTIVE' }, totals: {}, coverage: [], limitations: [], content: [], totalElements: 0, totalPages: 0, historicalCount: 0, potentialCount: 0, inspectedAt: '2026-09-21T00:00:00Z' })
  render(<QueryClientProvider client={client}><ClinicalMedicationStandardsPanel api={{ masterData: { clinicalMedicationStandards, medicationStandardReadiness }, clinicalSemanticImpact: { references } } as unknown as RhnApi} /></QueryClientProvider>)
  expect(await screen.findByText('药品标准建设情况')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('tab', { name: /临床用药规则基准/ }))
  await screen.findByText('TIMES_PER_DAY:2/1:DAY')
  expect(screen.getByText('2 次 / 1 天')).toBeInTheDocument()
  expect(screen.getByText('每日钟点与平均频率分别确认')).toBeInTheDocument()
  const prn = screen.getByText('必要时').closest('tr')!
  expect(within(prn).getByText('无固定日频率')).toBeInTheDocument()
  expect(screen.getByText(/默认剂量不代表安全上限/)).toBeInTheDocument()
  for (const [name, kind, conceptId, tabPattern] of [
    ['每日两次', 'FREQUENCY', 'bid', /频次标准/],
    ['口服', 'ROUTE', 'oral', /给药途径/],
    ['毫克', 'UNIT', 'UCUM:mg', /临床剂量单位/],
  ] as const) {
    await userEvent.click(screen.getByRole('tab', { name: tabPattern }))
    if (kind === 'UNIT') {
      expect(screen.getByText('1 mg = 0.001 g')).toBeInTheDocument()
    }
    const row = screen.getByText(name).closest('tr')!
    await userEvent.click(within(row).getByRole('button', { name: '查看引用' }))
    await waitFor(() => expect(references).toHaveBeenLastCalledWith({ kind, conceptId, name }, 'ALL', true, 0))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '关闭弹窗' }))
  }
})

it('allows switching seamlessly between readiness and clinical rules views', async () => {
  const clinicalMedicationStandards = vi.fn().mockResolvedValue({
    version: 'rhn-medication-standards-v2',
    doseUnits: [{ id: 'UCUM:mg', display: '毫克', code: 'mg', dimension: 'MASS', conversionFactor: 0.001, canonicalUnit: 'g' }],
    routes: [{ id: 'oral', code: 'ORAL', name: '口服', systemCode: 'RHN.ROUTE', systemVersion: '1' }],
    frequencies: [{ id: 'bid', code: 'BID', name: '每日两次', standard: { conceptId: 'TIMES_PER_DAY:2/1:DAY', interpretation: { kind: 'TIMES_PER_DAY', dailyRateComputable: true, doses: 2, perDays: 1 } } }],
  })
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const medicationStandardReadiness = vi.fn().mockResolvedValue({
    inspectedAt: '2026-09-21T00:00:00Z',
    summary: { totalActive: 100, referenceStatuses: { LINKED: 80 }, sourceUnverified: 10, conversionUnavailable: 5 },
    content: [], totalElements: 100, totalPages: 5,
  })
  render(
    <QueryClientProvider client={client}>
      <ClinicalMedicationStandardsPanel
        api={{ masterData: { clinicalMedicationStandards, medicationStandardReadiness } } as unknown as RhnApi}
      />
    </QueryClientProvider>
  )

  expect(await screen.findByText('药品标准建设情况')).toBeInTheDocument()
  expect(await screen.findByText('全量统计，筛选不改变分母')).toBeInTheDocument()
  expect(screen.queryByText('频次标准 · 1')).not.toBeInTheDocument()

  // 切换到临床规则基准
  await userEvent.click(screen.getByRole('tab', { name: /临床用药规则基准/ }))
  expect(await screen.findByText('频次标准 · 1')).toBeInTheDocument()
  expect(screen.getByText('给药途径 · 1')).toBeInTheDocument()
  expect(screen.getByText('临床剂量单位 · 1')).toBeInTheDocument()
  expect(screen.queryByText('全量统计，筛选不改变分母')).not.toBeInTheDocument()

  // 切回药品标准建设
  await userEvent.click(screen.getByRole('tab', { name: /药品标准建设与对齐/ }))
  expect(await screen.findByText('药品标准建设情况')).toBeInTheDocument()
  expect(await screen.findByText('全量统计，筛选不改变分母')).toBeInTheDocument()
})

