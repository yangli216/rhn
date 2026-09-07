import type { ReactNode } from 'react'
import { Icon } from '../ui'

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
    <header className="cashier-panel__head">
      <span className="cashier-panel__icon"><Icon name="billing" /></span>
      <div>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
    </header>
    <div className="cashier-panel__amount">
      <span>{amountLabel}</span>
      <strong>{amount}</strong>
    </div>
    <div className="cashier-panel__body">{children}</div>
    {footer && <footer className="cashier-panel__footer">{footer}</footer>}
  </aside>
}
