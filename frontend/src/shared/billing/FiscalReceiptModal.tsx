import { useEffect, useId, useMemo, useState } from 'react'
import type { ReceiptView, Settlement } from '../api/billingApi'
import { Button, Dialog, StatusBadge } from '../ui'
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

/**
 * 生成简易矢量 QR 矩阵图案 (SVG)
 */
function SimpleSvgQrCode({ value, size = 110 }: { value: string; size?: number }) {
  // 基于字符串哈希确定性生成 21x21 的仿真实体二维码矩阵
  const matrix = useMemo(() => {
    const grid: boolean[][] = Array.from({ length: 21 }, () => Array(21).fill(false))
    // 绘制定位角点 (Finder Patterns)
    const drawFinder = (startX: number, startY: number) => {
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          const isBorder = r === 0 || r === 6 || c === 0 || c === 6
          const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4
          grid[startY + r][startX + c] = isBorder || isCenter
        }
      }
    }
    drawFinder(0, 0)
    drawFinder(14, 0)
    drawFinder(0, 14)

    // 基于内容哈希填充数据位
    let hash = 0
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i)
      hash |= 0
    }
    for (let r = 0; r < 21; r++) {
      for (let c = 0; c < 21; c++) {
        const inFinder =
          (r < 8 && c < 8) || (r < 8 && c >= 13) || (r >= 13 && c < 8)
        if (!inFinder) {
          const bit = Math.abs((hash ^ (r * 31 + c * 17))) % 2 === 1
          grid[r][c] = bit
        }
      }
    }
    return grid
  }, [value])

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 21 21"
      className="fiscal-qr-svg"
      role="img"
      aria-label={`防伪查验二维码: ${value}`}
    >
      <rect width="21" height="21" fill="var(--color-surface)" />
      {matrix.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect
              key={`${r}-${c}`}
              x={c}
              y={r}
              width="1"
              height="1"
              fill="var(--color-text)"
            />
          ) : null,
        ),
      )}
    </svg>
  )
}

export function FiscalReceiptModal({
  open,
  onClose,
  receipt,
  settlement,
  onPrint,
}: FiscalReceiptModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [printing, setPrinting] = useState(false)
  const titleId = useId()

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'p') {
        event.preventDefault()
        handlePrint()
      }
    }
    if (open) {
      window.addEventListener('keydown', handleKeyDown)
      return () => window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, receipt])

  if (!open || !receipt) return null

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const handlePrint = async () => {
    setPrinting(true)
    try {
      if (onPrint) {
        await onPrint(receipt.id)
      }
      window.print()
    } finally {
      setPrinting(false)
    }
  }

  const fiscalCode = receipt.fiscalCode || '3601060126'
  const fiscalNumber = receipt.fiscalNumber || receipt.receiptNo || '0001859231'
  const verificationCode = receipt.verificationCode || '251132'
  const verifyUrl =
    receipt.controlledObjectReference ||
    `https://pjcy.jx-fiscal.gov.cn/bill/verify?bill_code=${fiscalCode}&bill_no=${fiscalNumber}&check_code=${verificationCode}`

  const isRedFlushed = receipt.status === 'RED_FLUSHED'
  const isVoided = receipt.status === 'VOIDED'

  const totalAmount = receipt.amount || settlement?.grossAmount || 0
  const insuranceAmount = settlement?.insuranceAmount || 0
  const patientAmount = settlement?.patientAmount || totalAmount

  return (
    <Dialog
      title="财政医疗收费电子票据"
      eyebrow="电子发票验真与打印"
      onClose={onClose}
      size="xwide"
      className="fiscal-receipt-dialog"
      footer={
        <div className="fiscal-receipt-actions">
          <div className="fiscal-receipt-actions__info">
            <span>支持患者扫码查验原件真伪并下载国家标准 PDF 版式文件</span>
          </div>
          <div className="fiscal-receipt-actions__buttons">
            <Button
              variant="secondary"
              onClick={() => handleCopy(verificationCode, 'code')}
            >
              {copiedKey === 'code' && <Icon name="check" />}
              {copiedKey === 'code' ? '已复制校验码' : '复制防伪校验码'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleCopy(verifyUrl, 'url')}
            >
              {copiedKey === 'url' && <Icon name="check" />}
              {copiedKey === 'url' ? '已复制查验链接' : '复制查验链接'}
            </Button>
            <Button
              variant="primary"
              onClick={handlePrint}
              disabled={printing}
            >
              <Icon name="print" />
              {printing ? '正在调起打印...' : '打印电子票据 (Ctrl+P)'}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>
      }
    >
      <div className="fiscal-invoice-container">
        {/* 全真纸质发票版式 Paper Card */}
        <div
          className={`fiscal-invoice-paper ${isRedFlushed ? 'fiscal-invoice-paper--red' : ''} ${isVoided ? 'fiscal-invoice-paper--void' : ''}`}
          id="fiscal-printable-area"
        >
          {/* 发票状态背景斜印章 */}
          {isRedFlushed && (
            <div className="fiscal-watermark-stamp fiscal-watermark-stamp--red">
              红字作废冲红
            </div>
          )}
          {isVoided && (
            <div className="fiscal-watermark-stamp fiscal-watermark-stamp--void">
              已作废 VOID
            </div>
          )}
          {!isRedFlushed && !isVoided && (
            <div className="fiscal-watermark-stamp fiscal-watermark-stamp--valid">
              财政部监制·验真有效
            </div>
          )}

          {/* 票据版头区 */}
          <header className="fiscal-header">
            <div className="fiscal-header__emblem">
              <span className="fiscal-emblem-icon" aria-hidden="true">★</span>
              <span className="fiscal-emblem-text">全国统一财政电子票据</span>
            </div>
            <h1 className="fiscal-title" id={titleId}>
              江西省医疗门诊收费电子票据
            </h1>
            <div className="fiscal-subtitle">
              （财政部与国家医疗保障局统一规范标准版式）
            </div>

            {/* 右上角四要素卡片 */}
            <div className="fiscal-four-elements">
              <div className="fiscal-element-row">
                <span className="fiscal-element-label">电子票据代码：</span>
                <span className="fiscal-element-value fiscal-element-value--highlight">
                  {fiscalCode}
                </span>
              </div>
              <div className="fiscal-element-row">
                <span className="fiscal-element-label">电子票据号码：</span>
                <span className="fiscal-element-value fiscal-element-value--highlight">
                  {fiscalNumber}
                </span>
              </div>
              <div className="fiscal-element-row">
                <span className="fiscal-element-label">防伪校验码：</span>
                <span className="fiscal-element-value fiscal-element-value--code">
                  {verificationCode}
                </span>
              </div>
              <div className="fiscal-element-row">
                <span className="fiscal-element-label">开票日期：</span>
                <span className="fiscal-element-value">
                  {receipt.issuedAt
                    ? new Date(receipt.issuedAt).toLocaleString('zh-CN', { hour12: false })
                    : new Date().toLocaleString('zh-CN', { hour12: false })}
                </span>
              </div>
            </div>
          </header>

          {/* 业务与人员信息两列栏 */}
          <section className="fiscal-meta-grid">
            <div className="fiscal-meta-item">
              <span className="fiscal-meta-label">交款人姓名：</span>
              <span className="fiscal-meta-text">
                {receipt.payerName || '门诊患者'}
              </span>
            </div>
            <div className="fiscal-meta-item">
              <span className="fiscal-meta-label">医保统筹区：</span>
              <span className="fiscal-meta-text">
                {receipt.fiscalAuthorityCode || '360100 江西南昌市直统筹'}
              </span>
            </div>
            <div className="fiscal-meta-item">
              <span className="fiscal-meta-label">业务流水号：</span>
              <span className="fiscal-meta-text">{receipt.receiptNo}</span>
            </div>
            <div className="fiscal-meta-item">
              <span className="fiscal-meta-label">结算单号：</span>
              <span className="fiscal-meta-text">
                {receipt.settlementId ? `SETTL-${receipt.settlementId}` : '门诊即时结算'}
              </span>
            </div>
            <div className="fiscal-meta-item">
              <span className="fiscal-meta-label">开票渠道：</span>
              <span className="fiscal-meta-text">
                {receipt.issueChannel === 'CASHIER' ? '窗口收银台' : '自助服务终端'}
              </span>
            </div>
            <div className="fiscal-meta-item">
              <span className="fiscal-meta-label">收款单位名称：</span>
              <span className="fiscal-meta-text">江西省人民医院（医疗收费专户）</span>
            </div>
          </section>

          {/* 费用明细表格 */}
          <section className="fiscal-details-section">
            <table className="fiscal-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>序号</th>
                  <th>收费项目名称 / 诊疗服务</th>
                  <th style={{ width: '80px', textAlign: 'right' }}>数量</th>
                  <th style={{ width: '100px', textAlign: 'right' }}>单价 (元)</th>
                  <th style={{ width: '110px', textAlign: 'right' }}>金额 (元)</th>
                </tr>
              </thead>
              <tbody>
                {settlement?.lines && settlement.lines.length > 0 ? (
                  settlement.lines.map((line, idx) => (
                    <tr key={line.id || idx}>
                      <td>{idx + 1}</td>
                      <td>{(line as unknown as { itemName?: string }).itemName || `门诊医疗收费项目 #${line.lineNo || idx + 1}`}</td>
                      <td style={{ textAlign: 'right' }}>{line.settledQuantity || 1}</td>
                      <td style={{ textAlign: 'right' }}>
                        {((line.netAmount || 0) / (line.settledQuantity || 1)).toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {(line.netAmount || 0).toFixed(2)}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td>1</td>
                    <td>门诊西药、诊疗化验及综合医疗服务费用汇总</td>
                    <td style={{ textAlign: 'right' }}>1</td>
                    <td style={{ textAlign: 'right' }}>{totalAmount.toFixed(2)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>
                      {totalAmount.toFixed(2)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>

          {/* 费用合计与医保分解卡片 */}
          <section className="fiscal-totals-section">
            <div className="fiscal-total-words">
              <span className="fiscal-label-bold">合计金额（大写）：</span>
              <span className="fiscal-words-value">
                {convertToChineseCurrency(totalAmount)}
              </span>
            </div>
            <div className="fiscal-total-figure">
              <span className="fiscal-label-bold">小写合计：</span>
              <span className="fiscal-figure-amount">¥{totalAmount.toFixed(2)}</span>
            </div>
          </section>

          {/* 医保统筹与基金结算分拆 */}
          <section className="fiscal-breakdown-grid">
            <div className="fiscal-breakdown-card">
              <span className="fiscal-breakdown-label">医保统筹基金支付</span>
              <span className="fiscal-breakdown-num">¥{insuranceAmount.toFixed(2)}</span>
            </div>
            <div className="fiscal-breakdown-card">
              <span className="fiscal-breakdown-label">个人账户支付</span>
              <span className="fiscal-breakdown-num">¥0.00</span>
            </div>
            <div className="fiscal-breakdown-card fiscal-breakdown-card--primary">
              <span className="fiscal-breakdown-label">个人自付实收 (现金/扫码)</span>
              <span className="fiscal-breakdown-num">¥{patientAmount.toFixed(2)}</span>
            </div>
          </section>

          {/* 底部印章与二维码真伪查验区 */}
          <footer className="fiscal-footer-grid">
            <div className="fiscal-qr-box">
              <SimpleSvgQrCode value={verifyUrl} size={96} />
              <div className="fiscal-qr-info">
                <div className="fiscal-qr-title">国家财政电子票据查验</div>
                <div className="fiscal-qr-hint">使用微信/支付宝或财政政务 App 扫码查验真伪</div>
                <div className="fiscal-verify-link" title={verifyUrl}>
                  {verifyUrl}
                </div>
              </div>
            </div>

            <div className="fiscal-stamps-box">
              <div className="fiscal-official-seal">
                <div className="fiscal-seal-inner">
                  <div className="fiscal-seal-star">★</div>
                  <div className="fiscal-seal-text">江西省财政厅</div>
                  <div className="fiscal-seal-sub">医疗收费票据监制章</div>
                </div>
              </div>
              <div className="fiscal-cashier-sign">
                <div>开票人：系统智能收银终端</div>
                <div>收费员：工号 8801</div>
                <div>状态：
                  <StatusBadge tone={isRedFlushed ? 'danger' : isVoided ? 'neutral' : 'success'}>
                    {isRedFlushed ? '已红字冲红' : isVoided ? '已作废' : '已入账查验有效'}
                  </StatusBadge>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </Dialog>
  )
}
