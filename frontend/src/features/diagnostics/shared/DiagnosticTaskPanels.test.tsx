import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { DiagnosticQueue, DiagnosticTaskContext } from './DiagnosticTaskPanels'

const task = { id: 't1', residentId: 'r1', residentName: '患者甲', healthRecordNo: 'H1', itemName: '血常规',
  organizationId: 'org1', departmentId: 'dept1', requestType: 'LABORATORY', status: 'READY', requestNo: 'SR1',
} as DiagnosticExecutionTask
const resident = { id: 'r1', healthRecordNo: 'H1', gender: 'FEMALE', genderText: '女', birthDate: '1990-10-14' }

function setup(get = vi.fn().mockResolvedValue(resident), initial = task, queue?: DiagnosticExecutionTask[]) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 14, 12))
  const api = { residents: { get } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = (value: DiagnosticExecutionTask) => <QueryClientProvider client={client}>
    {queue && <DiagnosticQueue api={api} tasks={queue} selectedId={value.id} forms={{}} scope="org1:dept1:LABORATORY" onSelect={vi.fn()} />}
    <DiagnosticTaskContext api={api} task={value} /></QueryClientProvider>
  const result = render(view(initial))
  return { get, rerender: (value: DiagnosticExecutionTask) => result.rerender(view(value)) }
}
afterEach(() => vi.useRealTimers())

describe('diagnostic patient demographics', () => {
  it('shows patient age and sex in each queue entry while sharing a single patient lookup with the header', async () => {
    const { get } = setup(vi.fn().mockResolvedValue(resident), task, [task, { ...task, id: 't2', itemName: 'C反应蛋白' }])
    const list = screen.getByRole('list', { name: '医技申请队列' })
    await waitFor(() => {
      for (const entry of within(list).getAllByRole('listitem')) expect(entry).toHaveTextContent('女 · 36岁')
    })
    expect(list).not.toHaveTextContent('H1')
    expect(within(list).getByRole('button', { name: '患者甲 · 血常规' })).toHaveAttribute('aria-current', 'true')
    expect(within(list).getByRole('button', { name: '患者甲 · C反应蛋白' })).toBeEnabled()
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('keeps failed queue demographics visible without nesting retry buttons inside a selection button', async () => {
    setup(vi.fn().mockRejectedValue(new Error('无法读取')), task, [task])
    const list = screen.getByRole('list', { name: '医技申请队列' })
    await within(list).findByText('基本信息读取失败')
    expect(within(list).queryByText(/未知|年龄未登记/)).not.toBeInTheDocument()
    expect(within(list).getByRole('button', { name: '患者甲 · 血常规' }).querySelector('button')).toBeNull()
    expect(screen.getByRole('button', { name: '重试基本信息' })).toBeEnabled()
  })

  it('uses task demographics directly when the response includes them', () => {
    const { get } = setup(vi.fn(), { ...task, gender: 'MALE', genderText: '男', birthDate: '1990-10-15' })
    expect(screen.getByText(/男 · 35岁/)).toBeInTheDocument()
    expect(get).not.toHaveBeenCalled()
  })

  it('hydrates missing task fields from the matching resident record', async () => {
    const { get } = setup()
    expect(screen.getByText('正在读取年龄、性别…')).toBeInTheDocument()
    expect(await screen.findByText(/女 · 36岁/)).toBeInTheDocument()
    expect(get).toHaveBeenCalledWith('r1')
  })

  it('distinguishes failed reads from genuinely missing patient data and allows retry', async () => {
    const { get } = setup(vi.fn().mockRejectedValueOnce(new Error('暂时无法读取')).mockResolvedValue(resident))
    await screen.findByText('患者基本信息读取失败')
    expect(screen.queryByText(/年龄未登记/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '重试基本信息' }))
    expect(await screen.findByText(/女 · 36岁/)).toBeInTheDocument()
    expect(get).toHaveBeenCalledTimes(2)
  })

  it.each([{ ...resident, id: 'another' }, { ...resident, healthRecordNo: 'another' }])(
    'rejects another patient record even if it contains demographics', async (wrong) => {
      setup(vi.fn().mockResolvedValue(wrong))
      await screen.findByText('患者基本信息读取失败')
      expect(screen.queryByText(/女 · 36岁/)).not.toBeInTheDocument()
    })

  it('does not apply a late patient response after switching to another patient', async () => {
    let finish!: (value: unknown) => void
    const { rerender } = setup(vi.fn().mockImplementation((id: string) => id === 'r1'
      ? new Promise((resolve) => { finish = resolve })
      : Promise.resolve({ ...resident, id: 'r2', healthRecordNo: 'H2', gender: 'MALE', genderText: '男', birthDate: '1980-10-14' })))
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    rerender({ ...task, id: 't2', residentId: 'r2', residentName: '患者乙', healthRecordNo: 'H2' })
    await screen.findByText(/男 · 46岁/)
    await act(async () => finish(resident))
    expect(screen.getByText(/男 · 46岁/)).toBeInTheDocument()
    expect(screen.queryByText(/女 · 36岁/)).not.toBeInTheDocument()
  })

  it('shows unregistered age only when the returned patient record has no birth date', async () => {
    setup(vi.fn().mockResolvedValue({ ...resident, gender: 'UNKNOWN', genderText: '未知', birthDate: '' }))
    await screen.findByText(/未知 · 年龄未登记/)
  })
})
