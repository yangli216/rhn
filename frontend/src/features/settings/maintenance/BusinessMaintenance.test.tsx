import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { MaintenancePlan, RhnApi } from '../../../shared/rhnApi'
import { BusinessMaintenance } from './BusinessMaintenance'

const grants = ['MAINTENANCE.VIEW', 'MAINTENANCE.MANAGE', 'MAINTENANCE.EXECUTE', 'CONFIGURATION.ACCESS']
const context = { organization: { id: '11', name: '甲机构' }, department: { id: '12', name: '甲科室' } } as ClinicalContext
const plan: MaintenancePlan = { id: '31', fingerprint: 'test-hash', scope: { tenantId: '1', organizationIds: ['11'], wholeTenant: false },
  expiresAt: '2026-10-13T20:00:00Z', blockers: [], retained: ['患者档案'], lines: [{ label: '测试参数', module: 'CONFIGURATION', action: 'CREATE' }] }
function fixture(preview = vi.fn().mockResolvedValue(plan), authorities = grants) {
  const maintenance = { workspace: vi.fn().mockResolvedValue({ tenantName: '测试租户', environmentName: 'test', physicalCleanupEnabled: true,
    organizations: [{ id: '11', name: '甲机构', lifecycle: 'PRELIVE' }, { id: '21', name: '乙机构', lifecycle: 'PRELIVE' }] }),
    batches: vi.fn().mockResolvedValue([]), parameterOptions: vi.fn().mockResolvedValue({ parameters: [{ key: 'demo.key', name: '测试参数' }] }),
    preview, execute: vi.fn().mockResolvedValue({ id: '41' }), tasks: vi.fn().mockResolvedValue([]) }
  const api = { maintenance } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (current = context) => <QueryClientProvider client={client}><BusinessMaintenance api={api} tenantId="1" context={current} authorities={authorities} /></QueryClientProvider>
  const rendered = render(view())
  return { ...rendered, maintenance, view }
}
async function prepare() {
  await screen.findByText('环境：test · 租户：测试租户')
  await userEvent.click(screen.getByRole('combobox', { name: /待补齐参数/ }))
  await userEvent.click(await screen.findByRole('option', { name: /测试参数/ }))
  await userEvent.keyboard('{Escape}')
  fireEvent.change(screen.getByLabelText(/操作原因/), { target: { value: '上线前测试' } })
}
describe('business maintenance scope and confirmation', () => {
  it('requires the exact target name before executing the reviewed plan', async () => {
    const { maintenance } = fixture()
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: '生成影响预览' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '核对并初始化' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '核对并初始化' }))
    const run = screen.getByRole('button', { name: '启动维护任务' })
    expect(run).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/输入目标名称确认/), { target: { value: '乙机构' } })
    expect(run).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/输入目标名称确认/), { target: { value: '甲机构' } })
    await userEvent.click(run)
    await waitFor(() => expect(maintenance.execute).toHaveBeenCalledWith('31', expect.objectContaining({ fingerprint: 'test-hash', confirmation: '甲机构' })))
  })
  it('does not adopt a late preview from the previous institution', async () => {
    let resolve!: (value: MaintenancePlan) => void
    const preview = vi.fn(() => new Promise<MaintenancePlan>(done => { resolve = done }))
    const { rerender, view } = fixture(preview)
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: '生成影响预览' }))
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1))
    rerender(view({ organization: { id: '21', name: '乙机构' }, department: { id: '22', name: '乙科室' } } as ClinicalContext))
    await act(async () => { resolve(plan) })
    expect(screen.getByRole('button', { name: '核对并初始化' })).toBeDisabled()
    expect(screen.getByText('先生成影响预览')).toBeInTheDocument()
  })
  it('keeps a blocked preview non-executable and prevents an ungranted preview', async () => {
    const { unmount } = fixture(vi.fn().mockResolvedValue({ ...plan, blockers: [{ message: '存在未接入业务引用' }] }))
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: '生成影响预览' }))
    await screen.findByText('存在未接入业务引用')
    expect(screen.getByRole('button', { name: '核对并初始化' })).toBeDisabled()
    unmount()
    const { maintenance } = fixture(vi.fn(), ['MAINTENANCE.VIEW', 'CONFIGURATION.ACCESS'])
    await prepare()
    expect(screen.getByRole('button', { name: '生成影响预览' })).toBeDisabled()
    expect(maintenance.preview).not.toHaveBeenCalled()
  })
})
