import { DEVELOPMENT_CA_VENDOR, type CaLoginApi } from '../../shared/api'

/**
 * 浏览器侧 UKey 驱动抽象：对后端给出的 Base64 待签字节做 SM3withSM2 签名，返回签名值和证书（Base64 DER）。
 * PIN 由厂商中间件自行弹窗收集，页面不接触 PIN 和私钥。真实厂商驱动（如 BJCA 证书助手）在取得接口文档后接入。
 */
export interface ClientTokenDriver {
  id: string
  label: string
  sign: (toBeSigned: string) => Promise<{ signatureValue: string; certificate: string }>
}

/** 开发模拟 UKey：由开发 CA 用该账号的模拟证书签名，只签登录挑战。 */
export function developmentTokenDriver(api: CaLoginApi, username: string): ClientTokenDriver {
  return {
    id: DEVELOPMENT_CA_VENDOR,
    label: '开发模拟 UKey',
    sign: (toBeSigned) => api.development.signToken(username.trim(), toBeSigned),
  }
}

export function tokenDriverAvailable(vendorCode: string | undefined): boolean {
  return vendorCode === DEVELOPMENT_CA_VENDOR
}
