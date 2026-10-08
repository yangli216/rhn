import { describe, expect, it, vi } from 'vitest'
import type { RhnApi } from '../../../shared/rhnApi'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import { canonicalizeAiDiagnoses } from './canonicalAiDiagnoses'

const western = { id: 'west', code: 'SAME', display: '西医目录名称', systemCode: 'WHO.BD.CS.ICD10',
  sdDiagnosisDomain: 'WESTERN_MEDICINE', sdStatus: 'ACTIVE', effectiveFrom: '2020-01-01', effectiveTo: null,
  managementPrograms: [] }
const tcm = { ...western, id: 'tcm', systemCode: 'TCM', sdDiagnosisDomain: 'TCM_DISEASE', display: '中医目录名称' }
const base: DiagnosisInput = { code: 'SAME', display: '原名称', type: 'PRIMARY' }
function apiReturning(value: unknown) {
  return { masterData: { diseases: vi.fn().mockResolvedValue(value) } } as unknown as RhnApi
}

describe('AI adoption diagnosis identity', () => {
  it('resolves a model candidate under its explicit ICD-10 contract and preserves catalog identity and management evidence', async () => {
    const result = await canonicalizeAiDiagnoses(apiReturning([tcm, western]), [base], 'model')
    expect(result).toEqual([{ ...base, conceptId: 'west', codeSystem: western.systemCode, diagnosisDomain: 'WESTERN_MEDICINE',
      display: western.display, managementResolutionStatus: 'CONFIRMED', managementPrograms: [] }])
  })
  it('resolves same-code plan diagnoses independently across systems and domains', async () => {
    const result = await canonicalizeAiDiagnoses(apiReturning([tcm, western]), [
      { ...base, conceptId: 'west', codeSystem: western.systemCode, diagnosisDomain: 'WESTERN_MEDICINE' },
      { ...base, conceptId: 'tcm', codeSystem: 'TCM', diagnosisDomain: 'TCM_DISEASE', type: 'SECONDARY' },
    ], 'plan')
    expect(result.map(item => item.conceptId)).toEqual(['west', 'tcm'])
    expect(result.map(item => item.diagnosisDomain)).toEqual(['WESTERN_MEDICINE', 'TCM_DISEASE'])
  })
  it('uses an explicit concept ID without fabricating a missing system', async () => {
    const result = await canonicalizeAiDiagnoses(apiReturning([tcm, western]), [{ ...base, conceptId: 'tcm' }], 'plan')
    expect(result[0]).toMatchObject({ conceptId: 'tcm', codeSystem: 'TCM', diagnosisDomain: 'TCM_DISEASE' })
  })
  it('allows an explicit system/domain tuple to resolve a unique catalog concept', async () => {
    const result = await canonicalizeAiDiagnoses(apiReturning([tcm, western]), [{ ...base, codeSystem: 'TCM', diagnosisDomain: 'TCM_DISEASE' }], 'plan')
    expect(result[0].conceptId).toBe('tcm')
  })
  it('rejects unknown plan identity before querying instead of assuming ICD-10', async () => {
    const api = apiReturning([western])
    await expect(canonicalizeAiDiagnoses(api, [base], 'plan')).rejects.toThrow('缺少概念标识')
    expect(api.masterData.diseases).not.toHaveBeenCalled()
  })
  it.each([
    { conceptId: 'wrong' }, { conceptId: 'west', codeSystem: 'TCM' },
    { conceptId: 'west', diagnosisDomain: 'TCM_DISEASE' },
  ])('rejects conflicting plan identity %j without choosing a same-code replacement', async identity => {
    await expect(canonicalizeAiDiagnoses(apiReturning([western, tcm]), [{ ...base, ...identity } as DiagnosisInput], 'plan'))
      .rejects.toThrow('未找到唯一有效且身份一致')
  })
  it.each([null, {}, [{ ...western, id: undefined }], [{ ...western, sdDiagnosisDomain: undefined }],
    [{ ...western, effectiveFrom: undefined }], [{ ...western, sdStatus: 'INACTIVE' }],
    [{ ...western, effectiveFrom: '2099-01-01' }], [{ ...western, effectiveTo: '2020-12-31' }],
    [western, { ...western, id: 'another-version' }], [],
  ])('rejects incomplete, inactive, expired, absent or ambiguous catalogs %#', async catalog => {
    await expect(canonicalizeAiDiagnoses(apiReturning(catalog), [base], 'model')).rejects.toThrow('诊断身份未确认')
  })
  it('does not turn missing management evidence into a confirmed empty list', async () => {
    const result = await canonicalizeAiDiagnoses(apiReturning([{ ...western, managementPrograms: undefined }]), [base], 'model')
    expect(result[0]).toMatchObject({ managementResolutionStatus: 'UNCONFIRMED', managementPrograms: null })
  })
  it('propagates directory failure and refuses repeated concept identities', async () => {
    const api = apiReturning([western]); vi.mocked(api.masterData.diseases).mockRejectedValueOnce(new Error('目录断开'))
    await expect(canonicalizeAiDiagnoses(api, [base], 'model')).rejects.toThrow('目录断开')
    await expect(canonicalizeAiDiagnoses(api, [base, { ...base, type: 'SECONDARY' }], 'model')).rejects.toThrow('重复出现')
  })
  it('rejects a model candidate claiming a conflicting domain', async () => {
    await expect(canonicalizeAiDiagnoses(apiReturning([tcm]), [{ ...base, diagnosisDomain: 'TCM_DISEASE' }], 'model')).rejects.toThrow('范围冲突')
  })
})
