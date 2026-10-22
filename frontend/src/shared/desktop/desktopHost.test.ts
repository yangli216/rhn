import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectDesktopHost, getDesktopHost, resetDesktopHostForTest } from './desktopHost'

const declaration = { os: 'windows', architecture: 'x86_64', appVersion: '0.1.0', protocolVersion: 1 }

function bridge(overrides: Record<string, unknown> = {}) {
  return {
    invokePlugin: vi.fn().mockResolvedValue({ ResCode: 0, ResData: { cardNumber: 'TEST-001' } }),
    getSystemInfo: vi.fn().mockResolvedValue(declaration),
    ...overrides,
  }
}

const trackedCapabilities = {
  capabilities: { schemaVersion: 1, trackedInvocations: { supported: true, available: true, accepting: true } },
}

describe('detectDesktopHost', () => {
  afterEach(() => {
    resetDesktopHostForTest()
    delete (window as { ssdevDesktop?: unknown }).ssdevDesktop
    vi.useRealTimers()
  })

  it('未注入桥接对象时按普通浏览器处理', async () => {
    await expect(detectDesktopHost({})).resolves.toEqual({ kind: 'browser' })
  })

  it('识别 RHN Link 并通过 invoker 转发插件调用，省略参数按空对象传递', async () => {
    const raw = bridge()
    const host = await detectDesktopHost({ ssdevDesktop: raw })
    expect(host).toMatchObject({ kind: 'rhn-link', system: declaration, trackedInvocations: false })
    if (host.kind !== 'rhn-link') throw new Error('unexpected host')
    await expect(host.invoker.invokePlugin('card.reader', 'readCard')).resolves.toEqual({ ResCode: 0, ResData: { cardNumber: 'TEST-001' } })
    expect(raw.invokePlugin).toHaveBeenCalledWith('card.reader', 'readCard', {})
  })

  it('持久调用要求方法存在且运行时声明可用', async () => {
    const tracked = {
      invokePluginTracked: vi.fn().mockResolvedValue({ state: 'completed', response: { ResCode: 0, ResData: null }, durable: true }),
      getPluginInvocation: vi.fn().mockResolvedValue({ state: 'unknown' }),
    }
    const available = await detectDesktopHost({ ssdevDesktop: bridge({ ...tracked, getSystemInfo: vi.fn().mockResolvedValue({ ...declaration, ...trackedCapabilities }) }) })
    expect(available).toMatchObject({ kind: 'rhn-link', trackedInvocations: true })
    if (available.kind !== 'rhn-link' || !available.trackedInvocations) throw new Error('unexpected host')
    await expect(available.trackedInvoker.invokePluginTracked('operation-1', 'printer', 'print', { documentId: 'doc-1' }))
      .resolves.toEqual({ state: 'completed', response: { ResCode: 0, ResData: null }, durable: true })
    expect(tracked.invokePluginTracked).toHaveBeenCalledWith('operation-1', 'printer', 'print', { documentId: 'doc-1' })
    await expect(available.trackedInvoker.getPluginInvocation('operation-1', 'printer', 'print')).resolves.toEqual({ state: 'unknown' })
    expect(tracked.getPluginInvocation).toHaveBeenCalledWith('operation-1', 'printer', 'print')

    const notAccepting = { capabilities: { schemaVersion: 1, trackedInvocations: { supported: true, available: true, accepting: false } } }
    const draining = await detectDesktopHost({ ssdevDesktop: bridge({ ...tracked, getSystemInfo: vi.fn().mockResolvedValue({ ...declaration, ...notAccepting }) }) })
    expect(draining).toMatchObject({ trackedInvocations: false })
    if (draining.kind !== 'rhn-link') throw new Error('unexpected host')
    expect('trackedInvoker' in draining).toBe(false)

    const futureSchema = { capabilities: { ...trackedCapabilities.capabilities, schemaVersion: 2 } }
    const unknown = await detectDesktopHost({ ssdevDesktop: bridge({ ...tracked, getSystemInfo: vi.fn().mockResolvedValue({ ...declaration, ...futureSchema }) }) })
    expect(unknown).toMatchObject({ trackedInvocations: false })

    const methodsMissing = await detectDesktopHost({ ssdevDesktop: bridge({ getSystemInfo: vi.fn().mockResolvedValue({ ...declaration, ...trackedCapabilities }) }) })
    expect(methodsMissing).toMatchObject({ trackedInvocations: false })
  })

  it.each([
    ['bridge-invalid', { invokePlugin: 'nope', getSystemInfo: vi.fn() }],
    ['declaration-failed', bridge({ getSystemInfo: vi.fn().mockRejectedValue(new Error('ipc')) })],
    ['declaration-invalid', bridge({ getSystemInfo: vi.fn().mockResolvedValue({ ...declaration, os: '' }) })],
    ['declaration-invalid', bridge({ getSystemInfo: vi.fn().mockResolvedValue(null) })],
    ['protocol-unsupported', bridge({ getSystemInfo: vi.fn().mockResolvedValue({ ...declaration, protocolVersion: 2 }) })],
  ])('宿主异常时返回 unsupported：%s', async (reason, raw) => {
    await expect(detectDesktopHost({ ssdevDesktop: raw })).resolves.toEqual({ kind: 'unsupported', reason })
  })

  it('系统声明超时按不可用处理', async () => {
    vi.useFakeTimers()
    const pending = detectDesktopHost({ ssdevDesktop: bridge({ getSystemInfo: () => new Promise(() => {}) }) }, 100)
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).resolves.toEqual({ kind: 'unsupported', reason: 'declaration-timeout' })
  })

  it('页面生命周期内只检测一次', async () => {
    const raw = bridge();
    (window as { ssdevDesktop?: unknown }).ssdevDesktop = raw
    const first = await getDesktopHost()
    const second = await getDesktopHost()
    expect(second).toBe(first)
    expect(raw.getSystemInfo).toHaveBeenCalledTimes(1)
  })
})
