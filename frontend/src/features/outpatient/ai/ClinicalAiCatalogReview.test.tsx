import { act, render, screen } from '@testing-library/react'
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
const ambiguous: ClinicalAiTreatmentMatch = { key: 'cbc', intent: { type: 'LABORATORY', name: '血常规' },
  status: 'AMBIGUOUS', reason: '存在多个项目，请选择', candidates }

describe('unresolved AI catalog intents', () => {
  it('requires an explicit candidate selection and keeps the chosen catalog facts', async () => {
    const user = userEvent.setup(), onResolved = vi.fn()
    render(<ClinicalAiCatalogReview matches={[ambiguous]} api={{} as RhnApi} encounterId="e1" disabled={false} onResolved={onResolved} />)
    expect(screen.getByRole('button', { name: '核对用法' })).toBeDisabled()
    await user.click(screen.getByRole('combobox', { name: '匹配 血常规' }))
    await user.click(screen.getByRole('option', { name: '血常规（五分类）' }))
    await user.click(screen.getByRole('button', { name: '核对用法' }))
    expect(onResolved).toHaveBeenCalledWith(['cbc'], [candidates[0]])
  })

  it('shows requested and actual drug specifications and does not preselect a different strength', () => {
    const match = { ...ambiguous, status: 'SPECIFICATION_REVIEW', intent: { type: 'MEDICATION', name: '测试药品', specification: '250mg' },
      candidates: [{ type: 'MEDICATION' as const, catalogItemId: 'p1', medicationId: 'm1', code: 'M', name: '测试药品', specification: '0.5g' }] }
    render(<ClinicalAiCatalogReview matches={[match]} api={{} as RhnApi} encounterId="e1" disabled={false} onResolved={vi.fn()} />)
    expect(screen.getByText('建议规格：250mg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '核对用法' })).toBeDisabled()
  })

  it('drops late retry results after the encounter changes', async () => {
    let complete!: (value: ClinicalAiTreatmentMatch[]) => void
    const resolveTreatments = vi.fn().mockImplementation(() => new Promise<ClinicalAiTreatmentMatch[]>(resolve => { complete = resolve }))
    const api = { clinicalAi: { resolveTreatments } } as unknown as RhnApi
    const props = { matches: [{ ...ambiguous, candidates: [], status: 'CATALOG_ERROR' }], api, disabled: false, onResolved: vi.fn() }
    const view = render(<ClinicalAiCatalogReview {...props} encounterId="e1" />)
    await userEvent.click(screen.getByRole('button', { name: '重新匹配' }))
    view.rerender(<ClinicalAiCatalogReview {...props} encounterId="e2" />)
    await act(async () => complete([{ ...ambiguous, status: 'MATCHED', candidates: [candidates[0]] }]))
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(props.onResolved).not.toHaveBeenCalled()
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
