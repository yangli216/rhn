import type { Encounter, Resident } from './model'
import { encounterStatusPresentation } from './presentation'

export function genderLabel(gender: Resident['gender']) {
  return gender === 'MALE' ? '男' : gender === 'FEMALE' ? '女' : '未知'
}

export function age(birthDate: string) {
  const birth = new Date(birthDate)
  const now = new Date()
  return now.getFullYear() - birth.getFullYear()
    - (now < new Date(now.getFullYear(), birth.getMonth(), birth.getDate()) ? 1 : 0)
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}

export function statusLabel(status: Encounter['status']) {
  return encounterStatusPresentation(status).label
}
