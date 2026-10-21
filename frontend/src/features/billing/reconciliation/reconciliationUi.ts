import { formatDateKey } from '../../../shared/utils/dateRange'
export function accountDate(zoneId: string, offset = 0): string {
  const current = formatDateKey(new Date(), zoneId)
  const date = new Date(`${current}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + offset)
  return date.toISOString().slice(0, 10)
}
export function saveReconciliationFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url; link.download = filename; link.click()
  URL.revokeObjectURL(url)
}
export function reconPermission(authorities: string[], action: string): boolean {
  return authorities.includes('ROLE_ADMIN') || authorities.includes(`PAYMENT_RECONCILIATION.${action}`)
}
