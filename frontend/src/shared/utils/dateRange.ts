export interface DateRange {
  from: string
  to: string
}

export type PresetKey =
  | 'TODAY'
  | 'YESTERDAY'
  | 'LAST_7_DAYS'
  | 'THIS_WEEK'
  | 'LAST_WEEK'
  | 'THIS_MONTH'
  | 'LAST_MONTH'
  | 'LAST_30_DAYS'
  | 'NEXT_7_DAYS'
  | 'NEXT_WEEK'

export interface PresetOption {
  key: PresetKey
  label: string
  getRange: () => DateRange
}

/** 格式化 Date 对象为 YYYY-MM-DD（采用本地年月日，避免时区偏移） */
export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 解析 YYYY-MM-DD 为本地 Date */
export function parseDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** 偏移天数 */
export function offsetDays(base: Date, days: number): Date {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

/** 获取今天的日期字符串 */
export function getTodayStr(): string {
  return formatDate(new Date())
}

/** 获取昨天 */
export function getYesterdayRange(): DateRange {
  const now = new Date()
  const y = offsetDays(now, -1)
  const dateStr = formatDate(y)
  return { from: dateStr, to: dateStr }
}

/** 获取今天 */
export function getTodayRange(): DateRange {
  const t = getTodayStr()
  return { from: t, to: t }
}

/** 近 7 天（包含今天，共 7 天） */
export function getLast7DaysRange(): DateRange {
  const now = new Date()
  return {
    from: formatDate(offsetDays(now, -6)),
    to: formatDate(now),
  }
}

/** 近 30 天（包含今天，共 30 天） */
export function getLast30DaysRange(): DateRange {
  const now = new Date()
  return {
    from: formatDate(offsetDays(now, -29)),
    to: formatDate(now),
  }
}

/** 未来 7 天（从今天开始，共 7 天） */
export function getNext7DaysRange(): DateRange {
  const now = new Date()
  return {
    from: formatDate(now),
    to: formatDate(offsetDays(now, 6)),
  }
}

/** 本周（周一至周日） */
export function getThisWeekRange(): DateRange {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0 = 周日, 1 = 周一, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = offsetDays(now, diffToMonday)
  const sunday = offsetDays(monday, 6)
  return {
    from: formatDate(monday),
    to: formatDate(sunday),
  }
}

/** 上周（上周一至上周日） */
export function getLastWeekRange(): DateRange {
  const thisWeekMonday = parseDate(getThisWeekRange().from)
  const lastMonday = offsetDays(thisWeekMonday, -7)
  const lastSunday = offsetDays(lastMonday, 6)
  return {
    from: formatDate(lastMonday),
    to: formatDate(lastSunday),
  }
}

/** 下周（下周一至下周日） */
export function getNextWeekRange(): DateRange {
  const thisWeekMonday = parseDate(getThisWeekRange().from)
  const nextMonday = offsetDays(thisWeekMonday, 7)
  const nextSunday = offsetDays(nextMonday, 6)
  return {
    from: formatDate(nextMonday),
    to: formatDate(nextSunday),
  }
}

/** 本月（当月 1 号至当月最后一天） */
export function getThisMonthRange(): DateRange {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    from: formatDate(firstDay),
    to: formatDate(lastDay),
  }
}

/** 上月（上月 1 号至上月最后一天） */
export function getLastMonthRange(): DateRange {
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastDay = new Date(now.getFullYear(), now.getMonth(), 0)
  return {
    from: formatDate(firstDay),
    to: formatDate(lastDay),
  }
}

/** 默认查询预设全集 */
export const DEFAULT_QUERY_PRESETS: PresetOption[] = [
  { key: 'TODAY', label: '今天', getRange: getTodayRange },
  { key: 'THIS_WEEK', label: '本周', getRange: getThisWeekRange },
  { key: 'LAST_WEEK', label: '上周', getRange: getLastWeekRange },
  { key: 'THIS_MONTH', label: '本月', getRange: getThisMonthRange },
  { key: 'LAST_7_DAYS', label: '近7天', getRange: getLast7DaysRange },
  { key: 'LAST_30_DAYS', label: '近30天', getRange: getLast30DaysRange },
]

/** 面向未来的业务（如排班/预约）快捷预设 */
export const FUTURE_QUERY_PRESETS: PresetOption[] = [
  { key: 'TODAY', label: '今天', getRange: getTodayRange },
  { key: 'THIS_WEEK', label: '本周', getRange: getThisWeekRange },
  { key: 'NEXT_WEEK', label: '下周', getRange: getNextWeekRange },
  { key: 'NEXT_7_DAYS', label: '未来7天', getRange: getNext7DaysRange },
  { key: 'THIS_MONTH', label: '本月', getRange: getThisMonthRange },
]

/** 匹配当前输入的日期范围是哪个预设（如有） */
export function findMatchingPreset(range: DateRange, presets: PresetOption[] = DEFAULT_QUERY_PRESETS): PresetKey | null {
  if (!range.from || !range.to) return null
  for (const preset of presets) {
    const candidate = preset.getRange()
    if (candidate.from === range.from && candidate.to === range.to) {
      return preset.key
    }
  }
  return null
}
