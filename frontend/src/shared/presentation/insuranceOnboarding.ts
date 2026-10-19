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
