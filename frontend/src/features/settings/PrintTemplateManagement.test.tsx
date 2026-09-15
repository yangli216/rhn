import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  PrintAdministrationCatalog, PrintTemplateDraft, PublishedPrintTemplate, RhnApi, SavePrintDraft,
} from '../../shared/rhnApi'
import { PrintTemplateManagement } from './PrintTemplateManagement'

const definition = {
  id: 'definition-card', documentType: 'ORAL_MEDICATION_CARD', documentName: '口服药卡', category: 'CARD',
  layoutMode: 'CANVAS', dataSchema: 'RHN.PRINT.ORAL_MEDICATION_CARD.V1',
  sourceType: 'MedicationExecutionTask', scope: 'PLATFORM',
} as const

const media = {
  id: 'media-80', mediaCode: 'THERMAL_80_CONTINUOUS', mediaName: '80mm 热敏连续纸', mediaKind: 'CONTINUOUS',
  widthMm: 80, heightMm: null, orientation: 'PORTRAIT', marginTopMm: 2, marginRightMm: 2,
  marginBottomMm: 2, marginLeftMm: 2, horizontalGapMm: 0, verticalGapMm: 0,
  columns: 1, rows: 1, dpi: 203, sensorMode: 'NONE', scope: 'PLATFORM',
} as const

const catalog: PrintAdministrationCatalog = { documentDefinitions: [definition], mediaProfiles: [media] }

function draft(status: PrintTemplateDraft['status'] = 'DRAFT', revision = 1): PrintTemplateDraft {
  return {
    id: 'draft-1', revision, templateId: null, publishedVersionId: null,
    templateCode: 'ORAL_CARD_CUSTOM', templateName: '病区口服药卡', status,
    layoutSchema: 'RHN_PRINT_CANVAS_V1',
    configJson: JSON.stringify({ paper: { widthMm: 80, heightMm: 55 }, elements: [
      { type: 'text', xMm: 2, yMm: 2, widthMm: 76, heightMm: 7, text: '口服药卡', fontSize: 13 },
    ] }),
    documentDefinition: definition, mediaProfile: media, updatedAt: '2026-09-12T08:00:00Z', updatedBy: 'admin',
  }
}

const publishedTemplate: PublishedPrintTemplate = {
  id: 'template-1', templateCode: 'ORAL_MEDICATION_CARD_80', templateName: '口服药卡 80mm',
  documentType: 'ORAL_MEDICATION_CARD', scope: 'PLATFORM', currentVersion: 3,
  layoutSchema: 'RHN_PRINT_CANVAS_V1',
}

function renderManagement(initial = draft(), published: PublishedPrintTemplate[] = []) {
  let current = initial
  const updateTemplateDraft = vi.fn(async (_id: string, value: Omit<SavePrintDraft, 'templateCode'> & { expectedRevision: number }) => {
    current = { ...current, revision: current.revision + 1, templateName: value.templateName, configJson: value.configJson }
    return current
  })
  const transitionTemplateDraft = vi.fn(async (_id: string, action: 'submit' | 'reject' | 'publish') => {
    current = { ...current, revision: current.revision + 1,
      status: action === 'submit' ? 'IN_REVIEW' : action === 'reject' ? 'REJECTED' : 'PUBLISHED' }
    return current
  })
  const device = { id: 'device-1', revision: 2, deviceCode: 'NURSE-01', deviceName: '治疗室标签机',
    channel: 'LOCAL_BRIDGE', outputLanguage: 'PDF', queueName: 'Zebra-01', defaultDevice: false,
    lastSeenAt: new Date().toISOString(), status: 'ACTIVE', capabilitiesJson: '{}' } as const
  const updateClinicalPrintDevice = vi.fn(async (_id: string, value: Record<string, unknown>) => ({
    ...device, ...value, revision: 3,
  }))
  const previewPublishedTemplate = vi.fn(async () => new Blob(['%PDF-preview'], { type: 'application/pdf' }))
  const api = { printing: {
    administrationCatalog: vi.fn().mockResolvedValue(catalog),
    templateDrafts: vi.fn(async () => [current]), templates: vi.fn().mockResolvedValue(published),
    createTemplateDraft: vi.fn(), updateTemplateDraft, transitionTemplateDraft,
    clonePublishedTemplate: vi.fn(), previewTemplateDraft: vi.fn(), previewPublishedTemplate,
    clinicalPrintDeviceManagement: vi.fn().mockResolvedValue({ devices: [device], bindings: [] }),
    createClinicalPrintDevice: vi.fn(), updateClinicalPrintDevice, bindClinicalPrintDevice: vi.fn(),
  } } as unknown as RhnApi
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}><PrintTemplateManagement api={api} /></QueryClientProvider>)
  return { updateTemplateDraft, transitionTemplateDraft, updateClinicalPrintDevice, previewPublishedTemplate }
}

describe('PrintTemplateManagement', () => {
  it('edits a canvas element, saves the validated layout, and submits the saved revision', async () => {
    const user = userEvent.setup()
    const { updateTemplateDraft, transitionTemplateDraft } = renderManagement()

    expect(await screen.findByText('病区口服药卡')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '文字' }))
    const text = screen.getByDisplayValue('新文字')
    fireEvent.change(text, { target: { value: '患者：{{patientName}}' } })
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updateTemplateDraft).toHaveBeenCalledTimes(1))
    const payload = updateTemplateDraft.mock.calls[0][1]
    expect(payload.expectedRevision).toBe(1)
    expect(JSON.parse(payload.configJson).elements.at(-1)).toMatchObject({
      type: 'text', text: '患者：{{patientName}}', xMm: 3, yMm: 3,
    })

    await screen.findByText('草稿已保存并通过布局校验')
    await user.click(screen.getByRole('button', { name: '提交审核' }))
    await waitFor(() => expect(transitionTemplateDraft).toHaveBeenCalledWith('draft-1', 'submit', 2))
    expect(await screen.findAllByText('待审核')).toHaveLength(2)
  })

  it('shows review actions only for an in-review draft', async () => {
    renderManagement(draft('IN_REVIEW', 4))

    expect(await screen.findByRole('button', { name: '发布版本' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '退回' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '提交审核' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('adds a predefined business field and exposes common display formatting', async () => {
    const user = userEvent.setup()
    const { updateTemplateDraft } = renderManagement()

    await user.click(await screen.findByRole('button', { name: '药品名称' }))
    expect(screen.getByDisplayValue('药品名称：{{medicationName}}')).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: '粗体' }))
    await user.click(screen.getByRole('switch', { name: '边框' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(updateTemplateDraft).toHaveBeenCalledTimes(1))
    expect(JSON.parse(updateTemplateDraft.mock.calls[0][1].configJson).elements.at(-1)).toMatchObject({
      type: 'text', template: '药品名称：{{medicationName}}', bold: true, border: true,
    })
  })

  it('previews an immutable published version from the published template list', async () => {
    const user = userEvent.setup()
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:published-preview')
    const { previewPublishedTemplate } = renderManagement(draft(), [publishedTemplate])

    await user.click(await screen.findByRole('button', { name: '预览已发布模板 口服药卡 80mm' }))
    await waitFor(() => expect(previewPublishedTemplate).toHaveBeenCalledWith('template-1', expect.objectContaining({ patientName: '张晓宁' })))
    expect(await screen.findByTitle('已发布打印模板 PDF 预览')).toHaveAttribute('src', 'blob:published-preview')
    createObjectUrl.mockRestore()
  })

  it('edits a local bridge device in the same print management workspace', async () => {
    const user = userEvent.setup()
    const { updateClinicalPrintDevice } = renderManagement()

    await user.click(await screen.findByRole('tab', { name: '设备与路由' }))
    await user.click(await screen.findByRole('button', { name: /治疗室标签机/ }))
    expect(await screen.findByDisplayValue('治疗室标签机')).toBeInTheDocument()
    fireEvent.change(screen.getByDisplayValue('治疗室标签机'), { target: { value: '门诊治疗室标签机' } })
    await user.click(screen.getByRole('button', { name: '保存设备' }))

    await waitFor(() => expect(updateClinicalPrintDevice).toHaveBeenCalledWith('device-1', expect.objectContaining({
      expectedRevision: 2, deviceName: '门诊治疗室标签机', channel: 'LOCAL_BRIDGE', outputLanguage: 'PDF',
    })))
  })
})
