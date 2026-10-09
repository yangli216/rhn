import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import { ManualClinicalTemplateDialog } from './ManualClinicalTemplateDialog'
import { editorStandardsFixture } from './templateEditorFacts.testFixtures'

function mockApi() {
  const orderableMedications = vi.fn()
  return {
    outpatientNoteTemplates: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockImplementation((input) => Promise.resolve({
        id: 'note-1', revision: 0, specialtyCode: 'GENERAL_PRACTICE', documentType: 'OUTPATIENT_NOTE',
        contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1', status: 'ACTIVE', sortOrder: 0, useCount: 0,
        createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z', ...input,
      })),
      update: vi.fn(),
    },
    outpatientPlanTemplates: { create: vi.fn(), update: vi.fn() },
    encounters: { orderableMedications },
    masterData: {
      diseases: vi.fn(), medications: vi.fn(), services: vi.fn(),
      searchMedications: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 30 }),
      searchServices: vi.fn().mockResolvedValue({ content: [], totalElements: 0, totalPages: 0, page: 0, size: 30 }),
      clinicalMedicationStandards: vi.fn().mockResolvedValue(editorStandardsFixture()),
    },
  } as unknown as RhnApi
}

describe('ManualClinicalTemplateDialog', () => {
  it('keeps annotation explanations at the bottom of the full-height note editor', () => {
    render(<ManualClinicalTemplateDialog api={mockApi()} kind="NOTE" onClose={vi.fn()} onSaved={vi.fn()}
      editingNote={{
        id: 'note-1', revision: 0, scopeType: 'PERSONAL', name: '咳嗽病历', specialtyCode: 'GENERAL_PRACTICE',
        documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1', status: 'ACTIVE',
        sortOrder: 0, useCount: 0, createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z',
        content: { chiefComplaint: '咳嗽3天', annotations: [{ field: 'chiefComplaint', text: '3天', start: 2,
          source: 'TEMPLATE', kind: 'VARIABLE', binding: 'symptom.cough.duration' }] },
      }} />)

    expect(screen.getByRole('button', { name: '3天：模板预设' })).toBeInTheDocument()
    const legend = screen.getByRole('complementary', { name: '病历标记说明' })
    expect(legend.parentElement?.lastElementChild).toBe(legend)
    expect(legend).toHaveTextContent('蓝色：需按本次患者替换')
  })

  it('creates a note template without invoking AI', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const onSaved = vi.fn()
    render(<ManualClinicalTemplateDialog api={api} kind="NOTE" onClose={vi.fn()} onSaved={onSaved} />)

    await user.type(screen.getByPlaceholderText('输入便于识别的模板名称'), '高血压复诊病历')
    await user.type(screen.getByPlaceholderText('输入可复用的主诉内容'), '血压升高复诊')
    await user.type(screen.getByPlaceholderText('输入可复用的现病史内容'), '近期家庭血压：')
    await user.click(screen.getByRole('button', { name: '保存模板' }))

    await waitFor(() => expect(api.outpatientNoteTemplates.create).toHaveBeenCalledWith(expect.objectContaining({
      scopeType: 'PERSONAL',
      name: '高血压复诊病历',
      specialtyCode: 'GENERAL_PRACTICE',
      content: expect.objectContaining({ chiefComplaint: '血压升高复诊', presentIllness: '近期家庭血压：' }),
    })))
    expect(api.outpatientPlanTemplates.create).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()
  })

  it('uses the doctor-station entry pattern for a manually maintained plan', () => {
    render(<ManualClinicalTemplateDialog api={mockApi()} organizationId="org-1" kind="PLAN"
      onClose={vi.fn()} onSaved={vi.fn()} />)

    expect(screen.getByLabelText('添加标准诊断')).toBeInTheDocument()
    expect(screen.getByLabelText('诊断类型')).toBeInTheDocument()
    expect(screen.getByLabelText('医嘱类型')).toBeInTheDocument()
    expect(screen.getByLabelText('模板医嘱检索')).toBeInTheDocument()
    expect(screen.getByText(/应用方案时再校验机构目录、库存与价格/)).toBeInTheDocument()
    expect(screen.queryByText(/按门诊医生站的录入方式维护诊断与医嘱/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存模板' })).toBeDisabled()
  })

  it('searches template medications from generic master data instead of encounter orderables', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    vi.mocked(api.masterData.searchMedications).mockResolvedValue({
      content: [{
        id: 'med-1', revision: 0, itemTypeId: 'type-1', code: 'MED001', name: '阿莫西林胶囊',
        sdMedicationType: 'WESTERN', sdMedicationTypeText: '西药', preparationSpec: '0.25g', preparationUnit: '盒',
        prescriptionDrug: true, essentialDrug: false, antimicrobial: true, antimicrobialOutpatientAllowed: true,
        antimicrobialConsultationRequired: false, antimicrobialEmergencyAllowed: false, skinTestRequired: false,
        chronicDiseaseDrug: false, singleOrder: false, sdStatus: 'ACTIVE', sdStatusText: '启用',
        classifications: [], allergenConceptIds: [], products: [], defaultDose: 0.5, defaultDoseUnit: 'g',
        defaultRoute: 'PO', defaultFrequency: 'BID',
      }], totalElements: 1, totalPages: 1, page: 0, size: 30,
    })

    render(<ManualClinicalTemplateDialog api={api} organizationId="org-1" kind="PLAN"
      onClose={vi.fn()} onSaved={vi.fn()} />)

    await user.click(screen.getByLabelText('模板医嘱检索'))
    await user.type(await screen.findByPlaceholderText('输入药品名称、编码或拼音码'), '阿莫西林')
    await user.click(await screen.findByRole('option', { name: /阿莫西林胶囊/ }))

    expect(api.masterData.searchMedications).toHaveBeenCalledWith('阿莫西林', '', 'ACTIVE', '', 0, 30)
    expect(api.encounters.orderableMedications).not.toHaveBeenCalled()
    expect(screen.getByLabelText('阿莫西林胶囊 单次剂量')).toHaveValue(0.5)
    expect(screen.getByText('0.25g')).toBeInTheDocument()
  })

  it('edits existing plan rows and submits the current revision', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    const onSaved = vi.fn()
    vi.mocked(api.outpatientPlanTemplates.update).mockImplementation(async (_id, input) => ({
      id: 'plan-1', revision: 4, status: 'ACTIVE', sourceType: 'MANUAL', sortOrder: 0, useCount: 2,
      createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-28T00:00:00Z', tasks: [], ...input,
    } as never))
    const editingPlan = {
      id: 'plan-1', revision: 3, scopeType: 'DEPARTMENT' as const, name: '上感方案', status: 'ACTIVE' as const,
      sourceType: 'MANUAL' as const, sortOrder: 0, useCount: 2, createdAt: '2026-09-25T00:00:00Z',
      updatedAt: '2026-09-27T00:00:00Z', tasks: [], services: [],
      diagnoses: [{ conceptId: 'diag-1', diagnosisDomain: 'WESTERN_MEDICINE' as const, code: 'J06.9', display: '急性上呼吸道感染', type: 'PRIMARY' as const }],
      medications: [{ lineId: 'line-1', editorMode: 'regular' as const, categoryCode: 'WESTERN', medicationCode: 'MED001',
        medicationId: 'med-1', medicationName: '对乙酰氨基酚片', preparationSpec: '0.5g', doseValue: 0.5,
        doseUnit: 'g', routeCode: 'PO', frequencyCode: 'TID', durationValue: 3, durationUnit: 'd', quantity: 1,
        quantityUnit: '盒', substitutionAllowed: true, selfProvided: false, pricingRequired: false }],
    }

    render(<ManualClinicalTemplateDialog api={api} organizationId="org-1" kind="PLAN" editingPlan={editingPlan}
      onClose={vi.fn()} onSaved={onSaved} />)

    const dose = screen.getByLabelText('对乙酰氨基酚片 单次剂量')
    expect(dose.closest('tr')).toHaveAttribute('data-mode', 'read')
    await user.click(screen.getByText('对乙酰氨基酚片'))
    expect(dose).toHaveFocus()
    expect(dose.closest('tr')).toHaveAttribute('data-mode', 'edit')
    await user.clear(dose)
    await user.type(dose, '1')
    await user.click(screen.getByRole('button', { name: '保存模板' }))

    await waitFor(() => expect(api.outpatientPlanTemplates.update).toHaveBeenCalledWith('plan-1', expect.objectContaining({
      expectedRevision: 3,
      diagnoses: [expect.objectContaining({ code: 'J06.9', type: 'PRIMARY' })],
      medications: [expect.objectContaining({ medicationId: 'med-1', doseValue: 1, pricingRequired: false })],
    })))
    expect(onSaved).toHaveBeenCalled()
  })

  it('links a compatible note template into the saved plan', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    vi.mocked(api.outpatientNoteTemplates.list).mockResolvedValue([{
      id: 'note-1', revision: 0, scopeType: 'DEPARTMENT', name: '上感病历模板', specialtyCode: 'GENERAL_PRACTICE',
      documentType: 'OUTPATIENT_NOTE', contentSchema: 'RHN.OUTPATIENT_NOTE_TEMPLATE.V1',
      content: { chiefComplaint: '发热、咳嗽', presentIllness: '起病经过：' }, status: 'ACTIVE', sortOrder: 0,
      useCount: 0, createdAt: '2026-09-25T00:00:00Z', updatedAt: '2026-09-25T00:00:00Z',
    }])
    vi.mocked(api.outpatientPlanTemplates.create).mockResolvedValue({ id: 'plan-1' } as never)

    render(<ManualClinicalTemplateDialog api={api} organizationId="org-1" kind="PLAN"
      editingPlan={{
        id: 'plan-draft', revision: 0, scopeType: 'PERSONAL', name: '上感整体方案', status: 'ACTIVE',
        sortOrder: 0, useCount: 0, diagnoses: [{ code: 'J06.9', display: '急性上呼吸道感染', type: 'PRIMARY' }],
        medications: [], services: [], tasks: [], createdAt: '', updatedAt: '',
      }} onClose={vi.fn()} onSaved={vi.fn()} />)

    await waitFor(() => expect(screen.getByLabelText('配套病历模板')).toBeEnabled())
    await user.click(screen.getByLabelText('配套病历模板'))
    await user.click(await screen.findByRole('option', { name: /上感病历模板/ }))
    await user.click(screen.getByRole('button', { name: '保存模板' }))

    await waitFor(() => expect(api.outpatientPlanTemplates.update).toHaveBeenCalledWith('plan-draft', expect.objectContaining({
      noteTemplateId: 'note-1', expectedRevision: 0,
    })))
  })

  it('shows only auxiliary tasks while preserving hidden structured task records', async () => {
    const user = userEvent.setup()
    const api = mockApi()
    vi.mocked(api.outpatientPlanTemplates.update).mockResolvedValue({ id: 'plan-1' } as never)
    render(<ManualClinicalTemplateDialog api={api} organizationId="org-1" kind="PLAN"
      editingPlan={{
        id: 'plan-1', revision: 2, scopeType: 'PERSONAL', name: '上感方案', status: 'ACTIVE',
        sortOrder: 0, useCount: 0, createdAt: '', updatedAt: '', medications: [], services: [],
        diagnoses: [{ code: 'J06.9', display: '急性上呼吸道感染', type: 'PRIMARY' }],
        tasks: [
          { kind: 'DIAGNOSIS', text: '急性上呼吸道感染', origin: 'EXPLICIT', status: 'MATCHED' },
          { kind: 'EDUCATION', text: '多饮水，注意休息', origin: 'SUGGESTED', status: 'NEEDS_REVIEW' },
          { kind: 'FOLLOW_UP', text: '三日后复诊', origin: 'SUGGESTED', status: 'NEEDS_REVIEW' },
        ],
      }} onClose={vi.fn()} onSaved={vi.fn()} />)

    const taskPanel = screen.getByRole('region', { name: '辅助任务' })
    expect(within(taskPanel).queryByLabelText('诊断任务内容')).not.toBeInTheDocument()
    expect(within(taskPanel).getByLabelText('宣教任务内容')).toHaveValue('多饮水，注意休息')

    await user.clear(within(taskPanel).getByLabelText('宣教任务内容'))
    await user.type(within(taskPanel).getByLabelText('宣教任务内容'), '充分休息并监测体温')
    await user.click(within(taskPanel).getByRole('button', { name: '移除任务 三日后复诊' }))
    await user.click(screen.getByRole('button', { name: '保存模板' }))

    await waitFor(() => expect(api.outpatientPlanTemplates.update).toHaveBeenCalledWith('plan-1', expect.objectContaining({
      tasks: [
        expect.objectContaining({ kind: 'DIAGNOSIS', text: '急性上呼吸道感染' }),
        expect.objectContaining({ kind: 'EDUCATION', text: '充分休息并监测体温' }),
      ],
    })))
  })
})
