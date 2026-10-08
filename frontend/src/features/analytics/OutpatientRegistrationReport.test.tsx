import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { OutpatientRegistrationReport } from './OutpatientRegistrationReport'

function mount(queryPage: ReturnType<typeof vi.fn>) {
  const api = { analytics: { queryPage } } as unknown as RhnApi
  return render(<MemoryRouter><OutpatientRegistrationReport api={api} /></MemoryRouter>)
}
const empty = { series: [] }

describe('OutpatientRegistrationReport', () => {
  it('shows an empty state without invented departments or counts', async () => {
    mount(vi.fn().mockResolvedValue(empty))
    expect(await screen.findByText('所选范围内暂无挂号记录')).toBeInTheDocument()
    expect(screen.queryByText('78.4')).not.toBeInTheDocument()
    expect(screen.queryByText('心血管内科门诊')).not.toBeInTheDocument()
  })
  it('hides stale results and disables printing after a failed refresh', async () => {
    const user = userEvent.setup()
    const queryPage = vi.fn().mockResolvedValue({ series: [
      { code: 'M1', total: 7, points: [{ key: '2026-10-01', label: '测试科室', value: 7 }] },
      { code: 'M2', total: 1, points: [{ key: '2026-10-01', label: '测试科室', value: 1 }] },
      { code: 'M3', total: 3, points: [{ key: '2026-10-01', label: '测试科室', value: 3 }] },
    ] })
    mount(queryPage)
    expect(await screen.findByText('挂号总人次')).toBeInTheDocument()
    queryPage.mockRejectedValue(new Error('offline'))
    await user.click(screen.getByRole('button', { name: /刷新统计/ }))
    expect(await screen.findByText(/统计分析服务响应异常/)).toBeInTheDocument()
    expect(screen.queryByText('挂号总人次')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /打印报表/ })).toBeDisabled()
  })
  it('does not let an older request overwrite a refreshed result', async () => {
    const user = userEvent.setup()
    let rejectOlder: (reason: Error) => void = () => {}
    const older = new Promise<typeof empty>((_resolve, reject) => { rejectOlder = reject })
    const queryPage = vi.fn().mockReturnValueOnce(older).mockResolvedValue(empty)
    mount(queryPage)
    // A scope change can start a new request while the original is pending.
    await user.click(screen.getByRole('combobox', { name: '科室统计范围' }))
    await user.click(screen.getByRole('option', { name: '当前登录科室' }))
    await screen.findByText('所选范围内暂无挂号记录')
    await act(async () => { rejectOlder(new Error('old request failed')) })
    await waitFor(() => expect(queryPage).toHaveBeenCalledTimes(4))
    expect(screen.queryByText(/统计分析服务响应异常/)).not.toBeInTheDocument()
  })
})
