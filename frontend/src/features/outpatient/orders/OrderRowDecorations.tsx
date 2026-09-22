import { serviceTypeLabel } from './orderPresentation'

export function OrderTypeBadge({ type }: { type: string }) {
  const label = type === 'MEDICATION' || type === 'WESTERN' ? '西药'
    : type === 'CHINESE_PATENT' ? '中成药' : type === 'HERBAL' ? '草药'
      : serviceTypeLabel(type)
  const className = ['MEDICATION', 'WESTERN', 'CHINESE_PATENT', 'HERBAL'].includes(type)
    ? (type === 'CHINESE_PATENT' ? 'is-patent' : type === 'HERBAL' ? 'is-herbal' : 'is-medication')
    : `is-${type.toLowerCase()}`
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
