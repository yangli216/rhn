import type { ReactNode } from 'react'
import { PanelHead } from '../ui'

export interface CashierPanelProps {
  title: string
  amountLabel: string
  amount: ReactNode
  meta?: ReactNode
  children: ReactNode
  footer?: ReactNode
  className?: string
}

export function CashierPanel({
  title,
  amountLabel,
  amount,
  meta,
  children,
  footer,
  className = '',
}: CashierPanelProps) {
  return <aside className={`cashier-panel ${className}`}>
    <PanelHead className="cashier-panel__head" title={title} meta={meta} />
    <div className="cashier-panel__amount">
      <span>{amountLabel}</span>
      <strong>{amount}</strong>
    </div>
    <div className="cashier-panel__body">{children}</div>
    {footer && <footer className="cashier-panel__footer">{footer}</footer>}
  </aside>
}
