import { render, screen, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { OrderDocumentReviewCard, OrderDocumentReviewList, type ReviewItemDisplay } from './OrderDocumentReviewCard'
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

  it('shows split reasons only when hovering or focusing the information icon', async () => {
    const user = userEvent.setup()
    render(<OrderDocumentReviewCard cardKey="preview" title="西1" kind="western" items={defaultItems}
      ruleReasons={['单列药品一药一方']} info={buildDefaultDocumentInfo(mockEncounter, 'prescription')}
      onChangeInfo={vi.fn()} encounter={mockEncounter} />)
    const trigger = screen.getByRole('button', { name: '查看分方原因' })
    expect(screen.queryByText('单列药品一药一方')).not.toBeInTheDocument()
    await user.hover(trigger)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('单列药品一药一方')
    await user.unhover(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    fireEvent.focus(trigger)
    expect(screen.getByRole('tooltip')).toHaveTextContent('单列药品一药一方')
    fireEvent.blur(trigger)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps distinct document boundaries with one shared header and collapsed optional fields', async () => {
    const user = userEvent.setup()
    render(<OrderDocumentReviewList>
      <OrderDocumentReviewCard cardKey="rx" title="西1" kind="western" deptOrSite="西药房"
        items={[...defaultItems, { id: 'second', name: '第二项药品', quantityText: '2 盒' }]}
        info={{ ...buildDefaultDocumentInfo(mockEncounter, 'prescription'), externalPrescription: true, specialDisease: '慢病' }}
        onChangeInfo={vi.fn()} encounter={mockEncounter} />
      <OrderDocumentReviewCard cardKey="lab" title="检1" kind="lab" deptOrSite="检验科"
        items={[{ name: '血常规', quantityText: '1 次', note: '全血 · 明确感染类型' }]}
        info={buildDefaultDocumentInfo(mockEncounter, 'service', '明确感染类型')}
        onChangeInfo={vi.fn()} encounter={mockEncounter} readOnly />
    </OrderDocumentReviewList>)
    expect(screen.getAllByRole('table')).toHaveLength(1)
    expect(screen.getAllByRole('columnheader')).toHaveLength(3)
    const prescription = screen.getByRole('rowgroup', { name: '西1单据' })
    expect(prescription).toHaveTextContent('2 项')
    expect(prescription).toHaveTextContent('外配')
    expect(prescription).toHaveTextContent('慢病')
    const laboratory = screen.getByRole('rowgroup', { name: '检1单据' })
    expect(within(laboratory).queryByRole('button', { name: '修改' })).not.toBeInTheDocument()
    expect(screen.getAllByText('明确感染类型')).toHaveLength(1)
    expect(within(laboratory).getByText('全血')).toBeInTheDocument()
    await user.click(within(prescription).getByRole('button', { name: '修改' }))
    expect(screen.getByRole('checkbox', { name: '外配处方' })).toBeChecked()
    await user.click(within(prescription).getByRole('button', { name: '收起' }))
    expect(screen.queryByRole('checkbox', { name: '外配处方' })).not.toBeInTheDocument()
  })

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
    expect(screen.queryByLabelText('信息齐备')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('门诊特病病种')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '修改' }))
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

  it.each(['lab', 'exam'] as const)('keeps examination purpose optional and editable for %s', (kind) => {
    const onChangeInfo = vi.fn()
    const serviceInfo = buildDefaultDocumentInfo(mockEncounter, 'service', '')

    const serviceItems: ReviewItemDisplay[] = [
      { id: 's1', name: '血常规（三分类）', quantityText: '1 次', note: '门诊检验送检' },
    ]

    const card = (info: typeof serviceInfo) => (
      <OrderDocumentReviewCard
        cardKey="svc-1"
        title="检1"
        kind={kind}
        deptOrSite="检验科"
        items={serviceItems}
        info={info}
        onChangeInfo={onChangeInfo}
        encounter={mockEncounter}
      />
    )
    const { rerender } = render(card(serviceInfo))

    expect(screen.getByText('检1')).toBeInTheDocument()
    expect(screen.getByText('检验科')).toBeInTheDocument()
    expect(screen.queryByText(/缺检查目的/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '修改' }))
    expect(screen.getByLabelText('检查目的')).not.toBeRequired()
    fireEvent.change(screen.getByLabelText('检查目的'), { target: { value: '明确感染类型' } })
    expect(onChangeInfo).toHaveBeenCalledWith(expect.objectContaining({
      examinationPurpose: '明确感染类型',
    }))
    rerender(card({ ...serviceInfo, examinationPurpose: '明确感染类型' }))
    fireEvent.change(screen.getByLabelText('检查目的'), { target: { value: '' } })
    expect(onChangeInfo).toHaveBeenLastCalledWith(expect.objectContaining({ examinationPurpose: '' }))
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

    expect(screen.queryByText(/缺检查目的/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('检查目的')).not.toBeInTheDocument()
  })
})
