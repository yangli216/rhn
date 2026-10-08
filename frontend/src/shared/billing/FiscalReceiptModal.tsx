import { useCallback, useEffect, useRef, useState } from 'react'
import '../../styles/features/inpatient.css'
import type { ReceiptView, Settlement } from '../api/billingApi'
import { fiscalReceiptStatusPresentation } from '../presentation'
import { Alert, Button, DataTable, Dialog, StatusBadge, tableCellClass } from '../ui'
import { Icon } from '../ui/Icon'

export interface FiscalReceiptModalProps {
  open: boolean
  onClose: () => void
  receipt: ReceiptView | null
  settlement?: Settlement | null
  onPrint?: (receiptId: string) => Promise<void>
  onRedFlush?: (receiptId: string, reason: string) => Promise<void>
}

/**
 * 将数字金额转换为人民币大写汉字金额
 */
export function convertToChineseCurrency(amount: number): string {
  if (isNaN(amount) || amount === 0) return '零元整'
  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖']
  const unit = [
    ['元', '万', '亿'],
    ['', '拾', '佰', '仟'],
  ]
  const head = amount < 0 ? '负' : ''
  const num = Math.abs(amount)

  const jiao = Math.floor(Math.round(num * 100) / 10) % 10
  const fen = Math.round(num * 100) % 10

  let fracPart = ''
  if (jiao > 0 && fen > 0) {
    fracPart = digit[jiao] + '角' + digit[fen] + '分'
  } else if (jiao > 0 && fen === 0) {
    fracPart = digit[jiao] + '角整'
  } else if (jiao === 0 && fen > 0) {
    fracPart = '零' + digit[fen] + '分'
  } else {
    fracPart = '整'
  }

  let intPart = Math.floor(num)
  let intStr = ''
  for (let i = 0; i < unit[0].length && intPart > 0; i++) {
    let p = ''
    for (let j = 0; j < unit[1].length && intPart > 0; j++) {
      p = digit[intPart % 10] + unit[1][j] + p
      intPart = Math.floor(intPart / 10)
    }
    intStr = p.replace(/(零.)*零$/, '').replace(/^$/, '零') + unit[0][i] + intStr
  }
  intStr = intStr.replace(/(零.)*零元/, '元').replace(/(零.)+/g, '零')
  if (!intStr) intStr = '零元'
  if (intStr.endsWith('元') && fracPart === '整') {
    return head + intStr + '整'
  }
  return head + intStr + fracPart
}

function httpReference(reference?: string): string | null {
  if (!reference) return null
  try {
    const url = new URL(reference)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

export function FiscalReceiptModal({ open, onClose, receipt, settlement, onPrint }: FiscalReceiptModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const [actionError, setActionError] = useState('')
  const printInFlight = useRef(false)
  const canPrint = receipt?.status === 'ISSUED' && !!receipt.fiscalCode && !!receipt.fiscalNumber

  const handlePrint = useCallback(async () => {
    if (!open || !receipt || !canPrint || printInFlight.current) return
    printInFlight.current = true
    setPrinting(true)
    setActionError('')
    try {
      if (onPrint) await onPrint(receipt.id)
      window.print()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : '打印失败，请重试。')
    } finally {
      printInFlight.current = false
      setPrinting(false)
    }
  }, [open, receipt, canPrint, onPrint])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        void handlePrint()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, handlePrint])

  useEffect(() => { setCopiedKey(null); setActionError('') }, [open, receipt?.id])
  if (!open || !receipt) return null

  const handleCopy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedKey(key)
    } catch { setActionError('复制失败，请手动复制。') }
  }
  const status = fiscalReceiptStatusPresentation(receipt.status)
  const reference = httpReference(receipt.controlledObjectReference)
  const sameSettlement = settlement?.id === receipt.settlementId ? settlement : null
  const money = (amount?: number) => amount == null ? '未提供' : `${receipt.currencyCode === 'CNY' ? '¥' : receipt.currencyCode + ' '}${amount.toFixed(2)}`

  return <Dialog title="财政医疗收费电子票据" eyebrow="票据信息与结算明细" onClose={onClose}
    size="xwide" className="fiscal-receipt-dialog" footer={
      <div className="fiscal-receipt-actions">
        <span>打印内容为系统票据信息摘要，原件及查验结果以财政平台为准。</span>
        <div className="fiscal-receipt-actions__buttons">
          <Button variant="secondary" disabled={!receipt.verificationCode}
            onClick={() => void handleCopy(receipt.verificationCode!, 'code')}>
            {copiedKey === 'code' ? '已复制校验码' : '复制防伪校验码'}
          </Button>
          <Button variant="secondary" disabled={!reference}
            onClick={() => void handleCopy(reference!, 'url')}>
            {copiedKey === 'url' ? '已复制票据链接' : '复制票据链接'}
          </Button>
          <Button onClick={() => void handlePrint()} disabled={!canPrint || printing}>
            <Icon name="print" />{printing ? '正在调起打印...' : '打印票据信息 (Ctrl+P)'}
          </Button>
          <Button variant="secondary" onClick={onClose}>关闭</Button>
        </div>
      </div>
    }>
    {actionError && <Alert tone="warning">{actionError}</Alert>}
    <div className="fiscal-invoice-container">
      <div className="fiscal-invoice-paper" id="fiscal-printable-area">
        <header className="fiscal-header">
          <h2 className="fiscal-title">电子票据信息</h2>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {receipt.errorMessage && <Alert tone="warning">{receipt.errorMessage}</Alert>}
          <div className="fiscal-four-elements">
            {[
              ['电子票据代码', receipt.fiscalCode], ['电子票据号码', receipt.fiscalNumber],
              ['防伪校验码', receipt.verificationCode],
              ['开票日期', receipt.issuedAt ? new Date(receipt.issuedAt).toLocaleString('zh-CN', { hour12: false }) : undefined],
            ].map(([label, value]) => <div className="fiscal-element-row" key={label}>
              <span className="fiscal-element-label">{label}：</span>
              <span className="fiscal-element-value">{value || '未提供'}</span>
            </div>)}
          </div>
        </header>
        <section className="fiscal-meta-grid">
          {[
            ['交款人姓名', receipt.payerName], ['财政主管机构代码', receipt.fiscalAuthorityCode],
            ['票据申请流水号', receipt.receiptNo], ['关联结算单号', sameSettlement?.settlementNo],
            ['开票渠道代码', receipt.issueChannel], ['创建人标识', receipt.createdBy],
          ].map(([label, value]) => <div className="fiscal-meta-item" key={label}>
            <span className="fiscal-meta-label">{label}：</span>
            <span className="fiscal-meta-text">{value || '未提供'}</span>
          </div>)}
        </section>
        <section className="fiscal-details-section">
          <h3>关联结算明细</h3>
          <DataTable className="fiscal-table">
            <thead><tr><th>结算行号</th><th>收费项目标识</th>
              <th className={tableCellClass('numeric')}>数量</th>
              <th className={tableCellClass('numeric')}>结算金额</th></tr></thead>
            <tbody>{sameSettlement?.lines.length ? sameSettlement.lines.map((line) => <tr key={line.id}>
              <td>{line.lineNo}</td><td>{line.chargeItemId}</td>
              <td className={tableCellClass('numeric')}>{line.settledQuantity}</td>
              <td className={tableCellClass('numeric')}>{money(line.netAmount)}</td>
            </tr>) : <tr><td colSpan={4}>未提供结算明细</td></tr>}</tbody>
          </DataTable>
        </section>
        <section className="fiscal-totals-section">
          {receipt.currencyCode === 'CNY' && <div className="fiscal-total-words">
            <span>票据金额（大写）：</span><span>{convertToChineseCurrency(receipt.amount)}</span>
          </div>}
          <div className="fiscal-total-figure"><span>票据金额：</span><strong>{money(receipt.amount)}</strong></div>
        </section>
        <section className="fiscal-breakdown-grid">
          {[
            ['结算医保分摊', sameSettlement?.insuranceAmount],
            ['已记录个人账户支付', sameSettlement?.tenders.filter((t) => t.tenderType === 'PERSONAL_ACCOUNT').reduce((sum, t) => sum + t.amount, 0)],
            ['结算患者分摊', sameSettlement?.patientAmount],
          ].map(([label, value]) => <div className="fiscal-breakdown-card" key={label}>
            <span className="fiscal-breakdown-label">{label}</span>
            <span className="fiscal-breakdown-num">{money(value as number | undefined)}</span>
          </div>)}
        </section>
        <footer className="fiscal-footer-grid">
          {reference ? <a href={reference} target="_blank" rel="noopener noreferrer">打开平台返回的票据链接</a>
            : <span>平台未提供可打开的票据链接</span>}
          <span>本页展示业务系统收到的票据信息，不代表已完成财政平台验真。</span>
        </footer>
      </div>
    </div>
  </Dialog>
}
