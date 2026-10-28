import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { RhnApi } from '../../../shared/rhnApi'
import { LaboratoryWorkspace } from '../laboratory/LaboratoryWorkspace'
import { ExaminationWorkspace } from '../examination/ExaminationWorkspace'
import { defaultDiagnosticDates, diagnosticDateBoundary } from './diagnosticWorkbenchModel'

const task: DiagnosticExecutionTask = { id: 'task1', revision: 1, requestNo: 'SR1', taskNo: null, requestType: 'LABORATORY',
  status: 'IN_PROGRESS', residentId: 'resident1', residentName: '患者甲', healthRecordNo: 'H1', encounterId: 'enc1', requestId: 'req1',
  organizationId: 'org1', departmentId: 'dept1', itemCode: 'LAB1', itemName: '血常规', createdAt: '2026-10-13T01:00:00Z' }
const context = { organization: { id: 'org1', name: '测试机构' }, department: { id: 'dept1', name: '医技科' } } as ClinicalContext
const defaultRange = () => { const { from, to } = defaultDiagnosticDates()
  return { createdFrom: diagnosticDateBoundary(from), createdBefore: diagnosticDateBoundary(to, true) } }
const blank = { revision: 0, doubleSignatureRequired: false }
function setup({ exam = false, tasks = [task], overrides = {}, authorities, entry = "/diagnostics/laboratory" }: { exam?: boolean; tasks?: DiagnosticExecutionTask[]; overrides?: Record<string, ReturnType<typeof vi.fn>>; authorities?: string[]; entry?: string } = {}) {
  const diagnostics = { reportTemplate: vi.fn().mockResolvedValue(null), worklistPage: vi.fn().mockResolvedValue({ content: tasks, totalElements: tasks.length, totalPages: 1, page: 0, size: 20 }), reportsByRequest: vi.fn().mockResolvedValue([]),
    specimens: vi.fn().mockResolvedValue([]),
    draftImages: vi.fn().mockResolvedValue([]),
    draft: vi.fn().mockResolvedValue(blank), saveDraft: vi.fn().mockRejectedValue(new Error('保存失败')),
    recordLocalReport: vi.fn().mockRejectedValue(new Error('签发失败')), issueDraft: vi.fn(), ...overrides }
  const api = { diagnostics, residents: { get: vi.fn().mockImplementation(async (id: string) => ({
    id, healthRecordNo: tasks.find((item) => item.residentId === id)?.healthRecordNo, gender: 'MALE', birthDate: '1980-01-01',
  })) } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Workspace = exam ? ExaminationWorkspace : LaboratoryWorkspace
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[entry]}><Workspace api={api} clinicalContext={context} onNavigate={vi.fn()} authorities={authorities} /></MemoryRouter></QueryClientProvider>)
  return diagnostics
}

describe('simple diagnostic business workbench', () => {
  it.each([false, true])('loads an explicitly linked historical task outside the focused queue (examination=%s)', async (exam) => {
    const historical = { ...task, id: 'old-task', requestType: exam ? 'EXAMINATION' as const : 'LABORATORY' as const,
      residentName: '历史患者', createdAt: '2020-01-01T00:00:00Z', itemName: exam ? '历史超声检查' : '历史血常规' }
    const readTask = vi.fn().mockResolvedValue(historical)
    const api = setup({ exam, tasks: [], entry: `/diagnostics/${exam ? 'examination' : 'laboratory'}?taskId=old-task`,
      overrides: { task: readTask } })
    await waitFor(() => expect(screen.getAllByText(/历史患者/).length).toBeGreaterThan(0))
    expect(readTask).toHaveBeenCalledWith('old-task')
    expect(api.worklistPage).toHaveBeenCalledWith(historical.requestType, '', 0, 20, undefined, undefined,
      expect.objectContaining({ activeAndRecent: true }))
  })

  it('uses the common keyword filter after removing the barcode location area', async () => {
    const scanSpecimen = vi.fn()
    const api = setup({ overrides: { scanSpecimen } })
    await screen.findByLabelText('指标1结果')
    expect(screen.queryByLabelText('扫码定位标本')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '定位' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('搜索患者、申请或标本'), { target: { value: 'SP1' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.worklistPage).toHaveBeenLastCalledWith('LABORATORY', 'SP1', 0, 20,
      undefined, undefined, { activeAndRecent: true, status: undefined, ...defaultRange() }))
    expect(scanSpecimen).not.toHaveBeenCalled()
  })

  it('queries all pages with status and inclusive operator dates', async () => {
    const api = setup()
    await screen.findByLabelText('指标1结果')
    await userEvent.click(screen.getByLabelText('任务状态'))
    await userEvent.click(screen.getByRole('option', { name: '检验中' }))
    fireEvent.change(screen.getByLabelText('申请开始日期'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('申请结束日期'), { target: { value: '2026-10-13' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.worklistPage).toHaveBeenLastCalledWith('LABORATORY', '', 0, 20, undefined, undefined, {
      activeAndRecent: true, status: 'IN_PROGRESS', createdFrom: new Date(2026, 9, 1).toISOString(), createdBefore: new Date(2026, 9, 14).toISOString(),
    }))
    fireEvent.click(screen.getByRole('button', { name: '重置' }))
    expect(screen.getByLabelText('申请开始日期')).toHaveValue(defaultDiagnosticDates().from)
    expect(screen.getByLabelText('任务状态')).toHaveTextContent('全部状态')
  })

  it('retains edits when querying dates adjusted by the shared date picker', async () => {
    const api = setup()
    fireEvent.change(await screen.findByLabelText('指标1结果'), { target: { value: '12.8' } })
    fireEvent.change(screen.getByLabelText('申请开始日期'), { target: { value: '2026-10-14' } })
    fireEvent.change(screen.getByLabelText('申请结束日期'), { target: { value: '2026-10-13' } })
    fireEvent.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.worklistPage).toHaveBeenLastCalledWith('LABORATORY', '', 0, 20, undefined, undefined, {
      activeAndRecent: true, status: undefined, createdFrom: new Date(2026, 9, 13).toISOString(), createdBefore: new Date(2026, 9, 14).toISOString(),
    }))
    await waitFor(() => expect(screen.getByLabelText('指标1结果')).toHaveValue('12.8'))
  })

  it('preserves report draft across work and report history tabs', async () => {
    setup()
    fireEvent.change(await screen.findByLabelText('指标1结果'), { target: { value: '9.8' } })
    fireEvent.click(screen.getByRole('tab', { name: '报告历史' }))
    await screen.findByText('尚未签发报告')
    expect(screen.queryByLabelText('指标1结果')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: '当前作业' }))
    expect(await screen.findByLabelText('指标1结果')).toHaveValue('9.8')
  })


  it('requires receipt of every active tube before laboratory start', async () => {
    const start = vi.fn()
    const specimens = vi.fn().mockResolvedValue([{ id: 'tube1', revision: 1, specimenNo: 'SP1', taskIds: [task.id], status: 'COLLECTED', specimenName: '血液' }])
    setup({ tasks: [{ ...task, status: 'COLLECTED' }], overrides: { start, specimens } })
    await screen.findByRole('button', { name: '接收标本' })
    expect(screen.getByRole('button', { name: '开始检验' })).toBeDisabled()
    expect(start).not.toHaveBeenCalled()
    expect(screen.getByText('请先接收所有有效标本，再开始检验。')).toBeInTheDocument()
  })

  it('asks for a rejection reason only after choosing a tube and preserves it after failure', async () => {
    const rejectSpecimen = vi.fn().mockRejectedValueOnce(new Error('拒收失败')).mockResolvedValue(undefined)
    setup({ tasks: [{ ...task, status: 'COLLECTED' }], overrides: { rejectSpecimen,
      specimens: vi.fn().mockResolvedValue([{ id: 'tube1', revision: 2, specimenNo: 'SP1', taskIds: [task.id],
        status: 'COLLECTED', specimenName: '血液', collectedAt: '2026-10-13T01:00:00Z' }]) } })
    await screen.findByRole('button', { name: '拒收标本' })
    expect(screen.queryByLabelText(/拒收原因/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/标签补打原因/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '拒收标本' }))
    expect(screen.getByRole('dialog', { name: '拒收标本' })).toHaveTextContent('SP1')
    expect(screen.getByRole('button', { name: '确认拒收' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/拒收原因/), { target: { value: '标本溶血' } })
    fireEvent.click(screen.getByRole('button', { name: '确认拒收' }))
    await screen.findByText('拒收失败')
    expect(screen.getByLabelText(/拒收原因/)).toHaveValue('标本溶血')
    await waitFor(() => expect(screen.getByRole('button', { name: '确认拒收' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: '确认拒收' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(rejectSpecimen).toHaveBeenLastCalledWith('tube1', 2, '标本溶血')
    expect(rejectSpecimen).toHaveBeenCalledTimes(2)
  })

  it('automatically loads the institution default into an empty report and submits fixed template metadata', async () => {
    const template = { id: 'tpl1', organizationId: 'org1', catalogItemId: 'catalog1', version: 1, serviceType: 'LABORATORY',
      effectiveFrom: '2026-01-01', publicationBasis: '机构规则', publishedBy: 'user1', publishedAt: '2026-01-01T00:00:00Z',
      content: { minimumImages: 0, requiredChecks: [], phrases: [], indicators: [{ code: 'GLU', name: '血糖', valueType: 'NUMBER',
        required: true, unitCode: 'mmol/L', allowedCodes: [], rules: [] }] } }
    const api=setup({ overrides: { reportTemplate: vi.fn().mockResolvedValue(template) } })
    expect(await screen.findByText('血糖')).toBeInTheDocument()
    expect(screen.getByRole('button',{name:'签发正式报告'})).toBeEnabled()
    expect(screen.getByTitle('必填')).toBeInTheDocument()
    expect(screen.queryByLabelText('指标1代码')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('指标1单位')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('指标1结果'),{target:{value:'5.8'}})
    fireEvent.click(screen.getByRole('button',{name:'保存草稿'}))
    await waitFor(()=>expect(api.saveDraft).toHaveBeenCalled())
    expect(api.saveDraft.mock.calls[0][1]).toEqual(expect.objectContaining({templateVersionId:'tpl1',observations:[
      expect.objectContaining({observationCode:'GLU',observationName:'血糖',valueType:'NUMBER',unitCode:'mmol/L',observationValue:'5.8'})
    ]}))
  })

  it('keeps a view-only actor from editing or issuing results', async () => {
    const api = setup({ authorities: ['DIAGNOSTICS.ACCESS', 'DIAGNOSTICS.LABORATORY.VIEW'] })
    expect(await screen.findByLabelText('指标1结果')).toBeDisabled()
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '签发正式报告' })).toBeDisabled()
    expect(api.recordLocalReport).not.toHaveBeenCalled()
  })
  it('loads only its domain and issues a list of actual indicators without inventing normality', async () => {
    const api = setup()
    const result = await screen.findByLabelText('指标1结果')
    fireEvent.change(result, { target: { value: '5.8' } })
    fireEvent.click(screen.getByRole('button', { name: '添加指标' }))
    fireEvent.change(screen.getByLabelText('指标2代码'), { target: { value: 'HGB' } })
    fireEvent.change(screen.getByLabelText('指标2名称'), { target: { value: '血红蛋白' } })
    fireEvent.change(screen.getByLabelText('指标2结果'), { target: { value: '120' } })
    fireEvent.click(screen.getByRole('button', { name: '签发正式报告' }))
    await waitFor(() => expect(api.recordLocalReport).toHaveBeenCalledOnce())
    expect(api.worklistPage).toHaveBeenCalledWith('LABORATORY', '', 0, 20, undefined, undefined, { activeAndRecent: true, status: undefined, ...defaultRange() })
    expect(api.recordLocalReport.mock.calls[0][1].observations).toEqual([
      expect.objectContaining({ observationValue: '5.8' }),
      expect.objectContaining({ observationCode: 'HGB', observationValue: '120' }),
    ])
    expect(api.recordLocalReport.mock.calls[0][1].observations[0].interpretationCode).toBeUndefined()
    await screen.findByText('签发失败')
    expect(result).toHaveValue('5.8')
  })

  it('preserves unsaved values per patient instead of clearing or moving them to another task', async () => {
    const second = { ...task, id: 'task2', requestId: 'req2', residentId: 'resident2', residentName: '患者乙' }
    setup({ tasks: [task, second] })
    fireEvent.change(await screen.findByLabelText('指标1结果'), { target: { value: '12.8' } })
    fireEvent.click(screen.getByRole('button', { name: /患者乙/ }))
    await waitFor(() => expect(screen.getByLabelText('指标1结果')).toHaveValue(''))
    fireEvent.click(screen.getByRole('button', { name: /患者甲/ }))
    await waitFor(() => expect(screen.getByLabelText('指标1结果')).toHaveValue('12.8'))
  })

  it('keeps input after a failed draft save and adds no submit/return approval steps', async () => {
    const api = setup()
    fireEvent.change(await screen.findByLabelText('指标1结果'), { target: { value: '9.6' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await screen.findByText('保存失败')
    expect(screen.getByLabelText('指标1结果')).toHaveValue('9.6')
    expect(api.saveDraft).toHaveBeenCalledWith('task1', expect.objectContaining({ expectedDraftRevision: 0 }))
    expect(screen.queryByRole('button', { name: /提交审核|驳回|撤回/ })).not.toBeInTheDocument()
  })

  it('issues a saved second-signer draft directly without overwriting its author', async () => {
    const content = { expectedRevision: 1, observations: [{ observationCode: 'WBC', observationName: '白细胞', valueType: 'NUMBER', observationValue: '5.8' }] }
    const api = setup({ overrides: { draft: vi.fn().mockResolvedValue({ revision: 3, doubleSignatureRequired: true, authorName: '录入人乙', content }),
      issueDraft: vi.fn().mockRejectedValue(new Error('双签必须由另一人审核并签发')) } })
    await screen.findByLabelText('指标1结果')
    fireEvent.click(screen.getByRole('button', { name: '审核并签发' }))
    await waitFor(() => expect(api.issueDraft).toHaveBeenCalledWith('task1', 1, 3, expect.any(String)))
    expect(api.saveDraft).not.toHaveBeenCalled()
    expect(api.recordLocalReport).not.toHaveBeenCalled()
  })

  it('keeps examination findings separate from conclusion and does not render laboratory fields', async () => {
    const api = setup({ exam: true, tasks: [{ ...task, requestType: 'EXAMINATION', itemName: '腹部超声' }] })
    fireEvent.change(await screen.findByLabelText(/检查所见/), { target: { value: '具体所见' } })
    fireEvent.change(screen.getByLabelText(/检查结论/), { target: { value: '具体结论' } })
    fireEvent.click(screen.getByRole('button', { name: '签发正式报告' }))
    await waitFor(() => expect(api.recordLocalReport).toHaveBeenCalledWith('task1', expect.objectContaining({ findings: '具体所见', conclusion: '具体结论' })))
    expect(api.worklistPage).toHaveBeenCalledWith('EXAMINATION', '', 0, 20, undefined, undefined, { activeAndRecent: true, status: undefined, ...defaultRange() })
    expect(screen.queryByLabelText('指标1结果')).not.toBeInTheDocument()
  })


  it('blocks generation and operations when the specimen list belongs to a different application', async () => {
    setup({ tasks: [{ ...task, status: 'READY' }], overrides: { specimens: vi.fn().mockResolvedValue([
      { id: 'wrong-tube', specimenNo: 'SP-WRONG', status: 'READY', taskIds: ['another-task'] },
    ]) } })
    await screen.findByText('标本数据不完整或与当前申请不一致，请重新读取。')
    expect(screen.queryByRole('button', { name: '生成标本条码' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认采集' })).not.toBeInTheDocument()
  })

  it('automatically binds preset national laboratory template when task is 5-part CBC without manual selection', async () => {
    const cbcTask = { ...task, id: 'task-cbc', itemName: '血常规（五分类）', itemCode: 'LAB-CBC' }
    setup({ tasks: [cbcTask] })
    await screen.findByText(/项目预置 · WS\/T 405-2012/)
    expect(await screen.findByText('白细胞计数')).toBeInTheDocument()
    expect(screen.getByText('红细胞计数')).toBeInTheDocument()
    expect(screen.getByLabelText('指标1结果')).toBeInTheDocument()
  })

})
