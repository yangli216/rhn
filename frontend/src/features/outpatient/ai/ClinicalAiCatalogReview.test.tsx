import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { ClinicalAiTreatmentMatch } from '../../../shared/api/clinicalAiApi'
import { ClinicalAiCatalogReview } from './ClinicalAiCatalogReview'
import { createRhnSessionApi } from '../../../shared/rhnApi'

const candidates = [
  { type: 'LABORATORY' as const, catalogItemId: 'five', code: 'CBC5', name: '血常规（五分类）' },
  { type: 'LABORATORY' as const, catalogItemId: 'three', code: 'CBC3', name: '血常规（三分类）' },
]
const checkedApi = (item = candidates[0]) => ({ clinicalAi: { resolveTreatments: vi.fn().mockResolvedValue([{ key: 'checked', intent: { type: item.type, name: item.name }, status: 'MATCHED', reason: '已核对', candidates: [item] }]) } } as unknown as RhnApi)
const ambiguous: ClinicalAiTreatmentMatch = { key: 'cbc', intent: { type: 'LABORATORY', name: '血常规' },
  status: 'AMBIGUOUS', reason: '存在多个项目，请选择', candidates }

describe('unresolved AI catalog intents', () => {
  it('requires an explicit candidate selection and keeps the chosen catalog facts', async () => {
    const user = userEvent.setup(), onResolved = vi.fn()
    render(<ClinicalAiCatalogReview matches={[ambiguous]} api={checkedApi()} encounterId="e1" disabled={false} onResolved={onResolved} />)
    expect(screen.getByRole('checkbox', { name: '选择 血常规' })).toBeDisabled()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '核对目录 血常规' }))
    expect(screen.getByRole('button', { name: '确认匹配' })).toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: '匹配 血常规' }))
    await user.click(screen.getByRole('option', { name: '血常规（五分类）' }))
    await user.click(screen.getByRole('button', { name: '确认匹配' }))
    expect(onResolved).toHaveBeenCalledWith(['cbc'], [{ ...candidates[0], aiOriginalName: '血常规' }])
  })

  it('keeps unavailable intents in a disabled order row and expands catalog search on demand', async () => {
    const onResolved = vi.fn()
    const match = { ...ambiguous, key: 'ct', intent: { type: 'EXAMINATION', name: '胸部CT' },
      status: 'NO_ORDERABLE_SERVICE', reason: '本院可开立目录未匹配，仅供医生评估医嘱方向；可调整名称重新检索。', candidates: [] }
    render(<ClinicalAiCatalogReview matches={[match]} api={{} as RhnApi} encounterId="e1" disabled={false} onResolved={onResolved} />)
    expect(screen.getByText('虚线项目尚未完成院内目录核对，暂不可勾选；核对后可带入医嘱。')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: '胸部CT · 未匹配本院项目' })).toHaveClass('doctor-unified-order-row', 'is-catalog-pending')
    const checkbox = screen.getByRole('checkbox', { name: '选择 胸部CT' })
    expect(checkbox).toBeDisabled()
    expect(checkbox).not.toBeChecked()
    await userEvent.click(checkbox)
    expect(onResolved).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '核对目录 胸部CT' }))
    expect(screen.getByRole('dialog', { name: '匹配院内项目 · 胸部CT' })).toHaveClass('ui-dialog--panel')
    expect(screen.getByRole('combobox', { name: '检索 胸部CT' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认匹配' })).toBeDisabled()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('keeps a general sputum method pending and uses its actual identity after selection', async () => {
    const user = userEvent.setup(), onResolved = vi.fn()
    const item = { type: 'LABORATORY' as const, catalogItemId: 'culture', code: 'LAB302', name: '一般细菌培养及鉴定' }
    const match = { ...ambiguous, key: 'sputum', intent: { type: 'LABORATORY', name: '痰培养' },
      reason: '已找到相关院内项目，请核对标本、检查方法及本次适用性后选择。', candidates: [item] }
    render(<ClinicalAiCatalogReview matches={[match]} api={checkedApi(item)} encounterId="e1" disabled={false} onResolved={onResolved} />)
    expect(screen.getByText('待选项目')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '核对目录 痰培养' }))
    expect(screen.getByRole('button', { name: '确认匹配' })).toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: '匹配 痰培养' }))
    await user.click(screen.getByRole('option', { name: item.name }))
    await user.click(screen.getByRole('button', { name: '确认匹配' }))
    expect(onResolved).toHaveBeenCalledWith(['sputum'], [{ ...item, aiOriginalName: '痰培养' }])
  })

  it('shows requested and actual drug specifications and does not preselect a different strength', async () => {
    const match = { ...ambiguous, status: 'SPECIFICATION_REVIEW', intent: { type: 'MEDICATION', name: '测试药品', specification: '250mg' },
      candidates: [{ type: 'MEDICATION' as const, catalogItemId: 'p1', medicationId: 'm1', code: 'M', name: '测试药品', specification: '0.5g' }] }
    render(<ClinicalAiCatalogReview matches={[match]} api={{} as RhnApi} encounterId="e1" disabled={false} onResolved={vi.fn()} />)
    expect(screen.getByText('建议规格：250mg')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '核对目录 测试药品' }))
    expect(screen.getByRole('button', { name: '确认匹配' })).toBeDisabled()
  })

  it('drops late retry results after the encounter changes', async () => {
    let complete!: (value: ClinicalAiTreatmentMatch[]) => void
    const resolveTreatments = vi.fn().mockImplementation(() => new Promise<ClinicalAiTreatmentMatch[]>(resolve => { complete = resolve }))
    const api = { clinicalAi: { resolveTreatments } } as unknown as RhnApi
    const props = { matches: [{ ...ambiguous, candidates: [], status: 'CATALOG_ERROR' }], api, disabled: false, onResolved: vi.fn() }
    const view = render(<ClinicalAiCatalogReview {...props} encounterId="e1" />)
    await userEvent.click(screen.getByRole('button', { name: '核对目录 血常规' }))
    await userEvent.click(screen.getByRole('button', { name: '重新核查' }))
    view.rerender(<ClinicalAiCatalogReview {...props} encounterId="e2" />)
    await act(async () => complete([{ ...ambiguous, status: 'MATCHED', candidates: [candidates[0]] }]))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(props.onResolved).not.toHaveBeenCalled()
  })

  it('does not expand a locked encounter and supports the evidence drawer layout', async () => {
    const onResolved = vi.fn()
    render(<ClinicalAiCatalogReview layout="compact" matches={[ambiguous]} api={{} as RhnApi} encounterId="e1" disabled onResolved={onResolved} />)
    const toggle = screen.getByRole('button', { name: '核对目录 血常规' })
    expect(toggle).toBeDisabled()
    await userEvent.click(toggle)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('shows raw low confidence without auto selecting, and keeps confirmation outside the row', async () => {
    const match = { ...ambiguous, decisionReview: { status: 'COMPLETED' as const, model: 'jev-1.13.0', mode: 'SHADOW',
      confidence: .73, threshold: .9, suggestedItem: candidates[1], detail: '仅核查目录语义匹配，需医生确认。' } }
    const onResolved = vi.fn()
    render(<ClinicalAiCatalogReview matches={[match]} api={checkedApi()} encounterId="e1" disabled={false} onResolved={onResolved} />)
    expect(screen.getByText('Jev 置信度 73.0%')).toBeInTheDocument()
    const row = screen.getByRole('row')
    await userEvent.click(within(row).getByRole('button', { name: '核对目录 血常规' }))
    const panel = screen.getByRole('dialog')
    expect(row).not.toContainElement(panel)
    expect(within(panel).getByText(/当前阈值 90%/)).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: '确认匹配' })).toBeDisabled()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('uses the organization-scoped order-entry search and validates the chosen ID', async () => {
    const user = userEvent.setup(), item = { id: 'actual', code: 'LAB303', name: '血细胞分析', sdServiceType: 'LABORATORY', sdStatus: 'ACTIVE' }
    const selected = { type: 'LABORATORY', catalogItemId: item.id, code: item.code, name: item.name }
    const services = vi.fn().mockResolvedValue([item])
    const resolveTreatments = vi.fn().mockResolvedValue([{ key: 'checked', intent: ambiguous.intent, status: 'MATCHED', reason: '已核对', candidates: [selected] }])
    const api = { masterData: { services }, clinicalAi: { resolveTreatments } } as unknown as RhnApi
    const onResolved = vi.fn()
    render(<ClinicalAiCatalogReview matches={[ambiguous]} api={api} organizationId="org1" encounterId="e1" disabled={false} onResolved={onResolved} />)
    await user.click(screen.getByRole('button', { name: '核对目录 血常规' }))
    await user.click(screen.getByRole('combobox', { name: '检索 血常规' }))
    await user.type(screen.getByPlaceholderText('输入项目名称、编码或项目类型'), '血细胞')
    await user.click(await screen.findByRole('option', { name: /血细胞分析/ }))
    await user.click(screen.getByRole('button', { name: '确认匹配' }))
    expect(services).toHaveBeenCalledWith('血细胞', '', 'ACTIVE', 'org1')
    expect(resolveTreatments).toHaveBeenCalledWith('e1', [expect.objectContaining({ name: item.name, catalogItemId: item.id, type: 'LABORATORY' })])
    expect(onResolved).toHaveBeenCalledWith(['cbc'], [{ ...selected, aiOriginalName: '血常规' }])
  })

  it('keeps the panel open when the selected identity is no longer orderable', async () => {
    const user = userEvent.setup(), onResolved = vi.fn()
    const api = { clinicalAi: { resolveTreatments: vi.fn().mockResolvedValue([{ ...ambiguous, status: 'NO_ORDERABLE_SERVICE', reason: '所选项目已停用', candidates: [] }]) } } as unknown as RhnApi
    render(<ClinicalAiCatalogReview matches={[ambiguous]} api={api} encounterId="e1" disabled={false} onResolved={onResolved} />)
    await user.click(screen.getByRole('button', { name: '核对目录 血常规' }))
    await user.click(screen.getByRole('combobox', { name: '匹配 血常规' }))
    await user.click(screen.getByRole('option', { name: candidates[0].name }))
    await user.click(screen.getByRole('button', { name: '确认匹配' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('所选项目已停用')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(onResolved).not.toHaveBeenCalled()
  })

  it('uses the production API module and preserves HTTP failures', async () => {
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify([ambiguous])))
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: '目录不可访问' }), { status: 403 }))
    try {
      const api = createRhnSessionApi('tenant').withWorkContext({ organizationId: 'org', departmentId: 'dept' })
      expect(await api.clinicalAi.resolveTreatments('e1', [ambiguous.intent])).toEqual([ambiguous])
      expect(fetcher.mock.calls[0][0]).toContain('/api/ai/clinical-assistant/encounters/e1/treatment-matches')
      expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({ intents: [ambiguous.intent] })
      await expect(api.clinicalAi.resolveTreatments('e1', [ambiguous.intent])).rejects.toThrow('目录不可访问')
    } finally { fetcher.mockRestore() }
  })
})
