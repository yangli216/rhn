import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { FrequencySchedulePreview } from './FrequencySchedulePreview'
import type { OrderFrequencySchedulePreview } from '../../shared/api/masterDataApi'

const result: OrderFrequencySchedulePreview = { frequencyCode: 'LOCAL', frequencyName: '测试', ruleType: 'TIMES_PER_PERIOD', explanation: '每周日期尚未明确', plannedTimes: [], capability: { version: 'v1', status: 'UNSUPPORTED', reason: 'PERIOD_DISTRIBUTION_REQUIRED', explanation: '每周日期尚未明确' }, standard: { system: 'TEST', version: 'v2', status: 'STANDARDIZED', conceptId: '2/7', interpretation: { kind: 'TIMES_PER_DAY', dailyRateComputable: true, doses: 2, perDays: 7, unknownReason: null } } }
it('shows a computable average independently from an unavailable schedule, without implying tasks were created', async () => {
  const load = vi.fn().mockResolvedValue(result)
  render(<FrequencySchedulePreview inputKey="weekly" load={load} />)
  expect(load).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: /预演当前内容/ }))
  expect(await screen.findByText('每周日期尚未明确')).toBeInTheDocument()
  expect(screen.getByText(/平均频率：2 次 \/ 7 天/)).toBeInTheDocument()
  expect(screen.getByText(/不是任意一天或任意 24 小时/)).toBeInTheDocument()
  expect(screen.queryByRole('list')).not.toBeInTheDocument()
})
it('ignores an old response after inputs change and only shows a newly requested matching result', async () => {
  let finish: (value: OrderFrequencySchedulePreview) => void = () => {}
  const load = vi.fn().mockImplementationOnce(() => new Promise<OrderFrequencySchedulePreview>(resolve => { finish = resolve })).mockResolvedValue({ ...result, explanation: '新的输入结果' })
  const { rerender } = render(<FrequencySchedulePreview inputKey="old" load={load} />)
  await userEvent.click(screen.getByRole('button', { name: /预演当前内容/ }))
  rerender(<FrequencySchedulePreview inputKey="new" load={load} />)
  await act(async () => { finish(result) })
  expect(screen.queryByText('每周日期尚未明确')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /预演当前内容/ }))
  expect(await screen.findByText('新的输入结果')).toBeInTheDocument()
  rerender(<FrequencySchedulePreview inputKey="changed-again" load={load} />)
  expect(screen.queryByText('新的输入结果')).not.toBeInTheDocument()
})
it('reports preview failure without retaining a successful result', async () => {
  const load = vi.fn().mockResolvedValueOnce(result).mockRejectedValueOnce(new Error('主档已变化'))
  render(<FrequencySchedulePreview inputKey="draft" load={load} />)
  await userEvent.click(screen.getByRole('button', { name: /预演当前内容/ })); await screen.findByText('每周日期尚未明确')
  await userEvent.click(screen.getByRole('button', { name: /预演当前内容/ }))
  await waitFor(() => expect(screen.getAllByText('主档已变化').length).toBeGreaterThan(0))
  expect(screen.queryByText('每周日期尚未明确')).not.toBeInTheDocument()
})
