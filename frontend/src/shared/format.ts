import type { Encounter, Resident } from './model'
import { encounterStatusPresentation } from './presentation'

export function genderLabel(gender?: Resident['gender'] | string) {
  return gender === 'MALE' ? '男' : gender === 'FEMALE' ? '女' : '未知'
}

export function age(birthDate: string) {
  const birth = new Date(birthDate)
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
