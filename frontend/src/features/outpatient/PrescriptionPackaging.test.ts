import { formatUnitPrice } from './orders/orderPresentation'
import { describe, expect, it, vi } from 'vitest'
import type { MedicationKnowledge } from '../../shared/api/masterDataApi'
import { resolveDispensableOptions, unitPriceText } from './orders/dispensableOptions'

describe('门诊处方包装与拆零计价', () => {
  it('同时提供整包装和最小单位选项，并优先使用当前机构价格', () => {
    const medication = {
      id: 'med-1', code: 'MED-1', name: '阿莫西林', preparationUnit: '片', products: [{
        id: 'product-1', name: '阿莫西林胶囊', unitCode: '片', sdStatus: 'ACTIVE',
        orderable: true, chargeable: true, validFrom: '2020-01-01',
        organizationAdoption: {
          organizationId: 'org-1', validFrom: '2020-01-01', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true,
        },
        packages: [{
          id: 'package-1', unitCode: 'BOX', unitName: '盒', packageSpec: '14片/盒', quantityFactor: 14,
          defaultDispense: true, defaultSale: true, sdStatus: 'ACTIVE', validFrom: '2020-01-01',
        }],
        prices: [
          { id: 'price-package', organizationId: null, sdStatus: 'ACTIVE', sdPriceType: 'SALE', packageId: 'package-1',
            price: 9, currencyCode: 'CNY', validFrom: '2020-01-01' },
          { id: 'price-base-default', organizationId: null, sdStatus: 'ACTIVE', sdPriceType: 'SALE',
            price: 0.8, currencyCode: 'CNY', validFrom: '2020-01-01' },
          { id: 'price-base-org', organizationId: 'org-1', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
            price: 0.65, currencyCode: 'CNY', validFrom: '2020-01-01' },
        ],
      }],
    } as unknown as MedicationKnowledge

    const options = resolveDispensableOptions(medication, 'org-1')

    expect(options).toHaveLength(2)
    expect(options[0]).toMatchObject({ unitCode: 'BOX', packageFactor: 14, price: 9, split: false })
    expect(options[1]).toMatchObject({ unitCode: '片', packageFactor: 1, price: 0.65, split: true })
  })

  it('没有最小单位价格时不开放拆零计价入口', () => {
    const medication = {
      id: 'med-2', code: 'MED-2', name: '整包装药品', products: [{
        id: 'product-2', name: '整包装药品', unitCode: '支', sdStatus: 'ACTIVE',
        orderable: true, chargeable: true, validFrom: '2020-01-01',
        organizationAdoption: {
          organizationId: 'org-1', validFrom: '2020-01-01', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true,
        },
        packages: [{ id: 'package-2', unitCode: 'BOX', unitName: '盒', quantityFactor: 10,
          defaultDispense: true, defaultSale: true, sdStatus: 'ACTIVE', validFrom: '2020-01-01' }],
        prices: [{ id: 'price-package-2', organizationId: null, sdStatus: 'ACTIVE', sdPriceType: 'SALE', packageId: 'package-2',
          price: 20, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    } as unknown as MedicationKnowledge

    expect(resolveDispensableOptions(medication, 'org-1')).toHaveLength(1)
  })
})

function validMedication(): MedicationKnowledge {
  return {
    id: 'm', preparationUnit: '片', products: [{
      id: 'p', name: '药品', unitCode: '片', validFrom: '2020-01-01', sdStatus: 'ACTIVE',
      orderable: true, chargeable: true,
      organizationAdoption: { organizationId: 'org', validFrom: '2020-01-01', sdStatus: 'ACTIVE',
        orderable: true, chargeable: true, dispensable: true },
      packages: [{ id: 'box', unitCode: 'BOX', unitName: '盒', quantityFactor: 10,
        sdStatus: 'ACTIVE', validFrom: '2020-01-01' }],
      prices: [{ id: 'sale', organizationId: 'org', packageId: 'box', sdStatus: 'ACTIVE',
        sdPriceType: 'SALE', price: 2, currencyCode: 'USD', validFrom: '2020-01-01' }],
    }],
  } as unknown as MedicationKnowledge
}

describe('dispensing rejects unknown catalog facts', () => {
  it.each([null, undefined, '', '2', -1, NaN, Infinity])('does not coerce invalid price %s into a usable sale', price => {
    const medication = validMedication()
    Object.assign(medication.products[0].prices[0], { price })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it.each([null, undefined, '', 'cny', '人民币'])('does not invent currency for %s', currencyCode => {
    const medication = validMedication()
    Object.assign(medication.products[0].prices[0], { currencyCode })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it.each([null, undefined, '', '10', 0, -1, NaN, Infinity])('does not repair invalid package factor %s', quantityFactor => {
    const medication = validMedication()
    Object.assign(medication.products[0].packages[0], { quantityFactor })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it.each(['unitCode', 'unitName'])('requires the actual package %s', field => {
    const medication = validMedication()
    Object.assign(medication.products[0].packages[0], { [field]: '' })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it('does not borrow the knowledge unit when the product base unit is missing', () => {
    const medication = validMedication()
    medication.products[0].unitCode = undefined
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it.each(['product', 'adoption', 'package', 'price'])('requires a real effective period for %s', target => {
    for (const patch of [{ validFrom: undefined }, { validFrom: '2020-02-30' },
      { validFrom: '2999-01-01' }, { validTo: '2020-01-01' }, { validTo: '' }]) {
      const medication = validMedication(), product = medication.products[0]
      Object.assign(target === 'product' ? product : target === 'adoption' ? product.organizationAdoption!
        : target === 'package' ? product.packages[0] : product.prices[0], patch)
      expect(resolveDispensableOptions(medication, 'org')).toEqual([])
    }
  })
  it('rejects truthy strings instead of enabling missing business permissions', () => {
    const medication = validMedication()
    Object.assign(medication.products[0].organizationAdoption!, { dispensable: 'false' })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it('rejects duplicate applicable prices instead of choosing the first', () => {
    const medication = validMedication(), prices = medication.products[0].prices
    prices.push({ ...prices[0], id: 'conflicting-sale', price: 3 })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it('does not fall back to tenant price when the organization price is corrupt', () => {
    const medication = validMedication(), prices = medication.products[0].prices
    prices.push({ ...prices[0], id: 'tenant-sale', organizationId: null } as never)
    Object.assign(prices[0], { price: null })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it('does not treat a missing organization field as an explicit tenant price', () => {
    const medication = validMedication()
    delete medication.products[0].prices[0].organizationId
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it('rejects duplicate package identities', () => {
    const medication = validMedication(), packages = medication.products[0].packages
    packages.push({ ...packages[0], quantityFactor: 20 })
    expect(resolveDispensableOptions(medication, 'org')).toEqual([])
  })
  it('preserves a real zero price and its currency', () => {
    const medication = validMedication()
    medication.products[0].prices[0].price = 0
    expect(resolveDispensableOptions(medication, 'org')[0]).toMatchObject({ price: 0, currencyCode: 'USD' })
  })
  it('does not display tiny prices as zero or unknown amounts as CNY', () => {
    expect(unitPriceText(0.000001, 'USD')).toContain('0.000001')
    expect(unitPriceText(2, '')).toBe('价格待确认')
    expect(unitPriceText(NaN, 'CNY')).toBe('价格待确认')
  })
})

describe('unit price presentation', () => {
  it.each([undefined, '', null, 'cny'])('does not default missing currency %s to CNY', currency => {
    expect(formatUnitPrice(2, currency as string)).toBe('价格待确认')
  })
  it.each([undefined, null, NaN, Infinity, '2', -1])('does not display an unknown amount %s as a price', amount => {
    expect(formatUnitPrice(amount as number, 'CNY')).toBe('价格待确认')
  })
  it('preserves actual zero and tiny amounts', () => {
    expect(formatUnitPrice(0, 'CNY')).toBe('¥0.00')
    expect(formatUnitPrice(0.000001, 'CNY')).toContain('0.000001')
    expect(formatUnitPrice(1e-25, 'CNY')).toBe('CNY 1e-25')
  })
  it('uses the local calendar day for dispensing eligibility', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date(2026, 0, 2, 0, 30))
      const medication = validMedication()
      medication.products[0].prices[0].validFrom = '2026-01-02'
      medication.products[0].prices[0].validTo = '2026-01-02'
      expect(resolveDispensableOptions(medication, 'org')).toHaveLength(1)
    } finally { vi.useRealTimers() }
  })
})
