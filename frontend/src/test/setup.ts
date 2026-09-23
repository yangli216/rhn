import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

if (typeof window !== 'undefined' && (!window.localStorage || typeof window.localStorage.clear !== 'function')) {
  const store = new Map<string, string>()
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() { return store.size },
  }
  Object.defineProperty(window, 'localStorage', { value: mockStorage, writable: true })
  Object.defineProperty(globalThis, 'localStorage', { value: mockStorage, writable: true })
}

if (typeof URL !== 'undefined') {
  if (!URL.createObjectURL) {
    URL.createObjectURL = (blob: Blob | MediaSource) => `blob:mock-url-${blob ? 'valid' : 'empty'}`
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = () => {}
  }
}

afterEach(cleanup)
