export const catalogPage = <T>(content: T[]) => ({ content, totalElements: content.length,
  totalPages: content.length ? 1 : 0, page: 0, size: 10 })
export const catalogProduct = (id = 'product', medicationId = 'med', name = '目录药品') => ({
  product: { id, medicationId, code: `P-${id}`, name, sdStatus: 'ACTIVE', unitCode: '盒' },
  medication: { id: medicationId, code: `M-${medicationId}`, name, sdStatus: 'ACTIVE', preparationSpec: '0.25g', preparationUnit: '粒', defaultDoseUnit: '粒' },
})
export const catalogDisease = () => ({ id: 'diagnosis', systemCode: 'GB_TCM', code: 'A01', display: '目录中医病证',
  sdStatus: 'ACTIVE', sdDiagnosisDomain: 'TCM_SYNDROME' })
export const catalogService = (id = 'service', name = '目录检查项目', serviceType = 'EXAMINATION', organizationId = 'org') => ({
  id, code: 'S1', name, sdStatus: 'ACTIVE', unitCode: '次', sdServiceType: serviceType,
  orderable: true, chargeable: true, sdUsageType: 'OUTPATIENT', validFrom: '2020-01-01',
  organizationAdoption: { id: `adoption-${id}`, organizationId, catalogItemId: id, sdStatus: 'ACTIVE',
    orderable: true, executable: true, chargeable: true, validFrom: '2020-01-01' },
})
