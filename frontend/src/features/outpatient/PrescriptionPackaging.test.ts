import { describe, expect, it } from 'vitest'
import type { MedicationKnowledge } from '../../shared/api/masterDataApi'
import { resolveDispensableOptions } from './PrescriptionListEditor'

describe('门诊处方包装与拆零计价', () => {
  it('同时提供整包装和最小单位选项，并优先使用当前机构价格', () => {
    const medication = {
      id: 'med-1', code: 'MED-1', name: '阿莫西林', preparationUnit: '片', products: [{
        id: 'product-1', name: '阿莫西林胶囊', unitCode: '片', sdStatus: 'ACTIVE',
        orderable: true, chargeable: true,
        organizationAdoption: {
          organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true,
        },
        packages: [{
          id: 'package-1', unitCode: 'BOX', unitName: '盒', packageSpec: '14片/盒', quantityFactor: 14,
          defaultDispense: true, defaultSale: true, sdStatus: 'ACTIVE', validFrom: '2020-01-01',
        }],
        prices: [
          { id: 'price-package', sdStatus: 'ACTIVE', sdPriceType: 'SALE', packageId: 'package-1',
            price: 9, currencyCode: 'CNY', validFrom: '2020-01-01' },
          { id: 'price-base-default', sdStatus: 'ACTIVE', sdPriceType: 'SALE',
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
        orderable: true, chargeable: true,
        organizationAdoption: {
          organizationId: 'org-1', sdStatus: 'ACTIVE', orderable: true, chargeable: true, dispensable: true,
        },
        packages: [{ id: 'package-2', unitCode: 'BOX', unitName: '盒', quantityFactor: 10,
          defaultDispense: true, defaultSale: true, sdStatus: 'ACTIVE', validFrom: '2020-01-01' }],
        prices: [{ id: 'price-package-2', sdStatus: 'ACTIVE', sdPriceType: 'SALE', packageId: 'package-2',
          price: 20, currencyCode: 'CNY', validFrom: '2020-01-01' }],
      }],
    } as unknown as MedicationKnowledge

    expect(resolveDispensableOptions(medication, 'org-1')).toHaveLength(1)
  })
})
