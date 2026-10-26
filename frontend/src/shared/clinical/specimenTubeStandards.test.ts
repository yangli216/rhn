import { describe, expect, it } from 'vitest'
import {
  SPECIMEN_REJECTION_REASONS,
  SPECIMEN_TUBE_STANDARDS,
  findSpecimenTubeByCode,
} from './specimenTubeStandards'

describe('specimenTubeStandards (YY/T 0314-2007 / ISO 6710)', () => {
  it('defines valid specimen tube standards with unique codes and proper semantic tokens', () => {
    const codes = new Set<string>()
    const validColorKeys = ['purple', 'yellow', 'red', 'blue', 'green', 'gray', 'black', 'orange', 'default']
    for (const tube of SPECIMEN_TUBE_STANDARDS) {
      expect(tube.tubeCode).toMatch(/^TUBE_[A-Z_]+|CONTAINER_[A-Z_]+$/)
      expect(codes.has(tube.tubeCode)).toBe(false)
      codes.add(tube.tubeCode)

      expect(validColorKeys).toContain(tube.capColorKey)
      expect(tube.capColorToken).toMatch(/^var\(--color-specimen-cap-[a-z]+\)$/)
      expect(tube.tubeName.length).toBeGreaterThan(0)
      expect(tube.additive.length).toBeGreaterThan(0)
      expect(tube.mixingInstructions.length).toBeGreaterThan(0)
      expect(tube.clinicalApplications.length).toBeGreaterThan(0)
    }
  })

  it('defines standard preanalytical rejection reasons with unique codes', () => {
    const reasonCodes = new Set<string>()
    for (const reason of SPECIMEN_REJECTION_REASONS) {
      expect(reason.code).toMatch(/^REJECT_[A-Z_]+$/)
      expect(reasonCodes.has(reason.code)).toBe(false)
      reasonCodes.add(reason.code)

      expect(['PREANALYTICAL_QUALITY', 'VOLUME', 'IDENTITY', 'CONTAINER']).toContain(reason.category)
      expect(reason.name.length).toBeGreaterThan(0)
      expect(reason.description.length).toBeGreaterThan(0)
    }
  })

  it('looks up tube by code correctly', () => {
    const purple = findSpecimenTubeByCode('TUBE_PURPLE_EDTA')
    expect(purple).toBeDefined()
    expect(purple?.specimenType).toBe('全血')
    expect(purple?.colorName).toContain('紫色')

    expect(findSpecimenTubeByCode('NON_EXISTENT')).toBeUndefined()
    expect(findSpecimenTubeByCode(undefined)).toBeUndefined()
  })

  it('matches a standard tube from the hospital container code or name, never from the test item', () => {
    expect(findSpecimenTubeByCode('EDTA_TUBE')?.tubeCode).toBe('TUBE_PURPLE_EDTA')
    expect(findSpecimenTubeByCode('C001', '真空采血管（黄头，分离胶）')?.tubeCode).toBe('TUBE_YELLOW_SST')
    expect(findSpecimenTubeByCode('C002', '枸橼酸钠凝血管（蓝）')?.tubeCode).toBe('TUBE_BLUE_CITRATE')
    expect(findSpecimenTubeByCode('C003', '特殊容器')).toBeUndefined()
  })
})
