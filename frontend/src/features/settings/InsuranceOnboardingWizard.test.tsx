import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { InsuranceReadinessReport } from '../../shared/api/billingApi'
import type { InsuranceCoverageReport } from '../../shared/api/masterDataApi'
import type { RhnApi } from '../../shared/rhnApi'
import { InsuranceOnboardingWizard } from './InsuranceOnboardingWizard'

const report: InsuranceReadinessReport = {
  checkedAt: '2026-10-18T02:00:00Z', clientMode: 'UNAVAILABLE', clientModeText: '未接入', overall: 'BLOCK', overallText: '阻断',
  summary: { pass: 1, warn: 0, block: 2 }, insuranceSystemCodes: ['SYS-A'],
  sections: [
    { code: 'client', title: '客户端模式', checks: [{ code: 'client-mode', title: '当前医保客户端', status: 'BLOCK', statusText: '阻断', detail: '正式网关与模拟客户端均未启用', fix: '配置网关并启用' }] },
    { code: 'gateway', title: '正式网关配置', checks: [
      { code: 'base-url', title: '网关地址 base-url', status: 'PASS', statusText: '通过', detail: '已配置' },
      { code: 'fixmedins-code', title: '定点医药机构编码', status: 'BLOCK', statusText: '阻断', detail: '未配置', fix: '填写医保平台下发的值' }] },
  ],
}

const coverage: InsuranceCoverageReport = {
  businessDate: '2026-10-18', summary: [
    { category: 'DRUG', categoryText: '药品', total: 3, mapped: 1, unmapped: 1, ambiguous: 1, expired: 0, coverageRate: 33.3 },
    { category: 'SERVICE', categoryText: '诊疗', total: 0, mapped: 0, unmapped: 0, ambiguous: 0, expired: 0 },
    { category: 'SUPPLY', categoryText: '耗材', total: 1, mapped: 0, unmapped: 1, ambiguous: 0, expired: 0, coverageRate: 0 },
  ],
  items: [{ catalogItemId: '1', category: 'DRUG', categoryText: '药品', code: 'D2', name: '头孢', status: 'AMBIGUOUS', statusText: '歧义', detail: '存在 2 个有效映射', termCodes: ['X002', 'X003'] }],
  page: 0, size: 20, total: 1,
}

function setup(overrides: Partial<{ readiness: () => Promise<InsuranceReadinessReport>; canProbe: boolean }> = {}) {
  const insuranceReadiness = vi.fn(overrides.readiness ?? (() => Promise.resolve(report)))
  const insuranceCoverage = vi.fn(() => Promise.resolve(coverage))
  const insuranceCoverageExport = vi.fn(() => Promise.resolve(new Blob(['x'])))
  const onNavigate = vi.fn()
  const insuranceProbeCapability = vi.fn(() => Promise.resolve({ available: false, mode: 'UNAVAILABLE', modeText: '未接入', reason: '正式网关未启用',
    signInRequired: true, settlementAllowed: false }))
  const api = { billing: { insuranceReadiness, insuranceProbeCapability }, masterData: { insuranceCoverage, insuranceCoverageExport } } as unknown as RhnApi
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <InsuranceOnboardingWizard api={api} contextKey="ctx" canProbe={overrides.canProbe} onNavigate={onNavigate} /></QueryClientProvider>)
  return { insuranceProbeCapability, insuranceReadiness, insuranceCoverage, insuranceCoverageExport, onNavigate }
}

describe('InsuranceOnboardingWizard', () => {
  it('shows the overall verdict, per-section status and fix hints', async () => {
    setup()
    expect(await screen.findByText('总体阻断')).toBeInTheDocument()
    expect(screen.getByText('通过 1 · 警告 0 · 阻断 2')).toBeInTheDocument()
    expect(screen.getByText('当前医保客户端：未接入')).toBeInTheDocument()
    expect(screen.getByText('配置网关并启用')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /正式网关配置/ }))
    const table = await screen.findByRole('table', { name: '正式网关配置检查结果' })
    expect(within(table).getByText('填写医保平台下发的值')).toBeInTheDocument()
    expect(within(table).getByText('网关地址 base-url')).toBeInTheDocument()
  })

  it('shows coverage rates, filters server-side and navigates to mapping maintenance', async () => {
    const { insuranceCoverage, onNavigate } = setup()
    await userEvent.click(await screen.findByRole('button', { name: '标准目录对照覆盖率' }))
    expect(await screen.findByText('33.3%')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()   // 无目录项的类别不显示 0%
    expect(screen.getByText('X002、X003')).toBeInTheDocument()
    await waitFor(() => expect(insuranceCoverage).toHaveBeenCalledWith({}, 0, 20))
    await userEvent.click(screen.getByRole('button', { name: '前往标准映射管理' }))
    expect(onNavigate).toHaveBeenCalledWith('/settings/standard-mappings')
  })

  it('exports with the current filter and reports export failures', async () => {
    const { insuranceCoverageExport } = setup()
    insuranceCoverageExport.mockRejectedValueOnce(new Error('导出失败'))
    await userEvent.click(await screen.findByRole('button', { name: '标准目录对照覆盖率' }))
    await userEvent.click(await screen.findByRole('button', { name: '导出当前筛选' }))
    expect(await screen.findByText('导出失败')).toBeInTheDocument()
    expect(insuranceCoverageExport).toHaveBeenCalledWith({})
  })

  it('reports a failed readiness check with a retry action', async () => {
    const { insuranceReadiness } = setup({ readiness: () => Promise.reject(new Error('体检服务不可用')) })
    expect(await screen.findByText('体检服务不可用')).toBeInTheDocument()
    insuranceReadiness.mockResolvedValueOnce(report)
    await userEvent.click(screen.getAllByRole('button', { name: '重新体检' })[0])
    await waitFor(() => expect(insuranceReadiness).toHaveBeenCalledTimes(2))
  })

  it('hides the live connectivity probe from users without the probe permission', async () => {
    const { insuranceProbeCapability } = setup()
    await screen.findByText('总体阻断')
    expect(screen.queryByRole('button', { name: '接口联通探测' })).not.toBeInTheDocument()
    expect(insuranceProbeCapability).not.toHaveBeenCalled()
  })

  it('offers the probe to authorised users and explains why it cannot run yet', async () => {
    setup({ canProbe: true })
    await userEvent.click(await screen.findByRole('button', { name: '接口联通探测' }))
    expect(await screen.findByText('正式网关未启用')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '接口联通探测' })).toBeInTheDocument()
  })

  it('navigates through steps using next and previous buttons', async () => {
    setup()
    expect(await screen.findByText('当前医保客户端：未接入')).toBeInTheDocument()
    expect(screen.getByText('步骤 1 / 4 · 客户端模式')).toBeInTheDocument()

    // 点击下一步流转到正式网关配置
    await userEvent.click(screen.getByRole('button', { name: '下一步' }))
    expect(await screen.findByRole('table', { name: '正式网关配置检查结果' })).toBeInTheDocument()
    expect(screen.getByText('步骤 2 / 4 · 正式网关配置')).toBeInTheDocument()

    // 点击上一步回到客户端模式
    await userEvent.click(screen.getByRole('button', { name: '上一步' }))
    expect(screen.getByText('步骤 1 / 4 · 客户端模式')).toBeInTheDocument()
  })

  it('shows the readiness assessment report and links to the debug console', async () => {
    const { onNavigate } = setup()
    await userEvent.click(await screen.findByRole('button', { name: '上线就绪评估报告' }))
    expect(await screen.findByText(/接入就绪度总体结论：阻断/)).toBeInTheDocument()
    expect(screen.getByText('待整改与关注项目清单（共 2 项）')).toBeInTheDocument()

    // 点击前往医保调试控制台
    await userEvent.click(screen.getByRole('button', { name: '前往医保调试控制台' }))
    expect(onNavigate).toHaveBeenCalledWith('/settings/insurance-debug')
  })
})
