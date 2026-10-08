import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRhnSessionApi, type RhnApi } from '../../../shared/rhnApi'
import { searchTemplateDiagnoses, searchTemplateMedications, searchTemplateServices } from './templateCatalogSearch'
import { catalogDisease, catalogPage, catalogProduct, catalogService } from './templateCatalogSearch.testFixtures'

afterEach(() => vi.restoreAllMocks())
function fixture() {
  const masterData = { searchMedicationProducts: vi.fn().mockResolvedValue(catalogPage([catalogProduct()])),
    searchMedications: vi.fn().mockResolvedValue(catalogPage([])),
    searchDiseases: vi.fn().mockResolvedValue(catalogPage([catalogDisease()])),
    searchServices: vi.fn().mockResolvedValue(catalogPage([catalogService()])) }
  return { masterData, api: { masterData } as unknown as RhnApi }
}
describe('template catalog search facts', () => {
  it('keeps real diagnosis identity, domain and coding system and uses the actual service type field', async () => {
    const f = fixture()
    expect(await searchTemplateDiagnoses(f.api, '病证')).toEqual([{ id: 'diagnosis', codeSystem: 'GB_TCM', code: 'A01', display: '目录中医病证', diagnosisDomain: 'TCM_SYNDROME' }])
    expect(await searchTemplateServices(f.api, '检查', 'org')).toEqual([{ id: 'service', code: 'S1', name: '目录检查项目', unitCode: '次', serviceType: 'EXAMINATION', organizationId: 'org', chargeable: true }])
  })
  it.each(['sdDiagnosisDomain', 'systemCode', 'id', 'sdStatus'])('does not invent missing diagnosis %s', async field => {
    const f = fixture(), value = catalogDisease(); delete (value as Record<string, unknown>)[field]
    f.masterData.searchDiseases.mockResolvedValue(catalogPage([value]))
    await expect(searchTemplateDiagnoses(f.api, '病证')).rejects.toThrow('目录缺少')
  })
  it.each(['sdServiceType', 'unitCode', 'id', 'sdStatus'])('does not invent missing service %s', async field => {
    const f = fixture(), value = catalogService(); delete (value as Record<string, unknown>)[field]
    f.masterData.searchServices.mockResolvedValue(catalogPage([value]))
    await expect(searchTemplateServices(f.api, '检查', 'org')).rejects.toThrow('目录缺少')
  })
  it.each(['product-failure', 'generic-failure', 'product-missing', 'generic-missing', 'mismatch', 'duplicate', 'inactive'])('rejects incomplete medication search: %s', async failure => {
    const f = fixture()
    if (failure === 'product-failure') f.masterData.searchMedicationProducts.mockRejectedValue(new Error('产品查询失败'))
    if (failure === 'generic-failure') f.masterData.searchMedications.mockRejectedValue(new Error('通用药品查询失败'))
    if (failure === 'product-missing') f.masterData.searchMedicationProducts.mockResolvedValue(undefined)
    if (failure === 'generic-missing') f.masterData.searchMedications.mockResolvedValue({})
    const product = catalogProduct()
    if (failure === 'mismatch') { product.product.medicationId = 'other'; f.masterData.searchMedicationProducts.mockResolvedValue(catalogPage([product])) }
    if (failure === 'duplicate') f.masterData.searchMedicationProducts.mockResolvedValue(catalogPage([product, product]))
    if (failure === 'inactive') { product.medication.sdStatus = 'INACTIVE'; f.masterData.searchMedicationProducts.mockResolvedValue(catalogPage([product])) }
    await expect(searchTemplateMedications(f.api, '药')).rejects.toThrow()
  })
  it('keeps generic and product namespaces separate and never invents a product package', async () => {
    const f = fixture()
    f.masterData.searchMedications.mockResolvedValue(catalogPage([{ ...catalogProduct().medication, id: 'product', code: 'GEN', name: '其他通用药品' }]))
    const result = await searchTemplateMedications(f.api, '药')
    expect(result.map(item => item.key)).toEqual(['product:product', 'generic:product'])
    expect(result[0]).toMatchObject({ medicationId: 'med', quantityUnit: '盒' })
    expect(result[1]).toMatchObject({ medicationId: 'product', quantityUnit: '粒' })
    expect(result[0]).not.toHaveProperty('packageId')
    expect(result[0].defaultFrequency).toBeUndefined()
  })
  it.each([{}, { content: [] }, { ...catalogPage([]), totalElements: 1 }, { ...catalogPage([]), totalPages: 1 }])('does not interpret an incomplete page as an empty search', async value => {
    const f = fixture(); f.masterData.searchDiseases.mockResolvedValue(value)
    await expect(searchTemplateDiagnoses(f.api, '病证')).rejects.toThrow('未返回完整')
  })
  it('accepts explicitly empty first-party directories', async () => {
    const f = fixture()
    Object.values(f.masterData).forEach(method => method.mockResolvedValue(catalogPage([])))
    expect(await searchTemplateMedications(f.api, '无')).toEqual([])
    expect(await searchTemplateDiagnoses(f.api, '无')).toEqual([])
    expect(await searchTemplateServices(f.api, '无', 'org')).toEqual([])
  })
  it('uses the production API paging, status and context transport', async () => {
    const seen: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (path, init) => {
      const url = new URL(String(path), 'http://localhost')
      expect(url.searchParams.get('query')).toBe('目标')
      expect(url.searchParams.get('status')).toBe('ACTIVE')
      expect(url.searchParams.get('page')).toBe('0'); expect(url.searchParams.get('size')).toBe('10')
      expect(new Headers(init?.headers).get('X-Organization-Id')).toBe('org')
      if (url.pathname.endsWith('/services/search')) expect(url.searchParams.get('organizationId')).toBe('org')
      seen.push(url.pathname)
      return new Response(JSON.stringify(url.pathname.endsWith('/diseases/search') ? catalogPage([catalogDisease()])
        : url.pathname.endsWith('/medication-products/search') ? catalogPage([catalogProduct()])
          : url.pathname.endsWith('/medications/search') ? catalogPage([]) : catalogPage([catalogService()])))
    })
    const api = createRhnSessionApi('tenant').withWorkContext({ organizationId: 'org', departmentId: 'dept' })
    await Promise.all([searchTemplateMedications(api, ' 目标 '), searchTemplateDiagnoses(api, '目标'), searchTemplateServices(api, '目标', 'org')])
    expect(new Set(seen).size).toBe(4)
  })
  it('requires the current organization before service lookup', async () => {
    const f = fixture()
    await expect(searchTemplateServices(f.api, '检查')).rejects.toThrow('工作机构尚未确认')
    expect(f.masterData.searchServices).not.toHaveBeenCalled()
  })
  it.each(['unadopted', 'inactive', 'not-orderable', 'not-executable', 'future', 'expired', 'inpatient', 'global-disabled'])('does not offer an unavailable institution service: %s', async failure => {
    const f = fixture(), value: any = catalogService()
    if (failure === 'unadopted') value.organizationAdoption = null
    if (failure === 'inactive') value.organizationAdoption.sdStatus = 'SUSPENDED'
    if (failure === 'not-orderable') value.organizationAdoption.orderable = false
    if (failure === 'not-executable') value.organizationAdoption.executable = false
    if (failure === 'future') value.organizationAdoption.validFrom = '9999-01-01'
    if (failure === 'expired') value.validTo = '2020-01-02'
    if (failure === 'inpatient') value.sdUsageType = 'INPATIENT'
    if (failure === 'global-disabled') value.orderable = false
    f.masterData.searchServices.mockResolvedValue(catalogPage([value]))
    expect(await searchTemplateServices(f.api, '检查', 'org')).toEqual([])
  })
  it.each(['organization', 'catalog', 'chargeable', 'execution', 'period'])('rejects inconsistent or incomplete institution facts: %s', async failure => {
    const f = fixture(), value: any = catalogService()
    if (failure === 'organization') value.organizationAdoption.organizationId = 'other'
    if (failure === 'catalog') value.organizationAdoption.catalogItemId = 'other'
    if (failure === 'chargeable') delete value.organizationAdoption.chargeable
    if (failure === 'execution') delete value.organizationAdoption.executable
    if (failure === 'period') value.organizationAdoption.validTo = '2019-12-31'
    f.masterData.searchServices.mockResolvedValue(catalogPage([value]))
    await expect(searchTemplateServices(f.api, '检查', 'org')).rejects.toThrow()
  })
  it('preserves institutional naming and explicit nonchargeable configuration', async () => {
    const f = fixture(), value = catalogService()
    Object.assign(value.organizationAdoption, { localCode: 'LOCAL', localName: '本院项目', chargeable: false })
    f.masterData.searchServices.mockResolvedValue(catalogPage([value]))
    expect(await searchTemplateServices(f.api, '检查', 'org')).toEqual([
      { id: 'service', code: 'LOCAL', name: '本院项目', unitCode: '次', serviceType: 'EXAMINATION', organizationId: 'org', chargeable: false },
    ])
    expect(f.masterData.searchServices).toHaveBeenCalledWith('检查', '', 'ACTIVE', 'org', 0, 10)
  })
  it('accepts the actual ten-row directory page and rejects a truncated page', async () => {
    const f = fixture(), values = Array.from({ length: 10 }, (_, index) => catalogService(`id-${index}`))
    const page = { content: values, page: 0, size: 10, totalElements: 11, totalPages: 2 }
    f.masterData.searchServices.mockResolvedValue(page)
    expect(await searchTemplateServices(f.api, '检查', 'org')).toHaveLength(10)
    f.masterData.searchServices.mockResolvedValue({ ...page, content: values.slice(0, 8) })
    await expect(searchTemplateServices(f.api, '检查', 'org')).rejects.toThrow('未返回完整')
  })

})
