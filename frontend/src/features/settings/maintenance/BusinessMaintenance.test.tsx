import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { MaintenanceBatch, MaintenancePlan, RhnApi } from '../../../shared/rhnApi'
import { BusinessMaintenance } from './BusinessMaintenance'
import { MaintenanceTaskRecords } from './MaintenanceTaskRecords'

const grants = ['MAINTENANCE.VIEW', 'MAINTENANCE.MANAGE', 'MAINTENANCE.EXECUTE', 'CONFIGURATION.ACCESS']
const context = { organization: { id: '11', name: '甲机构' }, department: { id: '12', name: '甲科室' } } as ClinicalContext
const plan: MaintenancePlan = { id: '31', fingerprint: 'test-hash', scope: { tenantId: '1', organizationIds: ['11'], wholeTenant: false },
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(), blockers: [], retained: ['患者档案'], lines: [{ label: '测试参数', module: 'CONFIGURATION', action: 'CREATE' }] }
function fixture(preview = vi.fn().mockResolvedValue(plan), authorities = grants, batches: MaintenanceBatch[] = []) {
  const maintenance = { workspace: vi.fn().mockResolvedValue({ tenantName: '测试租户', environmentName: 'test', physicalCleanupEnabled: true,
    organizations: [{ id: '11', name: '甲机构', lifecycle: 'PRELIVE' }, { id: '21', name: '乙机构', lifecycle: 'PRELIVE' }] }),
    batches: vi.fn().mockResolvedValue(batches), parameterOptions: vi.fn().mockResolvedValue({ parameters: [{ key: 'demo.key', name: '测试参数' }] }),
    preview, execute: vi.fn().mockResolvedValue({ id: '41' }), tasks: vi.fn().mockResolvedValue([]),
    task: vi.fn().mockResolvedValue({ id: '41', status: 'QUEUED' }), audit: vi.fn().mockResolvedValue([]) }
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
async function switchOperation(name: string) {
  await userEvent.click(screen.getByRole('button', { name: '切换操作' }))
  await userEvent.click(screen.getByRole('menuitem', { name }))
}
describe('business maintenance scope and confirmation', () => {
  it('makes the operation explicit and invalidates previews when switching operations', async () => {
    fixture()
    await prepare()
    expect(screen.getByRole('heading', { level: 1, name: '业务初始化' })).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '生成初始化预览' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '执行初始化' })).toBeEnabled())
    await switchOperation('业务清理')
    expect(screen.getByRole('heading', { level: 1, name: '业务清理' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '执行业务清理' })).toBeDisabled()
    expect(screen.queryByLabelText(/待补齐参数/)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '执行记录' }))
    expect(screen.getByRole('heading', { level: 1, name: '维护执行记录' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/目标机构/)).not.toBeInTheDocument()
    await switchOperation('业务初始化')
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '生成初始化预览' })).toBeEnabled()
    expect(screen.getByLabelText(/操作原因/)).toHaveValue('上线前测试')
  })
  it('keeps every blocker accessible while presenting shared guidance once', async () => {
    fixture(vi.fn().mockResolvedValue({ ...plan, blockers: [
      { code: 'MAINTENANCE_UNREGISTERED_BUSINESS_REFERENCE', module: 'OUTPATIENT', message: '存在医技执行关联' },
      { code: 'MAINTENANCE_UNREGISTERED_BUSINESS_REFERENCE', module: 'OUTPATIENT', message: '存在检验标本关联' },
      { code: 'MAINTENANCE_EXTERNAL_PAYMENT_BLOCKED', module: 'BILLING', message: '存在外部支付交易' },
    ] }))
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: '生成初始化预览' }))
    await screen.findByText('存在 3 项阻断，暂不可执行')
    expect(screen.queryByText('存在医技执行关联')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '查看阻断原因' }))
    const dialog = screen.getByRole('dialog', { name: '预览阻断原因' })
    for (const message of ['存在医技执行关联', '存在检验标本关联', '存在外部支付交易']) {
      expect(within(dialog).getByText(message)).toBeInTheDocument()
    }
    expect(within(dialog).getAllByText('当前清理能力尚未覆盖这项关联业务。请联系对应领域维护人员核对接入范围。')).toHaveLength(1)
    await userEvent.click(within(dialog).getByRole('button', { name: '返回预览' }))
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
  })
  it('requires the exact target name before executing the reviewed plan', async () => {
    const { maintenance } = fixture()
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '执行初始化' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '执行初始化' }))
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
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1))
    rerender(view({ organization: { id: '21', name: '乙机构' }, department: { id: '22', name: '乙科室' } } as ClinicalContext))
    await act(async () => { resolve(plan) })
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
    expect(screen.getByText('先生成影响预览')).toBeInTheDocument()
  })
  it('keeps a blocked preview non-executable and prevents an ungranted preview', async () => {
    const { unmount } = fixture(vi.fn().mockResolvedValue({ ...plan, blockers: [{ message: '存在未接入业务引用' }] }))
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await screen.findByText('存在 1 项阻断，暂不可执行')
    await userEvent.click(screen.getByRole('button', { name: '查看阻断原因' }))
    await screen.findByText('存在未接入业务引用')
    await userEvent.click(screen.getByRole('button', { name: '返回预览' }))
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
    unmount()
    const { maintenance } = fixture(vi.fn(), ['MAINTENANCE.VIEW', 'CONFIGURATION.ACCESS'])
    await prepare()
    expect(screen.getByRole('button', { name: /生成.*预览/ })).toBeDisabled()
    expect(maintenance.preview).not.toHaveBeenCalled()
  })
  it('clears the old executable plan when a replacement preview fails', async () => {
    const preview = vi.fn().mockResolvedValueOnce(plan).mockRejectedValueOnce(new Error('重新预览失败'))
    fixture(preview)
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '执行初始化' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await screen.findByText('重新预览失败')
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
    expect(screen.getByText('先生成影响预览')).toBeInTheDocument()
  })
  it('explains an expired plan and an independent execution permission', async () => {
    const { unmount } = fixture(vi.fn().mockResolvedValue({ ...plan, expiresAt: '2000-01-01T00:00:00Z' }))
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await screen.findByText('预览已过期，请重新生成。')
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
    unmount()
    fixture(undefined, grants.filter(grant => grant !== 'MAINTENANCE.EXECUTE'))
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await screen.findByText('缺少维护执行权限。')
    expect(screen.getByRole('button', { name: '执行初始化' })).toBeDisabled()
  })
  it('guides an empty test batch flow and requires a fresh prelive declaration after scope changes', async () => {
    const { maintenance } = fixture(undefined, [...grants, 'MAINTENANCE.LIFECYCLE'])
    await screen.findByText('环境：test · 租户：测试租户')
    await switchOperation('业务清理')
    await screen.findByText('请登记并选择测试批次。')
    expect(screen.getByRole('button', { name: /生成.*预览/ })).toBeDisabled()
    await userEvent.click(screen.getByRole('combobox', { name: '清理场景' }))
    await userEvent.click(screen.getByRole('option', { name: '上线前重置门诊业务' }))
    await userEvent.click(screen.getByRole('checkbox', { name: /所选机构尚未上线/ }))
    fireEvent.change(screen.getByLabelText(/操作原因/), { target: { value: '上线前清理演示门诊' } })
    expect(screen.getByRole('button', { name: /生成.*预览/ })).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await waitFor(() => expect(maintenance.preview).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'RESET_PRELIVE', datasetCode: 'CLINICAL_TEST', batchId: undefined,
      inputJson: JSON.stringify({ noRealEffectsConfirmed: true }),
    })))
    await userEvent.click(screen.getByRole('checkbox', { name: '包含下属机构' }))
    expect(screen.getByRole('checkbox', { name: /所选机构尚未上线/ })).not.toBeChecked()
    expect(screen.getByRole('button', { name: /生成.*预览/ })).toBeDisabled()
  })
  it('takes a reviewed test batch through cleanup preview, confirmation and task tracking', async () => {
    const cleanupPlan = { ...plan, operation: 'CLEAN_TEST', datasetCode: 'CLINICAL_TEST' }
    const { maintenance } = fixture(vi.fn().mockResolvedValue(cleanupPlan), grants, [{ id: '51', name: '门诊演练',
      datasetCode: 'CLINICAL_TEST', roots: [{ module: 'OUTPATIENT', resourceType: 'ENCOUNTER', resourceId: '61', organizationId: '11' }] }])
    await screen.findByText('环境：test · 租户：测试租户')
    await switchOperation('业务清理')
    await userEvent.click(screen.getByRole('combobox', { name: '测试来源批次' }))
    await userEvent.click(await screen.findByRole('option', { name: /门诊演练/ }))
    fireEvent.change(screen.getByLabelText(/操作原因/), { target: { value: '清理门诊演练数据' } })
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await waitFor(() => expect(maintenance.preview).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'CLEAN_TEST', datasetCode: 'CLINICAL_TEST', batchId: '51', modules: ['OUTPATIENT', 'BILLING', 'PHARMACY'],
    })))
    await userEvent.click(screen.getByRole('button', { name: '执行业务清理' }))
    fireEvent.change(screen.getByLabelText(/输入目标名称确认/), { target: { value: '甲机构' } })
    await userEvent.click(screen.getByRole('button', { name: '启动维护任务' }))
    await screen.findByRole('heading', { name: '任务 41 · 等待执行' })
    expect(maintenance.execute).toHaveBeenCalledOnce()
  })
  it('refreshes cached records after submission and opens the submitted task even outside the latest list', async () => {
    const { maintenance } = fixture()
    await prepare()
    await userEvent.click(screen.getByRole('button', { name: '执行记录' }))
    await screen.findByText('暂无执行记录')
    await switchOperation('业务初始化')
    await userEvent.click(screen.getByRole('button', { name: /生成.*预览/ }))
    await waitFor(() => expect(screen.getByRole('button', { name: '执行初始化' })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '执行初始化' }))
    fireEvent.change(screen.getByLabelText(/输入目标名称确认/), { target: { value: '甲机构' } })
    await userEvent.click(screen.getByRole('button', { name: '启动维护任务' }))
    await screen.findByRole('heading', { name: '任务 41 · 等待执行' })
    expect(maintenance.task).toHaveBeenCalledWith('41')
    expect(maintenance.tasks.mock.calls.length).toBeGreaterThan(1)
    expect(screen.getByText('任务已提交，等待后台执行。进入隔离阶段前可取消。')).toBeInTheDocument()
  })
  it('shows the recovery path for an uncommitted cleanup failure', async () => {
    const onReturnToSetup = vi.fn()
    const maintenance = { tasks: vi.fn().mockResolvedValue([]), audit: vi.fn().mockResolvedValue([]),
      task: vi.fn().mockResolvedValue({ id: '41', operation: 'CLEAN_TEST', status: 'FAILED',
        failureCode: 'MAINTENANCE_SOURCE_CHANGED', failureMessage: '业务数据或引用关系已变化，请重新预览' }) }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MaintenanceTaskRecords api={{ maintenance } as unknown as RhnApi}
      scopeKey="test" authorities={grants} tenantName="测试租户" organizations={[]} initialTaskId="41" onReturnToSetup={onReturnToSetup} /></QueryClientProvider>)
    await screen.findByText('业务数据或引用关系已变化，请重新预览')
    await userEvent.click(screen.getByRole('button', { name: '返回设置重新预览' }))
    expect(onReturnToSetup).toHaveBeenCalledWith('CLEAN_TEST')
    expect(screen.queryByRole('button', { name: '重试派生数据校验' })).not.toBeInTheDocument()
  })
  it('only retries derived verification after a committed cleanup failure', async () => {
    const onReturnToSetup = vi.fn()
    const maintenance = { tasks: vi.fn().mockResolvedValue([]), audit: vi.fn().mockResolvedValue([]),
      retryVerification: vi.fn().mockResolvedValue({ id: '41', status: 'VERIFYING' }),
      task: vi.fn().mockResolvedValueOnce({ id: '41', status: 'FAILED', failureCode: 'MAINTENANCE_POST_COMMIT_FAILED' })
        .mockResolvedValue({ id: '41', status: 'VERIFYING' }) }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MaintenanceTaskRecords api={{ maintenance } as unknown as RhnApi}
      scopeKey="test" authorities={grants} tenantName="测试租户" organizations={[]} initialTaskId="41" onReturnToSetup={onReturnToSetup} /></QueryClientProvider>)
    await screen.findByText('数据库处理已提交，业务写入仍暂停。请重试派生数据校验，完成后恢复写入。')
    expect(screen.queryByRole('button', { name: '返回设置重新预览' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重试派生数据校验' }))
    await screen.findByRole('heading', { name: '任务 41 · 核验派生数据' })
    expect(maintenance.retryVerification).toHaveBeenCalledOnce()
    expect(maintenance.retryVerification).toHaveBeenCalledWith('41')
    expect(onReturnToSetup).not.toHaveBeenCalled()
  })
})
