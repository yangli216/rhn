import { describe, expect, it } from 'vitest'
import type { ExaminationSiteOptions } from '../../../shared/api/encountersApi'
import { examinationSiteError, examinationSiteQuantity, formatBodySites, usesSiteQuantity } from './examinationSites'

const rule = (overrides: Partial<ExaminationSiteOptions> = {}): ExaminationSiteOptions => ({
  catalogItemId: '1', configured: true, bodySiteRequired: true, multiBodySite: true, maxBodySiteCount: 3,
  sitePricingMode: 'PER_SITE', maxChargeableSiteCount: 2,
  sites: [{ code: 'A', name: '胸部' }, { code: 'B', name: '上腹部' }, { code: 'C', name: '盆腔' }],
  ...overrides,
})

describe('examination body sites', () => {
  it('derives quantity like the server: per site, capped by chargeable count, otherwise one', () => {
    expect(examinationSiteQuantity(rule(), 1)).toBe(1)
    expect(examinationSiteQuantity(rule(), 2)).toBe(2)
    expect(examinationSiteQuantity(rule(), 3)).toBe(2)
    expect(examinationSiteQuantity(rule({ sitePricingMode: 'BASE_PLUS_ITEM' }), 3)).toBe(1)
    expect(examinationSiteQuantity(rule({ maxChargeableSiteCount: null }), 3)).toBe(3)
  })

  it('locks quantity only when the item is configured and sites are required or chosen', () => {
    expect(usesSiteQuantity(undefined, 0)).toBe(false)
    expect(usesSiteQuantity(rule({ configured: false }), 0)).toBe(false)
    expect(usesSiteQuantity(rule(), 0)).toBe(true)
    expect(usesSiteQuantity(rule({ bodySiteRequired: false }), 0)).toBe(false)
    expect(usesSiteQuantity(rule({ bodySiteRequired: false }), 1)).toBe(true)
  })

  it('names the item when required sites are missing or exceed the limit', () => {
    expect(examinationSiteError(rule(), '胸部CT', 0)).toBe('“胸部CT”必须选择检查部位')
    expect(examinationSiteError(rule({ sites: [] }), '胸部CT', 0)).toContain('尚未维护可选部位')
    expect(examinationSiteError(rule({ maxBodySiteCount: 1, multiBodySite: false }), '胸部CT', 2)).toBe('“胸部CT”最多选择 1 个部位')
    expect(examinationSiteError(rule(), '胸部CT', 2)).toBe('')
    expect(formatBodySites([{ name: '胸部' }, { name: '上腹部' }])).toBe('胸部、上腹部')
  })
})
