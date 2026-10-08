import { describe, expect, it } from 'vitest'
import { requireCatalogCandidates, requireCatalogOrganizations, requireCatalogSource, requireCatalogSourceReceipt } from './organizationCatalogFacts'

const independent = { organizationId: 'org', organizationName: '医院', organizationRevision: 1,
  sourceOrganizationId: null, sourceOrganizationName: null }
const context = { organizationId: 'org', sourceOrganizationId: 'shared', itemType: 'SERVICE' as const, page: 0, size: 20 }
const adoption = { id: 'a', revision: 1, organizationId: 'org', catalogItemId: 'c', orderable: true,
  executable: true, chargeable: true, purchasable: false, stocked: false, dispensable: false, returnable: false,
  sdStatus: 'ACTIVE', sdStatusText: '启用', validFrom: '2026-01-01' }
const candidate = { id: 'c', code: 'C', name: '检验', itemType: 'SERVICE', centerStatus: 'ACTIVE',
  adoptionSourceType: 'LOCAL', adoption, packages: [] }
const page = { content: [candidate], totalElements: 1, totalPages: 1, page: 0, size: 20 }

describe('organization catalog facts', () => {
  it('requires explicit independent source and matching organization', () => {
    expect(requireCatalogSource(independent, 'org')).toEqual(independent)
    for (const data of [{}, { ...independent, sourceOrganizationId: undefined },
      { ...independent, sourceOrganizationName: undefined }, { ...independent, organizationRevision: undefined },
      { ...independent, sourceOrganizationId: 'shared' }, { ...independent, organizationId: 'other' },
      { ...independent, sourceOrganizationId: 'org', sourceOrganizationName: '医院' }]) {
      expect(() => requireCatalogSource(data, 'org')).toThrow('目录来源')
    }
  })
  it('requires exact saved source and advanced revision', () => {
    const saved = { ...independent, organizationRevision: 2, sourceOrganizationId: 'shared', sourceOrganizationName: '分院' }
    expect(requireCatalogSourceReceipt(saved, independent, 'shared')).toEqual(saved)
    expect(requireCatalogSourceReceipt({ ...independent, organizationRevision: 3 }, saved, '')).toMatchObject({ sourceOrganizationId: null })
    for (const data of [{}, independent, { ...saved, organizationRevision: 1 }, { ...saved, sourceOrganizationId: 'other' }]) {
      expect(() => requireCatalogSourceReceipt(data, independent, 'shared')).toThrow()
    }
  })
  it('validates organization options without fabricating absent lists', () => {
    expect(requireCatalogOrganizations([])).toEqual([])
    const org = { id: 'org', code: 'ORG', name: '医院', sdOrgKind: 'LEGAL_ORGANIZATION' }
    expect(requireCatalogOrganizations([org])).toEqual([org])
    for (const data of [undefined, {}, [org, org], [{ ...org, sdOrgKind: 'ORG_UNIT' }]]) {
      expect(() => requireCatalogOrganizations(data)).toThrow('来源机构目录')
    }
  })
  it('accepts explicit empty pages and actual local/shared/unadopted facts', () => {
    expect(requireCatalogCandidates(page, context)).toEqual(page)
    for (const [adoptionSourceType, value] of [['NONE', null], ['SHARED', { ...adoption, organizationId: 'shared' }]]) {
      expect(requireCatalogCandidates({ ...page, content: [{ ...candidate, adoptionSourceType, adoption: value }] }, context)).toBeTruthy()
    }
    expect(requireCatalogCandidates({ ...page, content: [], totalElements: 0, totalPages: 0 }, context).content).toEqual([])
    expect(requireCatalogCandidates({ ...page, page: 2, content: [] }, { ...context, page: 2 }).page).toBe(2)
  })
  it.each([
    {}, { ...page, totalElements: undefined }, { ...page, totalPages: 0 }, { ...page, page: 1 },
    { ...page, size: 50 }, { ...page, content: [] }, { ...page, totalElements: 2, content: [candidate, candidate] },
  ])('rejects malformed pagination %#', data => {
    expect(() => requireCatalogCandidates(data, context)).toThrow('机构候选项目')
  })
  it.each([
    { itemType: 'MED_PRODUCT' }, { adoptionSourceType: 'UNKNOWN' }, { packages: undefined },
    { adoptionSourceType: 'NONE' }, { adoptionSourceType: 'SHARED' }, { adoption: undefined },
    { adoption: { ...adoption, catalogItemId: 'other' } }, { adoption: { ...adoption, stocked: undefined } },
    { adoption: { ...adoption, sdStatusText: undefined } }, { adoption: { ...adoption, validFrom: '2026-02-30' } },
    { packages: [{ id: 'p', unitCode: 'BOX' }] },
  ])('rejects incomplete or mismatched candidate facts %#', patch => {
    expect(() => requireCatalogCandidates({ ...page, content: [{ ...candidate, ...patch }] }, context)).toThrow()
  })
})
