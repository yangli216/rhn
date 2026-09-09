import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type {
  ClinicalAiDraftContext, ClinicalAiSuggestion, GenerateClinicalAiSuggestionInput,
} from '../../../shared/api/clinicalAiApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { ClinicalAiAssistantPanel } from './ClinicalAiAssistantPanel'

const encounter = {
  id: 'enc-1', residentId: 'resident-1', organizationId: 'org-1', departmentId: 'dept-1',
  clinicianId: 'doctor', status: 'IN_PROGRESS', diagnoses: [], vitalSigns: {},
} as unknown as Encounter

const context: ClinicalAiDraftContext = {
  encounterId: 'enc-1', residentId: 'resident-1', encounterStatus: 'IN_PROGRESS',
  documentVersion: 0, documentStatus: 'DRAFT', structuredContextFingerprint: 'record-0',
  medicationDraftFingerprint: 'med-0', serviceDraftFingerprint: 'service-0',
  allergyContextFingerprint: 'allergy-0', allergyState: 'READY', busy: false, diagnoses: [],
}

const template: OutpatientPlanTemplate = {
  id: 'plan-1', revision: 3, scopeType: 'PERSONAL', name: '高血压复诊方案', status: 'ACTIVE',
  sortOrder: 0, useCount: 2, diagnoses: [], services: [], createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z', medications: [{
    lineId: 'line-1', medicationId: 'med-1', catalogItemId: 'product-1', packageId: 'package-1',
    editorMode: 'regular', categoryCode: 'WESTERN', medicationCode: 'DRUG-AML',
    medicationName: '氨氯地平', productName: '苯磺酸氨氯地平片 5mg', preparationSpec: '5mg',
    quantity: 1, quantityUnit: 'BOX', doseValue: 5, doseUnit: 'mg', routeCode: 'ORAL',
    frequencyCode: 'QD', durationValue: 14, durationUnit: '天', substitutionAllowed: true,
    selfProvided: false, priceType: 'SALE', pricingRequired: true,
  }],
}

describe('ClinicalAiAssistantPanel plan preflight', () => {
  it('shows deterministic medication blockers and explicit unevaluated safety boundaries', async () => {
    const preflightPlan = vi.fn().mockResolvedValue({
      templateId: 'plan-1', templateRevision: 3, status: 'BLOCKED', blockingCount: 1, warningCount: 2,
      checkedAt: '2026-09-09T00:00:00Z', medications: [{
        lineId: 'line-1', medicationId: 'med-1', catalogItemId: 'product-1', packageId: 'package-1',
        medicationCode: 'DRUG-AML', medicationName: '氨氯地平', productName: '苯磺酸氨氯地平片 5mg',
        status: 'BLOCKED', checks: [
          { code: 'PRODUCT_PACKAGE', status: 'PASS', message: '院内药品产品与包装有效' },
          { code: 'INVENTORY', status: 'BLOCKED', message: '路由药房库存不足：需要 1 BOX，当前可用 0 BOX' },
        ],
      }],
      drugInteractions: { status: 'NOT_EVALUATED', message: '当前未接入经治理的药物相互作用规则源，系统未对此项作出安全判断。' },
      contraindications: { status: 'NOT_EVALUATED', message: '当前未接入经治理的禁忌证规则源，系统未对此项作出安全判断。' },
    })
    const api = {
      clinicalAi: {
        capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, provider: 'test', model: 'test',
          message: '', features: ['PLAN_RECOMMENDATIONS', 'AUDIT_TRAIL'] }),
        generate: vi.fn().mockImplementation((_id: string, input: GenerateClinicalAiSuggestionInput) => Promise.resolve({
          id: 'suggestion-1', status: 'GENERATED', contextHash: 'sha256:test',
          clientContextFingerprint: input.clientContextFingerprint, provider: 'test', model: 'test',
          promptVersion: 'V1', generatedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 60_000).toISOString(), summary: '建议核对既有方案', recordDraft: {},
          diagnosisCandidates: [], differentialDiagnoses: [], missingInformation: [], safetyAlerts: [],
          recommendedPlans: [{ templateId: 'plan-1', name: '高血压复诊方案', rationale: '匹配当前诊断' }],
          disclaimer: '仅供医生参考',
        })),
        history: vi.fn().mockResolvedValue([]),
        recordEvent: vi.fn().mockResolvedValue(undefined), preflightPlan,
      },
      outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([template]), use: vi.fn() },
    } as unknown as RhnApi
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })

    render(<QueryClientProvider client={client}><ClinicalAiAssistantPanel encounter={encounter}
      currentContext={context} allergies={[]} allergyState="READY" api={api} disabled={false}
      onAdoptionBusyChange={vi.fn()} onApply={vi.fn()} /></QueryClientProvider>)

    await userEvent.click(await screen.findByRole('button', { name: /分析当前就诊/ }))
    await userEvent.click(await screen.findByRole('button', { name: '核对后带入' }))

    expect(await screen.findByText('路由药房库存不足：需要 1 BOX，当前可用 0 BOX')).toBeInTheDocument()
    expect(screen.getByText(/药物相互作用规则源/)).toBeInTheDocument()
    expect(screen.getByText(/禁忌证规则源/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认带入草稿' })).toBeDisabled()
    await waitFor(() => expect(preflightPlan).toHaveBeenCalledWith('enc-1', 'plan-1', expect.objectContaining({
      selectedMedicationLineIds: ['line-1'], allergyReviewConfirmed: false,
    })))
  })
})

describe('ClinicalAiAssistantPanel suggestion history', () => {
  it('shows immutable chronological results and never exposes adoption commands', async () => {
    const latest = historicalSuggestion({ id: 'suggestion-2', status: 'ADOPTED', summary: '复诊风险复核完成',
      parentSuggestionId: 'suggestion-1', generatedAt: '2026-09-09T02:00:00Z' })
    const earlier = historicalSuggestion({ id: 'suggestion-1', status: 'EXPIRED', summary: '首次就诊分析',
      generatedAt: '2026-09-09T01:00:00Z', recordDraft: { presentIllness: '历史现病史草稿' } })
    const recordEvent = vi.fn().mockResolvedValue(undefined)
    const api = assistantApi({ history: vi.fn().mockResolvedValue([latest, earlier]), recordEvent })

    renderPanel(api)
    await userEvent.click(await screen.findByRole('tab', { name: /历史记录/ }))

    expect((await screen.findAllByText('复诊风险复核完成')).length).toBeGreaterThan(0)
    expect(screen.getByText(/追问自 #suggestion-1/)).toBeInTheDocument()
    expect(screen.getByText('已采纳')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /首次就诊分析/ }))
    expect(await screen.findByText('历史现病史草稿')).toBeInTheDocument()
    expect(screen.getByText('已过期')).toBeInTheDocument()
    expect(screen.getByText(/历史建议为生成时的不可变记录/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /带入/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /忽略/ })).not.toBeInTheDocument()
    await waitFor(() => expect(recordEvent).toHaveBeenCalledWith('suggestion-1', expect.objectContaining({
      eventType: 'VIEWED',
    })))
  })

  it('shows an empty state when the encounter has no prior suggestions', async () => {
    renderPanel(assistantApi({ history: vi.fn().mockResolvedValue([]) }))
    await userEvent.click(await screen.findByRole('tab', { name: /历史记录/ }))
    expect(await screen.findByText('暂无历史建议')).toBeInTheDocument()
    expect(screen.queryByText('尚未生成本次建议')).not.toBeInTheDocument()
  })

  it('keeps history failures isolated from the current analysis view', async () => {
    renderPanel(assistantApi({ history: vi.fn().mockRejectedValue(new Error('history unavailable')) }))
    await userEvent.click(await screen.findByRole('tab', { name: /历史记录/ }))
    expect(await screen.findByText(/建议历史加载失败.*history unavailable/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: '当前建议' }))
    expect(screen.getByRole('button', { name: /分析当前就诊/ })).toBeEnabled()
    expect(screen.queryByText(/history unavailable/)).not.toBeInTheDocument()
  })
})

function historicalSuggestion(overrides: Partial<ClinicalAiSuggestion> = {}): ClinicalAiSuggestion {
  return { ...baseSuggestion(), ...overrides }
}

function baseSuggestion() {
  return {
    id: 'suggestion-history', status: 'GENERATED' as const, contextHash: 'sha256:history',
    clientContextFingerprint: 'historical-context', provider: 'test-provider', model: 'clinical-model',
    promptVersion: 'V1', generatedAt: '2026-09-09T00:00:00Z', expiresAt: '2026-09-09T00:05:00Z',
    summary: '历史分析', recordDraft: {}, diagnosisCandidates: [], differentialDiagnoses: [],
    missingInformation: [], safetyAlerts: [], recommendedPlans: [{ templateId: 'plan-1', name: '复诊方案',
      rationale: '历史推荐' }], disclaimer: '仅供医生参考',
  }
}

function assistantApi(overrides: Record<string, unknown> = {}) {
  return {
    clinicalAi: {
      capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, provider: 'test', model: 'test',
        message: '', features: ['RECORD_COMPLETENESS', 'TERMINOLOGY_VALIDATION', 'PLAN_RECOMMENDATIONS', 'AUDIT_TRAIL'] }),
      history: vi.fn().mockResolvedValue([]), recordEvent: vi.fn().mockResolvedValue(undefined), ...overrides,
    },
    outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([]), use: vi.fn() },
  } as unknown as RhnApi
}

function renderPanel(api: RhnApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(<QueryClientProvider client={client}><ClinicalAiAssistantPanel encounter={encounter}
    currentContext={context} allergies={[]} allergyState="READY" api={api} disabled={false}
    onAdoptionBusyChange={vi.fn()} onApply={vi.fn()} /></QueryClientProvider>)
}
