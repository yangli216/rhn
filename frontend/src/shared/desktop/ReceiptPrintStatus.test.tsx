import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { DesktopPrintDelivery } from '../api/printingApi'
import { ReceiptPrintStatus } from './ReceiptPrintStatus'

const uncertain: DesktopPrintDelivery = { id: 'd-1', revision: 2, channel: 'DESKTOP_LINK', status: 'UNCERTAIN', attemptCount: 1 }

describe('ReceiptPrintStatus', () => {
  it('结果不确定时提示核对，判定未出纸必须填写说明', async () => {
    const onReconcile = vi.fn().mockResolvedValue(undefined)
    render(<ReceiptPrintStatus reconciling={false} onReconcile={onReconcile}
      result={{ kind: 'desktop', delivery: uncertain, printerName: '处方打印机', settlement: { kind: 'uncertain', code: 'job-aborted' } }} />)
    expect(screen.getByText(/打印结果不确定（打印作业在提交过程中中止）/)).toBeInTheDocument()
    const notPrinted = screen.getByRole('button', { name: '判定未出纸' })
    expect(notPrinted).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), '队列无该作业')
    await userEvent.click(notPrinted)
    expect(onReconcile).toHaveBeenCalledWith(false, '队列无该作业')
    await userEvent.click(screen.getByRole('button', { name: '确认已出纸' }))
    expect(onReconcile).toHaveBeenLastCalledWith(true, undefined)
  })

  it('未执行时按插件码说明原因，不提供核对操作', () => {
    render(<ReceiptPrintStatus reconciling={false} onReconcile={vi.fn()}
      result={{ kind: 'desktop', delivery: { ...uncertain, status: 'FAILED' }, printerName: '处方打印机',
        settlement: { kind: 'not-executed', code: 'printer-not-found' } }} />)
    expect(screen.getByText(/工作站未找到绑定的打印机/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认已出纸' })).not.toBeInTheDocument()
  })
})
