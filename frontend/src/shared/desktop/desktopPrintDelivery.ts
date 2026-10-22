import type { DesktopPrintDelivery, PrintingApi, PrintReceipt } from '../api/printingApi'
import { getDesktopHost, type DesktopHost } from './desktopHost'
import { printPdfTracked, type DesktopPrintSettlement, type PrintPdfTrackedOptions } from './rhnPrinting'

export type ReceiptPrintResult =
  /** 浏览器打印（含 BROWSER_PDF 通道和没有投递记录的旧回执）：已调起系统打印预览，无出纸回执。 */
  | { kind: 'browser' }
  /** 本地打印桥自行领取，页面无需操作。 */
  | { kind: 'queued' }
  /** 工作站打印设备，但页面不在可用的 RHN Link 中：投递改记为浏览器打印后调起预览。 */
  | { kind: 'browser-fallback'; delivery: DesktopPrintDelivery }
  | { kind: 'desktop'; settlement: DesktopPrintSettlement; delivery: DesktopPrintDelivery; printerName: string }

type ReceiptPrinting = Pick<PrintingApi, 'printPdf' | 'content' | 'desktopDispatch' | 'desktopResult' | 'desktopBrowserFallback'>
type PrintableReceipt = Pick<PrintReceipt, 'downloadUrl'> & { delivery?: PrintReceipt['delivery'] | null }

/** 工作站已执行但结果没能写回 RHN：投递保持“已下发”，不得换新操作编码重打。 */
export class DesktopPrintResultNotRecordedError extends Error {
  constructor(readonly settlement: DesktopPrintSettlement, cause: unknown) {
    super('工作站打印已执行，但结果未能写回系统。请勿重复打印，先核对打印机出纸情况并联系管理员处理该打印记录。', { cause })
    this.name = 'DesktopPrintResultNotRecordedError'
  }
}

/**
 * 打印一份受控输出。非工作站通道保持原有行为；工作站通道先持久保存操作编码再调用插件，
 * 结果（已提交 / 未执行 / 不确定）回写投递记录。
 */
export async function printReceipt(
  printing: ReceiptPrinting,
  receipt: PrintableReceipt,
  options: { host?: () => Promise<DesktopHost>; tracked?: PrintPdfTrackedOptions } = {},
): Promise<ReceiptPrintResult> {
  const delivery = receipt.delivery
  if (delivery?.channel === 'LOCAL_BRIDGE') return { kind: 'queued' }
  if (delivery?.channel !== 'DESKTOP_LINK') {
    await printing.printPdf(receipt.downloadUrl)
    return { kind: 'browser' }
  }
  const host = await (options.host ?? getDesktopHost)()
  if (host.kind !== 'rhn-link' || !host.trackedInvocations) {
    const recorded = await printing.desktopBrowserFallback(delivery.id, delivery.revision)
    await printing.printPdf(receipt.downloadUrl)
    return { kind: 'browser-fallback', delivery: recorded }
  }

  const operationId = createOperationId()
  const dispatch = await printing.desktopDispatch(delivery.id, delivery.revision, operationId)
  const document = new Uint8Array(await (await printing.content(dispatch.downloadUrl)).arrayBuffer())
  const localDigest = await sha256Hex(document)
  const settlement: DesktopPrintSettlement = localDigest !== null && localDigest !== dispatch.sha256
    ? { kind: 'not-executed', code: 'local-digest-mismatch' }
    : await printPdfTracked(host.trackedInvoker, operationId, {
      printerName: dispatch.printerName,
      documentBase64: toBase64(document),
      sha256: dispatch.sha256,
      copies: dispatch.copies,
      jobName: dispatch.jobName,
    }, options.tracked)
  try {
    const recorded = await printing.desktopResult(delivery.id, {
      expectedRevision: dispatch.delivery.revision,
      operationId,
      outcome: settlement.kind === 'submitted' ? 'SUBMITTED' : settlement.kind === 'not-executed' ? 'NOT_EXECUTED' : 'UNCERTAIN',
      ...(settlement.kind === 'submitted' ? { systemJobNo: settlement.systemJobNo } : { resultCode: settlement.code }),
    })
    return { kind: 'desktop', settlement, delivery: recorded, printerName: dispatch.printerName }
  } catch (error) {
    throw new DesktopPrintResultNotRecordedError(settlement, error)
  }
}

/** UUID v4（小写）。院内 HTTP 部署不是安全上下文，`randomUUID` 不可用时退回 `getRandomValues`。 */
export function createOperationId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** 非安全上下文没有 SubtleCrypto 时跳过本地复核；插件仍会按 sha256 校验同一份字节。 */
async function sha256Hex(bytes: Uint8Array): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}
