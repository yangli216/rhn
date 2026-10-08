import { vi } from 'vitest'
import type { OrderableMedicationKnowledge, Prescription } from '../../../shared/api/encountersApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'

export function historicalImportFixture() {
  const frequencyRule = { id: 'frequency', code: 'QD', name: '每日一次', ruleType: 'TIMES_PER_PERIOD',
    frequencyCount: 1, periodValue: 1, periodUnit: 'D', anchorType: 'STANDARD_TIME', executionTimes: ['08:00'], firstDayPolicy: 'REMAINING_SLOTS' }
  const source: Encounter = { id: 'history', residentId: 'resident', encounterNo: 'H1', organizationId: 'old-org',
    departmentId: 'old-dept', status: 'COMPLETED', registeredAt: new Date().toISOString(), diagnoses: [] }
  const target: Encounter = { ...source, id: 'current', encounterNo: 'C1', organizationId: 'org', departmentId: 'dept', status: 'IN_PROGRESS' }
  const rx: Prescription = { id: 'rx', revision: 1, residentId: 'resident', encounterId: 'history', status: 'ACTIVE',
    performerOrganizationId: 'old-org', performerDepartmentId: 'old-dept', authoredAt: source.registeredAt,
    categoryCode: 'WESTERN', prescriptionNo: 'RX-1', medicationRequests: [
      { id: 'med', revision: 1, prescriptionId: 'rx', residentId: 'resident', encounterId: 'history', status: 'ACTIVE',
        requestNo: 'MR-1', itemCode: 'PRODUCT', medicationType: 'WESTERN', authoredAt: source.registeredAt,
        itemAttributeSnapshot: {}, itemAttributeHash: 'test-hash', medicationSnapshot: {}, standardMappings: [],
        medicationId: 'm', medicationName: '历史测试药', medicationCode: 'TEST', itemName: '旧产品名称',
        catalogItemId: 'product', packageId: 'box', doseValue: 5, doseUnit: 'mg', routeCode: 'PO', routeExecutionType: 'NONE',
        frequencyCode: 'QD', frequencyRule: { ...frequencyRule }, durationValue: 5, durationUnit: 'd', quantity: 2, quantityUnit: 'BOX',
        baseQuantity: 20, packageFactor: 10, baseUnit: '片', medicationInstruction: '明确嘱托',
        antimicrobial: false, skinTestRequired: false, substitutionAllowed: true, selfProvided: false },
    ] }
  const medication = { id: 'm', code: 'TEST', name: '当前测试药', sdStatus: 'ACTIVE', sdMedicationType: 'WESTERN',
    antimicrobial: false, skinTestRequired: false, stockSiteId: 'pharmacy', stockSiteName: '当前药房',
    availableBaseQuantity: 100, availablePackageQuantity: 100, baseUnitCode: '片',
    products: [{ id: 'product', name: '当前产品', unitCode: '片', sdStatus: 'ACTIVE', orderable: true, chargeable: true,
      validFrom: '2020-01-01', organizationAdoption: { organizationId: 'org', sdStatus: 'ACTIVE',
        orderable: true, chargeable: true, dispensable: true, validFrom: '2020-01-01' },
      packages: [{ id: 'box', unitCode: 'BOX', unitName: '盒', quantityFactor: 10, sdStatus: 'ACTIVE', validFrom: '2020-01-01' }],
      prices: [{ id: 'price', packageId: 'box', organizationId: 'org', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
        price: 2.5, currencyCode: 'USD', validFrom: '2020-01-01' }],
    }],
  } as unknown as OrderableMedicationKnowledge
  const prescriptions = vi.fn().mockResolvedValue([rx])
  const orderableMedications = vi.fn().mockResolvedValue([medication])
  const routes = [{ id: 'route', code: 'PO', name: '口服', executionType: 'NONE' }]
  const frequencies = [{ ...frequencyRule }]
  const activeMedicationRoutes = vi.fn().mockResolvedValue(routes)
  const activeOrderFrequencies = vi.fn().mockResolvedValue(frequencies)
  const api = { encounters: { prescriptions, orderableMedications }, masterData: {
    activeMedicationRoutes, activeOrderFrequencies,
  } } as unknown as RhnApi
  const input = { source, target, viewed: [rx], selectedIds: ['med'], api, allergyOverrideReason: '' }
  return { input, rx, medication, api, source, target, prescriptions, orderableMedications, routes, frequencies,
    activeMedicationRoutes, activeOrderFrequencies }
}
