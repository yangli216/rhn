/**
 * 数值与金额精度规范化工具
 * 针对医疗处方剂量、包装发药总量、单剂重/总重、金额计算中 IEEE 754 浮点数累加误差
 * 提供统一、安全、标准的四舍五入与格式化函数
 */

/**
 * 基于指数移动的安全四舍五入，消除像 1.005 或 30.700000000000003 的精度截断误差
 * @param value 待舍入的数值
 * @param decimals 保留小数位数（默认 2）
 */
export function roundNumber(value: number | string | null | undefined, decimals = 2): number {
  if (value == null || value === '') return 0
  const num = Number(value)
  if (!Number.isFinite(num)) return 0
  if (decimals < 0) decimals = 0
  return Number(`${Math.round(Number(`${num}e${decimals}`))}e-${decimals}`)
}

/**
 * 格式化临床每剂剂量/单剂克数（如 10g、10.5g、0.25mg）
 * 自动消除末尾无用 0，并消除浮点长尾（如 30.700000000000003 -> '30.7'）
 * @param value 剂量数值
 * @param maxDecimals 最多显示小数位数（默认 2）
 */
export function formatDose(value: number | string | null | undefined, maxDecimals = 2): string {
  if (value == null || value === '') return '0'
  const rounded = roundNumber(value, maxDecimals)
  // 使用 Number.toString() 自动去除末尾无用 0，如 10.0 -> 10, 10.50 -> 10.5
  return rounded.toString()
}

/**
 * 格式化药品/耗材发药总量或项目执行数量
 * @param value 数量
 * @param maxDecimals 最多保留小数位（默认 2）
 */
export function formatQuantity(value: number | string | null | undefined, maxDecimals = 2): string {
  return formatDose(value, maxDecimals)
}

/**
 * 多数值安全累加，防止 0.1 + 0.2 或连续 reduce 导致的浮点长尾
 * @param values 待累加的数值数组
 * @param precision 保留精度（默认 4 位避免中间过程被过早截断）
 */
export function safeAdd(values: (number | string | null | undefined)[], precision = 4): number {
  const sum = values.reduce<number>((acc, cur) => {
    if (cur == null || cur === '') return acc
    const n = Number(cur)
    return acc + (Number.isFinite(n) ? n : 0)
  }, 0)
  return roundNumber(sum, precision)
}

/**
 * 两数或多数安全相乘，防止 30.7 * 7 = 214.90000000000003
 * @param a 乘数 A
 * @param b 乘数 B
 * @param decimals 最终保留小数位（默认 2）
 */
export function safeMultiply(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  decimals = 2
): number {
  const numA = Number(a) || 0
  const numB = Number(b) || 0
  return roundNumber(numA * numB, decimals)
}

/**
 * 安全格式化货币金额
 * @param value 金额数值
 * @param currencyCode 币种代码（默认 CNY）
 * @param minFractionDigits 最少小数位（默认 2）
 * @param maxFractionDigits 最多小数位（默认 2）
 */
export function formatCurrency(
  value: number | string | null | undefined,
  currencyCode = 'CNY',
  minFractionDigits = 2,
  maxFractionDigits = 2
): string {
  if (value == null || value === '') return '—'
  const num = roundNumber(value, maxFractionDigits)
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: currencyCode || 'CNY',
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(num)
}
