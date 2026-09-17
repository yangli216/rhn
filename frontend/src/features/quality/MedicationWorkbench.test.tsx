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
    duplicateCount: 2,
    message: '请核对',
    decision: 'WARN'
  },
  medications: [med]
}

function setup(available: boolean, saved: unknown[] = []) {
  const medicationWorkbench = {
    status: vi.fn().mockResolvedValue({
      available,
      model: available ? 'real-configured-model' : null,
      message: '请配置真实模型'
    }),
    medications: vi.fn().mockResolvedValue([med]),
    candidates: vi.fn().mockResolvedValue(saved),
    activeRules: vi.fn().mockResolvedValue(mockRules),
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
    runs: vi.fn().mockResolvedValue([])
  }
  render(
    <MemoryRouter>
      <MedicationWorkbench api={{ medicationWorkbench } as unknown as RhnApi} />
    </MemoryRouter>
  )
  return medicationWorkbench
}

describe('MedicationWorkbench', () => {
  it('displays active rule catalog by default and shows rule details', async () => {
    setup(true)
    expect(await screen.findByText('qmed-foundation-shadow-v1')).toBeInTheDocument()
    expect(screen.getAllByText('同处方通用药精确重复核对').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('强制皮试药品阴性结果与免试核对')).toBeInTheDocument()
    expect(screen.getByText('QMED-1 旁路规则规范')).toBeInTheDocument()
    expect(screen.getByText(/同一处方中至少两条重复时产生核对提示/)).toBeInTheDocument()
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
    const approveBtn = screen.getByRole('button', { name: '批准准入 SHADOW' })
    await user.click(approveBtn)
    await waitFor(() => expect(api.approve).toHaveBeenCalledWith('900001'))
    expect(await screen.findByText(/已批准准入 SHADOW 运行测试/)).toBeInTheDocument()
  })

  it('disables generation when actual AI is unavailable', async () => {
    const api = setup(false)
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: /AI 规则工坊与候选孵化/ }))
    await user.click(await screen.findByRole('checkbox', { name: /选择药品 阿莫西林/ }))
    expect(screen.getByRole('button', { name: 'AI 生成候选规则' })).toBeDisabled()
    expect(api.generate).not.toHaveBeenCalled()
  })
})

