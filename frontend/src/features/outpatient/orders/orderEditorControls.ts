import { type KeyboardEvent } from 'react'
import { type OrderEntryType } from './orderDraftTypes'

export function numberValue(value: string): number | '' {
  return value === '' ? '' : Number(value)
}

export function continueDraftOnEnter(event: KeyboardEvent<HTMLInputElement>, nextControlId: string) {
  if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
  event.preventDefault()
  focusControl(nextControlId)
}

export function focusResource(type: OrderEntryType) {
  if (typeof document === 'undefined') return
  const tryFocus = () => {
    const searchInput = document.querySelector<HTMLInputElement>(
      '.doctor-unified-inline-composer .ui-remote-search__search input, .ui-remote-search__popover .ui-remote-search__search input'
    )
    if (searchInput) {
      searchInput.focus()
      return true
    }

    const trigger = document.getElementById(`doctor-unified-${type}-resource`)
      || document.querySelector<HTMLElement>('.doctor-unified-inline-composer .ui-remote-search__trigger')
    if (trigger) {
      trigger.focus()
      if (trigger.getAttribute('aria-expanded') !== 'true') {
        trigger.click()
      }
      return true
    }
    return false
  }

  tryFocus()

  window.requestAnimationFrame(() => {
    tryFocus()
    globalThis.setTimeout(() => {
      tryFocus()
      const searchInput = document.querySelector<HTMLInputElement>(
        '.doctor-unified-inline-composer .ui-remote-search__search input, .ui-remote-search__popover .ui-remote-search__search input'
      )
      if (searchInput && document.activeElement !== searchInput) {
        searchInput.focus()
      }
    }, 40)
  })
}

export function focusControl(id: string) {
  window.requestAnimationFrame(() => {
    const el = document.getElementById(id)
    if (el) {
      el.focus()
      if (el instanceof HTMLInputElement) {
        el.select()
      }
    }
  })
}

export function focusControlAfterSelection(id: string) {
  globalThis.setTimeout(() => focusControl(id), 0)
}
