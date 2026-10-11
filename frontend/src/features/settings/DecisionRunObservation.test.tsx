import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { DecisionRunObservation } from './DecisionRunObservation'

const record = { id: 'r1', scene: 'PLAN_COMPILATION', mode: 'SHADOW', outcome: 'SHADOW', comparison: 'MANUAL_REVIEW', time: '2026-10-10T02:00:00Z', model: 'synthetic', latencyMs: 10 }
const page = { organizationId: 'o1', departmentId: 'd1', auditVersion: 'DECISION-OBSERVATION-V1',
  scenes: [{ scene: 'OUTPATIENT_TRIAGE', label: '预检分诊辅助', mode: 'SHADOW', state: 'SCENE_DISABLED' }],
  records: { content: [record], totalElements: 21, totalPages: 2, page: 0, size: 20 },
  statistics: { total: 21, comparable: 0, equal: 0, reviewed: 1, averageLatencyMs: 10, p95LatencyMs: 15, outcomes: { SHADOW: 21 } } }
function setup(data = page) {
  const observations = { list: vi.fn().mockResolvedValue(data), detail: vi.fn().mockResolvedValue({ run: { ...record, version: 'v1', input: { state: { name: '合成候选' } }, answers: { intent_0: { confidence: .9 } } }, reviews: [] }), review: vi.fn().mockResolvedValue({}) }
  const api = { decisionObservations: observations } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><DecisionRunObservation api={api} onClose={vi.fn()} /></QueryClientProvider>)
  return observations
}
describe('DecisionRunObservation', () => {
  it('shows state explanations and excludes manual baselines from consistency counts', async () => {
    setup()
    await screen.findByText('原流程需人工核对')
    expect(screen.queryByText('与基线不同')).not.toBeInTheDocument()
    expect(screen.getByText(/场景未启用/)).toBeInTheDocument()
    expect(screen.getByText(/非临床正确率/)).toBeInTheDocument()
    expect(screen.getByText(/待研判 20/)).toBeInTheDocument()
  })
  it('requests another page and applies the chosen scene independently', async () => {
    const api = setup(), user = userEvent.setup()
    await screen.findByText('原流程需人工核对')
    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })))
    await user.click(screen.getByRole('combobox', { name: '决策场景' }))
    await user.click(screen.getByRole('option', { name: /智能建方目录核查/ }))
    await user.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({ scene: 'PLAN_COMPILATION', page: 0 })))
  })
  it('reads snapshots only on demand and retains review input when saving fails', async () => {
    const api = setup(), user = userEvent.setup()
    await screen.findByText('原流程需人工核对')
    expect(api.detail).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '详情与研判' }))
    await screen.findByText('研判历史')
    expect(api.detail).toHaveBeenCalledWith('r1')
    await user.click(screen.getByRole('combobox', { name: '研判结果' }))
    await user.click(screen.getByRole('option', { name: '建议适当' }))
    fireEvent.change(screen.getByRole('textbox', { name: '研判原因' }), { target: { value: '合成研判原因' } })
    api.review.mockRejectedValueOnce(new Error('保存失败'))
    await user.click(screen.getByRole('button', { name: '记录研判' }))
    await screen.findByText('保存失败')
    expect(screen.getByRole('textbox', { name: '研判原因' })).toHaveValue('合成研判原因')
    await user.click(screen.getByRole('button', { name: '记录研判' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: '研判原因' })).toHaveValue(''))
    expect(api.review).toHaveBeenCalledWith('r1', 'APPROPRIATE', '合成研判原因')
  })
  it('explains no triggers and surfaces refresh failures rather than showing cached success', async () => {
    const api = setup({ ...page, scenes: [{ ...page.scenes[0], state: 'NOT_TRIGGERED' }], records: { ...page.records, content: [], totalElements: 0, totalPages: 0 } })
    await screen.findByText(/尚无持久化触发记录/)
    expect(screen.getByText(/当前范围暂无记录/)).toBeInTheDocument()
    api.list.mockRejectedValueOnce(new Error('服务不可用'))
    await userEvent.click(screen.getByRole('button', { name: '刷新' }))
    await screen.findByText('服务不可用')
    expect(screen.queryByText(/当前范围暂无记录/)).not.toBeInTheDocument()
  })
  it('supports date range picker and sends updated date range in query', async () => {
    const api = setup(), user = userEvent.setup()
    await screen.findByText('原流程需人工核对')
    const startInput = screen.getByLabelText('开始日期')
    const endInput = screen.getByLabelText('结束日期')
    expect(startInput).toBeInTheDocument()
    expect(endInput).toBeInTheDocument()
    fireEvent.change(startInput, { target: { value: '2026-10-01' } })
    fireEvent.change(endInput, { target: { value: '2026-10-05' } })
    await user.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.list).toHaveBeenLastCalledWith(expect.objectContaining({
      from: new Date('2026-10-01T00:00:00').toISOString(),
      to: new Date('2026-10-06T00:00:00').toISOString(),
      page: 0,
    })))
  })
})
