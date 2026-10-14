import type { Encounter, Resident } from './model'
import { encounterStatusPresentation } from './presentation'

export function genderLabel(gender?: Resident['gender'] | string) {
  return gender === '1' ? '男' : gender === '2' ? '女' : gender === '9' ? '未说明的性别' : '未知的性别'
}

export function age(birthDate: string) {
  const birth = new Date(/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? `${birthDate}T00:00:00` : birthDate)
  const now = new Date()
  return now.getFullYear() - birth.getFullYear()
    - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
}

export function formatTime(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function statusLabel(status: Encounter['status']) {
  return encounterStatusPresentation(status).label
}
