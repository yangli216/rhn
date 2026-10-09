import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Button, type ButtonSize } from './index'
import { Icon } from './Icon'

export interface ActionMenuItem {
  key: string
  label: string
  danger?: boolean
  disabled?: boolean
  onSelect: () => void
}

export function ActionMenu({ label = '更多', items, disabled = false, size = 'sm' }: {
  label?: string; items: ActionMenuItem[]; disabled?: boolean; size?: ButtonSize
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const close = (restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus) trigger.current?.focus()
  }
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  useEffect(() => {
    if (!open) return
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const navigate = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
    if (!buttons.length) return
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
      : event.key === 'ArrowDown' ? (current + 1) % buttons.length
      : event.key === 'ArrowUp' ? (current - 1 + buttons.length) % buttons.length : -1
    if (index >= 0) { event.preventDefault(); buttons[index].focus() }
  }
  return <div ref={root} className="ui-action-menu" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) close()
  }}>
    <Button ref={trigger} size={size} variant="secondary" disabled={disabled} aria-haspopup="menu"
      aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true) }
        if (event.key === 'Escape') close()
      }}>{label}<Icon name="chevron-down" /></Button>
    {open && <div ref={menu} id={menuId} role="menu" aria-label={label} className="ui-action-menu__items" onKeyDown={navigate}>
      {items.map(item => <Button key={item.key} role="menuitem" tabIndex={-1} variant={item.danger ? 'danger' : 'text'}
        disabled={item.disabled} size={size} onClick={() => { close(true); item.onSelect() }}>{item.label}</Button>)}
    </div>}
  </div>
}
