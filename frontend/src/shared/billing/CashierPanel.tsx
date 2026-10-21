import type { ReactNode } from 'react'
import { PanelHead } from '../ui'
import '../../styles/features/billing-settlement.css'

export interface CashierPanelProps {
  title: string
  amountLabel: string
  amount: ReactNode
  meta?: ReactNode
  /** 应收金额右侧的次要操作（如取消本单）。 */
  amountAction?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function CashierPanel({
  title,
  amountLabel,
  amount,
  meta,
  amountAction,
  children,
  footer,
  className = '',
}: CashierPanelProps) {
  return <aside className={`cashier-panel ${className}`}>
    <PanelHead className="cashier-panel__head" title={title} meta={meta} />
    <div className={`cashier-panel__amount${amountAction ? ' has-action' : ''}`}>
      <span>{amountLabel}</span>
      <strong>{amount}</strong>
      {amountAction && <div className="cashier-panel__amount-action">{amountAction}</div>}
    </div>
    <div className="cashier-panel__body">{children}</div>
    {footer && <footer className="cashier-panel__footer">{footer}</footer>}
  </aside>
}
