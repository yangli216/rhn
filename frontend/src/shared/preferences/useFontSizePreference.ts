import { useCallback, useEffect, useLayoutEffect, useState } from 'react'

export type FontSizePreference = 'standard' | 'large'
export const FONT_SIZE_STORAGE_KEY = 'rhn.display.font-size'
const changeEvent = 'rhn:font-size-change'
const normalize = (value: unknown): FontSizePreference => value === 'large' ? 'large' : 'standard'

function readPreference(): FontSizePreference {
  try { return normalize(localStorage.getItem(FONT_SIZE_STORAGE_KEY)) } catch { return 'standard' }
}

/** Device-local display preference; no clinical state or server data is changed. */
export function useFontSizePreference() {
  const [fontSize, setFontSize] = useState<FontSizePreference>(readPreference)
  useLayoutEffect(() => { document.documentElement.dataset.fontSize = fontSize }, [fontSize])
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === FONT_SIZE_STORAGE_KEY || event.key === null) setFontSize(normalize(event.newValue))
    }
    const onChange = (event: Event) => setFontSize(normalize((event as CustomEvent).detail))
    window.addEventListener('storage', onStorage)
    window.addEventListener(changeEvent, onChange)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(changeEvent, onChange)
    }
  }, [])
  const changeFontSize = useCallback((next: FontSizePreference) => {
    const value = normalize(next)
    try { localStorage.setItem(FONT_SIZE_STORAGE_KEY, value) } catch { /* Still usable for this session. */ }
    document.documentElement.dataset.fontSize = value
    setFontSize(value)
    window.dispatchEvent(new CustomEvent(changeEvent, { detail: value }))
  }, [])
  return [fontSize, changeFontSize] as const
}
