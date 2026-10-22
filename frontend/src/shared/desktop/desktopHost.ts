/**
 * 桌面宿主检测：判断当前页面是否运行在 RHN Link（健域端联）受控业务窗口中。
 *
 * 契约来源为 rhn-link 仓库 `packages/web-bridge/bridge-contract.json`（桥接协议 1、能力 schema 1）。
 * 在 SDK 有正式分发渠道之前只实现检测所需的最小子集；接口形状与 SDK 的 `PluginInvoker` 一致，
 * 以后可直接替换为 `connectDesktop()`。
 *
 * 回退规则：`browser` 与 `unsupported` 都由调用方走现有浏览器行为（iframe 打印、手工/扫码录入等）；
 * 不尝试 localhost HTTP 或其他通道。`unsupported` 额外带稳定 `reason`，供提示升级客户端或诊断使用。
 */

export const SUPPORTED_DESKTOP_BRIDGE_PROTOCOL = 1
export const SUPPORTED_DESKTOP_CAPABILITIES_SCHEMA = 1
/** getSystemInfo 在本地 IPC 内完成，超过该时限视为宿主异常，按不可用回退。 */
export const DESKTOP_DECLARATION_TIMEOUT_MS = 3000

export interface DesktopInvokeResponse<T = unknown> {
  ResCode: number
  ResData: T
}

/** 与 SDK `PluginInvoker` 同形：业务插件客户端只依赖这一个方法。 */
export interface DesktopPluginInvoker {
  invokePlugin<T = unknown>(serviceId: string, method: string, parameters?: Record<string, unknown>): Promise<DesktopInvokeResponse<T>>
}

/** 与 SDK `TrackedInvocationStatus` 同形的持久调用状态，业务按 `state` 分派，不解析本地化文案。 */
export type DesktopTrackedInvocationStatus<T = unknown> =
  | { state: 'unknown' }
  | { state: 'pending' }
  | { state: 'completed'; response: DesktopInvokeResponse<T>; durable: boolean }
  | { state: 'indeterminate' }
  | { state: 'completedWithoutResult' }

/** 仅当持久调用可用时提供；`operationId` 由业务流程持久保存并跨重试、刷新复用。 */
export interface DesktopTrackedPluginInvoker {
  invokePluginTracked<T = unknown>(
    operationId: string,
    serviceId: string,
    method: string,
    parameters?: Record<string, unknown>,
  ): Promise<DesktopTrackedInvocationStatus<T>>
  getPluginInvocation<T = unknown>(
    operationId: string,
    serviceId: string,
    method: string,
  ): Promise<DesktopTrackedInvocationStatus<T>>
}

export interface DesktopSystemDeclaration {
  os: string
  architecture: string
  appVersion: string
  protocolVersion: number
}

export type DesktopUnsupportedReason =
  | 'bridge-invalid'
  | 'declaration-failed'
  | 'declaration-timeout'
  | 'declaration-invalid'
  | 'protocol-unsupported'

export type DesktopHost =
  | { kind: 'browser' }
  | { kind: 'unsupported'; reason: DesktopUnsupportedReason }
  | {
    kind: 'rhn-link'
    system: DesktopSystemDeclaration
    invoker: DesktopPluginInvoker
    /** 持久调用（打印、写卡等非幂等操作）不可用：方法缺失或运行时声明未同时满足 supported/available/accepting。 */
    trackedInvocations: false
  }
  | {
    kind: 'rhn-link'
    system: DesktopSystemDeclaration
    invoker: DesktopPluginInvoker
    trackedInvocations: true
    /** 非幂等操作必须走该入口，不可退回普通 `invoker.invokePlugin`。 */
    trackedInvoker: DesktopTrackedPluginInvoker
  }

interface RawBridge {
  invokePlugin: (serviceId: string, method: string, parameters?: unknown) => Promise<unknown>
  getSystemInfo: () => Promise<unknown>
  invokePluginTracked?: (operationId: string, serviceId: string, method: string, parameters?: unknown) => Promise<unknown>
  getPluginInvocation?: (operationId: string, serviceId: string, method: string) => Promise<unknown>
}

interface RawTrackedBridge extends RawBridge {
  invokePluginTracked: NonNullable<RawBridge['invokePluginTracked']>
  getPluginInvocation: NonNullable<RawBridge['getPluginInvocation']>
}

type BridgeWindow = { ssdevDesktop?: unknown }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isShortText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 64
}

function readBridge(win: BridgeWindow): RawBridge | null | 'invalid' {
  const candidate = win.ssdevDesktop
  if (candidate === undefined || candidate === null) return null
  if (!isRecord(candidate) || typeof candidate.invokePlugin !== 'function' || typeof candidate.getSystemInfo !== 'function') {
    return 'invalid'
  }
  return candidate as unknown as RawBridge
}

function parseDeclaration(value: unknown): DesktopSystemDeclaration | null {
  if (!isRecord(value)) return null
  const { os, architecture, appVersion, protocolVersion } = value
  if (!isShortText(os) || !isShortText(architecture) || !isShortText(appVersion)
    || typeof protocolVersion !== 'number' || !Number.isSafeInteger(protocolVersion) || protocolVersion < 1) {
    return null
  }
  return { os, architecture, appVersion, protocolVersion }
}

/** 只认当前能力 schema；更高 schema 视为未知，不猜测持久调用可用（与 SDK 行为一致）。 */
function trackedInvocationsAvailable(bridge: RawBridge, declaration: unknown): bridge is RawTrackedBridge {
  if (typeof bridge.invokePluginTracked !== 'function' || typeof bridge.getPluginInvocation !== 'function') return false
  if (!isRecord(declaration) || !isRecord(declaration.capabilities)) return false
  const { schemaVersion, trackedInvocations } = declaration.capabilities
  return schemaVersion === SUPPORTED_DESKTOP_CAPABILITIES_SCHEMA && isRecord(trackedInvocations)
    && trackedInvocations.supported === true && trackedInvocations.available === true && trackedInvocations.accepting === true
}

const TIMEOUT = Symbol('timeout')

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | typeof TIMEOUT> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<typeof TIMEOUT>((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), timeoutMs) })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export async function detectDesktopHost(
  win: BridgeWindow = window as BridgeWindow,
  timeoutMs = DESKTOP_DECLARATION_TIMEOUT_MS,
): Promise<DesktopHost> {
  const bridge = readBridge(win)
  if (bridge === null) return { kind: 'browser' }
  if (bridge === 'invalid') return { kind: 'unsupported', reason: 'bridge-invalid' }

  let raw: unknown
  try {
    raw = await withTimeout(Promise.resolve(bridge.getSystemInfo()), timeoutMs)
  } catch {
    return { kind: 'unsupported', reason: 'declaration-failed' }
  }
  if (raw === TIMEOUT) return { kind: 'unsupported', reason: 'declaration-timeout' }
  const system = parseDeclaration(raw)
  if (!system) return { kind: 'unsupported', reason: 'declaration-invalid' }
  if (system.protocolVersion !== SUPPORTED_DESKTOP_BRIDGE_PROTOCOL) return { kind: 'unsupported', reason: 'protocol-unsupported' }

  const invoker: DesktopPluginInvoker = {
    invokePlugin: <T>(serviceId: string, method: string, parameters?: Record<string, unknown>) =>
      bridge.invokePlugin(serviceId, method, parameters ?? {}) as Promise<DesktopInvokeResponse<T>>,
  }
  if (!trackedInvocationsAvailable(bridge, raw)) {
    return { kind: 'rhn-link', system, invoker, trackedInvocations: false }
  }
  const trackedInvoker: DesktopTrackedPluginInvoker = {
    invokePluginTracked: <T>(operationId: string, serviceId: string, method: string, parameters?: Record<string, unknown>) =>
      bridge.invokePluginTracked(operationId, serviceId, method, parameters) as Promise<DesktopTrackedInvocationStatus<T>>,
    getPluginInvocation: <T>(operationId: string, serviceId: string, method: string) =>
      bridge.getPluginInvocation(operationId, serviceId, method) as Promise<DesktopTrackedInvocationStatus<T>>,
  }
  return { kind: 'rhn-link', system, invoker, trackedInvocations: true, trackedInvoker }
}

let cached: Promise<DesktopHost> | undefined

/** 页面生命周期内只检测一次；桥接对象由宿主在页面脚本执行前注入，之后不会出现或消失。 */
export function getDesktopHost(): Promise<DesktopHost> {
  cached ??= detectDesktopHost()
  return cached
}

/** 仅供测试重置缓存。 */
export function resetDesktopHostForTest() {
  cached = undefined
}
