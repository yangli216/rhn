import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalContext } from '../../app/AppShell'
import type { TreatmentExecutionTask } from '../../shared/api/treatmentApi'
import type { RhnApi } from '../../shared/rhnApi'
import { TreatmentExecutionWorkspace } from './TreatmentExecutionWorkspace'

const context = { organization: { id: 'org1', name: '机构' }, department: { id: 'dept1', name: '门诊' } } as ClinicalContext
const task: TreatmentExecutionTask = { id: 'task1', revision: 1, taskNo: 'TX001', taskType: 'SERVICE',
  status: 'IN_PROGRESS', residentId: 'res1', residentName: '患者甲', healthRecordNo: 'H001', encounterId: 'enc1',
  organizationId: 'org1', departmentId: 'dept1', createdAt: '2026-10-03T01:00:00Z', adverseReaction: null, items: [] }
function setup(tasks: TreatmentExecutionTask[] = [task], load = vi.fn().mockResolvedValue(tasks)) {
  const treatments = { worklist: load, start: vi.fn().mockResolvedValue(task), complete: vi.fn().mockResolvedValue(task) }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/treatment?encounterId=enc1']}>
    <TreatmentExecutionWorkspace api={{ treatments } as unknown as RhnApi} clinicalContext={context} onNavigate={vi.fn()} />
  </MemoryRouter></QueryClientProvider>)
  return { treatments, client }
}
async function choose(label: RegExp, option: string) {
  await userEvent.click(screen.getByLabelText(label))
  await userEvent.click(screen.getByRole('option', { name: option }))
}

describe('explicit treatment assessment', () => {
  it.each([
    ['COMPLETED', 'dispense-1', '已发药'],
    ['COMPLETED', undefined, '发药凭证缺失'],
    ['PARTIAL', 'dispense-1', '部分发药或退药'],
    ['RETURNED', 'dispense-1', '已退药'],
    ['PENDING', 'dispense-1', '待审方'],
    ['INCOMPLETE', undefined, '发药未完成'],
    [undefined, 'dispense-1', '发药状态未知'],
    ['UNRECOGNIZED', 'dispense-1', '发药状态未知'],
  ])('shows actual fulfillment status %s with document %s', async (fulfillmentStatus, fulfillmentId, label) => {
    setup([{ ...task, items: [{ id: 'item1', sourceType: 'MEDICATION_REQUEST', sourceId: 'request1',
      requestNo: 'MR001', itemCode: 'DRUG1', itemName: '治疗用药甲', skinTestRequired: false,
      skinTestStatus: 'NOT_REQUIRED', settlementRequired: false, fulfillmentRequired: true,
      fulfillmentId, fulfillmentStatus, cancelled: false, ready: false, createdAt: task.createdAt }] }])
    const badge = await screen.findByText(label!)
    const row = within(badge.closest('article')!)
    expect(row.getByText(label!)).toBeInTheDocument()
    if (label !== '已发药') expect(row.queryByText('已发药')).not.toBeInTheDocument()
  })

  it('does not default to completed or no adverse reaction', async () => {
    const { treatments } = setup()
    await screen.findByText('完成执行')
    expect(screen.getByLabelText(/执行结果/)).toHaveTextContent('请选择实际执行结果')
    expect(screen.getByLabelText(/不良反应评估/)).toHaveTextContent('请选择评估结果')
    expect(screen.getByRole('button', { name: '确认完成' })).toBeDisabled()
    await choose(/执行结果/, '顺利完成')
    expect(screen.getByRole('button', { name: '确认完成' })).toBeDisabled()
    await choose(/不良反应评估/, '未发生不良反应')
    fireEvent.click(screen.getByRole('button', { name: '确认完成' }))
    await waitFor(() => expect(treatments.complete).toHaveBeenCalledWith('task1', expect.objectContaining({
      resultCode: 'COMPLETED', adverseReaction: false,
    })))
  })

  it('requires details for an adverse reaction and submits the actual result', async () => {
    const { treatments } = setup()
    await screen.findByText('完成执行')
    await choose(/执行结果/, '中途停止')
    await choose(/不良反应评估/, '发生不良反应')
    expect(screen.getByRole('button', { name: '确认完成' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/不良反应详情/), { target: { value: '出现皮疹，停止治疗并通知医生' } })
    fireEvent.click(screen.getByRole('button', { name: '确认完成' }))
    await waitFor(() => expect(treatments.complete).toHaveBeenCalledWith('task1', expect.objectContaining({
      resultCode: 'INTERRUPTED', adverseReaction: true, adverseReactionDetail: '出现皮疹，停止治疗并通知医生',
    })))
  })

  it('clears the assessment when changing patients', async () => {
    setup([task, { ...task, id: 'task2', encounterId: 'enc2', residentName: '患者乙' }])
    await screen.findByText('完成执行')
    await choose(/执行结果/, '顺利完成')
    await choose(/不良反应评估/, '未发生不良反应')
    fireEvent.click(screen.getByRole('button', { name: /患者乙/ }))
    expect(screen.getByLabelText(/执行结果/)).toHaveTextContent('请选择实际执行结果')
    expect(screen.getByLabelText(/不良反应评估/)).toHaveTextContent('请选择评估结果')
    expect(screen.getByRole('button', { name: '确认完成' })).toBeDisabled()
  })

  it('requires an actual identity verification method without inventing an execution site', async () => {
    const { treatments } = setup([{ ...task, status: 'READY' }])
    await screen.findByText('开始执行')
    expect(screen.getByLabelText('执行地点')).toHaveValue('')
    fireEvent.click(screen.getByRole('checkbox', { name: /已当面核对/ }))
    expect(screen.getByRole('button', { name: '确认开始' })).toBeDisabled()
    await choose(/核对方式/, '读卡核对')
    fireEvent.click(screen.getByRole('button', { name: '确认开始' }))
    await waitFor(() => expect(treatments.start).toHaveBeenCalledWith('task1', expect.objectContaining({
      identityVerified: true, verificationMethod: 'CARD', executionSite: undefined,
    })))
  })

  it('shows unknown historical assessment without inventing identity verification', async () => {
    setup([{ ...task, status: 'COMPLETED', resultCode: 'COMPLETED', completedAt: '2026-10-03T02:00:00Z' }])
    await screen.findByText('治疗已完成')
    expect(screen.getByText('未评估')).toBeInTheDocument()
    expect(screen.queryByText('姓名 + 证件/卡')).not.toBeInTheDocument()
  })

  it('blocks stale tasks after a queue refresh fails', async () => {
    const { treatments, client } = setup()
    await screen.findByText('完成执行')
    await choose(/执行结果/, '顺利完成')
    await choose(/不良反应评估/, '未发生不良反应')
    treatments.worklist.mockRejectedValue(new Error('队列不可用'))
    await act(async () => { await client.invalidateQueries({ queryKey: ['treatment-worklist'] }) })
    await screen.findByText('治疗队列加载失败')
    expect(screen.queryByRole('button', { name: '确认完成' })).not.toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: '治疗任务摘要' })).getAllByText('—')).toHaveLength(5)
    expect(treatments.complete).not.toHaveBeenCalled()
  })
})
