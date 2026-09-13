import {
  Children,
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type TooltipPlacement = 'top' | 'bottom'

type TooltipChildProps = {
  'aria-describedby'?: string
}

export type TooltipProps = {
  children: ReactElement<TooltipChildProps>
  content: ReactNode
  placement?: TooltipPlacement
  openDelayMs?: number
}

type TooltipPosition = {
  left: number
  top: number
  placement: TooltipPlacement
  arrowLeft: number
}

const VIEWPORT_GAP = 8
const TRIGGER_GAP = 8

export function Tooltip({ children, content, placement = 'top', openDelayMs = 80 }: TooltipProps) {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLSpanElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const openTimerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<TooltipPosition | null>(null)

  const clearOpenTimer = () => {
    if (openTimerRef.current === null) return
    window.clearTimeout(openTimerRef.current)
    openTimerRef.current = null
  }

  const show = (delay: number) => {
    clearOpenTimer()
    if (delay <= 0) {
      setOpen(true)
      return
    }
    openTimerRef.current = window.setTimeout(() => {
      openTimerRef.current = null
      setOpen(true)
    }, delay)
  }

  const hide = () => {
    clearOpenTimer()
    setOpen(false)
    setPosition(null)
  }

  useEffect(() => () => clearOpenTimer(), [])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return

    const updatePosition = () => {
      const trigger = triggerRef.current
      const tooltip = tooltipRef.current
      if (!trigger || !tooltip) return

      const triggerRect = trigger.getBoundingClientRect()
      const tooltipRect = tooltip.getBoundingClientRect()
      const top = triggerRect.top - tooltipRect.height - TRIGGER_GAP
      const bottom = triggerRect.bottom + TRIGGER_GAP
      const canPlaceTop = top >= VIEWPORT_GAP
      const canPlaceBottom = bottom + tooltipRect.height <= window.innerHeight - VIEWPORT_GAP
      const resolvedPlacement = placement === 'top'
        ? (canPlaceTop || !canPlaceBottom ? 'top' : 'bottom')
        : (canPlaceBottom || !canPlaceTop ? 'bottom' : 'top')
      const unclampedLeft = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2
      const left = Math.max(
        VIEWPORT_GAP,
        Math.min(window.innerWidth - tooltipRect.width - VIEWPORT_GAP, unclampedLeft),
      )
      const unclampedTop = resolvedPlacement === 'top' ? top : bottom
      const resolvedTop = Math.max(
        VIEWPORT_GAP,
        Math.min(window.innerHeight - tooltipRect.height - VIEWPORT_GAP, unclampedTop),
      )
      const arrowLeft = Math.max(
        12,
        Math.min(tooltipRect.width - 12, triggerRect.left + triggerRect.width / 2 - left),
      )

      setPosition({ left, top: resolvedTop, placement: resolvedPlacement, arrowLeft })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, placement])

  const child = Children.only(children)
  const describedBy = [child.props['aria-describedby'], open ? tooltipId : ''].filter(Boolean).join(' ') || undefined
  const control = cloneElement(child, { 'aria-describedby': describedBy })
  const tooltipStyle = position ? ({
    left: position.left,
    top: position.top,
    '--ui-tooltip-arrow-left': `${position.arrowLeft}px`,
  } as CSSProperties) : undefined

  return <>
    <span
      ref={triggerRef}
      className="ui-tooltip__trigger"
      onMouseEnter={(_event: MouseEvent<HTMLSpanElement>) => show(openDelayMs)}
      onMouseLeave={hide}
      onFocus={(_event: FocusEvent<HTMLSpanElement>) => show(0)}
      onBlur={hide}
    >
      {control}
    </span>
    {open && createPortal(
      <div
        ref={tooltipRef}
        id={tooltipId}
        className="ui-tooltip"
        role="tooltip"
        data-placement={position?.placement ?? placement}
        style={tooltipStyle}
      >
        {content}
      </div>,
      document.body,
    )}
  </>
}
