import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticExecutionTask, DiagnosticReportDraft } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { ExaminationImages } from './ExaminationImages'

const task = { id: 't1', organizationId: 'org1', departmentId: 'dept1', revision: 1 } as DiagnosticExecutionTask

function setup(draft: Partial<DiagnosticReportDraft>, props: { disabled?: boolean; dirty?: boolean } = {}) {
  const api = { diagnostics: { draftImages: vi.fn().mockResolvedValue([]) } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(<QueryClientProvider client={client}>
    <ExaminationImages api={api} task={task} draft={{ revision: 1, doubleSignatureRequired: false, ...draft }}
      disabled={props.disabled ?? false} dirty={props.dirty} onRefresh={vi.fn()} />
  </QueryClientProvider>)
  return api
}

describe('ExaminationImages upload availability', () => {
  it('explains why the file picker is locked before a draft is saved', async () => {
    setup({})
    expect(screen.getByText('请先点击“保存草稿”，再上传关键图像。')).toBeInTheDocument()
    expect(screen.getByLabelText('选择关键图像')).toBeDisabled()
  })

  it('asks to save again when the form has unsaved edits', async () => {
    setup({ content: { findings: 'a', conclusion: 'b' } as DiagnosticReportDraft['content'] }, { dirty: true })
    expect(screen.getByText(/有未保存的修改/)).toBeInTheDocument()
    expect(screen.getByLabelText('选择关键图像')).toBeDisabled()
  })

  it('enables the file picker once the saved draft is current', async () => {
    setup({ content: { findings: 'a', conclusion: 'b' } as DiagnosticReportDraft['content'] })
    await waitFor(() => expect(screen.getByLabelText('选择关键图像')).toBeEnabled())
    expect(screen.queryByText(/保存草稿/)).not.toBeInTheDocument()
  })
})
