import type { components } from './generated'
import type { ApiClient } from './httpClient'

export type CaLoginOptions = components['schemas']['CaLoginOptions']
export type CaMobileChallenge = components['schemas']['MobileChallenge']
export type CaCertificateChallenge = components['schemas']['CertificateChallenge']
export type CaLoginResult = components['schemas']['CaLoginResult']
export type CaSigningCapability = components['schemas']['SigningCapability']
export type CaSignerView = components['schemas']['SignerView']

export const DEVELOPMENT_CA_VENDOR = 'development-ca'

/** 开发模拟 CA 的手机端与 UKey 中间件替身；只在后端显式开启时存在，不进入 API 契约。 */
export interface DevelopmentTokenSignature { signatureValue: string; certificate: string }

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) })

/**
 * 扫码 / 证书（UKey）登录与口令后的第二步认证。匿名客户端调用即登录；带口令凭据的客户端调用即第二步，
 * 后端要求 CA 对应账号与口令账号一致。确认后由服务端写入会话 Cookie。
 */
export function createCaLoginApi(client: ApiClient) {
  return {
    options: () => client.request<CaLoginOptions>('/api/session/ca-login/options'),
    startMobile: () => client.request<CaMobileChallenge>('/api/session/ca-login/mobile', { method: 'POST' }),
    pollMobile: (loginRequestId: string) => client.request<CaLoginResult>(
      `/api/session/ca-login/mobile/${encodeURIComponent(loginRequestId)}`),
    certificateChallenge: () => client.request<CaCertificateChallenge>(
      '/api/session/ca-login/certificate-challenges', { method: 'POST' }),
    completeCertificate: (body: { challengeId: string; signatureValue: string; certificate: string }) =>
      client.request<CaLoginResult>('/api/session/ca-login/certificate', json(body)),
    development: {
      confirmMobile: (qrContent: string, username: string) => client.request<void>(
        '/api/crypto/dev-ca/public/mobile-logins/confirm', json({ qrContent, username })),
      rejectMobile: (qrContent: string) => client.request<void>(
        '/api/crypto/dev-ca/public/mobile-logins/reject', json({ qrContent })),
      signToken: (username: string, toBeSigned: string) => client.request<DevelopmentTokenSignature>(
        '/api/crypto/dev-ca/public/token-signatures', json({ username, toBeSigned })),
    },
  }
}

export type CaLoginApi = ReturnType<typeof createCaLoginApi>

/** 当前账号的 CA 签名人绑定；开发环境可为自己签发模拟证书。 */
export function createCaSignerApi(client: ApiClient) {
  return {
    capability: () => client.request<CaSigningCapability>('/api/crypto/signatures/capability'),
    mine: () => client.request<CaSignerView[]>('/api/crypto/signers/me'),
    enrollDevelopment: () => client.request<CaSignerView>('/api/crypto/dev-ca/enrollments', { method: 'POST' }),
  }
}
