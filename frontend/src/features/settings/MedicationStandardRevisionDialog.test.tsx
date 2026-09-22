import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, it, vi } from 'vitest'
import type { StandardRevisionImpact } from '../../shared/api/medicationStandardRevisionApi'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationStandardRevisionDialog } from './MedicationStandardRevisionDialog'

const identity = { catalogId: 'C', catalogVersion: '2', contentHash: 'new', sourceHash: 'source' }
const medication = { id: '1', revision: 3, code: 'LOCAL', name: '合成药品', status: 'ACTIVE' }
const link = { id: 'old', catalogId: 'C', catalogVersion: '1', contentHash: 'old', entryId: 'E', specificationId: 'OLD-S', createdBy: '6', createdAt: '2026-01-01T00:00:00Z' }
const target = { id: 'S', entryId: 'E', name: '合成药品', doseFormName: '片剂', specification: '合成规格', sourceBlock: '合成原文' }
const snapshot: StandardRevisionImpact = { version: 'standard-revision-impact-v1', inspectedAt: '2026-09-21T00:00:00Z', fingerprint: 'impact-fingerprint', areas: [{ scope: { catalogId: 'C', entryId: 'E', specificationId: 'S' }, coverage: ['覆盖知识与规则'], limitations: ['历史处方未扫描'], dependencies: [] }] }
const event = { id: '10', status: 'SUBMITTED', actor: '提交人', actorId: '7', reason: '修正旧版关联', recordedAt: '2026-09-21T00:00:00Z', resultingLinks: [link], proposal: { medicationId: '1', medicationRevision: 3, medication, previousLinks: [link], identity, specificationId: 'S', target, reason: '修正旧版关联', impactNotes: '已核对合成影响', submittedBy: '7', submitter: '提交人', submittedAt: '2026-09-21T00:00:00Z', impact: snapshot } }
const base = { binding: { medication, identity, candidates: [{ specification: target }], reference: { status: 'STALE' } }, currentLinks: [link], sourceFingerprint: 'fingerprint', eligibleSpecificationIds: ['S'], latest: null as typeof event | null, staleIssues: [] as string[], allowedActions: ['SUBMIT'], history: [] as typeof event[], totalEvents: 0, historyPage: 0, currentImpact: null as StandardRevisionImpact | null }
function mount(value = base, impact = vi.fn().mockResolvedValue(snapshot)) {
  const preview = vi.fn().mockResolvedValue(value), submit = vi.fn().mockResolvedValue({ ...base, latest: event, history: [event], totalEvents: 1, allowedActions: ['CANCEL'] }), review = vi.fn().mockResolvedValue({ ...base, latest: { ...event, status: 'APPLIED' }, history: [], allowedActions: [] })
  const inspect = vi.fn().mockResolvedValue({ totals: {}, coverage: [], limitations: [], content: [], historicalCount: 0, potentialCount: 0, totalPages: 0, totalElements: 0, inspectedAt: '2026-01-01T00:00:00Z' })
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MedicationStandardRevisionDialog api={{ medicationStandardRevision: { preview, submit, review, impact }, medicationStandardImpact: { inspect } } as unknown as RhnApi} medicationId="1" onClose={vi.fn()} /></QueryClientProvider>)
  return { preview, submit, review, inspect, impact }
}
it('requires an explicit target, rationale, impact notes and identity confirmation before submission', async () => {
  const { submit } = mount()
  expect(await screen.findByRole('button', { name: '提交修订，等待复核' })).toBeDisabled()
  await userEvent.click(screen.getByRole('radio', { name: '修订目标 S' }))
  await userEvent.type(screen.getByRole('textbox', { name: '修订依据' }), '逐项核对旧关联')
  await userEvent.type(screen.getByRole('textbox', { name: '影响核对说明' }), '确认产品和规则影响')
  expect(screen.getByRole('button', { name: '提交修订，等待复核' })).toBeDisabled()
  await userEvent.click(await screen.findByRole('checkbox', { name: '确认冻结影响清单' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '已核对目标与此药品身份一致，修订范围和依据明确' }))
  await userEvent.click(screen.getByRole('button', { name: '提交修订，等待复核' }))
  await waitFor(() => expect(submit).toHaveBeenCalledWith('1', expect.objectContaining({ expectedMedicationRevision: 3, expectedEventId: null, expectedSourceFingerprint: 'fingerprint', identity, specificationId: 'S', confirmedIdentity: true, impactNotes: '确认产品和规则影响', expectedImpactFingerprint: 'impact-fingerprint' })))
  expect(await screen.findByText(/提交人不能自行复核应用/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复核通过并应用' })).not.toBeInTheDocument()
})
it('independent application requires both review confirmations and sends the frozen event id', async () => {
  const { review } = mount({ ...base, latest: event, history: [event], totalEvents: 1, allowedActions: ['APPLY', 'REJECT'] })
  await userEvent.type(await screen.findByRole('textbox', { name: '处理理由' }), '已独立核对')
  await userEvent.click(screen.getByRole('checkbox', { name: '复核标准身份' }))
  expect(screen.getByRole('button', { name: '复核通过并应用' })).toBeDisabled()
  await userEvent.click(screen.getByRole('checkbox', { name: '复核影响与历史保留' }))
  await userEvent.click(screen.getByRole('button', { name: '复核通过并应用' }))
  await waitFor(() => expect(review).toHaveBeenCalledWith('1', { expectedEventId: '10', action: 'APPLY', reason: '已独立核对', confirmedIdentity: true, confirmedImpact: true }))
})
it('invalidates old consent on refresh and permits rejection of stale proposals', async () => {
  const { preview } = mount({ ...base, latest: event, history: [event], totalEvents: 1, allowedActions: ['APPLY', 'REJECT'] })
  await userEvent.click(await screen.findByRole('checkbox', { name: '复核标准身份' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '复核影响与历史保留' }))
  preview.mockResolvedValue({ ...base, sourceFingerprint: 'changed', latest: event, history: [event], totalEvents: 1, staleIssues: ['已有标准关联已变化'], allowedActions: ['REJECT'] })
  await userEvent.click(screen.getByRole('button', { name: '刷新修订状态' }))
  expect(await screen.findByText('已有标准关联已变化')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复核通过并应用' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '退回修订' })).toBeDisabled()
})
it('opens impact inspection using the exact old catalogue and specification rather than current identity', async () => {
  const { inspect } = mount()
  await userEvent.click(await screen.findByRole('button', { name: '查看原关联影响' }))
  await waitFor(() => expect(inspect).toHaveBeenCalledWith({ catalogId: 'C', entryId: 'E', specificationId: 'OLD-S' }, 'ALL', true, 0))
})

it('keeps submission disabled when the impact inventory cannot be read and clears consent on refresh', async () => {
  const impact = vi.fn().mockResolvedValue(snapshot)
  const { submit } = mount(base, impact)
  await userEvent.click(await screen.findByRole('radio', { name: '修订目标 S' }))
  await userEvent.type(screen.getByRole('textbox', { name: '修订依据' }), '核对来源')
  await userEvent.type(screen.getByRole('textbox', { name: '影响核对说明' }), '核对全部影响')
  await userEvent.click(screen.getByRole('checkbox', { name: '已核对目标与此药品身份一致，修订范围和依据明确' }))
  await userEvent.click(await screen.findByRole('checkbox', { name: '确认冻结影响清单' }))
  expect(screen.getByRole('button', { name: '提交修订，等待复核' })).toBeEnabled()
  impact.mockRejectedValue(new Error('影响服务暂时不可用'))
  await userEvent.click(screen.getByRole('button', { name: '刷新影响清单' }))
  expect(await screen.findByText(/影响服务暂时不可用/)).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: '确认冻结影响清单' })).not.toBeChecked()
  expect(screen.getByRole('button', { name: '提交修订，等待复核' })).toBeDisabled()
  expect(submit).not.toHaveBeenCalled()
})
it('shows frozen and changed inventories separately, clears review consent and retains rejection', async () => {
  const { preview } = mount({ ...base, latest: event, history: [event], totalEvents: 1, currentImpact: snapshot, allowedActions: ['APPLY', 'REJECT'] })
  await userEvent.click(await screen.findByRole('checkbox', { name: '复核标准身份' }))
  await userEvent.click(screen.getByRole('checkbox', { name: '复核影响与历史保留' }))
  const changed: StandardRevisionImpact = { ...snapshot, fingerprint: 'new-impact', areas: snapshot.areas.map(area => ({ ...area, dependencies: [{ kind: 'KNOWLEDGE', id: 'K1', parentId: null, name: '新增合成知识', version: '1', status: 'DRAFT', historical: false, matchType: 'POTENTIAL', traces: [], mode: null, organizationId: null, departmentId: null, effectiveFrom: null, effectiveTo: null }] })) }
  preview.mockResolvedValue({ ...base, latest: event, history: [event], totalEvents: 1, currentImpact: changed, staleIssues: ['影响清单已变化'], allowedActions: ['REJECT'] })
  await userEvent.click(screen.getByRole('button', { name: '刷新修订状态' }))
  expect(await screen.findByText(/相对提交时的清单：新增 1 条/)).toBeInTheDocument()
  expect(screen.getByText(/提交时冻结的影响清单/)).toBeInTheDocument()
  expect(screen.getByText(/重新核查的当前影响清单/)).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复核通过并应用' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '退回修订' })).toBeInTheDocument()
})
it('explains missing impact evidence on legacy proposals without inventing a snapshot', async () => {
  const legacy = { ...event, proposal: { ...event.proposal, impact: undefined as unknown as StandardRevisionImpact } }
  mount({ ...base, latest: legacy, history: [legacy], totalEvents: 1, allowedActions: ['REJECT'], staleIssues: ['请重新提交'] })
  expect(await screen.findByText(/此历史修订没有冻结影响清单/)).toBeInTheDocument()
  expect(screen.queryByText(/提交时冻结的影响清单/)).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '复核通过并应用' })).not.toBeInTheDocument()
})
