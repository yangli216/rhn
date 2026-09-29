import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { OrderDocumentReviewCard, type ReviewItemDisplay } from './OrderDocumentReviewCard'
import { buildDefaultDocumentInfo, getPrimaryDiagnosis } from './orderDocumentDefaults'
import type { Encounter } from '../../../shared/model'

const mockEncounter: Encounter = {
  id: 'enc-1',
  encounterNo: 'ENC001',
  residentId: 'res-1',
  organizationId: 'org-1',
  departmentId: 'dept-1',
  status: 'IN_PROGRESS',
  visitType: 'GENERAL',
  registeredAt: '2026-09-28T09:00:00Z',
  diagnoses: [
    { code: 'J06.9', display: '急性上呼吸道感染，未特指', type: 'PRIMARY' },
    { code: 'I10', display: '原发性高血压', type: 'SECONDARY' },
  ],
}

describe('OrderDocumentReviewCard', () => {
  const defaultItems: ReviewItemDisplay[] = [
    {
      id: 'item-1',
      name: '连花清瘟胶囊',
      spec: '0.35g*24粒/盒',
      doseText: '1片',
      routeAndFreqText: '口服 · 每日一次',
      quantityText: '1 盒',
      manufacturer: '示范制药',
      instruction: '口服；每日一次',
    },
  ]

  it('inherits primary diagnosis by default', () => {
    const primary = getPrimaryDiagnosis(mockEncounter)
    expect(primary?.code).toBe('J06.9')
    const defaultInfo = buildDefaultDocumentInfo(mockEncounter, 'prescription')
    expect(defaultInfo.diagnoses).toEqual([{ code: 'J06.9', display: '急性上呼吸道感染，未特指', primary: true }])
  })

  it('renders a compact prescription card and supports multi-select diagnoses', async () => {
    const user = userEvent.setup()
    const onChangeInfo = vi.fn()
    const info = buildDefaultDocumentInfo(mockEncounter, 'prescription')

    render(
      <OrderDocumentReviewCard
        cardKey="rx-1"
        title="成1"
        kind="patent"
        deptOrSite="中成药房"
        items={defaultItems}
        info={info}
        onChangeInfo={onChangeInfo}
        encounter={mockEncounter}
      />
    )

    expect(screen.getByText('成1')).toBeInTheDocument()
    expect(screen.getByText('中成药房')).toBeInTheDocument()
    expect(screen.getByText('连花清瘟胶囊')).toBeInTheDocument()
    expect(screen.getByText('示范制药 / 0.35g*24粒/盒')).toBeInTheDocument()
    expect(screen.queryByText('口服；每日一次')).not.toBeInTheDocument()
    expect(screen.getByLabelText('信息齐备')).toBeInTheDocument()
    const diagnosisSelect = screen.getByRole('combobox', { name: '诊断' })
    expect(diagnosisSelect).toHaveTextContent('急性上呼吸道感染，未特指')

    await user.click(diagnosisSelect)
    await user.click(screen.getByRole('option', { name: /原发性高血压/ }))
    expect(onChangeInfo).toHaveBeenCalledWith(expect.objectContaining({
      diagnoses: [
        { code: 'J06.9', display: '急性上呼吸道感染，未特指', primary: true },
        { code: 'I10', display: '原发性高血压', primary: false },
      ],
    }))
  })

  it('renders service card and edits its examination purpose', () => {
    const onChangeInfo = vi.fn()
    const serviceInfo = buildDefaultDocumentInfo(mockEncounter, 'service', '')

    const serviceItems: ReviewItemDisplay[] = [
      { id: 's1', name: '血常规（三分类）', quantityText: '1 次', note: '门诊检验送检' },
    ]

    render(
      <OrderDocumentReviewCard
        cardKey="svc-1"
        title="检1"
        kind="lab"
        deptOrSite="检验科"
        items={serviceItems}
        info={serviceInfo}
        onChangeInfo={onChangeInfo}
        encounter={mockEncounter}
      />
    )

    expect(screen.getByText('检1')).toBeInTheDocument()
    expect(screen.getByText('检验科')).toBeInTheDocument()
    expect(screen.getByText('缺检查目的')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('检查目的'), { target: { value: '明确感染类型' } })
    expect(onChangeInfo).toHaveBeenCalledWith(expect.objectContaining({
      examinationPurpose: '明确感染类型',
    }))
  })

  it('does not require an examination purpose for a treatment order', () => {
    render(
      <OrderDocumentReviewCard
        cardKey="treatment-1"
        title="治疗单1"
        kind="treatment"
        items={[{ id: 't1', name: '清创缝合', quantityText: '1 次' }]}
        info={buildDefaultDocumentInfo(mockEncounter, 'service', '')}
        onChangeInfo={vi.fn()}
        encounter={mockEncounter}
      />
    )

    expect(screen.getByLabelText('信息齐备')).toBeInTheDocument()
    expect(screen.queryByLabelText('检查目的')).not.toBeInTheDocument()
  })
})
