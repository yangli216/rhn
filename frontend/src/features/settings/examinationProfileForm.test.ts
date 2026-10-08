import { describe, expect, it } from 'vitest'
import type { ExaminationProfileInput } from '../../shared/rhnApi'
import { examinationProfileForm, examinationProfileInput } from './examinationProfileForm'

const profile = { serviceId: 'exam1', revision: 1, bodySiteRequired: true, multiBodySite: true,
  sitePricingMode: 'BASE_PLUS_FIXED' as const, includedSiteCount: 1, additionalSitePrice: 80,
  additionalSiteQuantity: 1, variants: [], attachments: [] }

describe('examination pricing form truth', () => {
  it.each(['', ' ', 'NaN', 'Infinity', '-1'])('does not turn invalid price %s into free pricing', (price) => {
    expect(() => examinationProfileInput({ ...examinationProfileForm(profile), additionalSitePrice: price })).toThrow()
  })
  it('preserves explicit zero and decimal prices', () => {
    for (const price of ['0', '0.01', '80.50']) {
      expect(examinationProfileInput({ ...examinationProfileForm(profile), additionalSitePrice: price }).additionalSitePrice).toBe(Number(price))
    }
  })
  it('keeps optional limits unset and preserves actual configured limits', () => {
    const form = examinationProfileForm(profile)
    expect(form.maxBodySiteCount).toBe('')
    expect(form.maxChargeableSiteCount).toBe('')
    expect(examinationProfileInput(form)).toMatchObject({ maxBodySiteCount: undefined, maxChargeableSiteCount: undefined })
    const limited = examinationProfileForm({ ...profile, maxBodySiteCount: 4, maxChargeableSiteCount: 3 })
    expect(examinationProfileInput(limited)).toMatchObject({ maxBodySiteCount: 4, maxChargeableSiteCount: 3 })
  })
  it.each([
    { includedSiteCount: '' }, { includedSiteCount: '1.5' }, { maxBodySiteCount: '0' },
    { maxChargeableSiteCount: '2.5' }, { additionalSiteQuantity: '' }, { additionalSiteQuantity: '0' },
    { maxBodySiteCount: '3', maxChargeableSiteCount: '4' },
  ])('rejects missing or invalid counts without inventing defaults: %j', (invalid) => {
    expect(() => examinationProfileInput({ ...examinationProfileForm(profile), ...invalid })).toThrow()
  })
  it('requires an actual additional charge item and quantity', () => {
    const form = { ...examinationProfileForm(profile), sitePricingMode: 'BASE_PLUS_ITEM' as ExaminationProfileInput['sitePricingMode'] }
    expect(() => examinationProfileInput(form)).toThrow('请选择多部位加收项目')
    expect(examinationProfileInput({ ...form, additionalSiteItemId: 'actual-item', additionalSiteQuantity: '2' }))
      .toMatchObject({ additionalSiteItemId: 'actual-item', additionalSiteQuantity: 2, additionalSitePrice: undefined })
  })
})
