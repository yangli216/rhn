import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'

export interface RemoteSearchOption<T = unknown> {
  value: string
  label: string
  code: string
  description?: string
  tags?: string[]
  raw?: T
  disabled?: boolean
}

export interface RemoteSearchSelectProps<T = unknown> {
  id?: string
  name?: string
  className?: string
  value?: RemoteSearchOption<T>
  onChange: (option?: RemoteSearchOption<T>) => void
  loadOptions: (query: string) => Promise<RemoteSearchOption<T>[]>
  placeholder?: string
  searchPlaceholder?: string
  minChars?: number
  debounceMs?: number
  resultLimit?: number
  disabled?: boolean
  clearable?: boolean
  showCode?: boolean
  emptyText?: string
  popoverMinWidth?: number
  defaultOpen?: boolean
  autoFocus?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true'
  'aria-required'?: boolean | 'false' | 'true'
}

interface PopoverPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

export function RemoteSearchSelect<T>({
  id,
  name,
  className = '',
  value,
  onChange,
  loadOptions,
  placeholder = '输入关键字检索',
  searchPlaceholder = '输入名称、编码或拼音码',
  minChars = 1,
  debounceMs = 250,
  resultLimit = 30,
  disabled = false,
  clearable = true,
  showCode = true,
  emptyText = '未找到匹配结果',
  popoverMinWidth = 540,
  defaultOpen = false,
  autoFocus = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: RemoteSearchSelectProps<T>) {
  const generatedId = useId()
  const controlId = id ?? generatedId
  const listboxId = `${controlId}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const requestSequence = useRef(0)
  const cacheRef = useRef(new Map<string, RemoteSearchOption<T>[]>() )
  const [open, setOpen] = useState(defaultOpen)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<RemoteSearchOption<T>[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>()
  const normalizedQuery = query.trim()

  useEffect(() => {
    if (!open || normalizedQuery.length < minChars) {
      requestSequence.current += 1
      setOptions([])
      setLoading(false)
      setError('')
      setActiveIndex(-1)
      return
    }
    const sequence = ++requestSequence.current
    const cached = cacheRef.current.get(normalizedQuery)
    if (cached) {
      setOptions(cached)
      setActiveIndex(firstEnabledIndex(cached))
      setLoading(false)
      setError('')
      return
    }
    setOptions([])
    setActiveIndex(-1)
    setLoading(true)
    setError('')
    const timer = window.setTimeout(() => {
      loadOptions(normalizedQuery)
        .then((items) => {
          if (sequence !== requestSequence.current) return
          const next = items.slice(0, resultLimit)
          cacheRef.current.set(normalizedQuery, next)
          setOptions(next)
          setActiveIndex(firstEnabledIndex(next))
        })
        .catch(() => {
          if (sequence !== requestSequence.current) return
          setOptions([])
          setActiveIndex(-1)
          setError('检索失败，请检查网络后重试')
        })
        .finally(() => {
          if (sequence === requestSequence.current) setLoading(false)
        })
    }, debounceMs)
    return () => window.clearTimeout(timer)
  }, [debounceMs, loadOptions, minChars, normalizedQuery, open, resultLimit])

  useEffect(() => {
    if (!open) return
    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeFromOutside)
    return () => document.removeEventListener('pointerdown', closeFromOutside)
  }, [open])

  useLayoutEffect(() => {
    if (!open) return
    function updatePosition() {
      const trigger = triggerRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const margin = 12
      const gap = 4
      const availableBelow = window.innerHeight - rect.bottom - gap - margin
      const availableAbove = rect.top - gap - margin
      const placement = availableBelow < 300 && availableAbove > availableBelow ? 'top' : 'bottom'
      const availableHeight = placement === 'bottom' ? availableBelow : availableAbove
      const width = Math.min(Math.max(rect.width, popoverMinWidth), Math.max(0, window.innerWidth - margin * 2))
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin))
      setPopoverPosition({
        left,
        width,
        maxHeight: Math.max(160, Math.min(420, availableHeight)),
        top: placement === 'bottom' ? rect.bottom + gap : undefined,
        bottom: placement === 'top' ? window.innerHeight - rect.top + gap : undefined,
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

  useEffect(() => {
    if (open && popoverPosition) searchRef.current?.focus()
  }, [open, popoverPosition])

  useEffect(() => {
    if (autoFocus && !defaultOpen) triggerRef.current?.focus()
  }, [autoFocus, defaultOpen])

  useEffect(() => {
    if (!open) {
      requestSequence.current += 1
      setQuery('')
      setOptions([])
      setActiveIndex(-1)
      setLoading(false)
      setError('')
      setPopoverPosition(undefined)
    }
  }, [open])

  function select(option: RemoteSearchOption<T>) {
    if (option.disabled) return
    onChange(option)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function moveActive(direction: 1 | -1) {
    const next = nextEnabledIndex(activeIndex, direction, options)
    if (next >= 0) setActiveIndex(next)
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(event.key === 'ArrowDown' ? 1 : -1)
    } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
      const active = options[activeIndex]
      if (active && !active.disabled) {
        event.preventDefault()
        select(active)
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
    }
  }

  const prompt = normalizedQuery.length < minChars
    ? `请输入至少 ${minChars} 个字符开始检索`
    : loading ? '正在检索…'
      : error || (options.length === 0 ? emptyText : '')

  return <div className={`ui-remote-search ${open ? 'is-open' : ''}`} ref={rootRef}>
    {name && <input type="hidden" name={name} value={value?.value ?? ''} disabled={disabled} />}
    <button
      ref={triggerRef}
      id={controlId}
      type="button"
      role="combobox"
      className={`ui-remote-search__trigger ${value ? '' : 'is-placeholder'} ${className}`}
      aria-label={ariaLabel}
      aria-controls={listboxId}
      aria-describedby={ariaDescribedBy}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      disabled={disabled}
      onClick={() => {
        if (!open) setOpen(true)
        else searchRef.current?.focus()
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
        }
      }}
    >
      <span className="ui-remote-search__value">{value?.label ?? placeholder}</span>
      {value && showCode && <code>{value.code}</code>}
      <Icon name="search" />
    </button>
    {open && popoverPosition && createPortal(<div
      ref={popoverRef}
      className="ui-remote-search__popover"
      data-placement={popoverPosition.placement}
      style={{ top: popoverPosition.top, bottom: popoverPosition.bottom, left: popoverPosition.left,
        width: popoverPosition.width, maxHeight: popoverPosition.maxHeight }}
    >
      <label className="ui-remote-search__search">
        <span className="visually-hidden">远程检索</span>
        <Icon name="search" />
        <input
          ref={searchRef}
          value={query}
          placeholder={searchPlaceholder}
          autoComplete="off"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleSearchKeyDown}
        />
        {loading ? <span className="ui-spinner" aria-hidden="true" /> : query && <button type="button"
          aria-label="清除检索内容" onClick={() => { setQuery(''); searchRef.current?.focus() }}>
          <Icon name="close" />
        </button>}
      </label>
      <div id={listboxId} className="ui-remote-search__list" role="listbox">
        {prompt && <div className={`ui-remote-search__empty ${error ? 'is-error' : ''}`} role="status">{prompt}</div>}
        {options.map((option, index) => <button
          key={option.value}
          id={`${listboxId}-option-${index}`}
          type="button"
          role="option"
          className={`ui-remote-search__option ${index === activeIndex ? 'is-active' : ''} ${value?.value === option.value ? 'is-selected' : ''}`}
          aria-selected={value?.value === option.value}
          disabled={option.disabled}
          onClick={() => select(option)}
          onMouseMove={() => { if (!option.disabled && activeIndex !== index) setActiveIndex(index) }}
        >
          <span className="ui-remote-search__option-main" title={option.description}>
            <span className="ui-remote-search__option-head">
              <strong>{option.label}</strong>
              {option.tags && option.tags.length > 0 && (
                <span className="ui-remote-search__tags">
                  {option.tags.map((tag) => (
                    <span
                      key={tag}
                      className={`ui-remote-search__tag ${
                        tag === '西药' || tag === '中成药' || tag === '草药' || tag === '检验' || tag === '检查' || tag === '治疗'
                          ? 'is-type'
                          : tag === '需皮试' || tag === '孕妇慎用'
                          ? 'is-danger'
                          : tag === '基药'
                          ? 'is-success'
                          : tag === '处方药'
                          ? 'is-rx'
                          : ''
                      }`}
                    >
                      {tag}
                    </span>
                  ))}
                </span>
              )}
            </span>
            {option.description && <small className="ui-remote-search__desc">{option.description}</small>}
          </span>
          <span className="ui-remote-search__option-code">{showCode && <code>{option.code}</code>}
            {value?.value === option.value && <Icon name="check" />}</span>
        </button>)}
      </div>
      {clearable && value && <button className="ui-remote-search__clear" type="button" onClick={() => {
        onChange(undefined)
        setOpen(false)
        triggerRef.current?.focus()
      }}>清空选择</button>}
    </div>, document.body)}
  </div>
}

function firstEnabledIndex(options: RemoteSearchOption[]) {
  return options.findIndex((option) => !option.disabled)
}

function nextEnabledIndex(current: number, direction: 1 | -1, options: RemoteSearchOption[]) {
  let index = current + direction
  if (current < 0 && direction === -1) index = options.length - 1
  while (index >= 0 && index < options.length) {
    if (!options[index].disabled) return index
    index += direction
  }
  return -1
}
