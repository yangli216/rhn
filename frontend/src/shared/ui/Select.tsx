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
  parentValue?: string
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
  leafOnly?: boolean
  popoverMinWidth?: number
  openOnFocus?: boolean
  onSelectionCommit?: (option?: SelectOption) => void
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
    leafOnly = false,
    openOnFocus = false,
    onSelectionCommit,
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
  const pointerInteractingRef = useRef(false)
  const justClosedRef = useRef(false)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [expandedValues, setExpandedValues] = useState<Set<string>>(() => new Set())
  const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>()
  const positioned = Boolean(popoverPosition)
  const multiple = props.multiple === true
  const values = multiple
    ? (props.value ?? [])
    : props.value !== undefined && props.value !== null
      ? (props.value === '' ? (options.some((option) => option.value === '') ? [''] : []) : [props.value])
      : []
  const valueSet = useMemo(() => new Set(values), [values])
  const selectedOptions = options.filter((option) => valueSet.has(option.value))
  const hierarchical = options.some((option) => option.parentValue)
  const parentValueSet = useMemo(() => {
    const set = new Set<string>()
    for (const option of options) {
      if (option.parentValue) set.add(option.parentValue)
    }
    return set
  }, [options])
  const treeEntries = useMemo(() => buildSelectTree(options, query, pinyinSearch, expandedValues),
    [expandedValues, options, pinyinSearch, query])
  const visibleOptions = treeEntries.map((entry) => entry.option)
  const unavailable = disabled || loading

  useEffect(() => {
    if (!open || !positioned) return
    const selectedIndex = query.trim()
      ? -1
      : visibleOptions.findIndex((option) => values.includes(option.value) && !option.disabled)
    const firstEnabledIndex = nextEnabledIndex(-1, 1, visibleOptions)
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : firstEnabledIndex)
  }, [open, positioned, query, values.join('\u0000'), visibleOptions.map((option) => option.value).join('\u0000')])

  useEffect(() => {
    if (!open || !hierarchical || !values.length) return
    const byValue = new Map(options.map((option) => [option.value, option]))
    setExpandedValues((current) => {
      const next = new Set(current)
      let changed = false
      for (const value of values) {
        let parentValue = byValue.get(value)?.parentValue
        while (parentValue && byValue.has(parentValue)) {
          if (!next.has(parentValue)) { next.add(parentValue); changed = true }
          parentValue = byValue.get(parentValue)?.parentValue
        }
      }
      return changed ? next : current
    })
  }, [hierarchical, open, options, values.join('\u0000')])

  useEffect(() => {
    if (!open) return
    function closeFromOutside(event: PointerEvent) {
      const target = event.target as Node
      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        justClosedRef.current = true
        setOpen(false)
        window.setTimeout(() => {
          justClosedRef.current = false
        }, 150)
      }
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
    const selectedIndex = visibleOptions.findIndex((option) => valueSet.has(option.value) && !option.disabled)
    const firstEnabledIndex = visibleOptions.findIndex((option) => !option.disabled)
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
    if (leafOnly && hierarchical && parentValueSet.has(option.value)) {
      setExpandedValues((current) => {
        const next = new Set(current)
        if (next.has(option.value)) next.delete(option.value)
        else next.add(option.value)
        return next
      })
      return
    }
    if (multiple) {
      const nextValues = valueSet.has(option.value)
        ? values.filter((value) => value !== option.value)
        : [...values, option.value]
      const nextSet = new Set(nextValues)
      props.onChange?.(nextValues, options.filter((item) => nextSet.has(item.value)))
      return
    }
    props.onChange?.(option.value, option)
    justClosedRef.current = true
    setOpen(false)
    window.setTimeout(() => {
      justClosedRef.current = false
    }, 150)

    if (onSelectionCommit) {
      onSelectionCommit(option)
    } else {
      window.requestAnimationFrame(() => {
        if (document.activeElement === searchRef.current) {
          triggerRef.current?.focus()
        }
      })
    }
  }

  function clearSelection() {
    if (multiple) props.onChange?.([], [])
    else props.onChange?.('')
    justClosedRef.current = true
    setOpen(false)
    window.setTimeout(() => {
      justClosedRef.current = false
    }, 150)
    triggerRef.current?.focus()
  }

  function moveFocus(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target = index
    const entry = treeEntries[index]
    if (hierarchical && event.key === 'ArrowRight' && entry?.hasChildren) {
      event.preventDefault()
      setExpandedValues((current) => new Set(current).add(entry.option.value))
      return
    } else if (hierarchical && event.key === 'ArrowLeft' && entry) {
      event.preventDefault()
      if (expandedValues.has(entry.option.value)) {
        setExpandedValues((current) => {
          const next = new Set(current); next.delete(entry.option.value); return next
        })
      } else if (entry.option.parentValue) {
        const parentIndex = visibleOptions.findIndex((option) => option.value === entry.option.parentValue)
        if (parentIndex >= 0) { setActiveIndex(parentIndex); optionRefs.current[parentIndex]?.focus() }
      }
      return
    } else if (event.key === 'ArrowDown') target = nextEnabledIndex(index, 1, visibleOptions)
    else if (event.key === 'ArrowUp') target = nextEnabledIndex(index, -1, visibleOptions)
    else if (event.key === 'Home') target = nextEnabledIndex(-1, 1, visibleOptions)
    else if (event.key === 'End') target = nextEnabledIndex(visibleOptions.length, -1, visibleOptions)
    else if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      justClosedRef.current = true
      setOpen(false)
      window.setTimeout(() => {
        justClosedRef.current = false
      }, 150)
      triggerRef.current?.focus()
      return
    } else return
    event.preventDefault()
    if (target >= 0) {
      setActiveIndex(target)
      optionRefs.current[target]?.focus()
    }
  }

  function handleTriggerFocus(event: React.FocusEvent<HTMLButtonElement>) {
    if (!openOnFocus || unavailable || open) return
    if (pointerInteractingRef.current || justClosedRef.current) return

    const relatedTarget = event.relatedTarget as Node | null
    const fromInside = Boolean(
      (relatedTarget && rootRef.current?.contains(relatedTarget)) ||
      (relatedTarget && popoverRef.current?.contains(relatedTarget))
    )
    if (!fromInside) {
      setOpen(true)
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
      aria-haspopup={hierarchical ? 'tree' : 'listbox'}
      aria-invalid={ariaInvalid}
      aria-required={ariaRequired}
      disabled={unavailable}
      onPointerDown={() => {
        pointerInteractingRef.current = true
      }}
      onPointerUp={() => {
        window.requestAnimationFrame(() => {
          pointerInteractingRef.current = false
        })
      }}
      onFocus={handleTriggerFocus}
      onClick={() => {
        pointerInteractingRef.current = false
        setOpen((current) => !current)
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          setOpen(true)
        } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          if (onSelectionCommit && selectedOptions.length > 0) {
            event.preventDefault()
            onSelectionCommit(selectedOptions[0])
          }
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
                : direction === 1 ? -1 : visibleOptions.length
              const nextIndex = nextEnabledIndex(startIndex, direction, visibleOptions)
              if (nextIndex >= 0) setActiveIndex(nextIndex)
            } else if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              const activeOption = visibleOptions[activeIndex]
              if (activeOption && !activeOption.disabled) {
                event.preventDefault()
                changeSelection(activeOption)
              }
            } else if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              justClosedRef.current = true
              setOpen(false)
              window.setTimeout(() => {
                justClosedRef.current = false
              }, 150)
              triggerRef.current?.focus()
            }
          }}
        />
        {query && <button type="button" aria-label="清除检索内容" onClick={() => {
          setQuery('')
          searchRef.current?.focus()
        }}><Icon name="close" /></button>}
      </label>}
      <div id={listboxId} className={`ui-select__list ${hierarchical ? 'is-tree' : ''}`}
        role={hierarchical ? 'tree' : 'listbox'} aria-multiselectable={multiple || undefined}>
        {visibleOptions.length === 0 && <div className="ui-select__empty" role="status">
          {query.trim() ? noResultsText : emptyText}
        </div>}
        {treeEntries.map(({ option, depth, hasChildren }, index) => {
          const isLeafOnlyParent = Boolean(leafOnly && hierarchical && hasChildren)
          const selected = !isLeafOnlyParent && valueSet.has(option.value)
          const optionButton = <button
            key={option.value}
            id={`${listboxId}-option-${index}`}
            ref={(element) => { optionRefs.current[index] = element }}
            type="button"
            role={hierarchical ? 'treeitem' : 'option'}
            className={`ui-select__option ${selected ? 'is-selected' : ''} ${index === activeIndex ? 'is-active' : ''} ${isLeafOnlyParent ? 'is-leaf-only-parent' : ''}`}
            aria-selected={isLeafOnlyParent ? undefined : selected}
            aria-level={hierarchical ? depth + 1 : undefined}
            aria-expanded={hierarchical && hasChildren ? expandedValues.has(option.value) : undefined}
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
          if (!hierarchical) return optionButton
          return <div key={option.value} role="none" className="ui-select__tree-row"
            style={{ '--select-tree-depth': depth } as React.CSSProperties}>
            {hasChildren && <button type="button" className="ui-select__tree-toggle"
              aria-label={`${expandedValues.has(option.value) ? '收起' : '展开'} ${option.label}`}
              onClick={() => setExpandedValues((current) => {
                const next = new Set(current)
                if (next.has(option.value)) next.delete(option.value); else next.add(option.value)
                return next
              })}>
              <Icon name={expandedValues.has(option.value) ? 'chevron-down' : 'chevron-right'} />
            </button>}
            {optionButton}
          </div>
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

interface SelectTreeEntry {
  option: SelectOption
  depth: number
  hasChildren: boolean
}

function buildSelectTree(options: SelectOption[], query: string, includePinyin: boolean,
                         expandedValues: Set<string>): SelectTreeEntry[] {
  if (!options.some((option) => option.parentValue)) {
    return filterSelectOptions(options, query, includePinyin)
      .map((option) => ({ option, depth: 0, hasChildren: false }))
  }
  const byValue = new Map(options.map((option) => [option.value, option]))
  const children = new Map<string, SelectOption[]>()
  const roots: SelectOption[] = []
  for (const option of options) {
    if (option.parentValue && byValue.has(option.parentValue)) {
      children.set(option.parentValue, [...(children.get(option.parentValue) ?? []), option])
    } else roots.push(option)
  }
  const normalizedQuery = query.trim()
  const included = new Set<string>()
  if (normalizedQuery) {
    for (const option of filterSelectOptions(options, query, includePinyin)) {
      let current: SelectOption | undefined = option
      while (current && !included.has(current.value)) {
        included.add(current.value)
        current = current.parentValue ? byValue.get(current.parentValue) : undefined
      }
    }
  }
  const result: SelectTreeEntry[] = []
  const visited = new Set<string>()
  const visit = (option: SelectOption, depth: number) => {
    if (visited.has(option.value)) return
    visited.add(option.value)
    const childOptions = children.get(option.value) ?? []
    if (!normalizedQuery || included.has(option.value)) {
      result.push({ option, depth, hasChildren: childOptions.length > 0 })
    }
    if (normalizedQuery || expandedValues.has(option.value)) {
      for (const child of childOptions) visit(child, depth + 1)
    }
  }
  for (const root of roots) visit(root, 0)
  return result
}
