import { describe, expect, it, vi } from 'vitest'
import type { DesktopPrintDelivery, PrintReceipt } from '../api/printingApi'
import type { DesktopHost } from './desktopHost'
import { createOperationId, DesktopPrintResultNotRecordedError, printReceipt } from './desktopPrintDelivery'

const pdf = new TextEncoder().encode('%PDF-1.7 test document')
const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', pdf)),
  (value) => value.toString(16).padStart(2, '0')).join('')

function delivery(channel: PrintReceipt['delivery']['channel'], overrides: Partial<DesktopPrintDelivery> = {}): DesktopPrintDelivery {
  return { id: 'd-1', revision: 0, channel, status: 'QUEUED', attemptCount: 1, ...overrides }
}

function receipt(channel: PrintReceipt['delivery']['channel']) {
  return { downloadUrl: '/api/platform/printing/outputs/o-1/content',
    delivery: { id: 'd-1', revision: 0, deviceName: '诊室打印机', channel, status: 'QUEUED' as const, attemptCount: 1 } }
}

function printing(sha256 = digest) {
  return {
    printPdf: vi.fn().mockResolvedValue(undefined),
    content: vi.fn().mockResolvedValue({ arrayBuffer: async () => pdf.slice().buffer }),
    desktopDispatch: vi.fn().mockImplementation(async (_id: string, _revision: number, operationId: string) => ({
      delivery: delivery('DESKTOP_LINK', { revision: 1, status: 'DISPATCHED', operationId }),
      operationId, printerName: '处方打印机', jobName: 'RHN-o-1', copies: 2, sha256,
      downloadUrl: '/api/platform/printing/outputs/o-1/content',
    })),
    desktopResult: vi.fn().mockImplementation(async (_id: string, report: { outcome: string }) =>
      delivery('DESKTOP_LINK', { revision: 2, status: report.outcome === 'SUBMITTED' ? 'SENT' : report.outcome === 'UNCERTAIN' ? 'UNCERTAIN' : 'FAILED' })),
    desktopBrowserFallback: vi.fn().mockResolvedValue(delivery('BROWSER_PDF', { status: 'SENT' })),
  }
}

function desktopHost(invokePluginTracked = vi.fn().mockResolvedValue({ state: 'completed', durable: true,
  response: { ResCode: 0, ResData: { ReturnValue: 0, result: '{"submitted":true,"systemJobId":42}' } } })) {
  const host: DesktopHost = {
    kind: 'rhn-link', system: { os: 'windows', architecture: 'x86_64', appVersion: '0.2.0', protocolVersion: 1 },
    invoker: { invokePlugin: vi.fn() }, trackedInvocations: true,
    trackedInvoker: { invokePluginTracked, getPluginInvocation: vi.fn() },
  }
  return { host: async () => host, invokePluginTracked }
}

describe('printReceipt', () => {
  it('非工作站通道保持原有浏览器打印与本地打印桥行为', async () => {
    const api = printing()
    await expect(printReceipt(api, receipt('BROWSER_PDF'))).resolves.toEqual({ kind: 'browser' })
    expect(api.printPdf).toHaveBeenCalledWith('/api/platform/printing/outputs/o-1/content')
    await expect(printReceipt(api, receipt('LOCAL_BRIDGE'))).resolves.toEqual({ kind: 'queued' })
    expect(api.printPdf).toHaveBeenCalledTimes(1)
    expect(api.desktopDispatch).not.toHaveBeenCalled()
  })

  it('工作站设备但页面不在 RHN Link 中时登记浏览器回退再调起预览', async () => {
    const api = printing()
    await expect(printReceipt(api, receipt('DESKTOP_LINK'), { host: async () => ({ kind: 'browser' }) }))
      .resolves.toMatchObject({ kind: 'browser-fallback', delivery: { channel: 'BROWSER_PDF' } })
    expect(api.desktopBrowserFallback).toHaveBeenCalledWith('d-1', 0)
    expect(api.printPdf).toHaveBeenCalledTimes(1)
    expect(api.desktopDispatch).not.toHaveBeenCalled()
  })

  it('先持久保存操作编码，再以同一编码调用插件并回写已提交', async () => {
    const api = printing()
    const { host, invokePluginTracked } = desktopHost()
    const result = await printReceipt(api, receipt('DESKTOP_LINK'), { host })
    const operationId = api.desktopDispatch.mock.calls[0][2] as string
    expect(operationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(api.desktopDispatch.mock.invocationCallOrder[0]).toBeLessThan(invokePluginTracked.mock.invocationCallOrder[0])
    expect(invokePluginTracked).toHaveBeenCalledWith(operationId, 'rhn.printing', 'printPdf', {
      printerName: '处方打印机', documentBase64: btoa('%PDF-1.7 test document'), sha256: digest, copies: 2, jobName: 'RHN-o-1',
    })
    expect(api.desktopResult).toHaveBeenCalledWith('d-1', { expectedRevision: 1, operationId, outcome: 'SUBMITTED', systemJobNo: '42' })
    expect(result).toMatchObject({ kind: 'desktop', settlement: { kind: 'submitted' }, printerName: '处方打印机',
      delivery: { status: 'SENT' } })
    expect(api.printPdf).not.toHaveBeenCalled()
  })

  it('本地摘要与服务端不一致时不调用插件，回写未执行', async () => {
    const api = printing('0'.repeat(64))
    const { host, invokePluginTracked } = desktopHost()
    const result = await printReceipt(api, receipt('DESKTOP_LINK'), { host })
    expect(invokePluginTracked).not.toHaveBeenCalled()
    expect(api.desktopResult).toHaveBeenCalledWith('d-1', expect.objectContaining({ outcome: 'NOT_EXECUTED', resultCode: 'local-digest-mismatch' }))
    expect(result).toMatchObject({ settlement: { kind: 'not-executed' } })
  })

  it('结果不确定时如实回写，结果写回失败时提示勿重复打印', async () => {
    const api = printing()
    const { host } = desktopHost(vi.fn().mockResolvedValue({ state: 'indeterminate' }))
    await printReceipt(api, receipt('DESKTOP_LINK'), { host })
    expect(api.desktopResult).toHaveBeenCalledWith('d-1', expect.objectContaining({ outcome: 'UNCERTAIN', resultCode: 'indeterminate' }))

    api.desktopResult.mockRejectedValueOnce(new Error('network'))
    const error = await printReceipt(api, receipt('DESKTOP_LINK'), { host }).catch((value: unknown) => value)
    expect(error).toBeInstanceOf(DesktopPrintResultNotRecordedError)
    expect((error as DesktopPrintResultNotRecordedError).settlement).toEqual({ kind: 'uncertain', code: 'indeterminate' })
  })
})

describe('createOperationId', () => {
  it('没有 randomUUID 的非安全上下文仍生成小写 UUID v4', () => {
    const original = crypto.randomUUID
    try {
      Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
      expect(createOperationId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true })
    }
  })
})
