import { describe, expect, it, vi } from 'vitest'
import { classifyPrintPdfResponse, printPdfTracked, RHN_PRINTING_SERVICE } from './rhnPrinting'

const ok = (result: object) => ({ ResCode: 0, ResData: { ReturnValue: 0, result: JSON.stringify(result) } })
const failed = (returnValue: number, error: string) =>
  ({ ResCode: 0, ResData: { ReturnValue: returnValue, result: JSON.stringify({ error }) } })
const parameters = { printerName: '处方打印机', documentBase64: 'JVBERi0=', sha256: 'a'.repeat(64), copies: 1, jobName: 'RHN-1' }

describe('classifyPrintPdfResponse', () => {
  it('ReturnValue=0 且 submitted=true 视为已提交，并保留系统作业号', () => {
    expect(classifyPrintPdfResponse(ok({ submitted: true, systemJobId: 42 }))).toEqual({ kind: 'submitted', systemJobNo: '42' })
    expect(classifyPrintPdfResponse(ok({ submitted: true }))).toEqual({ kind: 'submitted' })
  })

  it('进入打印队列前的失败码保证未执行，1006/1008 与未知码按不确定处理', () => {
    expect(classifyPrintPdfResponse(failed(1004, 'printer-not-found'))).toEqual({ kind: 'not-executed', code: 'printer-not-found' })
    expect(classifyPrintPdfResponse(failed(1002, 'document-digest-mismatch')).kind).toBe('not-executed')
    expect(classifyPrintPdfResponse(failed(1006, 'job-aborted'))).toEqual({ kind: 'uncertain', code: 'job-aborted' })
    expect(classifyPrintPdfResponse(failed(1008, 'internal-error'))).toEqual({ kind: 'uncertain', code: 'internal-error' })
    expect(classifyPrintPdfResponse({ ResCode: 0, ResData: { ReturnValue: 1999, result: 'oops' } }))
      .toEqual({ kind: 'uncertain', code: 'return-1999' })
  })

  it('controller 拒绝码保证未执行，其余宿主错误与损坏响应按不确定处理', () => {
    expect(classifyPrintPdfResponse({ ResCode: -32001, ResData: 'busy' })).toEqual({ kind: 'not-executed', code: 'control-32001' })
    expect(classifyPrintPdfResponse({ ResCode: -1, ResData: 'timeout' })).toEqual({ kind: 'uncertain', code: 'host-error' })
    expect(classifyPrintPdfResponse(ok({ submitted: 'yes' }))).toEqual({ kind: 'uncertain', code: 'malformed-response' })
    expect(classifyPrintPdfResponse(null)).toEqual({ kind: 'uncertain', code: 'malformed-response' })
  })
})

describe('printPdfTracked', () => {
  it('pending 时只查询同一操作直到完成', async () => {
    const invoker = {
      invokePluginTracked: vi.fn().mockResolvedValue({ state: 'pending' }),
      getPluginInvocation: vi.fn()
        .mockResolvedValueOnce({ state: 'pending' })
        .mockResolvedValueOnce({ state: 'completed', durable: true, response: ok({ submitted: true, systemJobId: 7 }) }),
    }
    const sleep = vi.fn().mockResolvedValue(undefined)
    await expect(printPdfTracked(invoker, 'op-1', parameters, { sleep })).resolves.toEqual({ kind: 'submitted', systemJobNo: '7' })
    expect(invoker.invokePluginTracked).toHaveBeenCalledTimes(1)
    expect(invoker.invokePluginTracked).toHaveBeenCalledWith('op-1', RHN_PRINTING_SERVICE, 'printPdf', parameters)
    expect(invoker.getPluginInvocation).toHaveBeenCalledTimes(2)
    expect(invoker.getPluginInvocation).toHaveBeenCalledWith('op-1', RHN_PRINTING_SERVICE, 'printPdf')
  })

  it('超时、中断、桥接异常都按不确定处理且不重放', async () => {
    let clock = 0
    const pending = { invokePluginTracked: vi.fn().mockResolvedValue({ state: 'pending' }),
      getPluginInvocation: vi.fn().mockResolvedValue({ state: 'pending' }) }
    await expect(printPdfTracked(pending, 'op', parameters, {
      timeoutMs: 3000, sleep: async (ms) => { clock += ms }, now: () => clock,
    })).resolves.toEqual({ kind: 'uncertain', code: 'pending-timeout' })

    const interrupted = { invokePluginTracked: vi.fn().mockResolvedValue({ state: 'indeterminate' }), getPluginInvocation: vi.fn() }
    await expect(printPdfTracked(interrupted, 'op', parameters)).resolves.toEqual({ kind: 'uncertain', code: 'indeterminate' })

    const rejected = { invokePluginTracked: vi.fn().mockRejectedValue(
      { schemaVersion: 1, kind: 'trackedInvocationError', phase: 'authorization', code: 'origin-denied' }),
    getPluginInvocation: vi.fn() }
    await expect(printPdfTracked(rejected, 'op', parameters)).resolves.toEqual({ kind: 'uncertain', code: 'authorization:origin-denied' })

    const thrown = { invokePluginTracked: vi.fn().mockRejectedValue(new Error('boom')), getPluginInvocation: vi.fn() }
    await expect(printPdfTracked(thrown, 'op', parameters)).resolves.toEqual({ kind: 'uncertain', code: 'desktop-rejection' })
  })
})
