import {
  useId,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type TableHTMLAttributes,
} from 'react'
import { Icon } from './Icon'

export type TabsVariant = 'line' | 'workspace' | 'cards'
export type TableColumnType = 'text' | 'numeric' | 'status' | 'control' | 'actions'

export function tableCellClass(type: TableColumnType) {
  return `ui-table-cell--${type}`
}

export type TabItem<T extends string> = {
  value: T
  label: ReactNode
  meta?: ReactNode
  tabId?: string
  panelId?: string
  disabled?: boolean
}

export function Tabs<T extends string>({
  value,
  items,
  onChange,
  label,
  actions,
  variant = 'line',
  responsiveCards = false,
  className = '',
}: {
  value: T
  items: Array<TabItem<T>>
  onChange: (value: T) => void
  label: string
  actions?: ReactNode
  variant?: TabsVariant
  responsiveCards?: boolean
  className?: string
}) {
  const generatedId = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const enabledItems = items.filter((item) => !item.disabled)

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, item: TabItem<T>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || enabledItems.length === 0) return
    event.preventDefault()
    const currentIndex = Math.max(0, enabledItems.findIndex((candidate) => candidate.value === item.value))
    const nextIndex = event.key === 'Home' ? 0
      : event.key === 'End' ? enabledItems.length - 1
        : event.key === 'ArrowLeft'
          ? (currentIndex - 1 + enabledItems.length) % enabledItems.length
          : (currentIndex + 1) % enabledItems.length
    const next = enabledItems[nextIndex]
    onChange(next.value)
    const itemIndex = items.findIndex((candidate) => candidate.value === next.value)
    refs.current[itemIndex]?.focus()
  }

  return <div className={`ui-tabs ui-tabs--${variant} ${responsiveCards ? 'ui-tabs--responsive-cards' : ''} ${className}`}
    role="tablist" aria-label={label}>
    <div className="ui-tabs__items">
      {items.map((item, index) => {
        const selected = item.value === value
        return <button key={item.value} type="button" role="tab" id={item.tabId ?? `${generatedId}-${item.value}-tab`}
          aria-controls={item.panelId} aria-selected={selected} disabled={item.disabled}
          tabIndex={selected ? 0 : -1} ref={(node) => { refs.current[index] = node }}
          className={`ui-tabs__tab ${selected ? 'is-active' : ''}`}
          onKeyDown={(event) => handleKeyDown(event, item)} onClick={() => onChange(item.value)}>
          <strong>{item.label}</strong>{item.meta && <small>{item.meta}</small>}
        </button>
      })}
    </div>
    {actions && <div className="ui-tabs__actions">{actions}</div>}
  </div>
}

export function SearchField({
  value,
  onChange,
  label,
  clearable = true,
  inputRef: externalInputRef,
  className = '',
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> & {
  value: string
  onChange: (value: string) => void
  label: string
  clearable?: boolean
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const resolvedInputRef = externalInputRef ?? inputRef

  return <label className={`ui-search-field ${className}`}>
    <span className="visually-hidden">{label}</span>
    <Icon name="search" />
    <input {...props} ref={resolvedInputRef} aria-label={props['aria-label'] ?? label} type="search" value={value} onChange={(event) => onChange(event.target.value)} />
    {clearable && value && <button type="button" aria-label={`清空${label}`} title={`清空${label}`}
      onClick={() => {
        onChange('')
        resolvedInputRef.current?.focus()
      }}><Icon name="close" /></button>}
  </label>
}

export function SplitWorkspace({ children, className = '', ...props }:
  HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return <section className={`ui-split-workspace ${className}`} {...props}>{children}</section>
}

export function TableShell({ children, footer, className = '', scrollClassName = '', footerClassName = '', scrollLabel, resetScrollKey }: {
  children: ReactNode
  footer?: ReactNode
  className?: string
  scrollClassName?: string
  footerClassName?: string
  scrollLabel?: string
  resetScrollKey?: string | number
}) {
  const scroll = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (scroll.current) { scroll.current.scrollTop = 0; scroll.current.scrollLeft = 0 }
  }, [resetScrollKey])
  return <div className={`ui-table-shell ${className}`}>
    <div ref={scroll} className={`ui-table-scroll ${scrollClassName}`} role={scrollLabel ? 'region' : undefined}
      aria-label={scrollLabel} tabIndex={scrollLabel ? 0 : undefined}>{children}</div>
    {footer !== undefined && <footer className={`ui-table-footer ${footerClassName}`}>{footer}</footer>}
  </div>
}

export function DataTable({ className = '', compact = false, ...props }:
  TableHTMLAttributes<HTMLTableElement> & { compact?: boolean }) {
  return <table className={`ui-data-table ${compact ? 'is-compact' : ''} ${className}`} {...props} />
}
