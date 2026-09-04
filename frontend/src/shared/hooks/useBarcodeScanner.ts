import { useEffect, useRef } from 'react'

export interface BarcodeScannerOptions {
  onScan: (scannedText: string) => void
  enabled?: boolean
  maxIntervalMs?: number
  minCharacters?: number
}

/**
 * 全局扫码枪硬件输入捕获 Hook
 * 硬件扫码枪通常模拟键盘输入（HID模式），字符间间隔极短（<50ms）并以 Enter 结束。
 * 此 Hook 监听 window keydown 事件，自动区分人类手动打字与扫码枪高速输入。
 */
export function useBarcodeScanner({
  onScan,
  enabled = true,
  maxIntervalMs = 50,
  minCharacters = 4,
}: BarcodeScannerOptions) {
  const bufferRef = useRef<{ char: string; time: number }[]>([])
  const onScanRef = useRef(onScan)
  onScanRef.current = onScan

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      // 忽略功能键与修饰键（Shift、Control、Alt、Meta 等）
      if (event.key.length > 1 && event.key !== 'Enter') {
        return
      }

      const now = Date.now()
      const buffer = bufferRef.current

      if (event.key === 'Enter') {
        if (buffer.length >= minCharacters) {
          // 计算按键平均间隔与最大间隔
          let isFast = true
          for (let i = 1; i < buffer.length; i++) {
            if (buffer[i].time - buffer[i - 1].time > maxIntervalMs) {
              isFast = false
              break
            }
          }

          if (isFast) {
            const scannedText = buffer.map((b) => b.char).join('')
            event.preventDefault()
            event.stopPropagation()
            bufferRef.current = []
            onScanRef.current(scannedText)
            return
          }
        }
        bufferRef.current = []
        return
      }

      // 如果两次按键间隔过长，说明是人类常规输入，重置缓冲区
      if (buffer.length > 0) {
        const lastTime = buffer[buffer.length - 1].time
        if (now - lastTime > maxIntervalMs) {
          bufferRef.current = []
        }
      }

      bufferRef.current.push({ char: event.key, time: now })
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [enabled, maxIntervalMs, minCharacters])
}
