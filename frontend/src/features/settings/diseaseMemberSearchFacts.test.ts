import { describe, expect, it } from 'vitest'
import { requireDiseaseMemberSearchPage } from './diseaseMemberSearchFacts'

const candidate = { id: 'concept', codeSystemId: 'system', systemCode: 'ICD10', systemName: '疾病目录',
  code: 'I10', display: '原发性高血压', sdStatus: 'ACTIVE', sdDiagnosisDomain: 'WESTERN_MEDICINE' }
const page = { content: [candidate], totalElements: 1, totalPages: 1, page: 0, size: 10 }

describe('disease member search facts', () => {
  it.each([
    null, {}, { ...page, content: undefined }, { ...page, totalElements: undefined },
    { ...page, totalElements: '1' }, { ...page, totalElements: -1 }, { ...page, totalElements: 1.5 },
    { ...page, totalPages: 0 }, { ...page, page: 1 }, { ...page, size: 20 },
    { ...page, content: [] }, { ...page, totalElements: 2 },
    { ...page, content: [candidate, candidate], totalElements: 2 },
    ...['id', 'codeSystemId', 'systemCode', 'systemName', 'code', 'display'].map(field => ({
      ...page, content: [{ ...candidate, [field]: '' }],
    })),
    { ...page, content: [{ ...candidate, sdStatus: 'SUSPENDED' }] },
    { ...page, content: [{ ...candidate, sdDiagnosisDomain: 'UNRECOGNIZED' }] },
  ])('rejects incomplete or contradictory directory responses %#', value => {
    expect(() => requireDiseaseMemberSearchPage(value, 0, '')).toThrow('疾病目录结果未确认')
  })

  it('accepts a real empty response and a partial final page with accurate totals', () => {
    const empty = { content: [], totalElements: 0, totalPages: 0, page: 0, size: 10 }
    expect(requireDiseaseMemberSearchPage(empty, 0, '')).toEqual(empty)
    const last = { ...page, page: 1, totalElements: 11, totalPages: 2 }
    expect(requireDiseaseMemberSearchPage(last, 1, '')).toEqual(last)
  })

  it('keeps an out-of-range page distinct from an empty directory', () => {
    expect(requireDiseaseMemberSearchPage({ ...page, content: [], page: 2 }, 2, '').totalElements).toBe(1)
  })

  it('preserves unknown domain without inventing western medicine, and checks an explicit filter', () => {
    const unknown = { ...page, content: [{ ...candidate, sdDiagnosisDomain: null }] }
    expect(requireDiseaseMemberSearchPage(unknown, 0, '').content[0].sdDiagnosisDomain).toBeNull()
    expect(() => requireDiseaseMemberSearchPage(unknown, 0, 'WESTERN_MEDICINE')).toThrow()
    expect(() => requireDiseaseMemberSearchPage(page, 0, 'TCM_DISEASE')).toThrow()
    expect(requireDiseaseMemberSearchPage(page, 0, 'WESTERN_MEDICINE').content[0].id).toBe('concept')
  })
})
