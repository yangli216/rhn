import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { PrescriptionSafetyReview } from '../../shared/api/pharmacyApi'
import { PharmacyMedicationSafety } from './PharmacyMedicationSafety'

const review: PrescriptionSafetyReview = {
  prescriptionId: 'rx-1', prescriptionNo: 'RX-001', submittedAt: '2026-09-21T08:00:00Z',
  doctorReason: '已核对合成配对条件，补充测试处理说明',
  medications: [{ requestId: 'a', name: '测试药品甲' }, { requestId: 'b', name: '测试药品乙' }],
  evaluation: {
    evaluationId: 'evaluation-1', prescriptionId: 'rx-1', prescriptionRevision: 0, inputHash: 'test',
    ruleSetVersion: 'test', engineVersion: 'test', mode: 'ENFORCED', decision: 'REQUIRE_OVERRIDE',
    failureCodes: [], ruleExecutions: [], findings: [{
      findingId: 'finding-1', ruleCode: 'QMED.KNOWLEDGE.TEST', ruleVersion: 1, category: 'DRUG_INTERACTION',
      severity: 'HIGH', decision: 'REQUIRE_OVERRIDE', message: '合成配对条件命中',
      medicationRequestIds: ['a', 'b'], overridePolicy: 'REASON_REQUIRED', suggestedAction: '请核对配对及适用条件',
      evidence: [{ sourceType: 'TEST', sourceTitle: '合成依据', sourceVersion: '1', sourceLocator: '测试段落',
        section: '测试', excerpt: '仅用于隔离测试，不构成临床依据。', usageScope: '测试环境' }],
    }],
  },
}

describe('pharmacist medication safety context', () => {
  it('shows the submitted drug pair, doctor handling reason and supporting evidence together', async () => {
    render(<PharmacyMedicationSafety reviews={[review]} />)
    expect(screen.getByRole('region', { name: '处方合理用药与医生处理' })).toHaveTextContent('正式审查 · 需说明理由')
    expect(screen.getByText('涉及药品：测试药品甲、测试药品乙')).toBeVisible()
    expect(screen.getByText(/已核对合成配对条件/)).toBeVisible()
    await userEvent.click(screen.getByText('查看依据'))
    expect(screen.getByText('仅用于隔离测试，不构成临床依据。')).toBeVisible()
  })

  it('keeps shadow findings distinct from an enforced submission decision', () => {
    render(<PharmacyMedicationSafety reviews={[{ ...review, doctorReason: null,
      evaluation: { ...review.evaluation, mode: 'SHADOW', decision: 'BLOCK' } }]} />)
    expect(screen.getByText('旁路提示 · 阻断')).toBeVisible()
    expect(screen.queryByText(/正式审查/)).not.toBeInTheDocument()
    expect(screen.getByText('未填写')).toBeVisible()
  })

  it('does not describe absent historical results as a successful rule check', () => {
    render(<PharmacyMedicationSafety reviews={[]} />)
    expect(screen.getByText(/不能据此认定已通过规则检查/)).toBeVisible()
    expect(screen.queryByText('未触发控制')).not.toBeInTheDocument()
  })

  it('retains the incomplete-evaluation warning and does not present PASS as pharmacist approval', () => {
    render(<PharmacyMedicationSafety reviews={[{ ...review, evaluation: {
      ...review.evaluation, evaluationId: null, decision: 'PASS', findings: [], failureCodes: ['EVALUATION_NOT_PERSISTED'],
    } }]} />)
    expect(screen.getByText(/规则评价不完整/)).toBeVisible()
    expect(screen.queryByText('本次已执行规则未触发控制，仍需完成药学审核。')).not.toBeInTheDocument()
  })
})
