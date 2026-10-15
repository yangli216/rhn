import { describe, expect, it } from 'vitest'
import {
  SPECIMEN_REJECTION_REASONS,
  SPECIMEN_TUBE_STANDARDS,
  findSpecimenTubeByCode,
  recommendSpecimenTubeByItemName,
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

  it('accurately recommends standard tubes based on diagnostic request item names', () => {
    expect(recommendSpecimenTubeByItemName('血常规五分类').tubeCode).toBe('TUBE_PURPLE_EDTA')
    expect(recommendSpecimenTubeByItemName('糖化血红蛋白测定 (HbA1c)').tubeCode).toBe('TUBE_PURPLE_EDTA')
    expect(recommendSpecimenTubeByItemName('尿液干化学+沉渣分析').tubeCode).toBe('CONTAINER_URINE_CUP')
    expect(recommendSpecimenTubeByItemName('大便常规+隐血').tubeCode).toBe('CONTAINER_STOOL_CUP')
    expect(recommendSpecimenTubeByItemName('凝血四项 (PT/APTT/TT/FIB)').tubeCode).toBe('TUBE_BLUE_CITRATE')
    expect(recommendSpecimenTubeByItemName('空腹静脉血糖测定').tubeCode).toBe('TUBE_GRAY_NAF')
    expect(recommendSpecimenTubeByItemName('红细胞沉降率 (ESR)').tubeCode).toBe('TUBE_BLACK_ESR')
    expect(recommendSpecimenTubeByItemName('肝功能十一项').tubeCode).toBe('TUBE_YELLOW_SST')
    expect(recommendSpecimenTubeByItemName('肾功能三项').tubeCode).toBe('TUBE_YELLOW_SST')
  })
})
