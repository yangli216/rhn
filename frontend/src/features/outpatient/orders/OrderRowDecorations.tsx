import { serviceTypeLabel } from './orderPresentation'

export function OrderTypeBadge({ type }: { type?: string }) {
  const safeType = type || 'MEDICATION'
  const label = safeType === 'MEDICATION' || safeType === 'WESTERN' ? '西药'
    : safeType === 'CHINESE_PATENT' ? '中成药' : safeType === 'HERBAL' ? '草药'
      : serviceTypeLabel(safeType)
  const className = ['MEDICATION', 'WESTERN', 'CHINESE_PATENT', 'HERBAL'].includes(safeType)
    ? (safeType === 'CHINESE_PATENT' ? 'is-patent' : safeType === 'HERBAL' ? 'is-herbal' : 'is-medication')
    : `is-${safeType.toLowerCase()}`
  return <span className={`doctor-unified-order-kind ${className}`}>{label}</span>
}

export function AdministrationGroupBracket({ isHead, isTail, isMid }: {
  isHead?: boolean; isTail?: boolean; isMid?: boolean
}) {
  if (!isHead && !isTail && !isMid) return null
  const symbol = isHead ? '┏' : isTail ? '┗' : '┃'
  return (
    <span
      className={`doctor-group-bracket ${isHead ? 'is-head' : isTail ? 'is-tail' : 'is-mid'}`}
      title={isHead ? '输液成组（组头药）' : '输液成组（同组药）'}
      aria-label="输液成组标识"
    >
      {symbol}
    </span>
  )
}
