import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicalPrintBatch, ClinicalPrintPreparation, RhnApi } from '../../shared/rhnApi'
import { ClinicalPrintingWorkspace } from './ClinicalPrintingWorkspace'

const preparation: ClinicalPrintPreparation = {
  template: { id: 't1', templateCode: 'INFUSION_LABEL_70X50', templateName: '输液瓶签 70x50',
    documentType: 'INFUSION_LABEL', versionId: 'v1', version: 1, layoutSchema: 'RHN_PRINT_CANVAS_V1' },
  media: { id: 'm1', mediaCode: 'LABEL_70X50', mediaName: '70mm x 50mm 输液标签', mediaKind: 'LABEL',
    widthMm: 70, heightMm: 50, columns: 1, rows: 1, dpi: 203 },
  mediaProfiles: [
    { id: 'm1', mediaCode: 'LABEL_70X50', mediaName: '70mm x 50mm 输液标签', mediaKind: 'LABEL',
      widthMm: 70, heightMm: 50, columns: 1, rows: 1, dpi: 203 },
    { id: 'm2', mediaCode: 'A4_LABEL_70X50_8_UP', mediaName: 'A4 70x50 标签八联', mediaKind: 'SHEET',
      widthMm: 210, heightMm: 297, columns: 2, rows: 4, dpi: 300 },
  ],
  devices: [{ id: 'd1', revision: 0, deviceCode: 'BROWSER', deviceName: '治疗室浏览器 PDF',
    channel: 'BROWSER_PDF', outputLanguage: 'PDF', defaultDevice: true }],
  defaultDeviceId: 'd1',
  candidates: [
    { sourceId: 'task-1', sourceVersion: 2, taskNo: 'TR-001', status: 'READY', residentId: 'r1',
      residentName: '李晓雨', healthRecordNo: 'HR001', encounterId: 'e1', createdAt: '2026-09-12T08:00:00Z',
      medicationSummary: '氯化钠注射液', routeSummary: 'IVGTT', itemCount: 1, eligible: true,
      printedBefore: false, itemKey: 'key-1' },
    { sourceId: 'task-2', sourceVersion: 1, taskNo: 'TR-002', status: 'WAITING_SETTLEMENT', residentId: 'r2',
      residentName: '周建国', healthRecordNo: 'HR002', encounterId: 'e2', createdAt: '2026-09-12T08:10:00Z',
      medicationSummary: '头孢曲松钠', routeSummary: 'IVGTT', itemCount: 1, eligible: false,
      exclusionCode: 'WAITING_SETTLEMENT', exclusionReason: '费用尚未结算', printedBefore: false, itemKey: 'key-2' },
  ],
}

const batch: ClinicalPrintBatch = {
  id: 'batch-1', revision: 2, documentType: 'INFUSION_LABEL', documentName: '输液瓶签', status: 'SENT',
  templateName: '输液瓶签 70x50', templateVersionId: 'v1', mediaName: '70mm x 50mm 输液标签',
  mediaCode: 'LABEL_70X50', deviceId: 'd1', deviceName: '治疗室浏览器 PDF', businessDate: '2026-09-12',
  layoutStrategy: 'ONE_CARD_PER_PAGE', startSlot: 1, selectedCount: 1, includedCount: 1, excludedCount: 0,
  pageCount: 1, outputId: 'out-1', jobId: 'job-1', downloadUrl: '/output.pdf',
  createdAt: '2026-09-12T08:12:00Z', createdBy: 'doctor', items: [],
}

describe('ClinicalPrintingWorkspace', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() })
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'request-1') })
  })

  it('reconciles candidates and dispatches the selected card', async () => {
    const user = userEvent.setup()
    const create = vi.fn().mockResolvedValue({ ...batch, status: 'GENERATED' })
    const dispatch = vi.fn().mockResolvedValue(batch)
    const api = { printing: {
      clinicalPrintCandidates: vi.fn().mockResolvedValue(preparation),
      clinicalPrintBatches: vi.fn().mockResolvedValue([]),
      createClinicalPrintBatch: create, dispatchClinicalPrintBatch: dispatch,
      clinicalPrintOutput: vi.fn().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })),
    } } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><ClinicalPrintingWorkspace api={api} /></QueryClientProvider>)

    expect(await screen.findByText('李晓雨')).toBeInTheDocument()
    expect(screen.getByText('费用尚未结算')).toBeInTheDocument()
    const boxes = screen.getAllByRole('checkbox')
    expect(boxes[1]).toBeDisabled()
    await user.click(boxes[0])
    expect(screen.getByText('已选 1 张')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '生成并投递' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      documentType: 'INFUSION_LABEL', sourceIds: ['task-1'], mediaProfileId: 'm1', deviceId: 'd1',
    })))
    await waitFor(() => expect(dispatch).toHaveBeenCalledWith('batch-1', 'd1'))
    expect(await screen.findByTitle('打印 PDF 预览')).toHaveAttribute('src', 'blob:preview')
  })

  it('selects a multi-up sheet and sends the start slot to composition', async () => {
    const user = userEvent.setup()
    const sheetPreparation = { ...preparation, media: preparation.mediaProfiles[1] }
    const candidates = vi.fn()
      .mockResolvedValueOnce(preparation)
      .mockResolvedValue(sheetPreparation)
    const create = vi.fn().mockResolvedValue({ ...batch, mediaCode: 'A4_LABEL_70X50_8_UP',
      mediaName: 'A4 70x50 标签八联', layoutStrategy: 'SHEET_GRID', startSlot: 6 })
    const api = { printing: {
      clinicalPrintCandidates: candidates,
      clinicalPrintBatches: vi.fn().mockResolvedValue([]),
      createClinicalPrintBatch: create,
      dispatchClinicalPrintBatch: vi.fn().mockResolvedValue(batch),
      clinicalPrintOutput: vi.fn().mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' })),
    } } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
    render(<QueryClientProvider client={client}><ClinicalPrintingWorkspace api={api} /></QueryClientProvider>)

    expect(await screen.findByText('李晓雨')).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '输出纸张与组版' }))
    await user.click(await screen.findByText('A4 70x50 标签八联'))
    await waitFor(() => expect(screen.getByText('2 列 × 4 行，共 8 格')).toBeInTheDocument())
    await user.click(screen.getByRole('combobox', { name: '首张起始格' }))
    await user.click(await screen.findByText('第 6 格'))
    await user.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText('1 张 · 1 页 · 第 6 格起')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '生成并投递' }))

    await waitFor(() => expect(create).toHaveBeenCalledWith(expect.objectContaining({
      mediaProfileId: 'm2', layoutStrategy: 'SHEET_GRID', startSlot: 6,
    })))
  })
})
