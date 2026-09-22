import { useEffect, useRef, type FocusEvent, type KeyboardEvent } from 'react'

const popoverSelector = '.ui-select__popover, .ui-remote-search__popover, .ui-popconfirm'

/** Shared row lifecycle; each editor remains responsible for validation and saving once. */
export function useDraftRowInteractions({ save, cancel, ignoreInteraction }: {
  save: () => void
  cancel: () => void
  ignoreInteraction: () => boolean
}) {
  const rowRef = useRef<HTMLDivElement>(null)
  const handlers = useRef({ save, cancel, ignoreInteraction })
  handlers.current = { save, cancel, ignoreInteraction }
  const interactingWithContainer = useRef(false)
  const containerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const markContainerInteraction = () => {
    interactingWithContainer.current = true
    clearTimeout(containerTimer.current)
    containerTimer.current = setTimeout(() => { interactingWithContainer.current = false }, 400)
  }
  const isInside = (target: Node | null) => rowRef.current?.contains(target)
    || Boolean((target as Element | null)?.closest?.(popoverSelector))

  useEffect(() => {
    const list = rowRef.current?.closest('.doctor-unified-order-list')
    const handleOutsideInteraction = (event: Event) => {
      if (handlers.current.ignoreInteraction()) return
      const target = event.target as Node | null
      if (!target) return
      if (target === list || (target as Element)?.classList?.contains('doctor-unified-order-list')) {
        markContainerInteraction()
      } else if (!isInside(target)) {
        handlers.current.save()
      }
    }
    list?.addEventListener('scroll', markContainerInteraction, { passive: true })
    document.addEventListener('pointerdown', handleOutsideInteraction)
    document.addEventListener('mousedown', handleOutsideInteraction)
    document.addEventListener('click', handleOutsideInteraction, true)
    return () => {
      list?.removeEventListener('scroll', markContainerInteraction)
      document.removeEventListener('pointerdown', handleOutsideInteraction)
      document.removeEventListener('mousedown', handleOutsideInteraction)
      document.removeEventListener('click', handleOutsideInteraction, true)
      clearTimeout(containerTimer.current)
      clearTimeout(blurTimer.current)
    }
  }, [])

  const handleBlur = (event: FocusEvent) => {
    if (handlers.current.ignoreInteraction() || interactingWithContainer.current) return
    const next = event.relatedTarget as Node | null
    if (next) {
      if (!isInside(next)) handlers.current.save()
      return
    }
    clearTimeout(blurTimer.current)
    blurTimer.current = setTimeout(() => {
      if (!handlers.current.ignoreInteraction() && !interactingWithContainer.current
        && !isInside(document.activeElement)) handlers.current.save()
    }, 100)
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      handlers.current.cancel()
    } else if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault()
      handlers.current.save()
    }
  }

  return { rowRef, handleBlur, handleKeyDown }
}
