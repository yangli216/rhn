import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type HTMLAttributes,
  type KeyboardEvent as ReactKeyboardEvent,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import type { SemanticTone } from '../presentation'

export { Icon, type IconName } from './Icon'
export { Popconfirm, type PopconfirmProps } from './Popconfirm'
export { Select, type SelectMultipleProps, type SelectOption, type SelectProps, type SelectSingleProps } from './Select'
export { DictionarySelect, type DictionarySelectProps } from './DictionarySelect'
export { FormSelect } from './FormSelect'
export { TreePanel, type TreePanelMove, type TreePanelNode, type TreePanelProps } from './TreePanel'
export { GridAddressInput, type GridAddressInputProps, type GridAddressValue } from './GridAddressInput'
export { RemoteSearchSelect, type RemoteSearchOption, type RemoteSearchSelectProps } from './RemoteSearchSelect'
export {
  PatientIdentitySearch,
  unavailablePatientIdentityMethods,
  type PatientIdentityMethod,
  type PatientIdentityMethodId,
  type PatientIdentitySearchProps,
} from './PatientIdentitySearch'
export {
  ClinicalResourceSearch,
  type ClinicalResource,
  type ClinicalResourceOption,
  type ClinicalResourceSearchProps,
  type ClinicalResourceType,
  type OrderSearchMode,
} from './ClinicalResourceSearch'
export {
  DataTable,
  SearchField,
  SplitWorkspace,
  TableShell,
  Tabs,
  type TabItem,
  type TabsVariant,
} from './Workspace'

export type ButtonVariant = 'primary' | 'secondary' | 'text' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export function Button({
  ref,
  variant = 'primary',
  size = 'md',
  busy = false,
  busyLabel = '处理中',
  children,
  disabled,
  className = '',
  type = 'button',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  ref?: Ref<HTMLButtonElement>
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
  busyLabel?: string
}) {
  return <button
    ref={ref}
    type={type}
    className={`ui-button ui-button--${variant} ui-button--${size} ${busy ? 'is-busy' : ''} ${className}`}
    disabled={disabled || busy}
    aria-busy={busy || undefined}
    {...props}
  >
    <span className="ui-button__label">{children}</span>
    {busy && <span className="ui-button__busy" role="status"><span className="ui-spinner" aria-hidden="true" />{busyLabel}</span>}
  </button>
}

export function IconButton({ icon, label, className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return <button type={type} className={`ui-icon-button ${className}`} aria-label={label} title={label} {...props}>
    <Icon name={icon} />
  </button>
}

export function Panel({ children, className = '', ...props }: PropsWithChildren<HTMLAttributes<HTMLElement>>) {
  return <section className={`ui-panel ${className}`} {...props}>{children}</section>
}

export function PageHeader({ eyebrow, title, description, actions, compact = false }: {
  eyebrow?: string
  title: string
  description?: string
  actions?: ReactNode
  compact?: boolean
}) {
  return <header className={`ui-page-header ${compact ? 'is-compact' : ''} ${actions ? 'has-actions' : ''}`}>
    <div>
      {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      {description && <p title={description}>{description}</p>}
    </div>
    {actions && <div className="ui-page-header__actions">{actions}</div>}
  </header>
}

export function PanelHead({ title, meta, actions, className = '' }: {
  title: string
  meta?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return <header className={`ui-panel__head ${className}`}>
    <h2>{title}</h2>
    {meta && <span className="ui-panel__meta">{meta}</span>}
    {actions}
  </header>
}

export function Pagination({
  page,
  totalPages,
  onChange,
  total,
  pageSize,
  onPageSizeChange,
  pageSizeOptions = [10, 20, 50],
  label = '列表分页',
}: {
  page: number
  totalPages: number
  onChange: (page: number) => void
  total?: number
  pageSize?: number
  onPageSizeChange?: (size: number) => void
  pageSizeOptions?: number[]
  label?: string
}) {
  if (totalPages <= 1 && total === undefined && pageSize === undefined) return null
  return <nav className="ui-pagination" aria-label={label}>
    {total !== undefined && <span className="ui-pagination__total">共 {total} 条记录</span>}
    {pageSize !== undefined && onPageSizeChange && (
      <label className="ui-pagination__size">
        <span>每页显示</span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          aria-label="每页显示条数"
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>{opt} 条</option>
          ))}
        </select>
      </label>
    )}
    {totalPages > 0 && (
      <div className="ui-pagination__nav">
        <button type="button" disabled={page <= 0} onClick={() => onChange(page - 1)}>上一页</button>
        <span><strong>{page + 1}</strong> / {Math.max(1, totalPages)}</span>
        <button type="button" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>下一页</button>
      </div>
    )}
  </nav>
}

export function EmptyState({ icon, title, copy, action }: {
  icon: IconName
  title: string
  copy: string
  action?: ReactNode
}) {
  return <div className="ui-empty-state">
    <span className="ui-empty-state__icon"><Icon name={icon} /></span>
    <strong>{title}</strong>
    <p>{copy}</p>
    {action}
  </div>
}

export function LoadingState({ label = '正在加载…' }: { label?: string }) {
  return <div className="ui-loading-state" role="status" aria-live="polite">
    <span className="ui-spinner" aria-hidden="true" />
    <span>{label}</span>
  </div>
}

export type AlertTone = 'error' | 'warning' | 'success' | 'info'

const alertIcons: Record<AlertTone, IconName> = {
  error: 'error',
  warning: 'warning',
  success: 'success',
  info: 'info',
}

const defaultAlertDuration: Record<AlertTone, number> = {
  error: 8_000,
  warning: 8_000,
  success: 4_500,
  info: 5_000,
}

function alertText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(alertText).join('')
  if (isValidElement<{ children?: ReactNode }>(node)) return alertText(node.props.children)
  return ''
}

function notificationViewport(host: Element) {
  const existing = Array.from(host.children).find((element) =>
    element instanceof HTMLElement && element.dataset.uiNotificationViewport === 'true')
  if (existing instanceof HTMLElement) return existing

  const viewport = document.createElement('div')
  viewport.className = 'ui-notification-viewport'
  viewport.dataset.uiNotificationViewport = 'true'
  viewport.setAttribute('aria-label', '系统提示')
  host.appendChild(viewport)
  return viewport
}

export function Alert({
  tone = 'error',
  children,
  className = '',
  duration,
  dismissible = true,
  onDismiss,
}: PropsWithChildren<{
  tone?: AlertTone
  className?: string
  /** 自动关闭毫秒数；传 null 时持续显示，直到用户关闭或业务状态解除。 */
  duration?: number | null
  dismissible?: boolean
  onDismiss?: () => void
}>) {
  const assertive = tone === 'error' || tone === 'warning'
  const anchorRef = useRef<HTMLSpanElement>(null)
  const onDismissRef = useRef(onDismiss)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(true)
  const messageKey = `${tone}:${alertText(children)}`
  const resolvedDuration = duration === undefined ? defaultAlertDuration[tone] : duration

  useLayoutEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useLayoutEffect(() => {
    if (!anchorRef.current) return
    const workspace = anchorRef.current.closest('.workspace-panel')
    setTarget(notificationViewport(workspace ?? document.body))
  }, [])

  useEffect(() => {
    setVisible(true)
    if (resolvedDuration === null || resolvedDuration <= 0) return
    const timeout = window.setTimeout(() => {
      setVisible(false)
      onDismissRef.current?.()
    }, resolvedDuration)
    return () => window.clearTimeout(timeout)
  }, [messageKey, resolvedDuration])

  const dismiss = () => {
    setVisible(false)
    onDismissRef.current?.()
  }

  return <>
    <span ref={anchorRef} className="ui-alert-anchor" aria-hidden="true" />
    {visible && target && createPortal(<div
      className={`ui-alert ui-alert--${tone} ui-toast ${className}`}
      role={assertive ? 'alert' : 'status'}
      aria-live={assertive ? 'assertive' : 'polite'}
    >
      <Icon className="ui-alert__icon" name={alertIcons[tone]} />
      <div className="ui-alert__content">{children}</div>
      {dismissible && <button className="ui-toast__close" type="button" aria-label="关闭提示" onClick={dismiss}>
        <Icon name="close" />
      </button>}
      {resolvedDuration !== null && resolvedDuration > 0 && <span className="ui-toast__timer" aria-hidden="true"
        style={{ '--ui-toast-duration': `${resolvedDuration}ms` } as CSSProperties} />}
    </div>, target)}
  </>
}

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
}

const enterNavigableSelector = [
  'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"])',
  'select',
  'textarea',
  'button[role="combobox"]',
].join(', ')

function enterNavigableElements(form: HTMLFormElement) {
  return Array.from(form.querySelectorAll<HTMLElement>(enterNavigableSelector)).filter((element) => (
    !element.hasAttribute('disabled')
    && !element.hasAttribute('readonly')
    && !element.closest('[hidden]')
    && element.getAttribute('tabindex') !== '-1'
    && element.dataset.enterNavigation !== 'ignore'
  ))
}

function blocksEnterNavigation(control: HTMLElement) {
  const nativeControl = control as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
  if (typeof nativeControl.checkValidity === 'function' && !nativeControl.checkValidity()) {
    nativeControl.reportValidity()
    return true
  }
  if (control.getAttribute('aria-invalid') === 'true' || control.closest('.ui-field')?.classList.contains('is-invalid')) {
    return true
  }
  return control.getAttribute('aria-required') === 'true' && control.classList.contains('is-placeholder')
}

function advanceDialogFormOnEnter(event: ReactKeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Enter' || event.defaultPrevented || event.nativeEvent.isComposing
    || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return

  const target = event.target
  if (!(target instanceof HTMLElement) || target.matches('textarea, [contenteditable="true"]')
    || target.dataset.enterNavigation === 'ignore') return
  const control = target.closest<HTMLElement>(enterNavigableSelector)
  const form = control?.closest('form')
  if (!control || !form || !event.currentTarget.contains(form)) return

  if (blocksEnterNavigation(control)) {
    event.preventDefault()
    control.focus()
    return
  }

  const controls = enterNavigableElements(form)
  const next = controls[controls.indexOf(control) + 1]
  if (!next) return
  event.preventDefault()
  next.focus()
}

export function Dialog({
  title,
  eyebrow,
  description,
  onClose,
  children,
  footer,
  closeOnBackdrop = true,
  size = 'default',
  className = '',
  initialFocusRef,
  enterNavigation = true,
}: PropsWithChildren<{
  title: string
  eyebrow?: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  closeOnBackdrop?: boolean
  size?: 'default' | 'wide' | 'xwide'
  className?: string
  initialFocusRef?: RefObject<HTMLElement | null>
  enterNavigation?: boolean
}>) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const initialFocusTargetRef = useRef(initialFocusRef)
  const onCloseRef = useRef(onClose)
  const titleId = useId()
  const descriptionId = useId()

  useLayoutEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = triggerRef.current
    const previousOverflow = document.body.style.overflow
    const applicationRoot = document.getElementById('root')
    const applicationWasInert = applicationRoot?.hasAttribute('inert') ?? false
    document.body.style.overflow = 'hidden'
    applicationRoot?.setAttribute('inert', '')

    const dialog = dialogRef.current
    const focusable = dialog ? focusableElements(dialog) : []
    const autoFocusTarget = dialog?.querySelector<HTMLElement>('[autofocus]')
    const focusedInsideDialog = document.activeElement instanceof HTMLElement && dialog?.contains(document.activeElement)
      ? document.activeElement : null
    ;(initialFocusTargetRef.current?.current ?? focusedInsideDialog ?? autoFocusTarget ?? focusable[0] ?? dialog)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const elements = focusableElements(dialog)
      if (elements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (!applicationWasInert) applicationRoot?.removeAttribute('inert')
      previouslyFocused?.focus()
    }
  }, [])

  return createPortal(<div className="ui-dialog-backdrop" onMouseDown={closeOnBackdrop ? onClose : undefined}>
    <div
      ref={dialogRef}
      className={`ui-dialog ${size !== 'default' ? `ui-dialog--${size}` : ''} ${className}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      tabIndex={-1}
      onMouseDown={(event) => event.stopPropagation()}
      onKeyDown={enterNavigation ? advanceDialogFormOnEnter : undefined}
    >
      <div className="ui-dialog__head">
        <div className="ui-dialog__heading">
          {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
          {eyebrow && <span className="ui-dialog__heading-sep" aria-hidden="true">·</span>}
          <h2 id={titleId}>{title}</h2>
        </div>
        <IconButton icon="close" label="关闭弹窗" onClick={onClose} />
      </div>
      {description && <p className="ui-dialog__description" id={descriptionId}>{description}</p>}
      {children}
      {footer && <div className="ui-form-actions">{footer}</div>}
    </div>
  </div>, document.body)
}

type FormControlProps = {
  id?: string
  className?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true'
  'aria-required'?: boolean | 'false' | 'true'
}

function FieldHint({ label, hint, hintId }: { label: ReactNode; hint: string; hintId: string }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number; placement: 'top' | 'bottom' }>({
    left: 0,
    top: 0,
    placement: 'top',
  })

  useEffect(() => {
    if (!open) return
    const updatePosition = () => {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const tooltipHeight = 44
      const spacing = 8
      const topPlacement = rect.top - tooltipHeight - spacing
      const hasTopSpace = topPlacement >= 8
      setPosition({
        left: Math.max(8, Math.min(window.innerWidth - 280, rect.left + rect.width / 2 - 130)),
        top: hasTopSpace ? topPlacement : rect.bottom + spacing,
        placement: hasTopSpace ? 'top' : 'bottom',
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

  return <>
    <span className="ui-field__hint">
      <button
        ref={triggerRef}
        type="button"
        className="ui-field__hint-trigger"
        aria-label={typeof label === 'string' ? `查看${label}提示` : '查看字段提示'}
        aria-describedby={hintId}
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        <Icon name="info" />
      </button>
      <span id={hintId} className="visually-hidden">{hint}</span>
    </span>
    {open && createPortal(<span
      className={`ui-field__hint-tooltip ui-field__hint-tooltip--${position.placement}`}
      role="tooltip"
      style={{ left: position.left, top: position.top }}
    >{hint}</span>, document.body)}
  </>
}

export function FormField({ label, error, hint, required = false, className = '', children }: {
  label: ReactNode
  error?: string
  hint?: string
  required?: boolean
  className?: string
  children: ReactElement<FormControlProps>
}) {
  const generatedId = useId()
  const child = Children.only(children)
  const controlId = child.props.id ?? generatedId
  const hintId = `${controlId}-hint`
  const errorId = `${controlId}-error`
  const describedBy = [child.props['aria-describedby'], hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ') || undefined
  const control = isValidElement<FormControlProps>(child) ? cloneElement(child, {
    id: controlId,
    className: `ui-field__control ${child.props.className ?? ''}`,
    'aria-invalid': error ? true : child.props['aria-invalid'],
    'aria-required': required ? true : child.props['aria-required'],
    'aria-describedby': describedBy,
  }) : child

  return <div className={`ui-field ${error ? 'is-invalid' : ''} ${className}`}>
    <div className="ui-field__label-row">
      <label className="ui-field__label" htmlFor={controlId}>{label}
        {required && <span className="ui-field__required" aria-hidden="true">*</span>}
      </label>
      {hint && <FieldHint label={label} hint={hint} hintId={hintId} />}
    </div>
    {control}
    {error && <small id={errorId} className="ui-field__message ui-field__error">{error}</small>}
  </div>
}

export type StatusTone = SemanticTone

export function StatusBadge({ tone = 'neutral', children, className = '' }: PropsWithChildren<{
  tone?: StatusTone
  className?: string
}>) {
  return <span className={`ui-badge ui-badge--${tone} ${className}`}>{children}</span>
}

export function ObjectContextBar({ avatar, eyebrow, title, description, facts, actions }: {
  avatar: string
  eyebrow?: string
  title: string
  description: string
  facts?: Array<{ label: string; value: ReactNode }>
  actions?: ReactNode
}) {
  return <section className="ui-context-bar" aria-label={`${title}业务上下文`}>
    <div className="ui-context-bar__avatar" aria-hidden="true">{avatar}</div>
    <div className="ui-context-bar__identity">
      {eyebrow && <span className="ui-eyebrow">{eyebrow}</span>}
      <h1>{title}</h1>
      <p>{description}</p>
    </div>
    {facts && facts.length > 0 && <dl className="ui-context-bar__facts">
      {facts.map((fact) => <div className="ui-context-bar__fact" key={fact.label}>
        <dt>{fact.label}</dt><dd>{fact.value || '—'}</dd>
      </div>)}
    </dl>}
    {actions && <div className="ui-context-bar__actions">{actions}</div>}
  </section>
}

export function BackButton({ children, ...props }: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>>) {
  return <button type="button" className="ui-back-link" {...props}><Icon name="arrow-left" />{children}</button>
}

export function PlannedPage({ title, copy }: { title: string; copy: string }) {
  return <>
    <PageHeader eyebrow="产品能力地图" title={title} />
    <Panel className="planned-page">
      <Icon name="roadmap" />
      <h2>已纳入建设路线图</h2>
      <p>{copy}</p>
      <div className="planned-rule" aria-hidden="true"><i /><i /><i /></div>
    </Panel>
  </>
}

export * from './DateRangePicker'
export * from '../utils/dateRange'
