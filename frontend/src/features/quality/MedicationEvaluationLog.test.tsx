import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationEvaluationLog } from './MedicationEvaluationLog'

const row = { evaluationId: 'e1', prescriptionId: 'p1', encounterId: 'enc1', mode: 'SHADOW', decision: 'UNAVAILABLE', findingCount: 0 }
function setup() {
  const workbench = {
    evaluationRecords: vi.fn().mockResolvedValue({ content: [row], totalElements: 54, totalPages: 3, page: 0, size: 20 }),
    evaluationDetail: vi.fn().mockResolvedValue({ summary: row, input: { age: null }, result: { failureCodes: ['SYNTHETIC_MISSING_DATA'] } }),
  }
  const api = { medicationWorkbench: workbench } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}><MedicationEvaluationLog api={api} /></QueryClientProvider>)
  return workbench
}
describe('MedicationEvaluationLog', () => {
  it('paginates past the former 50-record cutoff and applies mode filters', async () => {
    const api = setup(), user = userEvent.setup()
    await screen.findByText('e1')
    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await user.click(screen.getByRole('button', { name: /下一页/ }))
    await waitFor(() => expect(api.evaluationRecords).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 })))
    await user.click(screen.getByRole('combobox', { name: '审查模式' }))
    await user.click(screen.getByRole('option', { name: '正式审查' }))
    await user.click(screen.getByRole('button', { name: '查询' }))
    await waitFor(() => expect(api.evaluationRecords).toHaveBeenLastCalledWith(expect.objectContaining({ mode: 'ENFORCED', page: 0 })))
  })
  it('shows immutable details on demand and does not equate no findings with safety', async () => {
    const api = setup(), user = userEvent.setup()
    await screen.findByText('e1')
    expect(screen.getByText('未记录命中项')).toBeInTheDocument()
    expect(screen.queryByText('无风险')).not.toBeInTheDocument()
    expect(api.evaluationDetail).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '查看详情' }))
    await screen.findByText(/SYNTHETIC_MISSING_DATA/)
    expect(api.evaluationDetail).toHaveBeenCalledWith('e1')
  })
  it('reports API failures and offers retry without keeping old rows visible', async () => {
    const api = setup(), user = userEvent.setup()
    await screen.findByText('e1')
    api.evaluationRecords.mockRejectedValueOnce(new Error('范围无权访问'))
    await user.click(screen.getByRole('button', { name: '刷新日志' }))
    await screen.findByText('范围无权访问')
    expect(screen.queryByText('e1')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '刷新日志' }))
    await screen.findByText('e1')
  })
  it('renders parsed findings and supports copying raw JSON', async () => {
    const user = userEvent.setup()
    const writeTextSpy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const detailPayload = {
      summary: { evaluationId: 'e2', prescriptionId: 'rx-99', encounterId: 'enc-99', mode: 'ENFORCED', decision: 'BLOCK', ruleSetVersion: 'v2.1' },
      input: {
        medications: [{ medicationRequestId: 'm1', name: '阿莫西林胶囊', spec: '0.25g*24粒', doseValue: 0.5, doseUnit: 'g', frequencyCode: 'TID', routeCode: '口服', durationValue: 3 }]
      },
      result: {
        decision: 'BLOCK',
        findings: [{
          findingId: 'f1',
          severity: 'HIGH',
          category: '过敏禁忌',
          ruleCode: 'ALLERGY_PENICILLIN',
          message: '患者对青霉素类药物过敏，阿莫西林存在严重过敏反应风险',
          suggestedAction: '建议更换为大环内酯类或头孢类抗生素',
          evidence: [{ sourceTitle: '临床用药指南', excerpt: '青霉素过敏患者禁用阿莫西林' }]
        }]
      }
    }
    const workbench = {
      evaluationRecords: vi.fn().mockResolvedValue({ content: [detailPayload.summary], totalElements: 1, totalPages: 1, page: 0, size: 20 }),
      evaluationDetail: vi.fn().mockResolvedValue(detailPayload),
    }
    const api = { medicationWorkbench: workbench } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(<QueryClientProvider client={client}><MedicationEvaluationLog api={api} /></QueryClientProvider>)
    await screen.findByText('e2')
    await user.click(screen.getByRole('button', { name: '查看详情' }))
    await screen.findByText('高风险')
    expect(screen.getByText('阿莫西林胶囊')).toBeInTheDocument()
    expect(screen.getByText(/患者对青霉素类药物过敏/)).toBeInTheDocument()
    expect(screen.getByText(/建议更换为大环内酯类/)).toBeInTheDocument()
    const copyBtn = screen.getByRole('button', { name: '拷贝原始 JSON' })
    await user.click(copyBtn)
    expect(writeTextSpy).toHaveBeenCalledWith(expect.stringContaining('"evaluationId": "e2"'))
    await screen.findByRole('button', { name: '已复制 JSON' })
  })
})
