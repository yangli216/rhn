import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { HistoryPanel } from './HistoryPanel'

vi.mock('../ai/HistoryPrescriptionReference', () => ({
  HistoryPrescriptionReference: () => <section aria-label="历史处方参考"><h3>历史医嘱 · 用药</h3></section>,
}))

const visit = (id: string, organizationId: string, departmentId: string) => ({ id, residentId: 'resident',
  encounterNo: `OP-${id}`, organizationId, departmentId, status: 'COMPLETED',
  chiefComplaint: `历史主诉-${id}`, registeredAt: '2026-10-02T09:36:00Z',
  diagnoses: [{ code: 'J03.9', display: '测试诊断', type: 'PRIMARY' }],
}) as Encounter
const current = { ...visit('current', 'org-a', 'current-dept'), status: 'IN_PROGRESS' } as Encounter
const history = [visit('first', 'org-a', 'same-dept-id'), visit('second', 'org-b', 'same-dept-id')]
const content = { presentIllness: '这是需要按需展开的完整现病史。', medicalHistory: '明确记录的既往病史。',
  physicalExam: '实际查体结果。', healthEducation: '历史健康宣教。', followUp: '历史复诊建议。' }

function setup(copyDisabled = false, status = 'DRAFT') {
  const api = { organization: {
    list: vi.fn().mockResolvedValue([{ id: 'org-a', name: '当前机构' }, { id: 'org-b', name: '外院机构' }]),
    departments: vi.fn().mockImplementation(async id => [{ id: 'same-dept-id', organizationId: id,
      name: id === 'org-a' ? '心内科' : '呼吸科' }]),
  }, clinicalDocuments: { byEncounter: vi.fn().mockImplementation(async id => [{ id: `note-${id}`,
    documentType: 'OUTPATIENT_NOTE', status, currentVersion: 1, content }]) },
  printing: { recordsByEncounter: vi.fn().mockResolvedValue([]) },
  } as unknown as RhnApi
  const onCopy = vi.fn()
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } })
  const props = { encounters: [current, ...history], currentEncounter: current, api, onCopy, copyDisabled }
  const view = render(<QueryClientProvider client={client}><HistoryPanel {...props} /></QueryClientProvider>)
  return { api, onCopy, client, rerender: (patch: Partial<typeof props>) =>
    view.rerender(<QueryClientProvider client={client}><HistoryPanel {...props} {...patch} /></QueryClientProvider>) }
}

afterEach(cleanup)

describe('history panel compact reading and selection', () => {
  it('shows departments and cross-organization names without the chief complaint in the visit list', async () => {
    setup()
    const list = screen.getByRole('list', { name: '历史就诊列表' })
    expect(await within(list).findByText('心内科')).toBeInTheDocument()
    expect(await within(list).findByText('外院机构 · 呼吸科')).toBeInTheDocument()
    expect(list).not.toHaveTextContent('历史主诉')
    expect(list).not.toHaveTextContent('当前机构')
    expect(within(list).getAllByText('测试诊断')).toHaveLength(2)
  })

  it('shows the status and the download / print action directly without expanding anything', async () => {
    setup(false, 'SIGNED')
    const section = await screen.findByRole('region', { name: '病历下载与打印' })
    expect(section.closest('details')).toBeNull()
    expect(within(section).getByRole('button', { name: /下载 \/ 打印病历/ })).toBeVisible()
  })

  it('keeps the chief complaint open and other record fields folded without changing copied content', async () => {
    const { onCopy } = setup()
    const record = await screen.findByRole('region', { name: '病历内容' })
    expect(within(record).getByText('历史主诉-first')).toBeVisible()
    expect(within(record).queryByRole('button', { name: '展开主诉' })).not.toBeInTheDocument()
    const toggle = within(record).getByRole('button', { name: '展开现病史' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(body).toHaveAttribute('hidden')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(body).not.toHaveAttribute('hidden')
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: /带入本次/ }))
    expect(onCopy).toHaveBeenCalledWith(expect.objectContaining({ record: {
      chiefComplaint: '历史主诉-first', presentIllness: content.presentIllness,
      medicalHistory: content.medicalHistory, physicalExam: content.physicalExam,
      healthEducation: content.healthEducation, followUp: content.followUp,
    }, diagnoses: [{ code: 'J03.9', display: '测试诊断', type: 'PRIMARY' }] }))
  })

  it('allows selection while folded, with independent group selection and expand-all controls', async () => {
    const { onCopy } = setup()
    const record = await screen.findByRole('region', { name: '病历内容' })
    const choice = within(record).getByRole('checkbox', { name: '选择现病史' })
    expect(within(record).getAllByRole('checkbox').every(input => (input as HTMLInputElement).checked)).toBe(true)
    expect(within(screen.getByRole('region', { name: '诊断信息' })).getAllByRole('checkbox')
      .every(input => (input as HTMLInputElement).checked)).toBe(true)
    fireEvent.click(choice)
    expect(choice).not.toBeChecked()
    expect(within(record).getByRole('button', { name: '展开现病史' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(within(record).getByRole('button', { name: '展开全部' }))
    expect(within(record).getAllByRole('button', { name: /^收起(?!全部)/ })).toHaveLength(5)
    fireEvent.click(within(record).getByRole('button', { name: '收起全部' }))
    expect(choice).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: /带入本次/ }))
    expect(onCopy.mock.calls[0][0].record.presentIllness).toBeUndefined()
    fireEvent.click(within(record).getByRole('checkbox', { name: '选择病历内容' }))
    expect(choice).toBeChecked()
    expect(within(record).getByRole('button', { name: '展开现病史' })).toHaveAttribute('aria-expanded', 'false')
  })

  it('resets folding on a visit change and lets read-only users expand without copy controls', async () => {
    setup(true)
    const record = await screen.findByRole('region', { name: '病历内容' })
    expect(within(record).queryByRole('checkbox')).not.toBeInTheDocument()
    fireEvent.click(within(record).getByRole('button', { name: '展开现病史' }))
    const list = screen.getByRole('list', { name: '历史就诊列表' })
    fireEvent.click(await within(list).findByRole('button', { name: /查看外院机构/ }))
    await waitFor(() => expect(within(screen.getByRole('region', { name: '病历内容' }))
      .getByRole('button', { name: '展开现病史' })).toHaveAttribute('aria-expanded', 'false'))
    expect(screen.queryByRole('button', { name: /带入本次/ })).not.toBeInTheDocument()
  })

  it('does not reuse names from another API session and marks unavailable names explicitly', async () => {
    const { api, rerender } = setup()
    const list = screen.getByRole('list', { name: '历史就诊列表' })
    await within(list).findByText('外院机构 · 呼吸科')
    const replacement = { ...api, organization: { ...api.organization,
      list: vi.fn().mockRejectedValue(new Error('目录读取失败')),
      departments: vi.fn().mockRejectedValue(new Error('科室读取失败')),
    } } as RhnApi
    rerender({ api: replacement })
    expect(await within(list).findByText('机构名称待确认 · 科室名称待确认')).toBeInTheDocument()
    expect(within(list).queryByText('外院机构 · 呼吸科')).not.toBeInTheDocument()
  })
})
