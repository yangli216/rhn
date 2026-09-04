import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { ReceiptView, Settlement } from '../api/billingApi'
import {
  FiscalReceiptModal,
  convertToChineseCurrency,
} from './FiscalReceiptModal'

const mockReceipt: ReceiptView = {
  id: 'rcpt-101',
  revision: 1,
  settlementId: 'settle-201',
  receiptNo: 'REQ-2026-001',
  commandCode: 'ISSUE-001',
  receiptType: 'MEDICAL_E_INVOICE',
  status: 'ISSUED',
  fiscalAuthorityCode: '360100',
  fiscalCode: '3601060126',
  fiscalNumber: '0001859231',
  verificationCode: '251132',
  controlledObjectReference:
    'https://pjcy.jx-fiscal.gov.cn/bill/verify?bill_code=3601060126&bill_no=0001859231&check_code=251132',
  amount: 188.5,
  currencyCode: 'CNY',
  issueChannel: 'CASHIER',
  payerName: '李四',
  duplicate: false,
  createdAt: '2026-09-04T10:00:00Z',
  issuedAt: '2026-09-04T10:00:05Z',
  updatedAt: '2026-09-04T10:00:05Z',
}

const mockSettlement: Settlement = {
  id: 'settle-201',
  revision: 1,
  patientAccountId: 'acc-1',
  settlementNo: 'SETL-20260904-01',
  commandCode: 'CMD-SETL-01',
  settlementType: 'NORMAL',
  settlementScene: 'OUTPATIENT',
  terminalScene: 'CASHIER',
  status: 'SETTLED',
  grossAmount: 188.5,
  discountAmount: 0,
  insuranceAmount: 120.0,
  patientAmount: 68.5,
  otherAmount: 0,
  roundingAmount: 0,
  netAmount: 188.5,
  tenderedAmount: 188.5,
  outstandingAmount: 0,
  currencyCode: 'CNY',
  createdBy: 'user-1',
  createdAt: '2026-09-04T09:59:00Z',
  lines: [
    {
      id: 'line-1',
      chargeItemId: 'chg-1',
      lineNo: 1,
      settledQuantity: 2,
      grossAmount: 38.5,
      discountAmount: 0,
      insuranceAmount: 20.0,
      patientAmount: 18.5,
      otherAmount: 0,
      netAmount: 38.5,
    },
    {
      id: 'line-2',
      chargeItemId: 'chg-2',
      lineNo: 2,
      settledQuantity: 1,
      grossAmount: 150.0,
      discountAmount: 0,
      insuranceAmount: 100.0,
      patientAmount: 50.0,
      otherAmount: 0,
      netAmount: 150.0,
    },
  ],
  tenders: [],
  events: [],
}

describe('convertToChineseCurrency', () => {
  it('converts numbers to uppercase Chinese currency accurately', () => {
    expect(convertToChineseCurrency(0)).toBe('零元整')
    expect(convertToChineseCurrency(100)).toBe('壹佰元整')
    expect(convertToChineseCurrency(188.5)).toBe('壹佰捌拾捌元伍角整')
    expect(convertToChineseCurrency(1234.56)).toBe('壹仟贰佰叁拾肆元伍角陆分')
  })
})

describe('FiscalReceiptModal', () => {
  it('renders four core elements, items table, and totals', () => {
    const onClose = vi.fn()
    render(
      <FiscalReceiptModal
        open
        onClose={onClose}
        receipt={mockReceipt}
        settlement={mockSettlement}
      />,
    )

    // 票据版头与大标题
    expect(screen.getByText('江西省医疗门诊收费电子票据')).toBeInTheDocument()
    expect(screen.getByText('全国统一财政电子票据')).toBeInTheDocument()

    // 票据核心四要素
    expect(screen.getByText('3601060126')).toBeInTheDocument()
    expect(screen.getByText('0001859231')).toBeInTheDocument()
    expect(screen.getByText('251132')).toBeInTheDocument()

    // 明细清单与交款人
    expect(screen.getByText('李四')).toBeInTheDocument()
    expect(screen.getByText('门诊医疗收费项目 #1')).toBeInTheDocument()
    expect(screen.getByText('门诊医疗收费项目 #2')).toBeInTheDocument()

    // 金额与医保统筹分解
    expect(screen.getByText('壹佰捌拾捌元伍角整')).toBeInTheDocument()
    expect(screen.getByText('¥188.50')).toBeInTheDocument()
    expect(screen.getByText('¥120.00')).toBeInTheDocument()
    expect(screen.getByText('¥68.50')).toBeInTheDocument()

    // 官方监制章与动态查验二维码
    expect(screen.getByText('江西省财政厅')).toBeInTheDocument()
    expect(screen.getByText('医疗收费票据监制章')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /防伪查验二维码/ })).toBeInTheDocument()
  })

  it('supports copying verification code and triggering print', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onPrint = vi.fn().mockResolvedValue(undefined)

    // Mock clipboard and window.print
    const writeTextMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true,
    })
    const originalPrint = window.print
    window.print = vi.fn()

    render(
      <FiscalReceiptModal
        open
        onClose={onClose}
        receipt={mockReceipt}
        settlement={mockSettlement}
        onPrint={onPrint}
      />,
    )

    // 复制校验码
    const copyBtn = screen.getByRole('button', { name: /复制防伪校验码/ })
    await user.click(copyBtn)
    expect(writeTextMock).toHaveBeenCalledWith('251132')
    await waitFor(() => {
      expect(screen.getByText('已复制校验码')).toBeInTheDocument()
    })

    // 打印票据
    const printBtn = screen.getByRole('button', { name: /打印电子票据/ })
    await user.click(printBtn)
    expect(onPrint).toHaveBeenCalledWith('rcpt-101')
    expect(window.print).toHaveBeenCalled()

    window.print = originalPrint
  })

  it('renders red flush stamp when invoice is red flushed', () => {
    const redReceipt: ReceiptView = {
      ...mockReceipt,
      status: 'RED_FLUSHED',
      fiscalNumber: 'RED-0001859231',
    }

    render(
      <FiscalReceiptModal
        open
        onClose={vi.fn()}
        receipt={redReceipt}
        settlement={mockSettlement}
      />,
    )

    expect(screen.getByText('红字作废冲红')).toBeInTheDocument()
    expect(screen.getByText('已红字冲红')).toBeInTheDocument()
  })
})
