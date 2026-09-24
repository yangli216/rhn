import { describe, it, expect, afterEach } from 'vitest'
import { safeRandomUUID, installCryptoPolyfill } from './uuid'

describe('safeRandomUUID', () => {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

  it('generates valid RFC 4122 v4 UUID format', () => {
    const uuid = safeRandomUUID()
    expect(uuid).toMatch(uuidRegex)
  })

  it('generates unique UUIDs on subsequent calls', () => {
    const id1 = safeRandomUUID()
    const id2 = safeRandomUUID()
    expect(id1).not.toBe(id2)
  })

  describe('when crypto.randomUUID is unavailable (non-secure HTTP context)', () => {
    const originalCrypto = globalThis.crypto

    afterEach(() => {
      Object.defineProperty(globalThis, 'crypto', {
        value: originalCrypto,
        writable: true,
        configurable: true,
      })
    })

    it('falls back seamlessly without throwing error', () => {
      // 模拟局域网 HTTP 下非安全上下文，浏览器将 randomUUID 设为 undefined
      const mockCryptoWithoutRandomUUID = {
        getRandomValues: (array: Uint8Array) => {
          for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256)
          }
          return array
        },
      }
      Object.defineProperty(globalThis, 'crypto', {
        value: mockCryptoWithoutRandomUUID,
        writable: true,
        configurable: true,
      })

      const uuid = safeRandomUUID()
      expect(uuid).toMatch(uuidRegex)
    })

    it('installs polyfill and makes global crypto.randomUUID available', () => {
      const mockCrypto = {
        getRandomValues: (array: Uint8Array) => array,
      }
      Object.defineProperty(globalThis, 'crypto', {
        value: mockCrypto,
        writable: true,
        configurable: true,
      })

      installCryptoPolyfill()
      expect(typeof globalThis.crypto.randomUUID).toBe('function')
      const uuid = globalThis.crypto.randomUUID()
      expect(uuid).toBeDefined()
      expect(typeof uuid).toBe('string')
    })
  })
})
