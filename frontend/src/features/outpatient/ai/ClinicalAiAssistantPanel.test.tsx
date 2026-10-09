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
  sortOrder: 0, useCount: 2, diagnoses: [], services: [], tasks: [], createdAt: '2026-09-01T00:00:00Z',
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
  it.each(['drawer'] as const)('shows deterministic medication blockers and explicit unevaluated safety boundaries (%s)', async (layout: 'drawer' | 'inline') => {
    const preflightPlan = vi.fn().mockResolvedValue({
      templateId: 'plan-1', templateRevision: 3, status: 'BLOCKED', blockingCount: 1, warningCount: 2,
      checkedAt: '2026-09-09T00:00:00Z', medications: [{
        lineId: 'line-1', medicationId: 'med-1', catalogItemId: 'product-1', packageId: 'package-1',
        medicationCode: 'DRUG-AML', medicationName: '氨氯地平', productName: '苯磺酸氨氯地平片 5mg',
        status: 'BLOCKED', checks: [
          { code: 'PRODUCT_PACKAGE', status: 'PASS', message: '院内药品产品与包装有效' },
          { code: 'INVENTORY', status: 'BLOCKED', message: '路由药房库存不足：需要 1 BOX，当前可用 0 BOX' },
          ...['DOSE', 'ROUTE', 'FREQUENCY', 'DURATION', 'QUANTITY', 'ALLERGY_REVIEW']
            .map(code => ({ code, status: 'PASS', message: '测试资料已核实' })),
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

    const workspace = render(<div><div data-testid="ai-summary" /><div data-testid="ai-note" />
      <div data-testid="ai-diagnoses" /><div data-testid="ai-plans" /></div>)
    const surfaces = layout === 'inline' ? {
      summary: workspace.getByTestId('ai-summary') as HTMLDivElement,
      note: workspace.getByTestId('ai-note') as HTMLDivElement,
      diagnoses: workspace.getByTestId('ai-diagnoses') as HTMLDivElement,
      plans: workspace.getByTestId('ai-plans') as HTMLDivElement, detail: null,
    } : undefined
    render(<QueryClientProvider client={client}><ClinicalAiAssistantPanel surfaces={surfaces} encounter={encounter}
      currentContext={context} allergies={[]} allergyState="READY" api={api} disabled={false}
      onAdoptionBusyChange={vi.fn()} onApply={vi.fn()} /></QueryClientProvider>)

    if (layout === 'inline') {
      await userEvent.click(await screen.findByRole('button', { name: 'AI 辅诊' }))
    }
    await userEvent.click(await screen.findByRole('button', { name: layout === 'inline' ? '分析当前病历' : /分析当前就诊/ }))
    await userEvent.click(await screen.findByRole('button', { name: layout === 'inline' ? '核对方案' : '核对后带入' }))

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

describe('ClinicalAiAssistantPanel layout and clinical usability optimization', () => {
  it('collapses prompt textarea by default and expands on demand, preserves actionable catalog alerts, and provides evidence and insert buttons', async () => {
    const generate = vi.fn().mockImplementation((_id: string, input: GenerateClinicalAiSuggestionInput) => Promise.resolve({
      id: 'sugg-opt', status: 'GENERATED' as const, contextHash: 'sha256:opt',
      clientContextFingerprint: input.clientContextFingerprint, provider: 'test', promptVersion: 'V1',
      generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
      summary: '6岁患儿急性扁桃体炎待评估', recordDraft: {},
      diagnosisCandidates: [
        { code: 'J03.9', display: '急性扁桃体炎', type: 'PRIMARY' as const, confidence: 0.9, rationale: '咽痛扁桃体红肿' },
      ],
      differentialDiagnoses: [],
      treatmentRecommendations: [
        { type: 'MEDICATION' as const, catalogItemId: 'drug-1', medicationId: 'med-1', code: 'PARA01', name: '对乙酰氨基酚混悬液', rationale: '解热镇痛' },
      ],
      missingInformation: [],
      safetyAlerts: [
        { level: 'CRITICAL' as const, title: '儿童咽痛需警惕气道风险', detail: '核对呼吸困难或气道受累表现' },
        { level: 'WARNING' as const, title: '缺少生命体征', detail: '未录入体温心率' },
        { level: 'INFO' as const, title: '目录待匹配', detail: 'A组链球菌快速抗原检测未匹配到本次可用目录' },
        { level: 'WARNING' as const, title: '目录决策回退', detail: '回退至规则引擎' },
      ],
      recommendedPlans: [],
      disclaimer: '仅供医生参考',
    }))
    const api = assistantApi({
      capabilities: vi.fn().mockResolvedValue({
        mode: 'MODEL', available: true, provider: 'test', model: 'test',
        features: ['RECORD_COMPLETENESS', 'TERMINOLOGY_VALIDATION', 'SAFETY_REMINDERS', 'PLAN_RECOMMENDATIONS', 'AUDIT_TRAIL', 'KNOWLEDGE_RETRIEVAL'],
      }),
      generate,
      knowledgeSearch: vi.fn().mockResolvedValue({ query: '', provider: 'test', results: [], retrievedAt: '' }),
    })
    renderPanel(api)

    // 1. 默认状态下大文本框收起，首屏仅有快捷条与“专项探查与追问”折叠入口
    expect(await screen.findByRole('button', { name: '专项探查与追问' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/例如：补全病历要点/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /分析当前就诊/ })).toBeInTheDocument()

    // 2. 点击折叠入口可展开专项探查输入框与快捷标签
    await userEvent.click(screen.getByRole('button', { name: '专项探查与追问' }))
    expect(screen.getByPlaceholderText(/例如：补全病历要点/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '补全病历要点' })).toBeInTheDocument()

    // 3. 点击“分析当前就诊”生成建议
    await userEvent.click(screen.getByRole('button', { name: /分析当前就诊/ }))

    // 4. 验证优先核对中过滤了 IT 目录日志，且临床红线与病历质控带有鲜明标识
    expect(await screen.findByText('儿童咽痛需警惕气道风险')).toBeInTheDocument()
    expect(screen.getByText('安全红线')).toBeInTheDocument()
    expect(screen.getByText('缺少生命体征')).toBeInTheDocument()
    expect(screen.getByText('病历质控')).toBeInTheDocument()
    // 未匹配原因保留，纯实现细节仍隐藏
    expect(screen.getByText('目录待匹配')).toBeInTheDocument()
    expect(screen.queryByText('目录决策回退')).not.toBeInTheDocument()

    // 5. 验证诊断行展示“指南”与“证据链”按钮
    expect(screen.getAllByRole('button', { name: /指南/ }).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /证据链/ })).toBeInTheDocument()

    // 6. 验证药品建议行展示“说明书”按钮
    expect(screen.getAllByRole('button', { name: /说明书/ }).length).toBeGreaterThan(0)

    // 7. 验证情境循证参考卡片自动推送
    expect(screen.getByText('情境循证参考与知识库')).toBeInTheDocument()
    expect(screen.getByText(/《急性扁桃体炎 临床诊疗规范》/)).toBeInTheDocument()

    // 8. 点击“查阅指南”按钮直接调阅权威指南模态框
    await userEvent.click(screen.getAllByRole('button', { name: '查阅指南' })[0])
    expect(await screen.findByRole('dialog', { name: /临床指南 · 急性扁桃体炎/ })).toBeInTheDocument()
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
