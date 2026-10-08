import { describe, expect, it, vi } from 'vitest'
import { createRhnSessionApi } from '../../../shared/rhnApi'
import { historicalImportFixture } from './historicalPrescriptionImport.testFixtures'
import { resolveHistoricalPrescriptionImport } from './historicalPrescriptionImport'

describe('historical prescription import uses current facts', () => {
  it.each([false, true])('uses the production API paths and propagates catalog denial: %s', async denied => {
    const f = historicalImportFixture()
    const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname === '/api/encounters/history/prescriptions') return new Response(JSON.stringify([f.rx]))
      if (url.pathname === '/api/platform/master-data/medication-routes/active') {
        expect(url.searchParams.get('scene')).toBe('OUTPATIENT')
        return new Response(JSON.stringify(f.routes))
      }
      if (url.pathname === '/api/platform/master-data/order-frequencies/active') {
        expect(url.searchParams.get('organizationId')).toBe('org')
        expect(url.searchParams.get('departmentId')).toBe('dept')
        return new Response(JSON.stringify(f.frequencies))
      }
      if (url.pathname === '/api/encounters/current/orderable-medications') {
        expect(url.searchParams.get('query')).toBe('TEST')
        return denied ? new Response(JSON.stringify({ message: '目录无权访问' }), { status: 403 })
          : new Response(JSON.stringify([f.medication]))
      }
      throw new Error(`Unexpected request: ${url.pathname}`)
    })
    try {
      const api = createRhnSessionApi('test-tenant').withWorkContext({ organizationId: 'org', departmentId: 'dept' })
      const result = resolveHistoricalPrescriptionImport({ ...f.input, api })
      if (denied) await expect(result).rejects.toThrow()
      else expect(await result).toHaveLength(1)
      expect(fetcher.mock.calls).toHaveLength(4)
      expect(fetcher.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(true)
    } finally { fetcher.mockRestore() }
  })
  it('rechecks the current encounter catalog and preserves explicit historical instructions and quantities', async () => {
    const f = historicalImportFixture()
    const [draft] = await resolveHistoricalPrescriptionImport(f.input)
    expect(f.prescriptions).toHaveBeenCalledWith('history')
    expect(f.orderableMedications).toHaveBeenCalledWith('current', 'TEST')
    expect(f.activeOrderFrequencies).toHaveBeenCalledWith('org', 'dept', 'OUTPATIENT', 'MEDICATION')
    expect(draft).toMatchObject({ medicationName: '当前测试药', productName: '当前产品', stockSiteName: '当前药房',
      unitPrice: 2.5, currencyCode: 'USD', availablePackageQuantity: 10, packageUnitName: '盒', quantityManuallySet: true,
      request: { doseValue: 5, quantity: 2, quantityUnit: 'BOX', medicationInstruction: '明确嘱托',
        substitutionAllowed: true, selfProvided: false, pricingRequired: true, allergyReviewConfirmed: true } })
    expect(draft.request).not.toHaveProperty('prescriptionId')
    expect(draft.request).not.toHaveProperty('parentRequestId')
  })
  it.each([{ residentId: 'another' }, { status: 'COMPLETED' }, { organizationId: '' }, { departmentId: '' }])(
    'rejects an invalid target before reading a catalog: %j', async patch => {
      const f = historicalImportFixture(); Object.assign(f.target, patch)
      await expect(resolveHistoricalPrescriptionImport(f.input)).rejects.toThrow(/当前就诊/)
      expect(f.orderableMedications).not.toHaveBeenCalled()
    })
  it.each([
    { quantity: undefined }, { doseValue: 0 }, { catalogItemId: undefined }, { durationUnit: undefined },
    { substitutionAllowed: undefined }, { packageFactor: undefined }, { quantityUnit: '' },
    { selfProvided: true }, { skinTestRequired: undefined }, { routeExecutionType: undefined },
  ])('does not fill missing facts or convert self-provided medication: %j', async patch => {
    const f = historicalImportFixture(); Object.assign(f.rx.medicationRequests[0], patch)
    await expect(resolveHistoricalPrescriptionImport(f.input)).rejects.toThrow(/历史处方未带入/)
  })
  it.each(['foreign-resident', 'foreign-encounter', 'duplicate', 'changed', 'cancelled', 'removed'])(
    'rejects %s historical receipts', async failure => {
      const f = historicalImportFixture(), latest = structuredClone(f.rx)
      if (failure === 'foreign-resident') latest.medicationRequests[0].residentId = 'other'
      if (failure === 'foreign-encounter') latest.encounterId = 'other'
      if (failure === 'changed') latest.medicationRequests[0].doseValue = 99
      if (failure === 'cancelled') latest.status = 'CANCELLED'
      f.prescriptions.mockResolvedValue(failure === 'removed' ? [] : failure === 'duplicate' ? [latest, latest] : [latest])
      await expect(resolveHistoricalPrescriptionImport(f.input)).rejects.toThrow(/历史处方未带入/)
      expect(f.orderableMedications).not.toHaveBeenCalled()
    })
  it.each(['missing', 'ambiguous', 'inactive', 'antimicrobial', 'skin-test', 'price', 'package', 'unit', 'factor', 'stock', 'route', 'frequency'])(
    'rejects unusable current facts: %s', async failure => {
      const f = historicalImportFixture(), product = f.medication.products[0]
      if (failure === 'missing') f.orderableMedications.mockResolvedValue([])
      if (failure === 'ambiguous') f.orderableMedications.mockResolvedValue([f.medication, f.medication])
      if (failure === 'inactive') f.medication.sdStatus = 'SUSPENDED'
      if (failure === 'antimicrobial') f.medication.antimicrobial = true
      if (failure === 'skin-test') f.medication.skinTestRequired = true
      if (failure === 'price') product.prices = []
      if (failure === 'package') product.packages[0].id = 'replacement'
      if (failure === 'unit') product.packages[0].unitCode = 'BAG'
      if (failure === 'factor') product.packages[0].quantityFactor = 20
      if (failure === 'stock') f.medication.availableBaseQuantity = 19
      if (failure === 'route') f.routes[0].executionType = 'INFUSION'
      if (failure === 'frequency') f.frequencies[0].code = 'BID'
      await expect(resolveHistoricalPrescriptionImport(f.input)).rejects.toThrow(/历史处方未带入/)
    })
  it('preserves two selected regimens for the same product and checks their combined stock demand', async () => {
    const f = historicalImportFixture()
    f.rx.medicationRequests.push({ ...f.rx.medicationRequests[0], id: 'med2', doseValue: 10 })
    f.input.selectedIds.push('med2')
    const result = await resolveHistoricalPrescriptionImport(f.input)
    expect(result.map(item => item.request.doseValue)).toEqual([5, 10])
    f.medication.availableBaseQuantity = 30
    await expect(resolveHistoricalPrescriptionImport(f.input)).rejects.toThrow(/所选总量超过/)
  })
  it('rejects the whole selection when one catalog lookup fails', async () => {
    const f = historicalImportFixture()
    f.rx.medicationRequests.push({ ...f.rx.medicationRequests[0], id: 'med2', medicationId: 'm2', medicationCode: 'OTHER' })
    f.input.selectedIds.push('med2')
    f.orderableMedications.mockResolvedValueOnce([f.medication]).mockRejectedValueOnce(new Error('目录读取失败'))
    await expect(resolveHistoricalPrescriptionImport(f.input)).rejects.toThrow('目录读取失败')
  })
  it.each(['missing-snapshot', 'changed-count', 'changed-times', 'changed-policy'])(
    'does not silently change a historical schedule: %s', async failure => {
      const f = historicalImportFixture()
      if (failure === 'missing-snapshot') f.rx.medicationRequests[0].frequencyRule = undefined
      if (failure === 'changed-count') f.frequencies[0].frequencyCount = 2
      if (failure === 'changed-times') f.frequencies[0].executionTimes = ['20:00']
      if (failure === 'changed-policy') f.frequencies[0].firstDayPolicy = 'FROM_ORDER_TIME'
      await expect(resolveHistoricalPrescriptionImport(f.input)).rejects.toThrow(/频次规则/)
    })
})
