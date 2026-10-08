import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientWorkloadReport } from './OutpatientWorkloadReport'

const empty = { series: [] }
function mount(queryPage: ReturnType<typeof vi.fn>) {
  return render(<MemoryRouter><OutpatientWorkloadReport api={{ analytics: { queryPage } } as unknown as RhnApi} /></MemoryRouter>)
}
describe('workload report real data states', () => {
  it('renders no invented departments when there is no business data', async () => {
    mount(vi.fn().mockResolvedValue(empty))
    expect(await screen.findByText('所选范围内暂无就诊或有效医嘱记录')).toBeInTheDocument()
    expect(screen.queryByText('心血管内科门诊')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /打印报表/ })).toBeDisabled()
  })
  it('hides previous counts after a failed refresh', async () => {
    const user = userEvent.setup()
    const query = vi.fn().mockResolvedValue({ series: ['M1', 'M2', 'M3', 'M4'].map((code) => ({
      code, total: 3, points: [{ key: 'A', label: '真实科室', value: 3 }],
    })) })
    mount(query)
    await screen.findByText('门诊登记就诊总人次')
    query.mockRejectedValue(new Error('offline'))
    await user.click(screen.getByRole('button', { name: /刷新统计/ }))
    expect(await screen.findByText(/工作量统计数据加载失败/)).toBeInTheDocument()
    expect(screen.queryByText('门诊登记就诊总人次')).not.toBeInTheDocument()
    expect(screen.queryByText('真实科室')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /打印报表/ })).toBeDisabled()
  })
  it('ignores stale requests after scope switches', async () => {
    const user = userEvent.setup()
    let rejectOlder!: (reason: Error) => void
    const old = new Promise((_resolve, reject) => { rejectOlder = reject })
    const query = vi.fn().mockReturnValueOnce(old).mockResolvedValue(empty)
    mount(query)
    await user.click(screen.getByRole('combobox', { name: '科室统计范围' }))
    await user.click(screen.getByRole('option', { name: '当前登录科室' }))
    await screen.findByText('所选范围内暂无就诊或有效医嘱记录')
    await act(async () => rejectOlder(new Error('old failed')))
    expect(screen.queryByText(/工作量统计数据加载失败/)).not.toBeInTheDocument()
  })
})
