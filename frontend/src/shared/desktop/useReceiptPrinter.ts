import { useCallback, useState } from 'react'
import type { DesktopPrintDelivery, PrintingApi } from '../api/printingApi'
import { printReceipt, type ReceiptPrintResult } from './desktopPrintDelivery'

/** 只有待投递或已确认未执行的工作站投递可以再次下发，其余状态须登记重打或先核对。 */
const REDISPATCHABLE = new Set<DesktopPrintDelivery['status']>(['QUEUED', 'FAILED'])

type PrintableReceipt = Parameters<typeof printReceipt>[1]
type Printing = Parameters<typeof printReceipt>[0] & Pick<PrintingApi, 'reconcileDesktopPrint'>

/**
 * 受控输出的打印入口：记住工作站投递的最新版本，重新打印和人工核对都基于服务端最新状态，
 * 不使用回执里已过期的 revision。
 */
export function useReceiptPrinter(printing: Printing) {
  const [result, setResult] = useState<ReceiptPrintResult | null>(null)
  const [latest, setLatest] = useState<DesktopPrintDelivery | null>(null)
  const [reconciling, setReconciling] = useState(false)

  const print = useCallback(async (receipt: PrintableReceipt) => {
    const delivery = receipt.delivery && latest && latest.id === receipt.delivery.id
      ? { ...receipt.delivery, revision: latest.revision, status: latest.status, channel: latest.channel }
      : receipt.delivery
    if (delivery?.channel === 'DESKTOP_LINK' && !REDISPATCHABLE.has(delivery.status)) {
      throw new Error('该文件已提交到工作站打印，如需再次打印请登记重打')
    }
    const value = await printReceipt(printing, { ...receipt, delivery })
    setResult(value)
    if (value.kind === 'desktop' || value.kind === 'browser-fallback') setLatest(value.delivery)
    return value
  }, [latest, printing])

  const reconcile = useCallback(async (printed: boolean, note?: string) => {
    if (result?.kind !== 'desktop') return
    setReconciling(true)
    try {
      const delivery = await printing.reconcileDesktopPrint(result.delivery.id, result.delivery.revision, printed, note)
      setLatest(delivery)
      setResult({ ...result, delivery })
    } finally {
      setReconciling(false)
    }
  }, [printing, result])

  return { print, result, reconcile, reconciling }
}
