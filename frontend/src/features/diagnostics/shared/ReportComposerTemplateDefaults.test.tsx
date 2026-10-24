import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticTemplateVersion } from '../../../shared/api/diagnosticTemplateTypes'
import type { DiagnosticExecutionTask, DiagnosticReportDraft } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { ReportComposer } from './ReportComposer'
import type { DiagnosticForm } from './diagnosticWorkbenchModel'

const task = { id: 'lab-default', requestId: 'req-default', organizationId: 'org-1', departmentId: 'lab',
  itemCode: '25010101501', itemName: '血常规（三分类）', requestType: 'LABORATORY', status: 'IN_PROGRESS', revision: 1,
} as DiagnosticExecutionTask
const version: DiagnosticTemplateVersion = {
  id: '501', catalogItemId: 'catalog-1', organizationId: 'org-1', version: 1, serviceType: 'LABORATORY',
  effectiveFrom: '2026-01-01', publicationBasis: '机构确认依据', publishedBy: 'user-1', publishedAt: '2026-01-01T00:00:00Z',
  content: { indicators: [{ code: 'MID_NUM', name: '中间细胞绝对值', valueType: 'NUMBER', unitCode: '10^9/L',
    required: true, rules: [], allowedCodes: [] }], phrases: [], requiredChecks: [], minimumImages: 0 },
}
function setup(current: DiagnosticTemplateVersion | null, draft?: DiagnosticReportDraft) {
  const api = { diagnostics: { reportTemplate: vi.fn().mockResolvedValue(current), saveDraft: vi.fn().mockResolvedValue({}),
    recordLocalReport: vi.fn().mockResolvedValue({}) } } as unknown as RhnApi
  function Harness() {
    const [form, onForm] = useState<DiagnosticForm>()
    return <ReportComposer api={api} task={task} draft={draft ?? { revision: 0, doubleSignatureRequired: false }}
      refreshing={false} onRefresh={vi.fn().mockResolvedValue(undefined)} form={form} onForm={onForm} canEdit canSign />
  }
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><Harness /></QueryClientProvider>)
  return api
}

describe('ReportComposer default mappings', () => {
  it('loads the persisted institution template into a blank report and saves its real version ID', async () => {
    const api = setup(version)
    const result = await screen.findByLabelText('指标1结果')
    expect(screen.getByText('中间细胞绝对值')).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: '套用项目结果模板' })).not.toBeInTheDocument()
    fireEvent.change(result, { target: { value: '0.5' } })
    fireEvent.click(screen.getByRole('button', { name: '保存草稿' }))
    await waitFor(() => expect(api.diagnostics.saveDraft).toHaveBeenCalledWith('lab-default', expect.objectContaining({
      templateVersionId: '501', templateSnapshot: JSON.stringify(version),
      observations: [expect.objectContaining({ observationCode: 'MID_NUM', observationValue: '0.5', interpretationCode: undefined })],
    })))
  })

  it('keeps an existing draft and its older snapshot when the current default changes', async () => {
    const previous = { ...version, id: '500', content: { ...version.content, indicators: [{ ...version.content.indicators[0], code: 'OLD', name: '历史指标' }] } }
    setup(version, { revision: 1, doubleSignatureRequired: false, content: { expectedRevision: 1, templateVersionId: '500',
      templateSnapshot: JSON.stringify(previous), observations: [{ observationCode: 'OLD', observationName: '历史指标', valueType: 'NUMBER', observationValue: '12' }] } })
    expect(await screen.findByLabelText('指标1结果')).toHaveValue('12')
    expect(screen.getByText('历史指标')).toBeInTheDocument()
    expect(screen.queryByText('中间细胞绝对值')).not.toBeInTheDocument()
  })

  it('offers only the matching project preset when no institution template exists', async () => {
    setup(null)
    const selector = await screen.findByLabelText('套用项目结果模板')
    fireEvent.click(selector)
    expect(screen.getByRole('option', { name: '血常规（三分类）结果模板' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: '肝功能常用组标准模板' })).not.toBeInTheDocument()
  })
})
