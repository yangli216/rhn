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
  type HTMLAttributes,
  type PropsWithChildren,
  type ReactElement,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import type { SemanticTone } from '../presentation'

export { Icon, type IconName } from './Icon'
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
  variant?: ButtonVariant
  size?: ButtonSize
  busy?: boolean
  busyLabel?: string
}) {
  return <button
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
  eyebrow: string
  title: string
  description?: string
  actions?: ReactNode
  compact?: boolean
}) {
  return <header className={`ui-page-header ${compact ? 'is-compact' : ''} ${actions ? 'has-actions' : ''}`}>
    <div>
      <span className="ui-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {description && <p title={description}>{description}</p>}
    </div>
    {actions && <div className="ui-page-header__actions">{actions}</div>}
  </header>
}

export function PanelHead({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return <header className="ui-panel__head">
    <h2>{title}</h2>
    {meta && <span className="ui-panel__meta">{meta}</span>}
    {actions}
  </header>
}

export function Pagination({ page, totalPages, onChange, label = '列表分页' }: {
  page: number
  totalPages: number
  onChange: (page: number) => void
  label?: string
}) {
  if (totalPages <= 1) return null
  return <nav className="ui-pagination" aria-label={label}>
    <button type="button" disabled={page <= 0} onClick={() => onChange(page - 1)}>上一页</button>
    <span><strong>{page + 1}</strong> / {totalPages}</span>
    <button type="button" disabled={page >= totalPages - 1} onClick={() => onChange(page + 1)}>下一页</button>
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

export function Alert({ tone = 'error', children, className = '' }: PropsWithChildren<{
  tone?: AlertTone
  className?: string
}>) {
  const assertive = tone === 'error' || tone === 'warning'
  return <div
    className={`ui-alert ui-alert--${tone} ${className}`}
    role={assertive ? 'alert' : 'status'}
    aria-live={assertive ? 'assertive' : 'polite'}
  >
    <Icon className="ui-alert__icon" name={alertIcons[tone]} />
    <div>{children}</div>
  </div>
}

function focusableElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute('hidden'))
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
}: PropsWithChildren<{
  title: string
  eyebrow?: string
  description?: string
  onClose: () => void
  footer?: ReactNode
  closeOnBackdrop?: boolean
  size?: 'default' | 'wide' | 'xwide'
  className?: string
}>) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const titleId = useId()
  const descriptionId = useId()

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
    ;(focusedInsideDialog ?? autoFocusTarget ?? focusable[0] ?? dialog)?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
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
  }, [onClose])

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

function FieldHint({ label, hint, hintId }: { label: string; hint: string; hintId: string }) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, placement: 'above' as 'above' | 'below' })

  useLayoutEffect(() => {
    if (!open) return

    function updatePosition() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const viewportGap = 12
      const tooltipWidth = Math.min(320, window.innerWidth - viewportGap * 2)
      const left = Math.max(viewportGap, Math.min(rect.left, window.innerWidth - tooltipWidth - viewportGap))
      const placement = rect.top >= 80 ? 'above' : 'below'
      setPosition({
        left,
        top: placement === 'above' ? rect.top - 8 : rect.bottom + 8,
        placement,
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
        aria-label={`查看${label}提示`}
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
  label: string
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
  eyebrow: string
  title: string
  description: string
  facts?: Array<{ label: string; value: ReactNode }>
  actions?: ReactNode
}) {
  return <section className="ui-context-bar" aria-label={`${title}业务上下文`}>
    <div className="ui-context-bar__avatar" aria-hidden="true">{avatar}</div>
    <div className="ui-context-bar__identity">
      <span className="ui-eyebrow">{eyebrow}</span>
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
