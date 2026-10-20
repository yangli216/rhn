const CREDENTIAL_EXPIRED_TEXT = '参保人鉴权凭证已失效'

/**
 * 判断错误是否为“医保参保人鉴权凭证失效/尚未读取”：
 * 既可能是接口直接报错（ApiError 对象，code CHS_REQUEST_CONTEXT_UNCONFIRMED），
 * 也可能是已有医保申请被返回后由结果确认抛出的 Error(errorMessage)。
 */
export function isInsuranceCredentialError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error && typeof error.message === 'string' ? error.message : ''
  if (message.includes(CREDENTIAL_EXPIRED_TEXT)) return true
  return 'code' in error && error.code === 'CHS_REQUEST_CONTEXT_UNCONFIRMED' && message.includes('鉴权凭证')
}
