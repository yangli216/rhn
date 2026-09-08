import { useMemo, useState, type ReactNode, type RefObject } from 'react'
import type { BillingWorkItem, Invoice, Payment, ReceiptView } from '../../shared/api/billingApi'
import { formatTime } from '../../shared/format'
import { EmptyState, Icon, Panel, StatusBadge } from '../../shared/ui'

export const workStatusText: Record<string, string> = {
  PENDING_CHARGE: '待计费', PENDING_INVOICE: '待结算', PENDING_PAYMENT: '待收款',
  PENDING_REFUND: '待退款', SETTLED: '已平账',
}

export function billingTone(status?: string) {
  if (status === 'SETTLED' || status === 'MATCHED' || status === 'CONFIRMED') return 'success' as const
  if (status === 'PENDING_REFUND' || status === 'MISMATCH' || status === 'ORPHAN_CHARGE') return 'danger' as const
  if (status === 'PENDING_PAYMENT' || status === 'PENDING_INVOICE' || status === 'UNCHARGED'
    || status === 'CALCULATED') return 'warning' as const
  return 'info' as const
}

export function money(value?: number, currency = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, minimumFractionDigits: 2 }).format(value ?? 0)
}

function patientDemographics(item: BillingWorkItem) {
  const gender = item.gender === 'MALE' ? '男' : item.gender === 'FEMALE' ? '女' : ''
  const birth = item.birthDate ? new Date(`${item.birthDate}T00:00:00`) : null
  const today = new Date()
  let age = birth && !Number.isNaN(birth.getTime()) ? today.getFullYear() - birth.getFullYear() : undefined
  if (birth && age !== undefined && (today.getMonth() < birth.getMonth()
    || today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1
  return [gender, age !== undefined && age >= 0 ? `${age}岁` : ''].filter(Boolean).join(' · ')
}

function formatRegistrationInfo(item: BillingWorkItem) {
  const parts: string[] = []
  if (item.departmentName) parts.push(item.departmentName)
  if (item.registeredAt) {
    const d = new Date(item.registeredAt)
    if (!Number.isNaN(d.getTime())) {
      const year = d.getFullYear()
      const month = String(d.getMonth() + 1).padStart(2, '0')
      const date = String(d.getDate()).padStart(2, '0')
      const hours = String(d.getHours()).padStart(2, '0')
      const minutes = String(d.getMinutes()).padStart(2, '0')
      parts.push(`${year}/${month}/${date} ${hours}:${minutes}`)
    }
  }
  return parts.join(' · ')
}

export function BillingQueue({
  title,
  items,
  selectedId,
  onSelect,
  emptyTitle,
  emptyCopy,
  searchInputRef,
  keyword: controlledKeyword,
  onKeywordChange,
  showSearch = true,
  action,
}: {
  title: string
  items: BillingWorkItem[]
  selectedId: string
  onSelect: (encounterId: string) => void
  emptyTitle: string
  emptyCopy: string
  searchInputRef?: RefObject<HTMLInputElement | null>
  keyword?: string
  onKeywordChange?: (value: string) => void
  showSearch?: boolean
  action?: ReactNode
}) {
  const [internalKeyword, setInternalKeyword] = useState('')
  const keyword = controlledKeyword ?? internalKeyword
  const setKeyword = onKeywordChange ?? setInternalKeyword

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase()
    if (!q) return items
    return items.filter((item) => {
      const name = (item.residentName || '').toLowerCase()
      const encNo = (item.encounterNo || '').toLowerCase()
      const healthNo = (item.healthRecordNo || '').toLowerCase()
      const resId = (item.residentId || '').toLowerCase()
      return name.includes(q) || encNo.includes(q) || healthNo.includes(q) || resId.includes(q)
    })
  }, [items, keyword])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!filteredItems.length) return
    const currentIdx = filteredItems.findIndex((item) => item.encounterId === selectedId)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIdx = currentIdx < filteredItems.length - 1 ? currentIdx + 1 : 0
      onSelect(filteredItems[nextIdx].encounterId)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIdx = currentIdx > 0 ? currentIdx - 1 : filteredItems.length - 1
      onSelect(filteredItems[prevIdx].encounterId)
    } else if (e.key === 'Enter') {
      if (currentIdx >= 0) {
        onSelect(filteredItems[currentIdx].encounterId)
      } else if (filteredItems.length > 0) {
        onSelect(filteredItems[0].encounterId)
      }
    } else if (e.key === 'Escape') {
      setKeyword('')
    }
  }

  return <Panel className="billing-queue">
    <header className="billing-queue-head">
      <div className="billing-queue-head__title">
        <h2>{title}</h2>
      </div>
      {action && <div className="billing-queue-head__action">{action}</div>}
    </header>
    {showSearch && items.length > 0 && (
      <div className="billing-queue-search">
        <div className="billing-queue-search-wrap">
          <Icon name="search" className="billing-queue-search-icon" />
          <input
            ref={searchInputRef}
            type="search"
            className="ui-field__control billing-queue-search-input"
            placeholder="搜索姓名/拼音/条码 (F1)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {keyword && (
            <button
              type="button"
              className="billing-queue-search-clear"
              onClick={() => setKeyword('')}
              aria-label="清空搜索"
            >
              ×
            </button>
          )}
        </div>
      </div>
    )}
    {!items.length ? (
      <EmptyState icon="billing" title={emptyTitle} copy={emptyCopy} />
    ) : !filteredItems.length ? (
      <EmptyState icon="billing" title="无匹配患者" copy="未找到匹配该关键字的待收费记录。" />
    ) : (
      <div className="billing-queue-list">
        {filteredItems.map((item) => <button key={item.encounterId} type="button"
          aria-label={`${item.residentName || '患者'}，${workStatusText[item.status]}`}
          className={item.encounterId === selectedId ? 'is-active' : ''} onClick={() => onSelect(item.encounterId)}>
          <div className="billing-queue-item__row">
            <strong>{item.residentName || '姓名未提供'}</strong>
            <StatusBadge tone={billingTone(item.status)}>{workStatusText[item.status]}</StatusBadge>
          </div>
          <small className="billing-queue-item__meta">{patientDemographics(item) || '性别、年龄未提供'}</small>
          {formatRegistrationInfo(item) && (
            <small className="billing-queue-item__meta billing-queue-item__registration">
              {formatRegistrationInfo(item)}
            </small>
          )}
        </button>)}
      </div>
    )}
  </Panel>
}

export function waitingDuration(value?: string) {
  if (!value) return '--'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (!Number.isFinite(minutes)) return '--'
  if (minutes < 60) return `${minutes} 分钟`
  return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分钟`
}

export function BillingTimeline({ invoices, payments, receipts = [], currency, onViewReceipt }: {
  invoices: Invoice[]
  payments: Payment[]
  receipts?: ReceiptView[]
  currency: string
  onViewReceipt?: (receipt: ReceiptView) => void
}) {
  const items = [
    ...invoices.map((invoice) => ({
      id: `I-${invoice.id}`,
      at: invoice.issuedAt,
      type: invoice.invoiceType === 'CREDIT' ? '贷项凭证' : '结算凭证',
      code: invoice.invoiceNo,
      amount: invoice.netAmount,
      tone: invoice.invoiceType === 'CREDIT' ? 'warning' as const : 'info' as const,
      receipt: undefined as ReceiptView | undefined,
    })),
    ...payments.map((payment) => ({
      id: `P-${payment.id}`,
      at: payment.paidAt,
      type: payment.paymentType === 'REFUND' ? '退款冲正' : '支付完成',
      code: payment.paymentNo,
      amount: payment.paymentType === 'REFUND' ? -payment.amount : payment.amount,
      tone: payment.paymentType === 'REFUND' ? 'danger' as const : 'success' as const,
      receipt: undefined as ReceiptView | undefined,
    })),
    ...receipts.map((receipt) => ({
      id: `R-${receipt.id}`,
      at: receipt.issuedAt || receipt.createdAt,
      type: receipt.status === 'RED_FLUSHED' ? '电子票据冲红' : receipt.status === 'VOIDED' ? '电子票据作废' : '财政电子票据',
      code: receipt.fiscalNumber || receipt.receiptNo,
      amount: receipt.amount,
      tone: receipt.status === 'RED_FLUSHED' ? 'danger' as const : receipt.status === 'VOIDED' ? 'neutral' as const : 'success' as const,
      receipt,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <section className="billing-timeline">
      <header>
        <h3>结算与支付记录</h3>
        <span>{items.length} 条</span>
      </header>
      {!items.length ? (
        <p>当前账户暂无结算和支付记录。</p>
      ) : (
        <ol>
          {items.map((item) => (
            <li key={item.id} className={item.receipt ? 'is-receipt-item' : ''}>
              <span className={`billing-timeline__dot is-${item.tone}`} />
              <div>
                <strong>{item.type}</strong>
                <code>{item.code}</code>
                <small>{formatTime(item.at)}</small>
              </div>
              <div className="billing-timeline__right">
                <b>{money(item.amount, currency)}</b>
                {item.receipt && onViewReceipt && (
                  <button
                    type="button"
                    className="billing-timeline__view-btn"
                    onClick={() => onViewReceipt(item.receipt!)}
                    aria-label={`查看发票 ${item.code}`}
                  >
                    查看发票
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
