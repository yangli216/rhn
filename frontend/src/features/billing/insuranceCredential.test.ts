import { describe, expect, it } from 'vitest'
import { isInsuranceCredentialError } from './insuranceCredential'

describe('isInsuranceCredentialError', () => {
  it('recognizes ApiError objects by code and message', () => {
    expect(isInsuranceCredentialError({ code: 'CHS_REQUEST_CONTEXT_UNCONFIRMED', message: '参保人鉴权凭证缺失' })).toBe(true)
  })
  it('recognizes Error and ApiError by the expiry text', () => {
    expect(isInsuranceCredentialError(new Error('医保失败：参保人鉴权凭证已失效，请重新读取'))).toBe(true)
    expect(isInsuranceCredentialError({ code: 'X', message: '参保人鉴权凭证已失效' })).toBe(true)
  })
  it('rejects other errors and non-objects', () => {
    expect(isInsuranceCredentialError({ code: 'CHS_REQUEST_CONTEXT_UNCONFIRMED', message: '上下文未确认' })).toBe(false)
    expect(isInsuranceCredentialError(new Error('网络错误'))).toBe(false)
    expect(isInsuranceCredentialError(null)).toBe(false)
    expect(isInsuranceCredentialError('参保人鉴权凭证已失效')).toBe(false)
  })
})
