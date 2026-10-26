import { describe, expect, it } from 'vitest'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import {
  copyOrderSetInput, draftsToOrderSetInput, rethrowTemplateSaveError, templateSaveErrorMessage, templateTypeLabel, templateTypeOrder,
} from './orderSetTemplate'

const medication = (patch: Partial<MedicationPlanDraft['request']> = {}): MedicationPlanDraft => ({
  id: 'd-med', editorMode: 'regular', categoryCode: 'WESTERN', medicationName: '阿莫西林胶囊', medicationCode: 'M1',
  preparationSpec: '0.25g', productName: '产品', routeName: '口服', stockSiteId: 'site', stockSiteName: '药房', unitPrice: 9,
  request: { medicationId: 'med-1', catalogItemId: 'prod-1', packageId: 'pkg-1', doseValue: 2, doseUnit: 'mg', routeCode: 'ORAL',
    frequencyCode: 'QD', durationValue: 3, durationUnit: 'd', quantity: 1, quantityUnit: '盒', substitutionAllowed: true, selfProvided: false,
    medicationInstruction: ' 饭后 ', allergyReviewConfirmed: true, allergyOverrideReason: '不应带入', pricingRequired: true, priceType: 'SALE', ...patch },
})
const service = (patch: Partial<ServicePlanDraft> = {}): ServicePlanDraft => ({ id: 'd-srv', catalogItemId: 'srv-1', itemCode: 'LAB1',
  itemName: '血常规', serviceType: 'LABORATORY', quantity: 1, unitCode: '次', clinicalDescription: ' 空腹 ',
  performerOrganizationId: 'org', performerDepartmentId: 'dept-from-encounter', unitPrice: 12, ...patch })

describe('template type naming', () => {
  it('fixes the order and the doctor-facing names', () => {
    expect(templateTypeOrder.map(type => templateTypeLabel(type))).toEqual(['诊疗方案', '医嘱组套', '病历模板'])
  })
})

describe('draftsToOrderSetInput', () => {
  it('builds an ORDER_SET request from drafts: no diagnoses or tasks, rows selected by default, no patient/stock facts', () => {
    const input = draftsToOrderSetInput([medication()], [service()], { name: '  复查组套 ', scopeType: 'PERSONAL' })
    expect(input).toMatchObject({ templateKind: 'ORDER_SET', scopeType: 'PERSONAL', name: '复查组套', sourceType: 'MANUAL', diagnoses: [], tasks: [] })
    expect(input.medications[0]).toEqual({ medicationId: 'med-1', catalogItemId: 'prod-1', packageId: 'pkg-1', medicationName: '阿莫西林胶囊',
      preparationSpec: '0.25g', doseValue: 2, doseUnit: 'mg', routeCode: 'ORAL', frequencyCode: 'QD', durationValue: 3, durationUnit: 'd',
      quantity: 1, quantityUnit: '盒', substitutionAllowed: true, selfProvided: false, medicationInstruction: '饭后',
      priceType: 'SALE', pricingRequired: true, defaultSelected: true })
    expect(input.services[0]).toEqual({ catalogItemId: 'srv-1', itemCode: 'LAB1', itemName: '血常规', serviceType: 'LABORATORY',
      quantity: 1, unitCode: '次', clinicalDescription: '空腹', priceType: 'SALE', pricingRequired: true, reason: '门诊诊疗申请', defaultSelected: true })
    // 草稿上的执行科室通常是接诊科室默认值，不写入共享组套
    expect(input.services[0]).not.toHaveProperty('executionDepartmentId')
    expect(JSON.stringify(input)).not.toContain('allergy')
  })
  it('refuses rows without a catalog identity instead of saving a hollow template', () => {
    expect(() => draftsToOrderSetInput([medication({ medicationId: undefined })], [], { name: 'x', scopeType: 'PERSONAL' })).toThrow(/阿莫西林胶囊/)
    expect(() => draftsToOrderSetInput([], [service({ catalogItemId: '' })], { name: 'x', scopeType: 'PERSONAL' })).toThrow(/血常规/)
  })
})

describe('copyOrderSetInput', () => {
  it('copies lines for a personal template and drops line identities', () => {
    const source = { id: 'set', revision: 4, templateKind: 'ORDER_SET', scopeType: 'HOSPITAL', name: '血常规复查组套', description: '说明', status: 'ACTIVE',
      sortOrder: 0, useCount: 9, createdAt: '', updatedAt: '', diagnoses: [], tasks: [],
      medications: [{ lineId: 'l1', medicationId: 'm1', quantity: 1, defaultSelected: false }],
      services: [{ catalogItemId: 's1', itemCode: 'S', itemName: 'n', quantity: 1, unitCode: '次', executionDepartmentId: 'dept-1' }] } as unknown as OutpatientPlanTemplate
    const copy = copyOrderSetInput(source)
    expect(copy).toMatchObject({ templateKind: 'ORDER_SET', scopeType: 'PERSONAL', name: '血常规复查组套（副本）', sourceType: 'MANUAL' })
    expect(copy.medications[0]).not.toHaveProperty('lineId')
    expect(copy.medications[0]).toMatchObject({ medicationId: 'm1', defaultSelected: false })
    expect(copy.services[0]).toMatchObject({ executionDepartmentId: 'dept-1' })
  })
})

describe('save error codes', () => {
  it.each([
    ['ORDER_SET_CONTENT_INVALID', /不能带诊断、任务或病历关联/],
    ['ORDER_SET_EMPTY', /至少需要一条/],
    ['CLINICAL_TEMPLATE_KIND_INVALID', /类型创建后不能修改/],
    ['PLAN_TEMPLATE_EXECUTION_DEPARTMENT_INVALID', /执行科室不可用/],
  ])('maps %s by code, ignoring the server message', (code, text) => {
    const error = { code, message: '服务端文案不应被依赖' }
    expect(templateSaveErrorMessage(error)).toMatch(text)
    expect(() => rethrowTemplateSaveError(error)).toThrow(text)
  })
  it('falls back to the generic message for other codes and keeps the original rejection', () => {
    const other = { code: 'SOMETHING_ELSE', message: '通用错误' }
    expect(templateSaveErrorMessage(other)).toContain('通用错误')
    expect(() => rethrowTemplateSaveError(other)).toThrow()
    try { rethrowTemplateSaveError(other) } catch (error) { expect(error).toBe(other) }
  })
})
