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

export type TabsVariant = 'line' | 'workspace' | 'cards' | 'pills' | 'segmented'
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
  /** 选中态使用成功色（目前仅 segmented 变体支持，如“已接诊”类终态页签）。 */
  tone?: 'success'
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
          className={`ui-tabs__tab ${selected ? 'is-active' : ''} ${item.tone ? `is-tone-${item.tone}` : ''}`}
          onKeyDown={(event) => handleKeyDown(event, item)} onClick={() => onChange(item.value)}>
          <strong>{item.label}</strong>{item.meta && <small>{item.meta}</small>}
        </button>
      })}
    </div>
    {actions && <div className="ui-tabs__actions">{actions}</div>}
  </div>
}

export type StatChipItem = {
  label: ReactNode
  value: ReactNode
  /** 数值后的补充说明，如“（余 3 盒）”。 */
  note?: ReactNode
  /** 说明需要引起注意（如临期、需核查）时用警示色。 */
  warn?: boolean
}

/** 一行“标签 + 数值”的统计胶囊，用于筛选栏/标题栏右侧的汇总；高度与同行 sm 控件一致。 */
export function StatChips({ items, className = '' }: { items: StatChipItem[]; className?: string }) {
  return <div className={`ui-stat-chips ${className}`.trim()}>
    {items.map((item, index) => <span className="ui-stat-chip" key={index}>
      {item.label} <strong>{item.value}</strong>
      {item.note !== undefined && item.note !== null && item.note !== false && <small className={item.warn ? 'ui-stat-chip__warn' : undefined}>{item.note}</small>}
    </span>)}
  </div>
}

export type TagTone = 'neutral' | 'brand' | 'info' | 'success' | 'warning' | 'danger'

/** 方角小标签：类型、编码、来源等分类信息。状态（启用/停用/异常）用 StatusBadge，不要用 Tag。 */
export function Tag({ tone = 'neutral', mono = false, className = '', title, children }: {
  tone?: TagTone
  /** 编码、批号等用等宽字体。 */
  mono?: boolean
  className?: string
  title?: string
  children: ReactNode
}) {
  return <span className={`ui-tag ui-tag--${tone} ${mono ? 'ui-tag--mono' : ''} ${className}`.trim()} title={title}>{children}</span>
}

export type DescriptionItem = {
  label: ReactNode
  value: ReactNode
  /** 占几列，默认 1。 */
  span?: number
}

/** 字段网格：小号次要色标签 + 半粗正文值。bordered 为带格线的详情卡，plain 为无框的行内信息。空值显示“—”。 */
export function DescriptionList({ items, columns = 2, variant = 'bordered', className = '' }: {
  items: DescriptionItem[]
  columns?: 2 | 3 | 4
  variant?: 'bordered' | 'plain'
  className?: string
}) {
  const empty = (value: ReactNode) => value === undefined || value === null || value === '' || value === false
  return <dl className={`ui-description-list ui-description-list--${variant} ${className}`.trim()} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
    {items.map((item, index) => <div key={index} style={item.span && item.span > 1 ? { gridColumn: `span ${Math.min(item.span, columns)}` } : undefined}>
      <dt>{item.label}</dt>
      <dd>{empty(item.value) ? '—' : item.value}</dd>
    </div>)}
  </dl>
}

/** 可选中列表（单据、期间、规则目录等）：上下方向键在条目间移动焦点，条目用 ListItemButton。 */
export function SelectableList({ label, className = '', children }: { label: string; className?: string; children: ReactNode }) {
  function move(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.ui-list-item:not(:disabled)')]
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (index < 0) return
    event.preventDefault()
    items[Math.min(items.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus()
  }
  return <div className={`ui-selectable-list ${className}`.trim()} role="group" aria-label={label} onKeyDown={move}>{children}</div>
}

/** 两行目录条目：第一行标题（可省略）+ 右侧徽标，第二行次要信息 + 右侧补充（如金额）。选中为品牌描边 + 左侧标记。 */
export function ListItemButton({ title, badge, meta, aside, selected = false, onSelect, disabled }: {
  title: ReactNode
  badge?: ReactNode
  meta?: ReactNode
  aside?: ReactNode
  selected?: boolean
  onSelect: () => void
  disabled?: boolean
}) {
  return <button type="button" className={`ui-list-item ${selected ? 'is-selected' : ''}`.trim()} aria-current={selected ? 'true' : undefined} disabled={disabled} onClick={onSelect}>
    <span className="ui-list-item__row"><strong className="ui-list-item__title">{title}</strong>{badge}</span>
    {(meta || aside) && <span className="ui-list-item__row ui-list-item__row--meta"><small>{meta}</small>{aside}</span>}
  </button>
}

export type MetricItem = {
  label: ReactNode
  value: ReactNode
  /** 数值下方的补充说明。 */
  note?: ReactNode
  /** warning 将数值标为危险色（如存在差异）。 */
  tone?: 'warning'
}

/** 合并格线的指标条：一排并列的“标签 / 数值 / 说明”，用于面板顶部的汇总。列数等于指标个数。 */
export function MetricStrip({ items, label, className = '' }: { items: MetricItem[]; label?: string; className?: string }) {
  return <div className={`ui-metric-strip ${className}`.trim()} role={label ? 'group' : undefined} aria-label={label}
    style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
    {items.map((item, index) => <div key={index} className={`ui-metric-strip__item ${item.tone === 'warning' ? 'is-warning' : ''}`.trim()}>
      <span>{item.label}</span>
      <strong>{item.value}</strong>
      {item.note && <small>{item.note}</small>}
    </div>)}
  </div>
}

export function SearchField({
  value,
  onChange,
  onSearch,
  onClear,
  label,
  clearable = true,
  size = 'md',
  inputRef: externalInputRef,
  className = '',
  onKeyDown,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'size'> & {
  value: string
  onChange: (value: string) => void
  onSearch?: (value: string) => void
  /** 点击内置清空按钮时调用（先于 onChange('')/onSearch('')），页面需要自定义清空行为时使用。 */
  onClear?: () => void
  label: string
  clearable?: boolean
  /** sm：紧凑高度，用于与 sm 按钮同行的工具栏。 */
  size?: 'md' | 'sm'
  inputRef?: RefObject<HTMLInputElement | null>
}) {
  const inputRef = useRef<HTMLInputElement | null>(null)

  const resolvedInputRef = externalInputRef ?? inputRef

  return <label className={`ui-search-field ${size === 'sm' ? 'ui-search-field--sm' : ''} ${className}`}>
    <span className="visually-hidden">{label}</span>
    <Icon name="search" />
    <input
      {...props}
      ref={resolvedInputRef}
      aria-label={props['aria-label'] ?? label}
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing && onSearch) {
          event.preventDefault()
          onSearch(value)
        }
        onKeyDown?.(event)
      }}
    />
    {clearable && value && <button type="button" aria-label={`清空${label}`} title={`清空${label}`}
      onClick={() => {
        onClear?.()
        onChange('')
        onSearch?.('')
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
