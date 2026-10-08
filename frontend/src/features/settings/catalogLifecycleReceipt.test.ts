import { describe, expect, it } from 'vitest'
import type { CatalogLifecycle, CatalogPrice, LifecycleAdoptionInput, LifecyclePriceInput, OrganizationAdoption } from '../../shared/rhnApi'
import { assertCatalogLifecycleCommand, requireCatalogLifecycleReceipt, requirePersistedCatalogReceipt, type CatalogLifecycleCommand } from './catalogLifecycleReceipt'
const at = '2026-10-03'
const adoption: OrganizationAdoption = { id: 'a1', revision: 1, organizationId: 'org', catalogItemId: 'item', localCode: 'CODE', localName: '名称',
  orderable: true, executable: true, chargeable: false, purchasable: false, stocked: false, dispensable: false, returnable: false,
  sdStatus: 'ACTIVE', sdStatusText: '启用', validFrom: '2026-01-01' }
const price: CatalogPrice = { id: 'p1', revision: 2, organizationId: 'org', sdPriceType: 'SALE', sdPriceTypeText: '销售价',
  price: 0.123456, currencyCode: 'USD', priceDocumentCode: 'DOC', priceReason: '依据', sdStatus: 'ACTIVE', sdStatusText: '启用', validFrom: '2026-01-01' }
function snapshot(adoptions: OrganizationAdoption[] = [], prices: CatalogPrice[] = [], businessDate = at): CatalogLifecycle {
  const effective = (row: OrganizationAdoption | CatalogPrice) => row.sdStatus !== 'SUSPENDED' && row.validFrom <= businessDate && (!row.validTo || row.validTo >= businessDate)
  return { catalogItemId: 'item', organizationId: 'org', businessDate, currentAdoption: adoptions.find(effective) ?? null,
    adoptionHistory: adoptions, currentPrices: prices.filter(effective).map(row => ({ ...row, organizationId: row.organizationId ?? null })),
    priceHistory: prices.map(row => ({ ...row, organizationId: row.organizationId ?? null })) } as unknown as CatalogLifecycle
}
const adoptionInput: LifecycleAdoptionInput = { organizationId: 'org', localCode: ' CODE ', localName: ' 名称 ', orderable: true,
  executable: true, chargeable: false, purchasable: false, stocked: false, dispensable: false, returnable: false,
  status: 'ACTIVE', validFrom: '2026-01-01' }
const priceInput: LifecyclePriceInput = { organizationId: 'org', priceType: 'SALE', price: 0.123456, currencyCode: ' USD ',
  priceDocumentCode: ' DOC ', priceReason: ' 依据 ', status: 'ACTIVE', validFrom: '2026-01-01' }
const empty = snapshot()
const createAdoption: CatalogLifecycleCommand = { kind: 'adoption-save', input: adoptionInput }
const createPrice: CatalogLifecycleCommand = { kind: 'price-save', input: priceInput }

describe('catalog lifecycle mutation evidence', () => {
  it('accepts new records with backend text normalization and actual prices', () => {
    expect(requireCatalogLifecycleReceipt(snapshot([adoption]), empty, createAdoption, at)).toBeTruthy()
    expect(requireCatalogLifecycleReceipt(snapshot([], [price]), empty, createPrice, at)).toBeTruthy()
  })
  it.each(['localCode', 'localName', 'defaultDepartmentId', 'orderable', 'executable', 'chargeable', 'purchasable', 'stocked', 'dispensable', 'returnable', 'validFrom', 'validTo', 'replacesAdoptionId'])('rejects adoption field mismatch: %s', key => {
    const value = { ...adoption, [key]: typeof (adoption as unknown as Record<string, unknown>)[key] === 'boolean'
      ? !(adoption as unknown as Record<string, unknown>)[key] : key === 'validFrom' ? '2026-01-02' : key === 'validTo' ? '2026-12-31' : 'wrong' }
    expect(() => requireCatalogLifecycleReceipt(snapshot([value]), empty, createAdoption, at)).toThrow()
  })
  it.each(['packageId', 'sdPriceType', 'price', 'currencyCode', 'priceDocumentCode', 'priceReason', 'validFrom', 'validTo', 'replacesPriceId'])('rejects price field mismatch: %s', key => {
    const value = { ...price, [key]: key === 'price' ? 12 : key === 'validFrom' ? '2026-01-02' : key === 'validTo' ? '2026-12-31' : 'wrong' }
    expect(() => requireCatalogLifecycleReceipt(snapshot([], [value]), empty, createPrice, at)).toThrow()
  })
  it('does not accept a structurally valid snapshot without the added record', () => {
    expect(() => requireCatalogLifecycleReceipt(empty, empty, createAdoption, at)).toThrow()
    expect(() => requireCatalogLifecycleReceipt(empty, empty, createPrice, at)).toThrow()
  })
  it.each(['adoption', 'price'] as const)('requires exact %s replacement link, end date, advanced original revision and preserved fields', kind => {
    const old = kind === 'adoption' ? adoption : price
    const command: CatalogLifecycleCommand = kind === 'adoption'
      ? { kind: 'adoption-save', input: { ...adoptionInput, validFrom: at }, replaced: adoption }
      : { kind: 'price-save', input: { ...priceInput, validFrom: at }, replaced: price }
    const ended = { ...old, revision: old.revision + 1, sdStatus: 'REPLACED' as const, validTo: '2026-10-02' }
    const added = { ...old, id: 'new', revision: 0, validFrom: at, [kind === 'adoption' ? 'replacesAdoptionId' : 'replacesPriceId']: old.id }
    const snap = (first = added, second = ended) => kind === 'adoption'
      ? snapshot([first as OrganizationAdoption, second as OrganizationAdoption]) : snapshot([], [first as CatalogPrice, second as CatalogPrice])
    const before = kind === 'adoption' ? snapshot([adoption]) : snapshot([], [price])
    expect(requireCatalogLifecycleReceipt(snap(), before, command, at)).toBeTruthy()
    for (const patch of [{ revision: old.revision }, { validTo: '2026-10-01' }, { sdStatus: 'ACTIVE' },
      kind === 'adoption' ? { localName: 'overwritten' } : { price: 999 }]) {
      expect(() => requireCatalogLifecycleReceipt(snap(added, { ...ended, ...patch } as typeof ended), before, command, at)).toThrow()
    }
    expect(() => requireCatalogLifecycleReceipt(snap({ ...added, [kind === 'adoption' ? 'replacesAdoptionId' : 'replacesPriceId']: 'wrong' }), before, command, at)).toThrow()
    expect(() => requireCatalogLifecycleReceipt(kind === 'adoption' ? snapshot([added as OrganizationAdoption]) : snapshot([], [added as CatalogPrice]), before, command, at)).toThrow()
  })
  it.each(['adoption', 'price'] as const)('checks all %s status transitions and rejects silent field changes', kind => {
    for (const target of ['SUSPENDED', 'ACTIVE', 'RETIRED'] as const) {
      const old = { ...(kind === 'adoption' ? adoption : price), sdStatus: target === 'ACTIVE' ? 'SUSPENDED' as const : 'ACTIVE' as const }
      const before = kind === 'adoption' ? snapshot([old as OrganizationAdoption]) : snapshot([], [old as CatalogPrice])
      const command = { kind: `${kind}-status`, original: old, status: target, validTo: target === 'RETIRED' ? at : undefined } as CatalogLifecycleCommand
      const actual = { ...old, revision: old.revision + 1, sdStatus: target, validTo: target === 'RETIRED' ? at : undefined }
      const snap = (row: typeof actual) => kind === 'adoption' ? snapshot([row as OrganizationAdoption]) : snapshot([], [row as CatalogPrice])
      expect(requireCatalogLifecycleReceipt(snap(actual), before, command, at)).toBeTruthy()
      expect(() => requireCatalogLifecycleReceipt(snap({ ...actual, revision: old.revision }), before, command, at)).toThrow()
      expect(() => requireCatalogLifecycleReceipt(snap({ ...actual, id: 'other' }), before, command, at)).toThrow()
      expect(() => requireCatalogLifecycleReceipt(snap({ ...actual, [kind === 'adoption' ? 'localCode' : 'currencyCode']: 'WRONG' }), before, command, at)).toThrow()
    }
  })
  it('does not accept deletions or edits to unrelated history', () => {
    const before = snapshot([], [price]), valid = snapshot([adoption], [price])
    expect(requireCatalogLifecycleReceipt(valid, before, createAdoption, at)).toBeTruthy()
    expect(() => requireCatalogLifecycleReceipt(snapshot([adoption]), before, createAdoption, at)).toThrow()
    expect(() => requireCatalogLifecycleReceipt(snapshot([adoption], [{ ...price, price: 99 }]), before, createAdoption, at)).toThrow()
  })
  it('does not let extra metadata change which price fields are checked', () => {
    const response = snapshot([], [{ ...price, price: 999, catalogItemId: 'item' } as CatalogPrice])
    expect(() => requireCatalogLifecycleReceipt(response, empty, createPrice, at)).toThrow()
    const before = snapshot([], [{ ...price, catalogItemId: 'item' } as CatalogPrice])
    expect(() => requireCatalogLifecycleReceipt(snapshot([adoption], [{ ...price, price: 999, catalogItemId: 'item' } as CatalogPrice]), before, createAdoption, at)).toThrow()
  })
  it('does not issue duplicate creates, mutate another scope, or replace stale versions', () => {
    expect(() => assertCatalogLifecycleCommand(snapshot([adoption]), createAdoption)).toThrow('已有')
    expect(() => assertCatalogLifecycleCommand(snapshot([], [price]), createPrice)).toThrow('已有')
    expect(() => assertCatalogLifecycleCommand(snapshot([adoption]), { kind: 'adoption-status', original: { ...adoption, revision: 0 }, status: 'SUSPENDED' })).toThrow('原版本')
    expect(() => assertCatalogLifecycleCommand(snapshot([], [price]), { kind: 'price-save', input: { ...priceInput, validFrom: at, priceType: 'PURCHASE' }, replaced: price })).toThrow('包装和价格类型')
    expect(() => assertCatalogLifecycleCommand(empty, { ...createAdoption, input: { ...adoptionInput, validFrom: '2026-02-30' } })).toThrow('日期')
  })
  it('requires the reread to retain the exact saved IDs, revisions and fields', () => {
    const receipt = snapshot([adoption], [price])
    expect(() => requirePersistedCatalogReceipt(receipt, snapshot([adoption], [price], '2026-10-04'))).not.toThrow()
    expect(() => requirePersistedCatalogReceipt(receipt, snapshot([{ ...adoption, id: 'different' }], [price]))).toThrow('实际记录')
    expect(() => requirePersistedCatalogReceipt(receipt, snapshot([adoption], [{ ...price, revision: 99 }]))).toThrow('实际记录')
  })
})
