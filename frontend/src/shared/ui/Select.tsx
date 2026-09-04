import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon, type IconName } from './Icon'
import { pinyinInitials } from './pinyinInitials'

export interface SelectOption {
  value: string
  label: string
  icon?: IconName
  disabled?: boolean
  searchKeywords?: string[]
  secondaryText?: string
  description?: string
  trailingText?: string
}

interface SelectBaseProps {
  id?: string
  name?: string
  className?: string
  options: SelectOption[]
  placeholder?: string
  emptyText?: string
  loading?: boolean
  loadingText?: string
  disabled?: boolean
  clearable?: boolean
  searchable?: boolean
  searchPlaceholder?: string
  noResultsText?: string
  pinyinSearch?: boolean
  showValue?: boolean
  popoverMinWidth?: number
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true'
  'aria-required'?: boolean | 'false' | 'true'
}

export interface SelectSingleProps extends SelectBaseProps {
  multiple?: false
  value?: string
  onChange?: (value: string, option?: SelectOption) => void
}

export interface SelectMultipleProps extends SelectBaseProps {
  multiple: true
  value?: string[]
  onChange?: (value: string[], options: SelectOption[]) => void
}

export type SelectProps = SelectSingleProps | SelectMultipleProps

export function Select(props: SelectProps) {
  const {
    id,
    name,
    className = '',
    options,
    placeholder = '请选择',
    emptyText = '暂无可选项',
    loading = false,
    loadingText = '正在加载选项…',
    disabled = false,
    clearable = true,
    searchable = true,
    searchPlaceholder = '搜索名称、编码或拼音首字母',
    noResultsText = '未找到匹配的选项',
    pinyinSearch = true,
    showValue = false,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
  } = props
  const generatedId = useId()
  const controlId = id ?? generatedId
  const listboxId = `${controlId}-listbox`
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>()
  const positioned = Boolean(popoverPosition)
  const multiple = props.multiple === true
  const values = multiple ? (props.value ?? []) : props.value ? [props.value] : []
  const valueSet = useMemo(() => new Set(values), [values])
  const selectedOptions = options.filter((option) => valueSet.has(option.value))
  const filteredOptions = useMemo(() => filterSelectOptions(options, query, pinyinSearch), [options, pinyinSearch, query])
  const unavailable = disabled || loading

  useEffect(() => {
    if (!open || !positioned) return
    const selectedIndex = query.trim()
      ? -1
      : filteredOptions.findIndex((option) => values.includes(option.value) && !option.disabled)
    const firstEnabledIndex = nextEnabledIndex(-1, 1, filteredOptions)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex)
  }, [filteredOptions, open, positioned, query, values.join('\u0000')])

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
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const availableBelow = viewportHeight - rect.bottom - gap - margin
      const availableAbove = rect.top - gap - margin
      const placement = availableBelow < 240 && availableAbove > availableBelow ? 'top' : 'bottom'
      const availableHeight = placement === 'bottom' ? availableBelow : availableAbove
      const defaultMin = (options.some((o) => o.secondaryText || o.description || o.trailingText) || props.searchable) ? 460 : 288
      const effectiveMinWidth = props.popoverMinWidth ?? defaultMin
      const width = Math.min(Math.max(rect.width, effectiveMinWidth), Math.max(0, viewportWidth - margin * 2))
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, viewportWidth - width - margin))
      setPopoverPosition({
        left,
        width,
        maxHeight: Math.max(120, Math.min(352, availableHeight)),
        top: placement === 'bottom' ? rect.bottom + gap : undefined,
        bottom: placement === 'top' ? viewportHeight - rect.top + gap : undefined,
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
    if (!open || !positioned) return
    if (searchable) {
      searchRef.current?.focus()
      return
    }
    const selectedIndex = filteredOptions.findIndex((option) => valueSet.has(option.value) && !option.disabled)
    const firstEnabledIndex = filteredOptions.findIndex((option) => !option.disabled)
    const initialIndex = selectedIndex >= 0 ? selectedIndex : firstEnabledIndex
    if (initialIndex >= 0) optionRefs.current[initialIndex]?.focus()
  }, [open, positioned, searchable])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(-1)
      setPopoverPosition(undefined)
    }
  }, [open])

  function selectionLabel() {
    if (loading) return loadingText
    if (!selectedOptions.length) return placeholder
    if (!multiple) return selectedOptions[0]?.label ?? placeholder
    if (selectedOptions.length <= 2) return selectedOptions.map((option) => option.label).join('、')
    return `${selectedOptions.slice(0, 2).map((option) => option.label).join('、')} 等 ${selectedOptions.length} 项`
  }

  function changeSelection(option: SelectOption) {
    if (option.disabled) return
    if (multiple) {
      const nextValues = valueSet.has(option.value)
        ? values.filter((value) => value !== option.value)
        : [...values, option.value]
      const nextSet = new Set(nextValues)
      props.onChange?.(nextValues, options.filter((item) => nextSet.has(item.value)))
      return
    }
    props.onChange?.(option.value, option)
    setOpen(false)
    triggerRef.current?.focus()
  }

  function clearSelection() {
    if (multiple) props.onChange?.([], [])
    else props.onChange?.('')
    setOpen(false)
    triggerRef.current?.focus()
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index
    if (event.key === 'ArrowDown') target = nextEnabledIndex(index, 1, filteredOptions)
    else if (event.key === 'ArrowUp') target = nextEnabledIndex(index, -1, filteredOptions)
    else if (event.key === 'Home') target = nextEnabledIndex(-1, 1, filteredOptions)
    else if (event.key === 'End') target = nextEnabledIndex(filteredOptions.length, -1, filteredOptions)
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      triggerRef.current?.focus()
      return
    } else return
    event.preventDefault()
    if (target >= 0) {
      setActiveIndex(target)
      optionRefs.current[target]?.focus()
    }
  }

  return <div className={`ui-select ${open ? 'is-open' : ''}`} ref={rootRef}>
    {name && (multiple
      ? values.map((value) => <input key={value} type="hidden" name={name} value={value} disabled={disabled} />)
      : <input type="hidden" name={name} value={values[0] ?? ''} disabled={disabled} />)}
    <button
      ref={triggerRef}
      id={controlId}
      type="button"
      role="combobox"
      className={`ui-select__trigger ${selectedOptions.length ? '' : 'is-placeholder'} ${className}`}
      aria-label={ariaLabel}
      aria-controls={listboxId}
      aria-describedby={ariaDescribedBy}
      aria-expanded={open}
      aria-haspopup="listbox"
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      disabled={unavailable}
      onClick={() => setOpen((current) => !current)}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
        }
      }}
    >
      {!multiple && selectedOptions[0]?.icon && (
        <Icon name={selectedOptions[0].icon} className="ui-select__trigger-icon" />
      )}
      <span className="ui-select__value">{selectionLabel()}</span>
      {multiple && selectedOptions.length > 0 && <span className="ui-select__count">{selectedOptions.length}</span>}
      {loading ? <span className="ui-spinner" aria-hidden="true" /> : <Icon name="chevron-down" />}
    </button>
    {open && popoverPosition && createPortal(<div ref={popoverRef} className="ui-select__popover"
      data-placement={popoverPosition.placement} style={{ top: popoverPosition.top, bottom: popoverPosition.bottom,
        left: popoverPosition.left, width: popoverPosition.width, maxHeight: popoverPosition.maxHeight }}>
      {searchable && <label className="ui-select__search">
        <span className="visually-hidden">检索选项</span>
        <Icon name="search" />
        <input
          ref={searchRef}
          value={query}
          placeholder={searchPlaceholder}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              const direction = event.key === 'ArrowDown' ? 1 : -1
              const startIndex = activeIndex >= 0
                ? activeIndex
                : direction === 1 ? -1 : filteredOptions.length
              const nextIndex = nextEnabledIndex(startIndex, direction, filteredOptions)
              if (nextIndex >= 0) setActiveIndex(nextIndex)
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              const activeOption = filteredOptions[activeIndex]
              if (activeOption && !activeOption.disabled) {
                event.preventDefault()
                changeSelection(activeOption)
              }
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              setOpen(false)
              triggerRef.current?.focus()
            }
          }}
        />
        {query && <button type="button" aria-label="清除检索内容" onClick={() => {
          setQuery('')
          searchRef.current?.focus()
        }}><Icon name="close" /></button>}
      </label>}
      <div id={listboxId} className="ui-select__list" role="listbox" aria-multiselectable={multiple || undefined}>
        {filteredOptions.length === 0 && <div className="ui-select__empty" role="status">
          {query.trim() ? noResultsText : emptyText}
        </div>}
        {filteredOptions.map((option, index) => {
          const selected = valueSet.has(option.value)
          return <button
            key={option.value}
            id={`${listboxId}-option-${index}`}
            ref={(element) => { optionRefs.current[index] = element }}
            type="button"
            role="option"
            className={`ui-select__option ${selected ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''}`}
            aria-selected={selected}
            disabled={option.disabled}
            onClick={() => changeSelection(option)}
            onFocus={() => setActiveIndex(index)}
            onMouseMove={() => {
              if (!option.disabled && activeIndex !== index) setActiveIndex(index)
            }}
            onKeyDown={(event) => moveFocus(event, index)}
          >
            {option.icon && <Icon name={option.icon} className="ui-select__option-icon" />}
            <span className={`ui-select__option-content ${option.description ? 'has-description' : ''}`}>
              <span className="ui-select__option-label">{option.label}</span>
              {option.description && <small className="ui-select__option-description">{option.description}</small>}
            </span>
            <span className={`ui-select__option-trailing ${option.trailingText ? 'has-text' : ''}`}>
              {option.trailingText && <strong>{option.trailingText}</strong>}
              {showValue && <code>{option.secondaryText ?? option.value}</code>}
              {selected && <Icon name="check" />}
            </span>
          </button>
        })}
      </div>
      {clearable && values.length > 0 && <button className="ui-select__clear" type="button" onClick={clearSelection}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            setOpen(false)
            triggerRef.current?.focus()
          }
        }}>
        清空选择
      </button>}
    </div>, document.body)}
  </div>
}

export function filterSelectOptions(options: SelectOption[], query: string, includePinyin = true) {
  const normalizedQuery = normalizeSearchText(query)
  if (!normalizedQuery) return options
  return options.filter((option) => {
    const searchableValues = [option.label, option.value, option.secondaryText ?? '', option.description ?? '',
      option.trailingText ?? '', ...(option.searchKeywords ?? [])]
    if (includePinyin) searchableValues.push(pinyinInitials(option.label))
    return searchableValues.some((value) => normalizeSearchText(value).includes(normalizedQuery))
  })
}

interface PopoverPosition {
  top?: number
  bottom?: number
  left: number
  width: number
  maxHeight: number
  placement: 'top' | 'bottom'
}

function normalizeSearchText(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase().replace(/\s+/g, '')
}

function nextEnabledIndex(current: number, direction: 1 | -1, options: SelectOption[]) {
  let index = current + direction
  while (index >= 0 && index < options.length) {
    if (!options[index].disabled) return index
    index += direction
  }
  return -1
}
