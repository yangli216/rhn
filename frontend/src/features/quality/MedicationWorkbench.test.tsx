import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../shared/rhnApi'
import { MedicationWorkbench } from './MedicationWorkbench'

const med = {
  medication: {
    id: '123456789012345678',
    code: 'HIS-AMOX',
    name: '阿莫西林',
    doseForm: '胶囊',
    preparationSpec: '0.25g',
    strengthValue: 250,
    strengthUnit: 'mg',
    defaultDose: 0.5,
    defaultDoseUnit: 'g',
    defaultRoute: '口服',
    defaultFrequency: 'tid',
    antimicrobial: true,
    antimicrobialMaxDays: 7,
    skinTestRequired: false
  },
  revision: 3,
  semanticStatus: 'LEGACY',
  capturedAt: '2026-09-16T00:00:00Z',
  classifications: [{ display: '青霉素类', systemCode: 'ATC', systemVersion: '2026', code: 'J01CA04' }],
  allergens: [{ id: '17', display: '青霉素' }],
  standardMappings: [{ id: '18', systemName: '标准药品目录', systemVersion: '1', termCode: 'AMOX', termDisplay: '阿莫西林' }]
}

const mockRules = [
  {
    ruleId: '101',
    ruleVersionId: '102',
    ruleCode: 'QMED.EXACT_GENERIC_DUPLICATE',
    category: 'EXACT_GENERIC_DUPLICATE',
    ruleName: '同处方通用药精确重复核对',
    version: 1,
    ruleSetVersion: 'qmed-foundation-shadow-v1',
    implementation: 'java:exact-generic-duplicate:1',
    status: 'SHADOW',
    severity: 'LOW',
    decision: 'WARN',
    overridePolicy: 'ACKNOWLEDGE',
    effectiveFrom: '2026-01-01T00:00:00Z',
    effectiveTo: null,
    evidence: [
      {
        sourceType: 'ENGINEERING_BASELINE',
        sourceTitle: 'QMED-1 旁路规则规范',
        sourceVersion: '1',
        sourceLocator: 'docs/architecture/QMED-1.md',
        section: '首条规则语义',
        excerpt: '同一处方中至少两条重复时产生核对提示。',
        usageScope: 'SHADOW_ONLY'
      }
    ]
  },
  {
    ruleId: '103',
    ruleVersionId: '104',
    ruleCode: 'QMED.SKIN_TEST',
    category: 'SKIN_TEST',
    ruleName: '强制皮试药品阴性结果与免试核对',
    version: 1,
    ruleSetVersion: 'qmed-foundation-shadow-v1',
    implementation: 'java:skin-test:1',
    status: 'SHADOW',
    severity: 'HIGH',
    decision: 'REQUIRE_OVERRIDE',
    overridePolicy: 'REASON_REQUIRED',
    effectiveFrom: '2026-01-01T00:00:00Z',
    effectiveTo: null,
    evidence: []
  }
]

const mockEvaluations = [
  {
    evaluationId: '8001',
    prescriptionId: '9001',
    encounterId: '7001',
    patientId: '6001',
    organizationId: '1',
    departmentId: '2',
    ruleSetVersion: 'qmed-foundation-shadow-v1',
    mode: 'SHADOW',
    decision: 'WARN',
    completedAt: '2026-09-16T10:00:00Z',
    findingCount: 1
  }
]

const candidate = {
  id: '900001',
  parentId: null,
  version: 1,
  requirement: '重复核对',
  source: '机构制度',
  model: 'real-configured-model',
  createdAt: '2026-09-16T00:00:00Z',
  status: 'CANDIDATE',
  rule: {
    template: 'EXACT_GENERIC_DUPLICATE',
    name: '重复核对',
    explanation: '按通用药 ID 核对',
    ruleExpression: 'IF Patient.RxCount(Medication.Id) >= 2 THEN WARN',
    duplicateCount: 2,
    message: '请核对',
    decision: 'WARN'
  },
  medications: [med]
}

function setup(available: boolean, saved: unknown[] = []) {
  const masterData = {
    activeMedicationRoutes: vi.fn().mockResolvedValue([
      { id: '1', code: 'ORAL', name: '口服', systemCode: 'LOCAL', systemVersion: '1', executionType: 'NONE' }
    ]),
    activeOrderFrequencies: vi.fn().mockResolvedValue([
      { code: 'TID', name: '每日三次', shortName: 'tid', executionTimes: ['08:00', '12:00', '18:00'] }
    ])
  }
  const medicationWorkbench = {
    status: vi.fn().mockResolvedValue({
      available,
      model: available ? 'real-configured-model' : null,
      message: '请配置真实模型'
    }),
    medications: vi.fn().mockResolvedValue([med]),
    candidates: vi.fn().mockResolvedValue(saved),
    activeRules: vi.fn().mockResolvedValue(mockRules),
    activeRuleTrial: vi.fn().mockResolvedValue({
      mode: 'ACTIVE_RULE_SANDBOX',
      scope: 'SELECTED',
      createdAt: '2026-09-17T00:00:00Z',
      ruleSetVersion: 'qmed-foundation-shadow-v1',
      decision: 'WARN',
      cases: [{
        ruleCode: 'QMED.EXACT_GENERIC_DUPLICATE',
        ruleName: '同处方通用药精确重复核对',
        version: 1,
        outcome: 'COMPLETED',
        failureCode: null,
        decision: 'WARN',
        matchedRows: [1, 2],
        reasons: ['同一通用药出现 2 次']
      }]
    }),
    evaluations: vi.fn().mockResolvedValue(mockEvaluations),
    approve: vi.fn().mockImplementation((id: string) =>
      Promise.resolve({ ...candidate, id, status: 'APPROVED_FOR_SHADOW' })
    ),
    generate: vi.fn().mockResolvedValue({ status: 'CLARIFY', message: '请说明重复次数', candidate: null }),
    suite: vi.fn().mockResolvedValue({
      id: 'r1',
      candidateId: '900001',
      mode: 'SYNTHETIC',
      createdAt: '2026-09-16T00:00:00Z',
      cases: [
        {
          name: '缺失输入',
          expected: 'UNAVAILABLE',
          actual: 'UNAVAILABLE',
          passed: true,
          reasons: ['缺少通用药 ID'],
          matchedRows: [],
          input: []
        }
      ]
    }),
    trial: vi.fn().mockResolvedValue({ id: 'r2', candidateId: '900001', mode: 'SYNTHETIC', createdAt: '2026-09-16T00:00:00Z', cases: [] }),
    shadow: vi.fn().mockResolvedValue({ id: 'r3', candidateId: '900001', mode: 'HIS_SHADOW', createdAt: '2026-09-16T00:00:00Z', cases: [] }),
    prescriptionPreview: vi.fn().mockResolvedValue({
      encounterId: '1001', prescriptionId: '2001', residentId: '3001', departmentId: '4001', prescriptionStatus: 'DRAFT',
      patientContext: { patientAgeYears: 14, gender: '男', activeAllergies: [] },
      items: [{ medicationId: med.medication.id, status: 'DRAFT', durationDays: 3, routeCode: 'ORAL', frequencyCode: 'TID',
        medicationName: '阿莫西林', preparationSpec: '0.25g', historicalSnapshotAvailable: true }]
    }),
    runs: vi.fn().mockResolvedValue([])
  }
  render(
    <MemoryRouter>
      <MedicationWorkbench api={{ medicationWorkbench, masterData } as unknown as RhnApi} />
    </MemoryRouter>
  )
  return Object.assign(medicationWorkbench, { masterData })
}

describe('MedicationWorkbench', () => {
  it('displays active rule catalog by default and shows rule details', async () => {
    setup(true)
    expect(await screen.findByText('qmed-foundation-shadow-v1')).toBeInTheDocument()
    expect(screen.getAllByText('同处方通用药精确重复核对').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('强制皮试药品阴性结果与免试核对')).toBeInTheDocument()
    expect(screen.getByText('QMED-1 旁路规则规范')).toBeInTheDocument()
    expect(screen.getByText(/同一处方中至少两条重复时产生核对提示/)).toBeInTheDocument()
    expect(screen.getByText(/当前在行规则由版本化强类型执行器运行/)).toBeInTheDocument()
  })

  it('starts candidate authoring from a blank form without injecting demo content', async () => {
    setup(true, [candidate])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /AI 规则工坊与候选孵化/ }))
    expect(screen.getByLabelText('规则审查需求描述')).toHaveValue('')
    expect(screen.queryByText('按通用药 ID 核对')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '新建候选' }))
    expect(screen.getByLabelText('规则审查需求描述')).toHaveValue('')
    expect(screen.getByText(/不会自动带入演示需求、药品或处方/)).toBeInTheDocument()
  })

  it('validates one active rule or the whole active rule set in the shared sandbox', async () => {
    const api = setup(true)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '验证当前规则' }))
    expect(await screen.findByText('在行规则验证沙箱')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '验证范围' })).toBeInTheDocument()
    await user.click(screen.getByRole('combobox', { name: '沙箱第1行药品' }))
    await user.click(await screen.findByText('阿莫西林'))
    await user.click(screen.getByRole('button', { name: '验证所选单条规则' }))
    await waitFor(() => expect(api.activeRuleTrial).toHaveBeenCalledWith(
      ['QMED.EXACT_GENERIC_DUPLICATE'],
      expect.arrayContaining([expect.objectContaining({ medicationId: med.medication.id })]),
      expect.objectContaining({ patientAgeYears: 35 })
    ))
    expect(await screen.findByText('同一通用药出现 2 次')).toBeInTheDocument()
  })

  it('navigates to evaluations tab and displays prescription audit records', async () => {
    setup(true)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /处方质量审查日志/ }))
    expect(await screen.findByText('8001')).toBeInTheDocument()
    expect(screen.getByText('9001')).toBeInTheDocument()
    expect(screen.getByText('1 项风险')).toBeInTheDocument()
  })

  it('navigates to AI factory, generates candidate, and approves it', async () => {
    const api = setup(true, [candidate])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /AI 规则工坊与候选孵化/ }))
    await user.click(await screen.findByRole('button', { name: /候选版本 重复核对/ }))
    expect(screen.getByText('按通用药 ID 核对')).toBeInTheDocument()
    const approveBtn = screen.getByRole('button', { name: '批准进入旁路监控' })
    await user.click(approveBtn)
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith('900001'))
    expect(await screen.findByText(/已批准进入旁路监控运行测试/)).toBeInTheDocument()
  })

  it('disables generation when actual AI is unavailable', async () => {
    const api = setup(false)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /AI 规则工坊与候选孵化/ }))
    await user.click(await screen.findByRole('checkbox', { name: /选择药品 阿莫西林/ }))
    expect(screen.getByRole('button', { name: 'AI 生成候选规则' })).toBeDisabled()
    expect(api.generate).not.toHaveBeenCalled()
  })

  it('supports simulated consultation trial run for candidates', async () => {
    const api = setup(true, [candidate])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /AI 规则工坊与候选孵化/ }))
    await user.click(await screen.findByRole('button', { name: /候选版本 重复核对/ }))
    expect(screen.getAllByText('IF Patient.RxCount(Medication.Id) >= 2 THEN WARN').length).toBeGreaterThanOrEqual(1)

    const simBtn = screen.getByRole('button', { name: /模拟门诊就诊审查/ })
    await user.click(simBtn)
    await waitFor(() => expect(api.trial).toHaveBeenCalled())
  })

  it('uses system controls and imports a real HIS prescription preview before review', async () => {
    const api = setup(true, [candidate])
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /AI 规则工坊与候选孵化/ }))
    await user.click(await screen.findByRole('button', { name: /候选版本 重复核对/ }))

    // 1. 验证移除了无意义的英文，显示中文模板与中文动作
    expect(screen.getAllByText('同类药物 / 重复用药核对').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/临床预警 \(WARN\)/)).toBeInTheDocument()

    // 2. 验证医嘱录入式搜索组件、给药途径和频次列
    expect(screen.getByRole('combobox', { name: /第1行给药途径/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: /第1行给药频次/ })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: /第1行状态/ })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(api.masterData.activeMedicationRoutes).toHaveBeenCalledWith('OUTPATIENT')
      expect(api.masterData.activeOrderFrequencies).toHaveBeenCalledWith(undefined, undefined, 'OUTPATIENT', 'MEDICATION')
    })

    // 3. 验证旧的 details 折叠区已不存在
    expect(screen.queryByText('从 HIS 真实历史处方读取旁路回放')).not.toBeInTheDocument()

    // 4. 调入功能只接受真实标识，不再展示前端硬编码的“真实处方”案例
    const importLink = screen.getByRole('button', { name: /调入门诊真实历史处方/ })
    await user.click(importLink)
    expect(await screen.findByText('调入门诊真实处方')).toBeInTheDocument()
    expect(screen.queryByText('就诊 #1001 · 处方 #2001')).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/就诊标识/), '1001')
    await user.type(screen.getByLabelText(/处方标识/), '2001')
    await user.click(screen.getByRole('button', { name: '读取并载入处方' }))
    await waitFor(() => expect(api.prescriptionPreview).toHaveBeenCalledWith('1001', '2001'))
    expect(await screen.findByDisplayValue('患者 3001')).toBeInTheDocument()
    expect(screen.getByDisplayValue('14')).toBeInTheDocument()
    expect(screen.getByText(/已从 HIS 读取就诊 1001 的处方 2001/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '原始处方旁路核对' })).toBeInTheDocument()
  })
})
