import { vi } from 'vitest'
import type { BatchOrderMedicationItem } from '../../../shared/api/encountersApi'
import type { OutpatientPlanTemplate } from '../../../shared/api/outpatientPlanTemplatesApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { historicalImportFixture } from '../ai/historicalPrescriptionImport.testFixtures'
import { groupApi } from '../orders/orderSetImport.testFixtures'

export function templateCatalogFixture() {
  const f = historicalImportFixture(), g = groupApi()
  f.medication.products[0].medicationId = f.medication.id
  f.medication.allergenConceptIds = []
  f.medication.preparationUnit = '片'
  const plan: OutpatientPlanTemplate = { id: 'plan', revision: 1, name: '目录核对方案', scopeType: 'PERSONAL', status: 'ACTIVE',
    sortOrder: 0, useCount: 0, createdAt: '', updatedAt: '', diagnoses: [], tasks: [],
    medications: [{ ...f.rx.medicationRequests[0], lineId: 'line', editorMode: 'regular', categoryCode: 'WESTERN' }],
    services: [{ catalogItemId: 's1', itemCode: 'S1', itemName: '旧项目名称', serviceType: 'LABORATORY',
      quantity: 2, unitCode: '次', performerOrganizationId: 'org', performerDepartmentId: 'lab-dept', clinicalDescription: '明确说明' }],
  }
  const medications = vi.fn().mockResolvedValue([f.medication])
  const autoSplitPreview = vi.fn().mockImplementation(async (_id: string, items: BatchOrderMedicationItem[]) => items.map(item => ({
    categoryCode: item.categoryCode, title: '真实分方预览', ruleReasons: ['分类分方'],
    routeGroupType: item.categoryCode === 'HERBAL' ? 'HERBAL' : item.routeExecutionType === 'INFUSION' ? 'INFUSION' : 'NON_INFUSION',
    stockSiteId: item.selfProvided ? null : 'pharmacy', stockSiteName: item.selfProvided ? null : '当前药房',
    items: [{ item: { ...item, stockSiteId: item.selfProvided ? null : 'pharmacy', stockSiteName: item.selfProvided ? null : '当前药房' }, groupLeader: false }],
  })))
  const api = { encounters: { ...f.api.encounters, autoSplitPreview },
    masterData: { ...f.api.masterData, medications, searchServices: g.api.masterData.searchServices },
    organization: g.api.organization,
  } satisfies { [K in keyof RhnApi]?: Partial<RhnApi[K]> } as unknown as RhnApi
  return { ...f, plan, api, medications, autoSplitPreview, service: g.services[0], department: g.department }
}

// Explicit catalog setup for workstation integration tests only; production never synthesizes these facts.
export function installTemplateCatalog(api: RhnApi, plan: OutpatientPlanTemplate) {
  const f = templateCatalogFixture()
  const medications = plan.medications.map(item => {
    if (!item.catalogItemId || !item.packageId) throw new Error('Test plan must explicitly select its product and package')
    const medication = structuredClone(f.medication), product = medication.products[0]
    Object.assign(medication, { id: item.medicationId, code: item.medicationCode, name: item.medicationName,
      sdMedicationType: item.categoryCode, stockSiteId: '10', stockSiteName: '核实药房', availableBaseQuantity: 1000 })
    Object.assign(product, { id: item.catalogItemId, medicationId: item.medicationId })
    product.organizationAdoption!.organizationId = 'org-1'
    Object.assign(product.packages[0], { id: item.packageId, unitCode: item.quantityUnit, unitName: item.quantityUnit })
    Object.assign(product.prices[0], { organizationId: 'org-1', packageId: item.packageId })
    return medication
  })
  api.masterData.medications = vi.fn().mockImplementation(async code => medications.filter(item => item.code === code))
  api.encounters.orderableMedications = vi.fn().mockImplementation(async (_id, code) => medications.filter(item => item.code === code))
  api.masterData.activeMedicationRoutes = vi.fn().mockResolvedValue(plan.medications.map(item => ({
    id: item.routeCode, code: item.routeCode, name: '口服', executionType: 'NONE',
  })))
  api.masterData.activeOrderFrequencies = vi.fn().mockResolvedValue(plan.medications.map(item => ({
    ...f.frequencies[0], id: item.frequencyCode, code: item.frequencyCode,
  })))
  const services = plan.services.map(item => ({ ...structuredClone(f.service), id: item.catalogItemId,
    code: item.itemCode, name: item.itemName, sdServiceType: item.serviceType, unitCode: item.unitCode,
    organizationAdoption: { ...f.service.organizationAdoption, organizationId: 'org-1' },
    prices: f.service.prices.map(price => ({ ...price, organizationId: 'org-1' })),
  }))
  api.masterData.searchServices = vi.fn().mockImplementation(async code => {
    const content = services.filter(item => item.code === code)
    return { content, totalElements: content.length, totalPages: 1, page: 0, size: 100 }
  }) as RhnApi['masterData']['searchServices']
  api.organization = { ...api.organization, department: vi.fn().mockResolvedValue({
    department: { ...f.department, id: 'dept-1', organizationId: 'org-1', name: '测试执行科室' },
  }) }
  api.encounters.autoSplitPreview = vi.fn().mockImplementation(async (_id: string, items: BatchOrderMedicationItem[]) => [{
    categoryCode: 'WESTERN', title: '门诊西药处方', stockSiteId: '10', stockSiteName: '核实药房',
    routeGroupType: 'NON_INFUSION', ruleReasons: ['分类分方'],
    items: items.map(item => ({ item: { ...item, stockSiteId: '10', stockSiteName: '核实药房' }, groupLeader: false })),
  }])
  return { medications, services }
}
