import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { DiagnosticExecutionTask, DiagnosticReportDraft } from '../../../shared/api/diagnosticsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { ReportComposer } from './ReportComposer'

describe('ReportComposer Critical Value Interception and Double Sign Flow', () => {
  const labTask: DiagnosticExecutionTask = {
    id: 'task-lab-crit-1',
    taskNo: null,
    requestId: 'req-1',
    requestNo: 'REQ-2026-CRIT',
    itemName: '急诊生化血糖测定',
    itemCode: 'LAB-GLU-STAT',
    requestType: 'LABORATORY',
    status: 'IN_PROGRESS',
    revision: 1,
    organizationId: 'org-1',
    departmentId: 'dept-lab',
    residentId: 'res-1',
    residentName: '赵六',
    gender: 'MALE',
    healthRecordNo: 'HR-9988',
    encounterId: 'enc-1',
    createdAt: '2026-10-14 08:00:00',
  }

  const criticalDraft: DiagnosticReportDraft = {
    revision: 1,
    doubleSignatureRequired: false,
    authorName: '初检技师小李',
    content: {
      expectedRevision: 1,
      expectedDraftRevision: 1,
      templateVersionId: 'v1',
      conclusion: '初步测定完成',
      observations: [
        {
          observationCode: 'GLU',
          observationName: '葡萄糖(空腹/随机)',
          valueType: 'NUMBER',
          observationValue: '2.0',
          unitCode: 'mmol/L',
          referenceRangeLow: 3.90,
          referenceRangeHigh: 6.10,
          interpretationCode: 'LL',
        },
      ],
    },
  }

  const setup = (overrides?: { draft?: DiagnosticReportDraft; doubleSign?: boolean }) => {
    const api = {
      diagnostics: {
        reportTemplate: vi.fn().mockResolvedValue({
          id: 'tpl-1',
          templateVersionId: 'v1',
          organizationId: 'org-1',
          serviceType: 'LABORATORY',
          content: { indicators: [] },
        }),
        saveDraft: vi.fn().mockResolvedValue({
          content: { ...criticalDraft.content },
        }),
        recordLocalReport: vi.fn().mockResolvedValue({}),
        issueDraft: vi.fn().mockResolvedValue({}),
      },
    } as unknown as RhnApi

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const draft = overrides?.draft || {
      ...criticalDraft,
      doubleSignatureRequired: overrides?.doubleSign ?? false,
    }
    const onForm = vi.fn()

    const result = render(
      <QueryClientProvider client={client}>
        <ReportComposer
          api={api}
          task={labTask}
          draft={draft}
          refreshing={false}
          onRefresh={vi.fn().mockResolvedValue(undefined)}
          onForm={onForm}
          canEdit={true}
          canSign={true}
        />
      </QueryClientProvider>
    )

    return { api, onForm, ...result }
  }

  it('intercepts report issuance when critical observations exist and prompts notice modal', async () => {
    const { api } = setup()

    const issueBtn = await screen.findByRole('button', { name: '签发正式报告' })
    fireEvent.click(issueBtn)

    // 应该弹出危急值登记卡，且尚未调用后端的签发接口
    expect(screen.getByText('危急值口头电话通报登记卡 (国家临床安全规范)')).toBeInTheDocument()
    expect(screen.getAllByText(/葡萄糖\(空腹\/随机\)/).length).toBeGreaterThanOrEqual(1)
    expect(api.diagnostics.recordLocalReport).not.toHaveBeenCalled()

    // 填报接报人员后确认登记
    const recipientInput = screen.getByPlaceholderText('必填，例如：张医生、李护士长')
    fireEvent.change(recipientInput, { target: { value: '急诊刘主任' } })

    const confirmNoticeBtn = screen.getByRole('button', { name: '确认通报登记并继续签发' })
    fireEvent.click(confirmNoticeBtn)

    // 登记卡关闭
    expect(screen.queryByText('危急值口头电话通报登记卡 (国家临床安全规范)')).not.toBeInTheDocument()
  })

  it('displays double sign badge and instruction when institution requires double signature', async () => {
    setup({ doubleSign: true })

    expect(await screen.findByText(/机构启用双签/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '审核并签发' })).toBeInTheDocument()
  })
})
