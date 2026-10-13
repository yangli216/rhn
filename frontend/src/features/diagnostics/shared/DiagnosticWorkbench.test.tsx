import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticExecutionTask } from '../../../shared/api/diagnosticsApi'
import type { ClinicalContext } from '../../../shared/clinical/workContext'
import type { RhnApi } from '../../../shared/rhnApi'
import { LaboratoryWorkspace } from '../laboratory/LaboratoryWorkspace'
import { ExaminationWorkspace } from '../examination/ExaminationWorkspace'

const task: DiagnosticExecutionTask = { id: 'task1', revision: 1, requestNo: 'SR1', taskNo: null, requestType: 'LABORATORY',
  status: 'IN_PROGRESS', residentId: 'resident1', residentName: '患者甲', healthRecordNo: 'H1', encounterId: 'enc1', requestId: 'req1',
  organizationId: 'org1', departmentId: 'dept1', itemCode: 'LAB1', itemName: '血常规', createdAt: '2026-10-13T01:00:00Z' }
const context = { organization: { id: 'org1', name: '测试机构' }, department: { id: 'dept1', name: '医技科' } } as ClinicalContext
const blank = { revision: 0, doubleSignatureRequired: false }
function setup({ exam = false, tasks = [task], overrides = {}, authorities }: { exam?: boolean; tasks?: DiagnosticExecutionTask[]; overrides?: Record<string, ReturnType<typeof vi.fn>>; authorities?: string[] } = {}) {
  const diagnostics = { reportTemplate: vi.fn().mockResolvedValue(null), worklistPage: vi.fn().mockResolvedValue({ content: tasks, totalElements: tasks.length, totalPages: 1, page: 0, size: 20 }), reportsByRequest: vi.fn().mockResolvedValue([]),
    specimens: vi.fn().mockResolvedValue([]),
    draftImages: vi.fn().mockResolvedValue([]),
    draft: vi.fn().mockResolvedValue(blank), saveDraft: vi.fn().mockRejectedValue(new Error('保存失败')),
    recordLocalReport: vi.fn().mockRejectedValue(new Error('签发失败')), issueDraft: vi.fn(), ...overrides }
  const api = { diagnostics } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const Workspace = exam ? ExaminationWorkspace : LaboratoryWorkspace
  render(<QueryClientProvider client={client}><MemoryRouter><Workspace api={api} clinicalContext={context} onNavigate={vi.fn()} authorities={authorities} /></MemoryRouter></QueryClientProvider>)
  return diagnostics
}

describe('simple diagnostic business workbench', () => {
  it('requires explicit institution template selection and submits fixed template metadata', async () => {
    const template = { id: 'tpl1', organizationId: 'org1', catalogItemId: 'catalog1', version: 1, serviceType: 'LABORATORY',
      effectiveFrom: '2026-01-01', publicationBasis: '机构规则', publishedBy: 'user1', publishedAt: '2026-01-01T00:00:00Z',
      content: { minimumImages: 0, requiredChecks: [], phrases: [], indicators: [{ code: 'GLU', name: '血糖', valueType: 'NUMBER',
        required: true, unitCode: 'mmol/L', allowedCodes: [], rules: [] }] } }
    const api=setup({ overrides: { reportTemplate: vi.fn().mockResolvedValue(template) } })
    await screen.findByText('请载入机构模板后填写；已有模板的项目不能绕过机构规则签发。')
    expect(screen.getByRole('button',{name:'签发正式报告'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'载入机构模板 V1'}))
    expect(screen.getByLabelText('指标1代码')).toHaveValue('GLU')
    expect(screen.getByLabelText('指标1代码')).toBeDisabled()
    expect(screen.getByLabelText('指标1单位')).toBeDisabled()
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
    expect(api.worklistPage).toHaveBeenCalledWith('LABORATORY', '', 0, 20, undefined, undefined)
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
    expect(api.worklistPage).toHaveBeenCalledWith('EXAMINATION', '', 0, 20, undefined, undefined)
    expect(screen.queryByLabelText('指标1结果')).not.toBeInTheDocument()
  })

  it('locates a barcode through its actual task even when it is outside the current queue page', async () => {
    const outside = { ...task, id: 'older-task', requestId: 'older-request', residentId: 'older-patient', residentName: '较早患者', status: 'COLLECTED' as const }
    const scanSpecimen = vi.fn().mockResolvedValue({ id: 'tube1', specimenNo: 'SP-OLDER', status: 'RECEIVED', taskIds: [outside.id] })
    const getTask = vi.fn().mockResolvedValue(outside)
    const api = setup({ overrides: { scanSpecimen, task: getTask } })
    fireEvent.change(await screen.findByLabelText('扫码定位标本'), { target: { value: 'SP-OLDER' } })
    fireEvent.click(screen.getByRole('button', { name: '定位' }))
    expect(await screen.findByRole('heading', { name: /较早患者/ })).toBeInTheDocument()
    expect(scanSpecimen).toHaveBeenCalledWith('SP-OLDER')
    expect(getTask).toHaveBeenCalledWith('older-task')
    expect(api.worklistPage).toHaveBeenCalledTimes(1)
  })

  it('blocks generation and operations when the specimen list belongs to a different application', async () => {
    setup({ tasks: [{ ...task, status: 'READY' }], overrides: { specimens: vi.fn().mockResolvedValue([
      { id: 'wrong-tube', specimenNo: 'SP-WRONG', status: 'READY', taskIds: ['another-task'] },
    ]) } })
    await screen.findByText('标本数据不完整或与当前申请不一致，请重新读取。')
    expect(screen.queryByRole('button', { name: '生成标本条码' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认采集' })).not.toBeInTheDocument()
  })

  it('does not operate on a rejected old barcode', async () => {
    const getTask = vi.fn()
    setup({ overrides: { scanSpecimen: vi.fn().mockResolvedValue({ specimenNo: 'SP-REJECTED', status: 'REJECTED', taskIds: [task.id] }), task: getTask } })
    fireEvent.change(await screen.findByLabelText('扫码定位标本'), { target: { value: 'SP-REJECTED' } })
    fireEvent.click(screen.getByRole('button', { name: '定位' }))
    await screen.findByText('此标本已拒收，请使用重采条码。')
    expect(getTask).not.toHaveBeenCalled()
  })
})
