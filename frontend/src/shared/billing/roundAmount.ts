/** 支付规则来自 PAY_METHOD 字典；仅支持字典定义的分、角精度。 */
export interface RoundAmountResult {
  rounded: number
  adjustment: number
}

export function requirePaymentRounding(precision: unknown, roundingMode: unknown) {
  if (precision !== '0.01' && precision !== '0.1') {
    throw new Error('支付精度未配置或无效，请联系管理员维护支付方式')
  }
  if (roundingMode !== 'HALF_UP' && roundingMode !== 'HALF_EVEN_SIX' && roundingMode !== 'FLOOR') {
    throw new Error('支付舍入方式未配置或无效，请联系管理员维护支付方式')
  }
  return { precision, roundingMode }
}

export function roundAmount(amount: number, precision?: string, roundingMode?: string): RoundAmountResult {
  const rule = requirePaymentRounding(precision, roundingMode)
  if (!Number.isFinite(amount)) throw new Error('待支付金额无效，请重新读取结算单')

  // 账务金额最多六位小数；直接按目标精度计算，避免先舍入到分引起二次进位。
  const absolute = Math.abs(amount)
  const units = Math.round(absolute * 1_000_000)
  if (!Number.isSafeInteger(units) || Math.abs(units / 1_000_000 - absolute) > Number.EPSILON * Math.max(1, absolute) * 2) {
    throw new Error('待支付金额超出支持的范围或六位小数精度')
  }
  const step = rule.precision === '0.01' ? 10_000 : 100_000
  const quotient = Math.floor(units / step)
  const remainder = units % step
  const increment = rule.roundingMode === 'HALF_UP' ? remainder >= step / 2
    : rule.roundingMode === 'HALF_EVEN_SIX' ? remainder > step / 2 : false
  const rounded = Number(((quotient + Number(increment)) * step / 1_000_000 * (amount < 0 ? -1 : 1)).toFixed(2))
  const adjustment = Number((rounded - amount).toFixed(6))
  return { rounded: rounded === 0 ? 0 : rounded, adjustment: adjustment === 0 ? 0 : adjustment }
}
