import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { ClinicalAiPlanPreflight, ClinicalAiPlanPreflightInput, GenerateClinicalAiSuggestionInput } from '../../../shared/api/clinicalAiApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { RhnApi } from '../../../shared/rhnApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { aiContextFromDraft } from '../record/clinicalAiDraftContext'
import type { RecordForm } from '../record/clinicalRecordDraft'
import type { AiRecordUndo } from '../record/useClinicalAiDraft'
import { useAiPlanApplication } from '../record/useAiPlanApplication'
import { templateCatalogFixture } from '../templates/resolveTemplateOrders.testFixtures'
import { ClinicalAiAssistantPanel } from './ClinicalAiAssistantPanel'
import { requirePlanPreflight } from './planPreflightReceipt'

function aiPlanFixture() {
  const f = templateCatalogFixture()
  f.plan.diagnoses = [{ code: 'I10', display: '高血压', type: 'PRIMARY', conceptId: 'western-i10',
    codeSystem: 'WHO.BD.CS.ICD10', diagnosisDomain: 'WESTERN_MEDICINE' }]
  const preflight = (confirmed = true): ClinicalAiPlanPreflight => ({ templateId: f.plan.id, templateRevision: f.plan.revision,
    status: confirmed ? 'WARNING' : 'BLOCKED', blockingCount: confirmed ? 0 : 1, warningCount: 2,
    checkedAt: new Date().toISOString(), medications: f.plan.medications.map(item => ({ ...item,
      status: confirmed ? 'READY' : 'BLOCKED', checks: [
        ...['PRODUCT_PACKAGE', 'DOSE', 'ROUTE', 'FREQUENCY', 'DURATION', 'QUANTITY', 'INVENTORY']
          .map(code => ({ code, status: 'PASS' as const, message: '测试目录已核实' })),
        { code: 'ALLERGY_REVIEW', status: confirmed ? 'PASS' as const : 'BLOCKED' as const, message: '请明确核对过敏' },
      ] })), drugInteractions: { status: 'NOT_EVALUATED', message: '相互作用未评估' },
    contraindications: { status: 'NOT_EVALUATED', message: '禁忌证未评估' } })
  const use = vi.fn().mockImplementation(async () => structuredClone(f.plan))
  const recordEvent = vi.fn().mockResolvedValue(undefined)
  const diseases = vi.fn().mockResolvedValue([{ code: 'I10', display: '高血压',
    id: 'western-i10', sdStatus: 'ACTIVE', systemCode: 'WHO.BD.CS.ICD10', sdDiagnosisDomain: 'WESTERN_MEDICINE',
    effectiveFrom: '2020-01-01', effectiveTo: null, managementPrograms: [] }])
  const api = { ...f.api, diagnostics: { reportsByEncounter: vi.fn().mockResolvedValue([]) },
    masterData: { ...f.api.masterData, diseases },
    outpatientPlanTemplates: { list: vi.fn().mockResolvedValue([f.plan]), use },
    clinicalAi: {
      capabilities: vi.fn().mockResolvedValue({ mode: 'MODEL', available: true, provider: 'test',
        features: ['RECORD_COMPLETENESS', 'TERMINOLOGY_VALIDATION', 'PLAN_RECOMMENDATIONS', 'AUDIT_TRAIL'] }),
      history: vi.fn().mockResolvedValue([]), recordEvent,
      preflightPlan: vi.fn().mockImplementation(async (_enc: string, _id: string, input: ClinicalAiPlanPreflightInput) => preflight(input.allergyReviewConfirmed)),
      generate: vi.fn().mockImplementation(async (_id: string, input: GenerateClinicalAiSuggestionInput) => ({
        id: 'suggestion', status: 'GENERATED', contextHash: 'test', clientContextFingerprint: input.clientContextFingerprint,
        generatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString(),
        summary: '核对当前方案', recordDraft: { presentIllness: '明确的本次症状' }, diagnosisCandidates: [],
        differentialDiagnoses: [], missingInformation: [], safetyAlerts: [],
        recommendedPlans: [{ templateId: f.plan.id, name: f.plan.name, rationale: '符合问诊内容' }],
      })),
    },
  } as unknown as RhnApi
  return { ...f, api, use, recordEvent, preflight, diseases }
}

function setup(f = aiPlanFixture()) {
  const onApply = vi.fn(), notice = vi.fn(), busy = vi.fn()
  function Harness() {
    const form = useForm<RecordForm>({ defaultValues: { chiefComplaint: '复诊', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '' } })
    form.watch()
    const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
    const [medications, setMedications] = useState<MedicationPlanDraft[]>([])
    const [services, setServices] = useState<ServicePlanDraft[]>([])
    const [, setUndo] = useState<AiRecordUndo | null>(null)
    const readContext = () => aiContextFromDraft(form.getValues(), diagnoses, f.target, {
      documentStatus: 'DRAFT', structuredFormId: '', structuredValues: {}, medicationDrafts: medications,
      serviceDrafts: services, allergies: [], allergyState: 'READY', busy: false,
    })
    const prepare = useAiPlanApplication({ api: f.api, encounter: f.target, form, readContext, blocked: false,
      allergies: [], allergyReady: true, diagnoses, setDiagnoses, medications, setMedications,
      services, setServices, setUndo, onNotice: notice })
    return <><output data-testid="draft">{JSON.stringify({ record: form.getValues(), diagnoses, medications, services })}</output>
      <ClinicalAiAssistantPanel encounter={f.target} currentContext={readContext()} allergies={[]} allergyState="READY"
        api={f.api} disabled={false} onApply={onApply} onPreparePlan={prepare} onAdoptionBusyChange={busy} /></>
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const renderApp = () => <QueryClientProvider client={client}><Harness /></QueryClientProvider>
  const view = render(renderApp())
  const user = userEvent.setup()
  const review = async () => {
    await user.click(await screen.findByRole('button', { name: /分析当前就诊/ }))
    await user.click(await screen.findByRole('button', { name: '核对后带入' }))
    const dialog = await screen.findByRole('dialog', { name: `核对“${f.plan.name}”` })
    await user.click(within(dialog).getByRole('checkbox', { name: /已核对患者过敏信息/ }))
    await waitFor(() => expect(within(dialog).getByRole('button', { name: '确认带入草稿' })).toBeEnabled())
    return dialog
  }
  const draft = () => JSON.parse(screen.getByTestId('draft').textContent!)
  const adopted = () => f.recordEvent.mock.calls.filter(([, input]) => input.eventType === 'ADOPTED')
  return { f, user, review, draft, onApply, notice, adopted, rerender: () => view.rerender(renderApp()) }
}

describe('AI assistant plan adoption with the real editor preparation boundary', () => {
  it.each([false, true])('preserves same-code cross-system diagnoses and independent selection (deselect western: %s)', async deselect => {
    const f = aiPlanFixture()
    f.plan.diagnoses.push({ conceptId: 'tcm-i10', codeSystem: 'TCM', diagnosisDomain: 'TCM_DISEASE',
      code: 'I10', display: '中医诊断', type: 'PRIMARY' })
    f.diseases.mockResolvedValue([
      { id: 'western-i10', code: 'I10', display: '高血压', systemCode: 'WHO.BD.CS.ICD10', sdDiagnosisDomain: 'WESTERN_MEDICINE',
        sdStatus: 'ACTIVE', effectiveFrom: '2020-01-01', managementPrograms: [] },
      { id: 'tcm-i10', code: 'I10', display: '中医诊断', systemCode: 'TCM', sdDiagnosisDomain: 'TCM_DISEASE',
        sdStatus: 'ACTIVE', effectiveFrom: '2020-01-01', managementPrograms: [] },
    ])
    const h = setup(f), dialog = await h.review()
    if (deselect) await h.user.click(within(dialog).getByRole('checkbox', { name: /高血压/ }))
    expect(within(dialog).getByRole('checkbox', { name: /中医诊断/ })).toBeChecked()
    await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
    await waitFor(() => expect(h.draft().diagnoses).toHaveLength(deselect ? 1 : 2))
    expect(h.draft().diagnoses).toContainEqual(expect.objectContaining({ conceptId: 'tcm-i10', codeSystem: 'TCM',
      diagnosisDomain: 'TCM_DISEASE', managementResolutionStatus: 'CONFIRMED', managementPrograms: [] }))
    if (!deselect) expect(h.draft().diagnoses[0]).toMatchObject({ conceptId: 'western-i10', codeSystem: 'WHO.BD.CS.ICD10' })
    expect(h.adopted()).toHaveLength(1)
  })
  it.each(['unknown-identity', 'wrong-concept', 'directory-failed'])('keeps the whole draft unchanged and does not report adoption when %s', async failure => {
    const f = aiPlanFixture()
    if (failure === 'unknown-identity') f.plan.diagnoses = [{ code: 'I10', display: '高血压', type: 'PRIMARY' }]
    if (failure === 'wrong-concept') f.plan.diagnoses[0].conceptId = 'missing-concept'
    if (failure === 'directory-failed') f.diseases.mockRejectedValue(new Error('目录连接失败'))
    const h = setup(f), dialog = await h.review(), before = h.draft()
    await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(failure === 'directory-failed' ? '目录连接失败' : '诊断身份未确认')
    expect(h.draft()).toEqual(before)
    expect(h.adopted()).toHaveLength(0)
    expect(h.notice).not.toHaveBeenCalled()
  })
  it('uses current catalog facts and commits the full selection only after the audit request succeeds', async () => {
    const h = setup(), dialog = await h.review()
    let finish!: () => void
    h.f.recordEvent.mockImplementation(async (_id, input) => {
      if (input.eventType === 'ADOPTED') await new Promise<void>(resolve => { finish = resolve })
    })
    await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
    await waitFor(() => expect(h.adopted()).toHaveLength(1))
    expect(h.draft().record.presentIllness).toBe('')
    expect(h.draft().medications).toEqual([])
    expect(h.notice).not.toHaveBeenCalled()
    await act(async () => { finish() })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(h.draft()).toMatchObject({ record: { presentIllness: '明确的本次症状' }, diagnoses: [{ code: 'I10' }],
      medications: [{ unitPrice: 2.5, stockSiteId: 'pharmacy', request: { allergyReviewConfirmed: true } }],
      services: [{ performerDepartmentName: '检验中心二部' }] })
    expect(h.onApply).not.toHaveBeenCalled()
  })
  it.each(['changed-dose', 'wrong-id', 'missing-price', 'audit-failed'])(
    'keeps the selection and all clinical content unchanged after %s', async failure => {
      const f = aiPlanFixture()
      if (failure === 'changed-dose' || failure === 'wrong-id') f.use.mockImplementation(async () => {
        const receipt = structuredClone(f.plan)
        if (failure === 'changed-dose') receipt.medications[0].doseValue = 999
        else receipt.id = 'other'
        return receipt
      })
      if (failure === 'missing-price') f.medication.products[0].prices = []
      if (failure === 'audit-failed') f.recordEvent.mockImplementation(async (_id, input) => {
        if (input.eventType === 'ADOPTED') throw new Error('采纳留痕服务不可访问')
      })
      const h = setup(f), dialog = await h.review()
      await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(failure === 'audit-failed' ? '采纳留痕服务不可访问' : /未带入/)
      expect(h.draft().record.presentIllness).toBe('')
      expect(h.draft().diagnoses).toEqual([])
      expect(h.draft().medications).toEqual([])
      expect(h.draft().services).toEqual([])
      expect(h.notice).not.toHaveBeenCalled()
      expect(within(dialog).getByRole('checkbox', { name: /已核对患者过敏信息/ })).toBeChecked()
      expect(h.adopted()).toHaveLength(failure === 'audit-failed' ? 1 : 0)
      if (failure === 'audit-failed') {
        f.recordEvent.mockResolvedValue(undefined)
        await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
        await waitFor(() => expect(h.draft().medications).toHaveLength(1))
        expect(h.adopted()[0][1].commandCode).toBe(h.adopted()[1][1].commandCode)
      }
    })
  it('honors deselection of a service instead of using a mismatched checkbox key', async () => {
    const h = setup(), dialog = await h.review()
    await h.user.click(within(dialog).getByRole('checkbox', { name: /旧项目名称/ }))
    await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
    await waitFor(() => expect(h.draft().medications).toHaveLength(1))
    expect(h.draft().services).toEqual([])
    expect(h.f.api.masterData.searchServices).not.toHaveBeenCalled()
  })
  it('rejects a use receipt arriving from an API scope that has been replaced', async () => {
    const h = setup(), dialog = await h.review()
    let finish!: (value: typeof h.f.plan) => void
    h.f.use.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
    await waitFor(() => expect(h.f.use).toHaveBeenCalledTimes(1))
    h.f.api = { ...h.f.api }
    h.rerender()
    await act(async () => { finish(structuredClone(h.f.plan)) })
    const currentDialog = await screen.findByRole('dialog', { name: `核对“${h.f.plan.name}”` })
    expect(await within(currentDialog).findByRole('alert')).toHaveTextContent('工作上下文或 AI 面板已变化')
    expect(h.draft().medications).toEqual([])
    expect(h.draft().record.presentIllness).toBe('')
    expect(h.f.medications).not.toHaveBeenCalled()
    expect(h.adopted()).toHaveLength(0)
  })
  it('ignores diagnosis catalog results that arrive after the API context changes', async () => {
    const h = setup(), dialog = await h.review()
    let finish!: (value: unknown[]) => void
    h.f.diseases.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await h.user.click(within(dialog).getByRole('button', { name: '确认带入草稿' }))
    await waitFor(() => expect(h.f.diseases).toHaveBeenCalledTimes(1))
    h.f.api = { ...h.f.api }; h.rerender()
    await act(async () => finish([{ id: 'western-i10', code: 'I10', display: '高血压', systemCode: 'WHO.BD.CS.ICD10',
      sdDiagnosisDomain: 'WESTERN_MEDICINE', sdStatus: 'ACTIVE', effectiveFrom: '2020-01-01', managementPrograms: [] }]))
    const currentDialog = await screen.findByRole('dialog', { name: `核对“${h.f.plan.name}”` })
    expect(await within(currentDialog).findByRole('alert')).toHaveTextContent('工作上下文或 AI 面板已变化')
    expect(h.draft().diagnoses).toEqual([]); expect(h.draft().medications).toEqual([])
    expect(h.adopted()).toHaveLength(0)
  })
})

describe('AI preflight receipts cannot turn missing checks into a pass', () => {
  it.each(['empty', 'identity', 'revision', 'missing-line', 'duplicate-line', 'product', 'package', 'checks', 'missing-check', 'status', 'counts', 'boundary'])(
    'rejects an invalid %s receipt', failure => {
      const f = aiPlanFixture(), receipt = f.preflight()
      if (failure === 'identity') receipt.templateId = 'other'
      if (failure === 'revision') receipt.templateRevision += 1
      if (failure === 'missing-line') receipt.medications = []
      if (failure === 'duplicate-line') receipt.medications.push(receipt.medications[0])
      if (failure === 'product') receipt.medications[0].catalogItemId = 'other'
      if (failure === 'package') receipt.medications[0].packageId = 'other'
      if (failure === 'checks') receipt.medications[0].checks = []
      if (failure === 'missing-check') receipt.medications[0].checks = receipt.medications[0].checks.filter(check => check.code !== 'DOSE')
      if (failure === 'status') Object.assign(receipt, { status: 'UNKNOWN' })
      if (failure === 'counts') receipt.blockingCount = 1
      if (failure === 'boundary') Object.assign(receipt, { drugInteractions: undefined })
      expect(() => requirePlanPreflight(failure === 'empty' ? undefined as unknown as ClinicalAiPlanPreflight : receipt, f.plan)).toThrow(/预检回执/)
    })
  it('retains explicit blocking and unevaluated results', () => {
    const f = aiPlanFixture()
    expect(requirePlanPreflight(f.preflight(false), f.plan).status).toBe('BLOCKED')
    expect(requirePlanPreflight(f.preflight(), f.plan).status).toBe('WARNING')
  })
})
