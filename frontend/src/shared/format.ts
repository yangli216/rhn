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

const DISPLAY_LOCALE = 'zh-CN'

/**
 * 与 Date.prototype.toLocaleString('zh-CN', options) 一致：未指定任何日期/时间字段时默认输出日期+时间。
 * 无效日期返回 'Invalid Date'。
 */
export function formatLocaleDateTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  return new Date(value).toLocaleString(DISPLAY_LOCALE, options)
}

/**
 * 与 new Intl.DateTimeFormat('zh-CN', options).format(date) 一致：未指定字段时默认只输出日期；
 * 无效日期抛 RangeError，调用方按需 try/catch。
 */
export function formatDateTimeParts(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, options).format(value instanceof Date ? value : new Date(value))
}

/** 地区（ISO 3166 代码）中文名；非法代码抛 RangeError，未收录返回 undefined。 */
export function regionDisplayName(code: string) {
  return new Intl.DisplayNames([DISPLAY_LOCALE], { type: 'region' }).of(code)
}
