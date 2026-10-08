export type OrderSubtotal = { status: 'known'; totals: Array<{ currencyCode: string; amount: string }> }
  | { status: 'unknown' }
type Decimal = { coefficient: bigint; scale: number }
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const currency = (value: unknown): value is string => typeof value === 'string' && /^[A-Z]{3}$/.test(value)

// Work with the decimal values received from the API, without float accumulation or intermediate rounding.
function decimal(value: number): Decimal {
  const [source, exponent = '0'] = String(value).toLowerCase().split('e')
  const [whole, fraction = ''] = source.split('.')
  const scale = fraction.length - Number(exponent)
  const coefficient = BigInt(whole + fraction)
  return scale < 0 ? { coefficient: coefficient * 10n ** BigInt(-scale), scale: 0 } : { coefficient, scale }
}
function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale)
  return { coefficient: left.coefficient * 10n ** BigInt(scale - left.scale)
    + right.coefficient * 10n ** BigInt(scale - right.scale), scale }
}
function render(value: Decimal): string {
  const digits = value.coefficient.toString().padStart(value.scale + 1, '0')
  if (!value.scale) return `${digits}.00`
  const fraction = digits.slice(-value.scale).replace(/0+$/, '').padEnd(2, '0')
  return `${digits.slice(0, -value.scale)}.${fraction}`
}
function total(rows: Array<{ amount: Decimal; currencyCode: string }>): OrderSubtotal {
  const amounts = new Map<string, Decimal>()
  for (const row of rows) amounts.set(row.currencyCode, add(amounts.get(row.currencyCode) ?? { coefficient: 0n, scale: 0 }, row.amount))
  return { status: 'known', totals: [...amounts].map(([currencyCode, amount]) => ({ currencyCode, amount: render(amount) })) }
}

export function draftOrderSubtotal(rows: Array<{ unitPrice?: number; quantity?: number; currencyCode?: string }>): OrderSubtotal {
  const amounts: Array<{ amount: Decimal; currencyCode: string }> = []
  for (const row of rows) {
    if (!finite(row.unitPrice) || row.unitPrice < 0 || !finite(row.quantity) || row.quantity <= 0 || !currency(row.currencyCode)) {
      return { status: 'unknown' }
    }
    const price = decimal(row.unitPrice), quantity = decimal(row.quantity)
    amounts.push({ currencyCode: row.currencyCode,
      amount: { coefficient: price.coefficient * quantity.coefficient, scale: price.scale + quantity.scale } })
  }
  return total(amounts)
}

export function savedOrderSubtotal(rows: Array<{ totalAmount?: number; currencyCode?: string; status: string }>): OrderSubtotal {
  const amounts: Array<{ amount: Decimal; currencyCode: string }> = []
  for (const row of rows) {
    if (row.status === 'CANCELLED') continue
    if (row.status !== 'ACTIVE' || !finite(row.totalAmount) || row.totalAmount < 0 || !currency(row.currencyCode)) return { status: 'unknown' }
    amounts.push({ amount: decimal(row.totalAmount), currencyCode: row.currencyCode })
  }
  return total(amounts)
}

export function formatOrderSubtotal(value: OrderSubtotal): string {
  if (value.status === 'unknown') return '待确认'
  if (!value.totals.length) return '无有效计价明细'
  return value.totals.map(({ currencyCode, amount }) => {
    const [whole, fraction = ''] = amount.split('.')
    const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0').slice(0, 2)) + (Number(fraction[2] ?? 0) >= 5 ? 1n : 0n)
    // A real small positive amount must not look like a free order.
    const shown = cents === 0n && /[1-9]/.test(amount) ? amount : `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
    return `${currencyCode} ${shown}`
  }).join('；')
}
