/**
 * 支付金额精度与舍入计算工具
 *
 * precision: '0.01' (分), '0.1' (角), '1' (元)
 * roundingMode: 'HALF_UP' (四舍五入), 'HALF_EVEN_SIX' (五舍六入), 'FLOOR' (抹零/截断)
 */
export interface RoundAmountResult {
  rounded: number
  adjustment: number
}

export function roundAmount(
  amount: number,
  precision: string = '0.01',
  roundingMode: string = 'HALF_UP'
): RoundAmountResult {
  if (!Number.isFinite(amount) || amount === 0) {
    return { rounded: 0, adjustment: 0 }
  }

  const prec = parseFloat(precision) || 0.01
  const stepInCents = Math.round(prec * 100)

  if (stepInCents <= 1) {
    // 精度到分或更细，无需进行整角/整元舍入，直接保留两位小数
    const rounded = Number((Math.round(amount * 100) / 100).toFixed(2))
    return { rounded, adjustment: 0 }
  }

  const isNegative = amount < 0
  const absAmount = Math.abs(amount)
  const cents = Math.round(absAmount * 100)

  const quotient = Math.floor(cents / stepInCents)
  const remainder = cents % stepInCents

  let roundedCents: number
  if (remainder === 0) {
    roundedCents = cents
  } else if (roundingMode === 'FLOOR') {
    // 抹零（直接截断尾数）
    roundedCents = quotient * stepInCents
  } else if (roundingMode === 'HALF_EVEN_SIX') {
    // 五舍六入：余数 <= 5舍弃，> 5进位 (以角 stepInCents=10 为例：1~5舍，6~9入)
    const half = stepInCents / 2
    if (remainder > half) {
      roundedCents = (quotient + 1) * stepInCents
    } else {
      roundedCents = quotient * stepInCents
    }
  } else {
    // 默认：HALF_UP 四舍五入 (以角 stepInCents=10 为例：1~4舍，5~9入)
    const half = stepInCents / 2
    if (remainder >= half) {
      roundedCents = (quotient + 1) * stepInCents
    } else {
      roundedCents = quotient * stepInCents
    }
  }

  const finalRounded = isNegative ? -(roundedCents / 100) : roundedCents / 100
  const roundedVal = Number(finalRounded.toFixed(2))
  const originalVal = Number(amount.toFixed(2))
  const adjustmentVal = Number((roundedVal - originalVal).toFixed(2))

  return {
    rounded: roundedVal,
    adjustment: adjustmentVal,
  }
}
