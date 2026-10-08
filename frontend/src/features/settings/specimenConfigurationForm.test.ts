import { describe, expect, it } from 'vitest'
import type { ClinicalConfiguration, ServiceCatalogItem } from '../../shared/rhnApi'
import { specimenForm, specimenConfigurationInput } from './specimenConfigurationForm'

const configuration: ClinicalConfiguration = { serviceId: 'lab', serviceCode: 'LAB', serviceName: '检验项目', serviceType: 'LABORATORY',
  specimenOptions: [{ id: 'serum', code: 'SERUM', name: '血清', sortOrder: 1 }],
  containerOptions: [{ id: 'tube', code: 'TUBE', name: '本机构采集容器', sortOrder: 1 }] }
const services = [{ id: 'unrelated', name: '其他收费项目', chargeable: true, sdStatus: 'ACTIVE' },
  { id: 'actual-fee', name: '容器收费项目', chargeable: true, sdStatus: 'ACTIVE' }] as ServiceCatalogItem[]
function configured() {
  return { ...specimenForm(undefined, 10), specimenItemId: 'serum', containerItemId: 'tube',
    tubeSharingMode: 'SHARE', tubeGroupCode: 'CONFIRMED_GROUP', tubeChargeMode: 'PER_TUBE', tubeChargeItemId: 'actual-fee' }
}

describe('specimen configuration requires actual choices', () => {
  it('does not preselect a specimen, container, sharing policy or charging policy', () => {
    expect(specimenForm(undefined, 10)).toMatchObject({ specimenItemId: '', containerItemId: '',
      tubeSharingMode: '', tubeChargeMode: '', tubeChargeItemId: '', tubeGroupCode: '' })
  })
  it.each([
    { specimenItemId: '' }, { specimenItemId: 'foreign' }, { containerItemId: '' }, { containerItemId: 'foreign' },
    { tubeSharingMode: '' }, { tubeChargeMode: '' }, { tubeGroupCode: '' }, { tubeChargeItemId: '' }, { tubeChargeItemId: 'missing' },
    { baseTubeCount: '' }, { baseTubeCount: '1.5' }, { tubeChargeQuantity: '' }, { tubeChargeQuantity: '0' },
    { tubeChargeMode: 'EXCESS_TUBE', includedTubeCount: '' }, { tubeChargeMode: 'EXCESS_TUBE', includedTubeCount: '-1' },
    { tubeSharingMode: 'BY_TEST_COUNT', maxTestsPerTube: '' },
  ])('rejects missing or invalid facts without picking fallbacks: %j', (invalid) => {
    expect(() => specimenConfigurationInput({ ...configured(), ...invalid }, configuration, services)).toThrow()
  })
  it('preserves the chosen fee instead of the first catalog item, group and actual quantities', () => {
    const result = specimenConfigurationInput({ ...configured(), baseTubeCount: '3', tubeChargeMode: 'EXCESS_TUBE',
      includedTubeCount: '2', tubeChargeQuantity: '0.5' }, configuration, services)
    expect(result).toMatchObject({ specimenItemId: 'serum', containerItemId: 'tube', tubeGroupCode: 'CONFIRMED_GROUP',
      tubeChargeItemId: 'actual-fee', baseTubeCount: 3, includedTubeCount: 2, tubeChargeQuantity: 0.5 })
  })
  it('clears inapplicable group and fee references after explicit separate/no-charge choices', () => {
    const result = specimenConfigurationInput({ ...configured(), tubeSharingMode: 'SEPARATE', tubeChargeMode: 'NONE',
      tubeChargeQuantity: '', includedTubeCount: '' }, configuration, services)
    expect(result.tubeGroupCode).toBeUndefined()
    expect(result.tubeChargeItemId).toBeUndefined()
  })
})
