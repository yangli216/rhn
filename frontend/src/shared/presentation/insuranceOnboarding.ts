import type { StatusTone } from '../ui'

/** 展示文字由服务端 xxxText 字段提供，前端只维护编码到语义色的映射。 */
export const readinessStatusTones: Record<string, StatusTone> = { PASS: 'success', WARN: 'warning', BLOCK: 'danger' }
export const coverageStatusTones: Record<string, StatusTone> = {
  MAPPED: 'success', UNMAPPED: 'danger', AMBIGUOUS: 'warning', EXPIRED: 'warning',
}

export function coverageRateLabel(rate?: number | null) {
  return rate === null || rate === undefined ? '—' : `${rate.toFixed(1)}%`
}

export const probeStatusTones: Record<string, StatusTone> = { PASS: 'success', FAIL: 'danger', SKIPPED: 'neutral', BLOCKED: 'warning' }

/** 调试控制台：往返结果、留存级别与申请状态的展示映射。结果不明（超时/网络）按“需关注”显示琥珀色，而非失败红色。 */
export const debugOutcomeTones: Record<string, StatusTone> = {
  OK: 'success', REJECTED: 'danger', HTTP_STATUS: 'danger', BAD_JSON: 'danger', INCOMPLETE: 'danger', TIMEOUT: 'warning', NETWORK: 'warning',
}
export const debugRetentionText: Record<string, string> = { SUMMARY: '仅摘要', REDACTED: '脱敏报文', RAW: '原始报文' }
export const debugClaimTones: Record<string, StatusTone> = { FAILED: 'danger' }
export const debugActionTones: Record<string, StatusTone> = {
  REVERSED: 'success', ALREADY_REVERSED: 'success', REVERSAL_PENDING: 'warning', NOT_REVERSIBLE: 'warning', QUERIED: 'info',
}
