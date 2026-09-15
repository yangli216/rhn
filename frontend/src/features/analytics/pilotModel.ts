export type Metric = 'REGISTERED' | 'CANCELLED' | 'COMPLETED' | 'CANCELLATION_RATE'
export type Dimension = 'DAY' | 'MONTH' | 'DEPARTMENT'
export type Scope = 'CURRENT' | 'AUTHORIZED'
export type Chart = 'BAR' | 'LINE' | 'TABLE'
export interface PilotQuery { metric: Metric; dimension: Dimension; scope: Scope; startDate: string; endDate: string }
export const metricNames: Record<Metric, string> = { REGISTERED: '挂号人次', CANCELLED: '挂号队列退号人次', COMPLETED: '诊毕人次', CANCELLATION_RATE: '挂号队列退号率' }
export const dimensionNames: Record<Dimension, string> = { DAY: '按日', MONTH: '按月', DEPARTMENT: '按科室' }
export const scopeNames: Record<Scope, string> = { CURRENT: '当前工作科室', AUTHORIZED: '当前机构 · 可访问科室' }
export function dateText(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
export function dateRange(preset: string, now = new Date()) {
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  let start = new Date(end)
  if (preset === '上个月') { start = new Date(end.getFullYear(), end.getMonth()-1, 1); end.setDate(0) }
  else if (preset === '本月') start.setDate(1)
  else if (preset === '今年') start = new Date(end.getFullYear(), 0, 1)
  else start.setDate(start.getDate() - (Number(preset) || 30) + 1)
  return { startDate: dateText(start), endDate: dateText(end) }
}
export function initialQuery(): PilotQuery { return { metric: 'REGISTERED', dimension: 'DAY', scope: 'CURRENT', ...dateRange('30') } }
export function understand(text: string, base: PilotQuery, chart: Chart, now = new Date()): { query: PilotQuery; chart: Chart; message: string } {
  if (/诊断|疾病|排行|排名|收入|收费|药占比|预测|复诊|同比|患者名单|身份证|手机号|SQL|删除|导出明细/i.test(text)) throw new Error('当前支持挂号、挂号队列退号、诊毕和退号率。请换一个指标，或使用右侧配置。')
  if (/按周|按医生|按医师|年龄|性别|住院|去重|患者数|人数|退号发生|发生.*退号|退号日期|退号时间/.test(text)) throw new Error('这个分组或口径暂未接入。当前只支持门诊人次，按日、月或可访问科室分组；退号使用挂号队列口径。')
  let recognized = false
  const q = { ...base }
  if (/退号率|取消率/.test(text)) { q.metric = 'CANCELLATION_RATE'; recognized = true }
  else if (/退号|取消挂号/.test(text)) { q.metric = 'CANCELLED'; recognized = true }
  else if (/诊毕|完成接诊|完成就诊/.test(text)) { q.metric = 'COMPLETED'; recognized = true }
  else if (/挂号|门诊量/.test(text)) { q.metric = 'REGISTERED'; recognized = true }
  if (/按科室|各科室|科室对比/.test(text)) { q.dimension = 'DEPARTMENT'; q.scope = 'AUTHORIZED'; chart = 'BAR'; recognized = true }
  else if (/按月|月度/.test(text)) { q.dimension = 'MONTH'; recognized = true }
  else if (/按天|按日|每天|每日/.test(text)) { q.dimension = 'DAY'; recognized = true }
  if (/全部科室|全院|所有科室|可访问科室/.test(text)) { q.scope = 'AUTHORIZED'; recognized = true }
  if (/本科室|当前科室/.test(text)) { q.scope = 'CURRENT'; recognized = true }
  const dates = text.match(/\d{4}-\d{2}-\d{2}/g)
  const near = text.match(/(?:近|最近|过去)\s*(\d+)\s*天/)
  if (dates?.length === 2) { [q.startDate, q.endDate] = dates; recognized = true }
  else if (dates?.length) throw new Error('固定日期请同时填写开始和结束日期，例如 2026-01-01 至 2026-01-31。')
  else if (/上个月|上月/.test(text)) { Object.assign(q, dateRange('上个月', now)); recognized = true }
  else if (/本月|这个月/.test(text)) { Object.assign(q, dateRange('本月', now)); recognized = true }
  else if (/今年/.test(text)) { Object.assign(q, dateRange('今年', now)); recognized = true }
  else if (/今天|今日/.test(text)) { Object.assign(q, dateRange('1', now)); recognized = true }
  else if (/昨天|昨日/.test(text)) { const d = new Date(now); d.setDate(d.getDate()-1); q.startDate=q.endDate=dateText(d); recognized=true }
  else if (near) { if(Number(near[1])<1 || Number(near[1])>366) throw new Error('体验版支持连续 1 至 366 天，请缩短日期范围。'); Object.assign(q, dateRange(near[1], now)); recognized = true }
  else if (/去年|上周|本周|季度|半年/.test(text)) throw new Error('这个时间表达暂未接入，请在右侧选择准确的开始和结束日期。')
  if (/折线|趋势/.test(text)) { chart='LINE'; recognized=true }
  if (/柱状|柱形/.test(text)) { chart='BAR'; recognized=true }
  if (!recognized) throw new Error('还没识别出明确的分析条件。试试“最近30天按日看挂号趋势”，或直接调整右侧配置。')
  return { query:q, chart, message:`${metricNames[q.metric]} · ${dimensionNames[q.dimension]} · ${scopeNames[q.scope]}。请确认右侧条件后生成结果。` }
}
