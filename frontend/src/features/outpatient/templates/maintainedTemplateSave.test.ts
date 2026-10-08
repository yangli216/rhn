import { describe, expect, it, vi } from 'vitest'
import type { SaveOutpatientNoteTemplateInput } from '../../../shared/api/outpatientNoteTemplatesApi'
import type { OutpatientPlanTemplate, SaveOutpatientPlanTemplateInput } from '../../../shared/api/outpatientPlanTemplatesApi'
import { prepareMaintainedPlanSave, saveAiMaintainedPlan, saveMaintainedNote, saveMaintainedPlan, type NoteSaveCheckpoint } from './maintainedTemplateSave'

import { maintainedPlanFixture, maintainedNoteReceipt } from './maintainedTemplateSave.testFixtures'

function setup() {
  const plan = maintainedPlanFixture()
  const receipt = (input: SaveOutpatientPlanTemplateInput): OutpatientPlanTemplate => ({ ...plan, ...input,
    medications: input.medications.map((item, index) => ({ ...item, medicationId: item.medicationId!, lineId: `line-${index}`, editorMode: 'regular',
      categoryCode: 'WESTERN', medicationName: '测试药品', medicationCode: 'M1' })),
    services: input.services.map(item => ({ ...item, itemCode: 'S1', itemName: '测试服务', serviceType: 'OTHER' })),
  })
  const api = { outpatientNoteTemplates: { list: vi.fn(), use: vi.fn(), disable: vi.fn(),
    create: vi.fn(async (input: SaveOutpatientNoteTemplateInput) => maintainedNoteReceipt(input)),
    update: vi.fn(async (id: string, input: SaveOutpatientNoteTemplateInput & { expectedRevision: number }) =>
      ({ ...maintainedNoteReceipt(input), id, revision: input.expectedRevision + 1 })) },
  outpatientPlanTemplates: { create: vi.fn(async (input: SaveOutpatientPlanTemplateInput) => ({ ...receipt(input), useCount: 0 })),
    update: vi.fn(async (id: string, input: SaveOutpatientPlanTemplateInput & { expectedRevision: number }) =>
      ({ ...receipt(input), id, revision: input.expectedRevision + 1 })) } }
  // Only the exercised API methods are needed by the save boundary.
  const checkpoint: { current: NoteSaveCheckpoint | null } = { current: null }
  return { plan, api, checkpoint }
}

describe('maintained template save facts', () => {
  it.each([undefined, null, 0, -1, NaN, Infinity])('does not replace invalid medication quantity %s with one or save the linked note first', async quantity => {
    const f = setup(); Object.assign(f.plan.medications[0], { quantity })
    await expect(saveAiMaintainedPlan(f.api, f.plan,
      { chiefComplaint: '明确模板段落' }, undefined, undefined, f.checkpoint, () => true)).rejects.toThrow()
    expect(f.api.outpatientNoteTemplates.create).not.toHaveBeenCalled()
    expect(f.api.outpatientPlanTemplates.create).not.toHaveBeenCalled()
  })
  it.each(['quantityUnit', 'doseValue', 'tasks', 'services'])('refuses incomplete %s facts', failure => {
    const f = setup()
    if (failure === 'quantityUnit') f.plan.medications[0].quantityUnit = ''
    if (failure === 'doseValue') f.plan.medications[0].doseValue = -1
    if (failure === 'tasks') Object.assign(f.plan, { tasks: [{ text: '未核实的任务' }] })
    if (failure === 'services') Object.assign(f.plan, { services: [{ catalogItemId: 's', quantity: 0, unitCode: '次' }] })
    expect(() => prepareMaintainedPlanSave(f.plan)).toThrow()
  })
  it.each(['empty', 'identity', 'revision', 'quantity', 'extra-dose', 'description', 'usage', 'sort', 'tasks'])('does not acknowledge an invalid %s plan update', async failure => {
    const f = setup(), receipt = { ...f.plan, revision: 4 }
    if (failure === 'identity') receipt.id = 'wrong'
    if (failure === 'revision') receipt.revision = 3
    if (failure === 'quantity') receipt.medications = [{ ...receipt.medications[0], quantity: 1 }]
    if (failure === 'extra-dose') receipt.medications = [{ ...receipt.medications[0], doseValue: 1, doseUnit: '片' }]
    if (failure === 'description') receipt.description = '另一个说明'
    if (failure === 'usage') receipt.useCount = 0
    if (failure === 'sort') receipt.sortOrder = 0
    if (failure === 'tasks') Object.assign(receipt, { tasks: [{ kind: 'EDUCATION', text: '凭空补充' }] })
    f.api.outpatientPlanTemplates.update.mockResolvedValueOnce(failure === 'empty' ? undefined as never : receipt as never)
    await expect(saveMaintainedPlan(f.api, f.plan, f.plan)).rejects.toThrow('保存未确认')
  })
  it('preserves the actual sort order, source and usage of an updated plan', async () => {
    const f = setup()
    const saved = await saveMaintainedPlan(f.api, f.plan, f.plan)
    expect(saved).toMatchObject({ id: 'plan', revision: 4, useCount: 5, sortOrder: 7, sourceType: 'MANUAL' })
    expect(f.api.outpatientPlanTemplates.update).toHaveBeenCalledWith('plan', expect.objectContaining({ expectedRevision: 3, sortOrder: 7 }))
  })
  it.each(['identity', 'revision', 'content'])('checks note update %s before accepting its result', async failure => {
    const f = setup(), input = { name: '病历', scopeType: 'PERSONAL' as const, specialtyCode: 'GENERAL_PRACTICE', sortOrder: 2, content: { chiefComplaint: '主诉' } }
    const previous = maintainedNoteReceipt(input)
    const next = { ...previous, revision: 2 }
    if (failure === 'identity') next.id = 'another'
    if (failure === 'revision') next.revision = 1
    if (failure === 'content') next.content = { chiefComplaint: '别的正文' }
    f.api.outpatientNoteTemplates.update.mockResolvedValueOnce(next)
    await expect(saveMaintainedNote(f.api, input, previous)).rejects.toThrow('保存未确认')
  })
  it('never links an unverified note ID into a plan', async () => {
    const f = setup(); f.api.outpatientNoteTemplates.create.mockResolvedValueOnce({ id: 'unverified' } as never)
    await expect(saveAiMaintainedPlan(f.api, f.plan,
      { chiefComplaint: '主诉' }, null, undefined, f.checkpoint, () => true)).rejects.toThrow('保存未确认')
    expect(f.checkpoint.current).toBeNull()
    expect(f.api.outpatientPlanTemplates.create).not.toHaveBeenCalled()
  })
  it('reuses the confirmed note after a plan failure and updates that note if the doctor changes its content', async () => {
    const f = setup(), api = f.api
    f.api.outpatientPlanTemplates.create.mockRejectedValueOnce(new Error('方案服务暂不可用'))
    await expect(saveAiMaintainedPlan(api, f.plan, { chiefComplaint: '主诉' }, null, undefined, f.checkpoint, () => true)).rejects.toThrow('病历模板已保存')
    const result = await saveAiMaintainedPlan(api, f.plan, { chiefComplaint: '主诉' }, null, undefined, f.checkpoint, () => true)
    expect(result.noteTemplateId).toBe('note')
    expect(f.api.outpatientNoteTemplates.create).toHaveBeenCalledTimes(1)
    await saveAiMaintainedPlan(api, f.plan, { chiefComplaint: '更新后的主诉' }, null, undefined, f.checkpoint, () => true)
    expect(f.api.outpatientNoteTemplates.create).toHaveBeenCalledTimes(1)
    expect(f.api.outpatientNoteTemplates.update).toHaveBeenCalledExactlyOnceWith('note', expect.objectContaining({ expectedRevision: 1, content: { chiefComplaint: '更新后的主诉', annotations: [] } }))
  })
  it('does not create a fake empty note just because an annotations array is present', async () => {
    const f = setup()
    const saved = await saveAiMaintainedPlan(f.api, f.plan,
      { annotations: [] }, null, undefined, f.checkpoint, () => true)
    expect(saved.noteTemplateId).toBeUndefined()
    expect(f.api.outpatientNoteTemplates.create).not.toHaveBeenCalled()
  })
  it('does not silently replace a missing linked note or retain cleared old content', async () => {
    const f = setup(); f.plan.noteTemplateId = 'missing'
    const api = f.api
    await expect(saveAiMaintainedPlan(api, f.plan, { chiefComplaint: '新段落' }, f.plan, undefined, f.checkpoint, () => true)).rejects.toThrow('已不可用')
    const linked = maintainedNoteReceipt({ name: '病历', scopeType: 'PERSONAL', specialtyCode: 'GENERAL_PRACTICE', sortOrder: 0, content: { chiefComplaint: '旧段落' } })
    f.plan.noteTemplateId = linked.id
    await expect(saveAiMaintainedPlan(api, f.plan, {}, f.plan, linked, f.checkpoint, () => true)).rejects.toThrow('正文为空')
    expect(f.api.outpatientPlanTemplates.update).not.toHaveBeenCalled()
  })
  it('stops before the plan write when context changes during the note write', async () => {
    const f = setup(); let current = true
    f.api.outpatientNoteTemplates.create.mockImplementationOnce(async input => { current = false; return maintainedNoteReceipt(input) })
    await expect(saveAiMaintainedPlan(f.api, f.plan,
      { chiefComplaint: '主诉' }, null, undefined, f.checkpoint, () => current)).rejects.toThrow('上下文已变化')
    expect(f.api.outpatientPlanTemplates.create).not.toHaveBeenCalled()
    expect(f.checkpoint.current).toBeNull()
  })
})
