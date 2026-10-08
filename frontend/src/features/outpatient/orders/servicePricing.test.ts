import { describe, expect, it } from 'vitest'
import type { ServiceCatalogItem } from '../../../shared/api/masterDataApi'
import { resolveServicePricing } from './servicePricing'

const catalog = (): ServiceCatalogItem => ({ id: 's', unitCode: '次', sdStatus: 'ACTIVE', sdUsageType: 'OUTPATIENT',
  orderable: true, chargeable: true, validFrom: '2020-01-01', organizationAdoption: {
    organizationId: 'org', sdStatus: 'ACTIVE', orderable: true, chargeable: true, validFrom: '2020-01-01',
  }, prices: [{ id: 'sale', organizationId: 'org', packageId: null, sdPriceType: 'SALE', sdStatus: 'ACTIVE',
    price: 2, currencyCode: 'USD', validFrom: '2020-01-01' }],
}) as unknown as ServiceCatalogItem

describe('outpatient service pricing', () => {
  it('prefers the current organization SALE price rather than the first or purchase price', () => {
    const item = catalog(), price = item.prices[0]
    item.prices.unshift({ ...price, id: 'purchase', sdPriceType: 'PURCHASE', price: 0.1 },
      { ...price, id: 'other-org', organizationId: 'other', price: 1 },
      { ...price, id: 'tenant', organizationId: null, price: 1.5 } as never)
    expect(resolveServicePricing(item, 'org').price).toBe(price)
  })
  it.each([{ sdStatus: 'INACTIVE' }, { validFrom: '2999-01-01' }, { validTo: '2020-01-01' },
    { organizationId: 'other' }, { sdPriceType: 'PURCHASE' }])('never falls back to an unusable first price: %j', patch => {
    const item = catalog()
    Object.assign(item.prices[0], patch)
    expect(resolveServicePricing(item, 'org').error).toContain('未配置有效销售价格')
  })
  it.each([{ price: null }, { price: '' }, { price: '2' }, { price: -1 }, { price: NaN }, { price: Infinity },
    { currencyCode: undefined }, { currencyCode: '' }, { organizationId: undefined }, { validFrom: undefined },
    { validFrom: '2026-02-30' }, { validTo: '' }, { packageId: 'box' }, { sdPriceType: undefined }, { sdStatus: undefined }])(
    'does not hide damaged price facts behind a tenant fallback: %j', patch => {
      const item = catalog()
      item.prices.push({ ...item.prices[0], id: 'tenant', organizationId: null } as never)
      Object.assign(item.prices[0], patch)
      expect(resolveServicePricing(item, 'org').price).toBeUndefined()
    })
  it('rejects ambiguous prices and accepts a genuine zero tenant price', () => {
    const item = catalog()
    item.prices.push({ ...item.prices[0], id: 'conflict' })
    expect(resolveServicePricing(item, 'org').error).toContain('多条')
    item.prices = [{ ...item.prices[0], organizationId: null, price: 0 }] as never
    expect(resolveServicePricing(item, 'org').price).toMatchObject({ price: 0, currencyCode: 'USD' })
  })
  it.each([{ chargeable: undefined }, { orderable: 'false' }, { unitCode: undefined }, { validFrom: undefined },
    { sdUsageType: 'INPATIENT' }, { validTo: '2020-01-01' }, { prices: null }])('rejects unconfirmed catalog facts: %j', patch => {
    expect(resolveServicePricing(Object.assign(catalog(), patch), 'org').price).toBeUndefined()
  })
  it('requires effective local adoption and known charging permission', () => {
    const item = catalog()
    Object.assign(item.organizationAdoption!, { chargeable: undefined })
    expect(resolveServicePricing(item, 'org').price).toBeUndefined()
    Object.assign(item.organizationAdoption!, { chargeable: true, validFrom: undefined })
    expect(resolveServicePricing(item, 'org').price).toBeUndefined()
  })
})
