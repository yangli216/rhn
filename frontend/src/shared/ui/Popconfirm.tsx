import {
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Button, type ButtonVariant } from './index'
import { Icon } from './Icon'

export interface PopconfirmProps {
  title: ReactNode
  description?: ReactNode
  onConfirm?: () => void | Promise<void>
  onCancel?: () => void
  okText?: string
  cancelText?: string
  okVariant?: ButtonVariant
  disabled?: boolean
  children: ReactElement
  className?: string
}

export function Popconfirm({
  title,
  description,
  onConfirm,
  onCancel,
  okText = '确定',
  cancelText = '取消',
  okVariant = 'danger',
  disabled = false,
  children,
  className = '',
}: PopconfirmProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [position, setPosition] = useState<{
    top?: number
    bottom?: number
    left?: number
    right?: number
    placement: 'top' | 'bottom'
    arrowLeft?: number
    arrowRight?: number
  }>()
  const triggerRef = useRef<HTMLElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const titleId = useId()

  const close = () => {
    setOpen(false)
    setBusy(false)
    onCancel?.()
  }

  const handleConfirm = async () => {
    if (busy) return
    try {
      setBusy(true)
      await onConfirm?.()
      setOpen(false)
    } finally {
      setBusy(false)
    }
  }

  // Click outside to close & Escape key
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (event: PointerEvent) => {
      const target = event.target as Node
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        close()
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('pointerdown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  // Position calculation
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const popover = popoverRef.current
      const popoverWidth = popover?.offsetWidth ?? 240
      const popoverHeight = popover?.offsetHeight ?? 110
      const gap = 8
      const margin = 12
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      const spaceAbove = rect.top
      const spaceBelow = viewportHeight - rect.bottom
      const placement: 'top' | 'bottom' = spaceAbove >= popoverHeight + gap || spaceAbove > spaceBelow ? 'top' : 'bottom'

      let left: number | undefined
      let right: number | undefined
      let arrowLeft: number | undefined
      let arrowRight: number | undefined

      const rightDistance = viewportWidth - rect.right
      if (rect.right - popoverWidth >= margin) {
        right = rightDistance
        arrowRight = Math.max(14, Math.min(popoverWidth - 20, rect.width / 2))
      } else if (rect.left + popoverWidth <= viewportWidth - margin) {
        left = rect.left
        arrowLeft = Math.max(14, Math.min(popoverWidth - 20, rect.width / 2))
      } else {
        left = Math.max(margin, (viewportWidth - popoverWidth) / 2)
        arrowLeft = Math.max(14, Math.min(popoverWidth - 20, rect.left + rect.width / 2 - left))
      }

      setPosition({
        top: placement === 'bottom' ? rect.bottom + gap : undefined,
        bottom: placement === 'top' ? viewportHeight - rect.top + gap : undefined,
        left,
        right,
        placement,
        arrowLeft,
        arrowRight,
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  if (!isValidElement(children)) return children

  const child = children as ReactElement<{
    ref?: (node: HTMLElement | null) => void
    onClick?: (e: React.MouseEvent) => void
  }>

  const trigger = cloneElement(child, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      const originalRef = (child as any).ref
      if (typeof originalRef === 'function') originalRef(node)
      else if (originalRef && typeof originalRef === 'object') originalRef.current = node
    },
    onClick: (e: React.MouseEvent) => {
      if (!disabled) {
        e.preventDefault()
        e.stopPropagation()
        setOpen((prev) => !prev)
      }
    },
  })

  return (
    <>
      {trigger}
      {open &&
        createPortal(
          <div
            ref={popoverRef}
            className={`ui-popconfirm ui-popconfirm--placement-${position?.placement ?? 'top'} ${className}`}
            style={{
              top: position?.top,
              bottom: position?.bottom,
              left: position?.left,
              right: position?.right,
            }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="ui-popconfirm__arrow"
              style={{
                left: position?.arrowLeft,
                right: position?.arrowRight,
              }}
            />
            <div className="ui-popconfirm__content">
              <span className="ui-popconfirm__icon" aria-hidden="true">
                <Icon name="warning" />
              </span>
              <div className="ui-popconfirm__body">
                <div id={titleId} className="ui-popconfirm__title">
                  {title}
                </div>
                {description && <div className="ui-popconfirm__description">{description}</div>}
              </div>
            </div>
            <div className="ui-popconfirm__actions">
              <Button size="sm" variant="secondary" onClick={close} disabled={busy}>
                {cancelText}
              </Button>
              <Button size="sm" variant={okVariant} onClick={handleConfirm} busy={busy}>
                {okText}
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
