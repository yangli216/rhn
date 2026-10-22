import type { DesktopInvokeResponse, DesktopTrackedInvocationStatus, DesktopTrackedPluginInvoker } from './desktopHost'

/**
 * RHN Link `rhn.printing` 插件契约（rhn-link `docs/rhn-printing.md`）。
 *
 * 通用 DLL ABI 只输出整数与字符串：`ResData = { ReturnValue, result }`，`ReturnValue = 0` 时 `result` 为业务对象 JSON，
 * 非零时 `result` 为 `{"error":"<稳定码>"}`。这里只判断“已提交 / 保证未执行 / 结果不确定”，不做任何自动重试。
 */
export const RHN_PRINTING_SERVICE = 'rhn.printing'

export interface PrintPdfParameters {
  printerName: string
  documentBase64: string
  /** 解码后 PDF 字节的小写十六进制 SHA-256。 */
  sha256: string
  copies: number
  jobName: string
}

export type DesktopPrintSettlement =
  | { kind: 'submitted'; systemJobNo?: string }
  | { kind: 'not-executed'; code: string }
  | { kind: 'uncertain'; code: string }

/** 进入打印队列之前失败的插件状态码；1006（作业中止）与 1008（内部异常）不在此列，可能已部分入队。 */
const NOT_EXECUTED_RETURN_CODES: Record<number, string> = {
  1001: 'invalid-request',
  1002: 'document-digest-mismatch',
  1003: 'document-invalid',
  1004: 'printer-not-found',
  1005: 'printer-unavailable',
  1007: 'output-buffer-too-small',
  1050: 'unsupported-platform',
}
/** controller 在进入插件宿主前产生的拒绝码，保证未执行。 */
const NOT_EXECUTED_CONTROL_CODES = new Set([-32001, -32002, -32003, -32004, -32010])
const RESULT_CODE = /^[A-Za-z0-9._:-]{1,80}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseResult(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function stableCode(value: unknown, fallback: string) {
  return typeof value === 'string' && RESULT_CODE.test(value) ? value : fallback
}

export function classifyPrintPdfResponse(response: unknown): DesktopPrintSettlement {
  if (!isRecord(response) || typeof response.ResCode !== 'number') return { kind: 'uncertain', code: 'malformed-response' }
  if (response.ResCode !== 0) {
    return NOT_EXECUTED_CONTROL_CODES.has(response.ResCode)
      ? { kind: 'not-executed', code: `control${response.ResCode}` }
      : { kind: 'uncertain', code: 'host-error' }
  }
  const data = response.ResData
  if (!isRecord(data) || typeof data.ReturnValue !== 'number') return { kind: 'uncertain', code: 'malformed-response' }
  const result = parseResult(data.result)
  if (data.ReturnValue === 0) {
    if (result?.submitted !== true) return { kind: 'uncertain', code: 'malformed-response' }
    const jobId = result.systemJobId
    return typeof jobId === 'number' && Number.isSafeInteger(jobId) && jobId >= 0
      ? { kind: 'submitted', systemJobNo: String(jobId) }
      : { kind: 'submitted' }
  }
  const notExecuted = NOT_EXECUTED_RETURN_CODES[data.ReturnValue]
  if (notExecuted) return { kind: 'not-executed', code: stableCode(result?.error, notExecuted) }
  return { kind: 'uncertain', code: stableCode(result?.error, `return-${data.ReturnValue}`) }
}

function settleStatus(status: unknown): DesktopPrintSettlement | 'pending' {
  if (!isRecord(status) || typeof status.state !== 'string') return { kind: 'uncertain', code: 'malformed-status' }
  const value = status as DesktopTrackedInvocationStatus
  switch (value.state) {
    case 'pending': return 'pending'
    case 'completed': return classifyPrintPdfResponse(value.response as DesktopInvokeResponse)
    case 'indeterminate': return { kind: 'uncertain', code: 'indeterminate' }
    case 'completedWithoutResult': return { kind: 'uncertain', code: 'completed-without-result' }
    case 'unknown': return { kind: 'uncertain', code: 'operation-unknown' }
    default: return { kind: 'uncertain', code: 'malformed-status' }
  }
}

/** 桌面端结构化拒绝（`{ kind: 'trackedInvocationError', phase, code }`）保留阶段与码；其余异常一律按可能已执行处理。 */
function rejectionCode(error: unknown) {
  if (isRecord(error) && error.kind === 'trackedInvocationError'
    && typeof error.phase === 'string' && typeof error.code === 'string') {
    return stableCode(`${error.phase}:${error.code}`, 'desktop-rejection')
  }
  return 'desktop-rejection'
}

export interface PrintPdfTrackedOptions {
  pollIntervalMs?: number
  /** 插件宿主默认方法超时 120 秒，留出余量后仍未完成即按不确定处理。 */
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
}

/**
 * 以持久调用提交打印。`operationId` 必须已由业务流程持久保存；同一编码只会执行一次，
 * 本函数对 `pending` 只查询同一操作，不会以新编码重放。
 */
export async function printPdfTracked(
  invoker: DesktopTrackedPluginInvoker,
  operationId: string,
  parameters: PrintPdfParameters,
  {
    pollIntervalMs = 1000,
    timeoutMs = 150_000,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now = Date.now,
  }: PrintPdfTrackedOptions = {},
): Promise<DesktopPrintSettlement> {
  const deadline = now() + timeoutMs
  let status: unknown
  try {
    status = await invoker.invokePluginTracked(operationId, RHN_PRINTING_SERVICE, 'printPdf', { ...parameters })
  } catch (error) {
    return { kind: 'uncertain', code: rejectionCode(error) }
  }
  for (;;) {
    const settled = settleStatus(status)
    if (settled !== 'pending') return settled
    if (now() >= deadline) return { kind: 'uncertain', code: 'pending-timeout' }
    await sleep(pollIntervalMs)
    try {
      status = await invoker.getPluginInvocation(operationId, RHN_PRINTING_SERVICE, 'printPdf')
    } catch (error) {
      return { kind: 'uncertain', code: rejectionCode(error) }
    }
  }
}
