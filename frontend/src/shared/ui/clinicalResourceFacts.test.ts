import { describe, expect, it } from 'vitest'
import { clinicalReferencePrices, clinicalMedicationType, clinicalStockText } from './clinicalResourceFacts'

const at = '2026-10-03'
const price = { price: 15.6, currencyCode: 'CNY', sdStatus: 'ACTIVE', sdPriceType: 'SALE', organizationId: null, validFrom: '2020-01-01' }
const pack = { id: 'box', unitName: '盒', packageSpec: '20片/盒', sdStatus: 'ACTIVE', validFrom: '2020-01-01' }
const subject = { name: '药品产品', unitCode: '片', sdStatus: 'ACTIVE', validFrom: '2020-01-01', prices: [price], packages: [pack] }
const format = (value: unknown = [subject], org?: string) => clinicalReferencePrices(value, org, at)

describe('clinical price evidence', () => {
  it('keeps currencies, units and package identities separate without combining incomparable prices', () => {
    const data = [{ ...subject, prices: [{ ...price, price: .000123 }, { ...price, packageId: 'box', currencyCode: 'USD', price: 15.6 }] }]
    expect(format(data)).toBe('参考销售价：CNY 0.000123/片；USD 15.60/盒（20片/盒）')
    expect(format(data)).not.toContain('~')
    expect(format(data)).not.toContain('¥')
  })
  it('selects the current organization price over its tenant price and excludes other organizations', () => {
    const data = [{ ...subject, prices: [price, { ...price, price: 10, organizationId: 'org' }, { ...price, price: 2, organizationId: 'other' }] }]
    expect(format(data, 'org')).toBe('参考销售价：CNY 10.00/片')
    expect(format(data)).toBe('参考销售价：CNY 15.60/片')
  })
  it('retains zero and tiny prices exactly as received without rounding to a free price', () => {
    expect(format([{ ...subject, prices: [{ ...price, price: 0 }] }])).toContain('CNY 0.00/片')
    expect(format([{ ...subject, prices: [{ ...price, price: 1e-30 }] }])).toContain('CNY 1e-30/片')
  })
  it.each([
    { sdStatus: undefined }, { sdStatus: 'UNKNOWN' }, { sdPriceType: undefined }, { organizationId: undefined },
    { currencyCode: undefined }, { currencyCode: '' }, { price: undefined }, { price: '15' }, { price: NaN }, { price: Infinity },
    { price: -1 }, { validFrom: undefined }, { validFrom: '2026-02-30' }, { validTo: '2019-01-01' }, { packageId: 'missing' },
  ])('does not substitute missing or invalid price facts %#', patch => {
    expect(format([{ ...subject, prices: [{ ...price, ...patch }] }])).toBe('参考销售价待确认')
  })
  it.each([undefined, null, {}, [{ ...subject, prices: undefined }], [{ ...subject, prices: {} }], [{ ...subject, unitCode: undefined }],
    [{ ...subject, prices: [price, price] }], [{ ...subject, sdStatus: undefined }], [{ ...subject, validFrom: undefined }]])(
    'does not treat incomplete price subjects as free or price-less %#', value => {
      expect(clinicalReferencePrices(value, undefined, at)).toBe('参考销售价待确认')
    })
  it.each([{ sdStatus: 'SUSPENDED' }, { sdPriceType: 'PURCHASE' }, { validFrom: '2027-01-01' }, { validTo: '2026-10-02' }])(
    'excludes a price outside the current sale context %#', patch => {
      expect(format([{ ...subject, prices: [{ ...price, ...patch }] }])).toBe('暂无有效销售价')
    })
  it.each([{ packages: [] }, { packages: [pack, pack] }, { packages: [{ ...pack, unitName: undefined }] },
    { packages: [{ ...pack, sdStatus: 'INACTIVE' }] }, { packages: [{ ...pack, validTo: '2025-01-01' }] }])(
    'does not guess a package unit or use an inactive package %#', patch => {
      expect(format([{ ...subject, ...patch, prices: [{ ...price, packageId: 'box' }] }])).toBe('参考销售价待确认')
    })
  it('identifies products separately and does not synthesize a price range across them', () => {
    expect(format([subject, { ...subject, name: '另一产品', prices: [{ ...price, price: 20 }] }]))
      .toBe('参考销售价：药品产品：CNY 15.60/片；另一产品：CNY 20.00/片')
  })
})

describe('clinical type and stock evidence', () => {
  it('does not classify missing, custom, patented Chinese medicines or vaccines as western medicines', () => {
    expect(clinicalMedicationType({})).toBe('药品类型待确认')
    expect(clinicalMedicationType({ sdMedicationType: 'CHINESE_PATENT' })).toBe('中成药')
    expect(clinicalMedicationType({ sdMedicationType: 'VACCINE' })).toBe('疫苗')
    expect(clinicalMedicationType({ sdMedicationType: 'CUSTOM' })).toBe('药品类型：CUSTOM')
    expect(clinicalMedicationType({ sdMedicationType: 'CUSTOM', sdMedicationTypeText: '实际字典名称' })).toBe('实际字典名称')
  })
  it.each([undefined, NaN, Infinity])('does not turn unknown quantity %s into out-of-stock', quantity => {
    expect(clinicalStockText({ stockSiteName: '门诊药房', availablePackageQuantity: quantity })).toBe('门诊药房（库存待确认）')
  })
  it('distinguishes zero, negative quantity, unknown units and missing stock sites', () => {
    expect(clinicalStockText({ stockSiteName: '门诊药房', availablePackageQuantity: 0 })).toContain('缺药')
    expect(clinicalStockText({ stockSiteName: '门诊药房', availablePackageQuantity: -2 })).toContain('异常：-2')
    expect(clinicalStockText({ stockSiteName: '门诊药房', availablePackageQuantity: 10 })).toContain('单位待确认')
    expect(clinicalStockText({ availablePackageQuantity: 10, packageUnitName: '盒' })).toBe('库存所属药房待确认')
    expect(clinicalStockText({ stockSiteName: '门诊药房', availablePackageQuantity: 10, packageUnitName: '盒' })).toContain('可用: 10盒')
  })
})
