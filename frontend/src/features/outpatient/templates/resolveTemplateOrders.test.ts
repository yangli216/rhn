import { describe, expect, it, vi } from 'vitest'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import { resolveTemplateOrders } from './resolveTemplateOrders'
import { templateCatalogFixture } from './resolveTemplateOrders.testFixtures'

const resolve = (f: ReturnType<typeof templateCatalogFixture>, allergies: AllergyIntolerance[] = []) =>
  resolveTemplateOrders(f.plan, f.target, f.api, allergies, true)

describe('template orders use current catalog facts', () => {
  it('uses current names, price, confirmed routing and base-unit availability while preserving explicit dosing', async () => {
    const f = templateCatalogFixture(), result = await resolve(f)
    expect(f.medications).toHaveBeenCalledWith('TEST', '', 'ACTIVE', 'org')
    expect(f.orderableMedications).toHaveBeenCalledWith('current', 'TEST')
    expect(f.autoSplitPreview).toHaveBeenCalledWith('current', expect.any(Array))
    expect(result.medications[0]).toMatchObject({ medicationName: '当前测试药', productName: '当前产品',
      stockSiteId: 'pharmacy', stockSiteName: '当前药房', availablePackageQuantity: 10, unitPrice: 2.5, currencyCode: 'USD',
      request: { doseValue: 5, quantity: 2, quantityUnit: 'BOX', substitutionAllowed: true, selfProvided: false, allergyReviewConfirmed: false } })
    expect(result.services[0]).toMatchObject({ itemName: 'S1当前目录名称', unitPrice: 3, currencyCode: 'USD',
      quantity: 2, clinicalDescription: '明确说明', performerDepartmentId: 'lab-dept', performerDepartmentName: '检验中心二部' })
  })
  it.each(['product', 'package', 'price', 'adoption', 'category', 'unit', 'route', 'frequency', 'risk', 'stock', 'split', 'department', 'service-price', 'service-type'])(
    'rejects the whole selection when %s facts are missing or changed', async failure => {
      const f = templateCatalogFixture(), product = f.medication.products[0]
      if (failure === 'product') f.plan.medications[0].catalogItemId = undefined
      if (failure === 'package') product.packages = []
      if (failure === 'price') product.prices = []
      if (failure === 'adoption') product.organizationAdoption!.organizationId = 'other'
      if (failure === 'category') f.medication.sdMedicationType = 'HERBAL'
      if (failure === 'unit') product.packages[0].unitCode = 'BAG'
      if (failure === 'route') f.routes[0].executionType = 'INFUSION'
      if (failure === 'frequency') f.frequencies[0].code = 'BID'
      if (failure === 'risk') Object.assign(f.medication, { skinTestRequired: undefined })
      if (failure === 'stock') f.medication.availableBaseQuantity = 19
      if (failure === 'split') f.autoSplitPreview.mockResolvedValue([])
      if (failure === 'department') f.department.organizationId = 'other'
      if (failure === 'service-price') f.service.prices = []
      if (failure === 'service-type') f.service.sdServiceType = 'EXAMINATION'
      await expect(resolve(f)).rejects.toThrow()
    })
  it('uses the pharmacy chosen by the backend rather than the first available stock record', async () => {
    const f = templateCatalogFixture()
    f.orderableMedications.mockResolvedValue([{ ...f.medication, stockSiteId: 'wrong', stockSiteName: '其他药房' }, f.medication])
    expect((await resolve(f)).medications[0].stockSiteId).toBe('pharmacy')
  })
  it('checks the combined demand of multiple selected regimens', async () => {
    const f = templateCatalogFixture()
    f.plan.medications.push({ ...f.plan.medications[0], lineId: 'second', doseValue: 10 })
    expect((await resolve(f)).medications).toHaveLength(2)
    f.medication.availableBaseQuantity = 30
    await expect(resolve(f)).rejects.toThrow(/总量超过/)
  })
  it('does not switch to another package with an available price', async () => {
    const f = templateCatalogFixture(), product = f.medication.products[0]
    product.packages[0].id = 'other-box'; product.prices[0].packageId = 'other-box'
    await expect(resolve(f)).rejects.toThrow(/原包装/)
  })
  it('keeps current skin-test/antimicrobial facts without fabricating an exemption or allergy review', async () => {
    const f = templateCatalogFixture()
    f.medication.skinTestRequired = true; f.medication.antimicrobial = true; f.medication.skinTestResultValidityHours = 72
    const [draft] = (await resolve(f)).medications
    expect(draft).toMatchObject({ skinTestRequired: true, antimicrobial: true, skinTestResultValidityHours: 72 })
    expect(draft.request.allergyReviewConfirmed).toBe(false)
    expect(draft.request.skinTestExempt).toBeUndefined()
  })
  it.each(['UNCONFIRMED', 'CONFIRMED'] as const)('uses the actual patient allergy verification status: %s', async verificationStatus => {
    const f = templateCatalogFixture()
    const result = await resolve(f, [{ residentId: 'resident', clinicalStatus: 'ACTIVE', verificationStatus,
      assertionType: 'NO_KNOWN_DRUG_ALLERGY' } as AllergyIntolerance])
    expect(result.medications[0].request.allergyReviewConfirmed).toBe(verificationStatus === 'CONFIRMED')
  })
  it('supports explicit self-provided medication without inventing hospital stock or a zero price', async () => {
    const f = templateCatalogFixture()
    Object.assign(f.plan.medications[0], { catalogItemId: undefined, packageId: undefined, selfProvided: true, pricingRequired: false, quantityUnit: '片' })
    const [draft] = (await resolve(f)).medications
    expect(f.orderableMedications).not.toHaveBeenCalled()
    expect(draft.stockSiteId).toBeUndefined()
    expect(draft.unitPrice).toBeUndefined()
    expect(draft.request).toMatchObject({ selfProvided: true, pricingRequired: false, quantity: 2, quantityUnit: '片' })
    expect(draft.productName).toBe('自备药品（产品未指定）')
  })
  it('preserves an explicit non-priced product order without requiring or fabricating a price', async () => {
    const f = templateCatalogFixture()
    f.plan.medications[0].pricingRequired = false; f.medication.products[0].prices = []
    const [draft] = (await resolve(f)).medications
    expect(draft.request.pricingRequired).toBe(false)
    expect(draft.unitPrice).toBeUndefined()
    expect(draft.stockSiteId).toBe('pharmacy')
  })
  it('supports priced self-provided products without requiring dispensing adoption', async () => {
    const f = templateCatalogFixture()
    f.plan.medications[0].selfProvided = true; f.plan.medications[0].pricingRequired = true
    f.medication.products[0].organizationAdoption!.dispensable = false
    expect((await resolve(f)).medications[0].unitPrice).toBe(2.5)
    expect(f.orderableMedications).not.toHaveBeenCalled()
  })
  it.each(['HERBAL', 'INFUSION'])('keeps the actual %s classification and preview', async kind => {
    const f = templateCatalogFixture()
    if (kind === 'HERBAL') {
      f.medication.sdMedicationType = 'HERBAL'; f.plan.medications[0].categoryCode = 'HERBAL'; f.plan.medications[0].editorMode = 'herbal'
    } else {
      f.routes[0].executionType = 'INFUSION'; f.plan.medications[0].routeExecutionType = 'INFUSION'
    }
    const [draft] = (await resolve(f)).medications
    expect(draft.categoryCode).toBe(kind === 'HERBAL' ? 'HERBAL' : 'WESTERN')
    expect(Boolean(draft.administrationGroupKey)).toBe(kind === 'INFUSION')
  })
  it('does not substitute a guessed department when the real department API fails', async () => {
    const f = templateCatalogFixture()
    vi.mocked(f.api.organization.department).mockRejectedValue(new Error('科室无权访问'))
    await expect(resolve(f)).rejects.toThrow('科室无权访问')
  })
})
