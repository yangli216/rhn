/**
 * 安全的 UUID v4 生成工具，兼容非安全上下文（如局域网 HTTP 访问时浏览器禁用 crypto.randomUUID 的情况）。
 */
export function safeRandomUUID(): `${string}-${string}-${string}-${string}-${string}` {
  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    try {
      return globalThis.crypto.randomUUID()
    } catch {
      // 在部分非安全上下文环境下调用可能抛错，降级执行
    }
  }

  if (typeof globalThis !== 'undefined' && globalThis.crypto && typeof globalThis.crypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16)
      globalThis.crypto.getRandomValues(bytes)
      bytes[6] = (bytes[6] & 0x0f) | 0x40 // RFC 4122 version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80 // RFC 4122 variant 10xx
      const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`
    } catch {
      // 降级到 Math.random
    }
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  }) as `${string}-${string}-${string}-${string}-${string}`
}

/**
 * 在全局环境中安装 polyfill，使全局所有 crypto.randomUUID() 均能在局域网 HTTP 下正常工作
 */
export function installCryptoPolyfill(): void {
  if (typeof globalThis === 'undefined') return
  try {
    if (!globalThis.crypto) {
      // @ts-expect-error fallback assignment
      globalThis.crypto = {}
    }
    if (typeof globalThis.crypto.randomUUID !== 'function') {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: safeRandomUUID,
        writable: true,
        configurable: true,
      })
    }
  } catch {
    // 忽略特定运行时的属性保护异常
  }
}

// 模块加载时立即自动安装
installCryptoPolyfill()
