import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type InputHTMLAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { useEditableRowScope } from './EditableTable'

export interface DatePickerProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value?: string // YYYY-MM-DD
  onChange?: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  clearable?: boolean
  showShortcuts?: boolean // 是否显示药库常用效期快捷选项（+1年, +2年, +3年, +5年）
  className?: string
  id?: string
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true'
  'aria-required'?: boolean | 'false' | 'true'
}

function isValidDate(y: number, m: number, d: number): boolean {
  if (y < 1900 || y > 2150 || m < 1 || m > 12 || d < 1 || d > 31) return false
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

export function parseFlexibleDate(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // 1. 匹配连续 8 位纯数字，例如 20260408
  if (/^\d{8}$/.test(trimmed)) {
    const y = Number(trimmed.slice(0, 4))
    const m = Number(trimmed.slice(4, 6))
    const d = Number(trimmed.slice(6, 8))
    if (isValidDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  // 2. 匹配分隔符格式，例如 2026-04-08、2026/4/8、2026.04.08
  const match = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(trimmed)
  if (match) {
    const y = Number(match[1])
    const m = Number(match[2])
    const d = Number(match[3])
    if (isValidDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    }
  }

  return null
}

function formatDateString(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addYears(base: Date, years: number): Date {
  const next = new Date(base)
  next.setFullYear(next.getFullYear() + years)
  return next
}

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export const DatePicker = forwardRef<HTMLInputElement, DatePickerProps>(function DatePicker(
  {
    value = '',
    onChange,
    min,
    max,
    placeholder = 'YYYY-MM-DD 或 20260408',
    disabled = false,
    readOnly = false,
    clearable = true,
    showShortcuts = true,
    className = '',
    id,
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
    'aria-invalid': ariaInvalid,
    'aria-required': ariaRequired,
    onKeyDown,
    onBlur,
    onFocus,
    ...restProps
  },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const popoverId = useId()
  const editableRowScope = useEditableRowScope()
  const [popoverPosition, setPopoverPosition] = useState<CSSProperties>()
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement)

  const [isOpen, setIsOpen] = useState(false)
  const [inputText, setInputText] = useState(value || '')

  // 视图年月（用于日历弹窗）
  const initialDate = useMemo(() => {
    if (value) {
      const parsed = parseFlexibleDate(value)
      if (parsed) {
        const [y, m, d] = parsed.split('-').map(Number)
        return new Date(y, m - 1, d)
      }
    }
    return new Date()
  }, [value])

  const [viewYear, setViewYear] = useState(initialDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth()) // 0-11

  // 外部 value 变化时同步到 input 文本
  useEffect(() => {
    setInputText(value || '')
    if (value) {
      const parsed = parseFlexibleDate(value)
      if (parsed) {
        const [y, m] = parsed.split('-').map(Number)
        setViewYear(y)
        setViewMonth(m - 1)
      }
    }
  }, [value])

  const containsTarget = (target: EventTarget | null) => target instanceof Node
    && Boolean(containerRef.current?.contains(target) || popoverRef.current?.contains(target))

  // Portal avoids clipping by scrolling tables and dialogs, and follows its field on scroll.
  useLayoutEffect(() => {
    if (!isOpen) { setPopoverPosition(undefined); return }
    const updatePosition = () => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const margin = 12, gap = 4
      const below = window.innerHeight - rect.bottom - margin - gap
      const above = rect.top - margin - gap
      const height = popoverRef.current?.scrollHeight || 360
      const openAbove = below < height && above > below
      const width = Math.min(320, window.innerWidth - margin * 2)
      setPopoverPosition({
        width,
        left: Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin)),
        top: openAbove ? undefined : Math.max(margin, rect.bottom + gap),
        bottom: openAbove ? Math.max(margin, window.innerHeight - rect.top + gap) : undefined,
        maxHeight: Math.max(0, openAbove ? above : below),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen])

  // Clicking or tabbing outside the field and its calendar ends editing.
  useEffect(() => {
    if (!isOpen) return
    const handleOutside = (e: Event) => {
      if (!containsTarget(e.target)) setIsOpen(false)
    }
    document.addEventListener('pointerdown', handleOutside)
    document.addEventListener('focusin', handleOutside)
    return () => {
      document.removeEventListener('pointerdown', handleOutside)
      document.removeEventListener('focusin', handleOutside)
    }
  }, [isOpen])

  useEffect(() => { if (disabled || readOnly) setIsOpen(false) }, [disabled, readOnly])

  const withinRange = (date: string) => (!min || date >= min) && (!max || date <= max)

  // 输入变化逻辑：支持直接输入 20260408 或 2026-04-08
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value
    setInputText(raw)

    if (!raw.trim()) {
      onChange?.('')
      return
    }

    // 快速检测：如果是 8 位纯数字或合法格式，立即自动格式化并回调
    const formatted = parseFlexibleDate(raw)
    if (formatted && withinRange(formatted)) {
      setInputText(formatted)
      onChange?.(formatted)
    }
  }

  // 失焦逻辑：如果输入了合法但未规范的日期，进行格式化
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (inputText.trim()) {
      const formatted = parseFlexibleDate(inputText)
      if (formatted && withinRange(formatted)) {
        setInputText(formatted)
        onChange?.(formatted)
      } else {
        // 如果输入无法识别，重置回上一次外部有效值
        setInputText(value || '')
      }
    } else {
      onChange?.('')
    }
    if (!containsTarget(e.relatedTarget)) setIsOpen(false)
    onBlur?.(e)
  }

  // 键盘事件：Enter 键跳格兼容与确认
  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (inputText.trim()) {
        const formatted = parseFlexibleDate(inputText)
        if (formatted && withinRange(formatted)) {
          setInputText(formatted)
          onChange?.(formatted)
        }
      }
      setIsOpen(false)
    } else if (e.key === 'Escape') {
      if (isOpen) { e.preventDefault(); e.stopPropagation() }
      setIsOpen(false)
    } else if (e.key === 'ArrowDown') {
      if (disabled || readOnly) return
      e.preventDefault()
      setIsOpen(true)
      const selectedDay = popoverRef.current?.querySelector<HTMLButtonElement>('.ui-date-picker__day.is-selected:not(:disabled)')
      const firstDay = popoverRef.current?.querySelector<HTMLButtonElement>('.ui-date-picker__day:not(:disabled)')
      ;(selectedDay ?? firstDay)?.focus()
    }
    onKeyDown?.(e)
  }

  // 选择具体某天
  const selectDate = (dateStr: string) => {
    if (disabled || readOnly || !withinRange(dateStr)) return
    setInputText(dateStr)
    onChange?.(dateStr)
    inputRef.current?.focus()
    setIsOpen(false)
  }

  // 清除日期
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (disabled || readOnly) return
    setInputText('')
    onChange?.('')
  }

  // 年月切换
  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1)
      setViewMonth(11)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1)
      setViewMonth(0)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const prevYear = () => setViewYear((y) => y - 1)
  const nextYear = () => setViewYear((y) => y + 1)

  // 快捷效期预设
  const shortcuts = useMemo(() => {
    const today = new Date()
    return [
      { label: '今天', getDate: () => formatDateString(today) },
      { label: '+1年', getDate: () => formatDateString(addYears(today, 1)) },
      { label: '+2年', getDate: () => formatDateString(addYears(today, 2)) },
      { label: '+3年', getDate: () => formatDateString(addYears(today, 3)) },
      { label: '+5年', getDate: () => formatDateString(addYears(today, 5)) },
    ]
  }, [])

  // 日历网格生成（42格，包含当月及前后填充）
  const calendarDays = useMemo(() => {
    const firstDayOfMonth = new Date(viewYear, viewMonth, 1)
    const dayOfWeek = firstDayOfMonth.getDay() // 0 = 周日, 1 = 周一, ...
    const leadDays = dayOfWeek === 0 ? 6 : dayOfWeek - 1 // 周一开始

    const startDate = new Date(viewYear, viewMonth, 1 - leadDays)
    const days: Array<{
      dateStr: string
      dayNum: number
      isCurrentMonth: boolean
      isSelected: boolean
      isToday: boolean
      isDisabled: boolean
    }> = []

    const todayStr = formatDateString(new Date())

    for (let i = 0; i < 42; i++) {
      const current = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i)
      const dateStr = formatDateString(current)
      const isCurrentMonth = current.getMonth() === viewMonth
      const isSelected = dateStr === value
      const isToday = dateStr === todayStr
      let isDisabled = false
      if (min && dateStr < min) isDisabled = true
      if (max && dateStr > max) isDisabled = true

      days.push({
        dateStr,
        dayNum: current.getDate(),
        isCurrentMonth,
        isSelected,
        isToday,
        isDisabled,
      })
    }
    return days
  }, [viewYear, viewMonth, value, min, max])

  return (
    <div
      ref={containerRef}
      className={`ui-date-picker ${disabled ? 'is-disabled' : ''} ${readOnly ? 'is-readonly' : ''} ${isOpen ? 'is-open' : ''} ${className}`}
      data-testid="date-picker-wrapper"
      onBlur={(event) => { if (!containsTarget(event.relatedTarget)) setIsOpen(false) }}
    >
      <div className="ui-date-picker__control">
        <input
          {...restProps}
          ref={inputRef}
          id={id}
          type="text"
          className="ui-date-picker__input"
          value={inputText}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={readOnly}
          maxLength={10}
          autoComplete="off"
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          aria-expanded={isOpen}
          aria-controls={isOpen ? popoverId : undefined}
          aria-haspopup="dialog"
          onFocus={(event) => {
            if (!disabled && !readOnly) setIsOpen(true)
            onFocus?.(event)
          }}
          onClick={() => { if (!disabled && !readOnly) setIsOpen(true) }}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          onKeyDown={handleInputKeyDown}
        />

        {clearable && Boolean(inputText) && !disabled && !readOnly && (
          <button
            type="button"
            className="ui-date-picker__clear-btn"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleClear}
            aria-label="清空日期"
            title="清空日期"
            tabIndex={-1}
          >
            <Icon name="close" />
          </button>
        )}

        <button
          type="button"
          className="ui-date-picker__trigger-btn"
          disabled={disabled || readOnly}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            if (isOpen) setIsOpen(false)
            else { inputRef.current?.focus(); setIsOpen(true) }
          }}
          aria-label={ariaLabel ? `打开${ariaLabel}日历` : '打开日历'}
          title="选择日期"
          tabIndex={-1}
        >
          <Icon name="calendar" />
        </button>
      </div>

      {isOpen && createPortal(
        <div ref={popoverRef} id={popoverId} data-editable-row={editableRowScope}
          className="ui-date-picker__popover" style={{ ...popoverPosition, visibility: popoverPosition ? 'visible' : 'hidden' }}
          role="dialog" aria-modal="false" aria-label="日历选择"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault(); event.stopPropagation()
              inputRef.current?.focus(); setIsOpen(false)
            } else if (event.key === 'Tab') {
              inputRef.current?.focus(); setIsOpen(false)
            }
          }}>
          {showShortcuts && (
            <div className="ui-date-picker__shortcuts" role="toolbar" aria-label="效期快速预设">
              <span className="ui-date-picker__shortcuts-label">效期快捷:</span>
              <div className="ui-date-picker__shortcuts-group">
                {shortcuts.map((sc) => (
                  <button
                    key={sc.label}
                    type="button"
                    className="ui-date-picker__shortcut-btn"
                    disabled={!withinRange(sc.getDate())}
                    onClick={() => selectDate(sc.getDate())}
                  >
                    {sc.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="ui-date-picker__header">
            <div className="ui-date-picker__nav-group">
              <button
                type="button"
                className="ui-date-picker__nav-btn"
                onClick={prevYear}
                title="上一年"
                aria-label="上一年"
              >
                «
              </button>
              <button
                type="button"
                className="ui-date-picker__nav-btn"
                onClick={prevMonth}
                title="上一月"
                aria-label="上一月"
              >
                ‹
              </button>
            </div>

            <span className="ui-date-picker__title">
              <strong>{viewYear}</strong> 年 <strong>{viewMonth + 1}</strong> 月
            </span>

            <div className="ui-date-picker__nav-group">
              <button
                type="button"
                className="ui-date-picker__nav-btn"
                onClick={nextMonth}
                title="下一月"
                aria-label="下一月"
              >
                ›
              </button>
              <button
                type="button"
                className="ui-date-picker__nav-btn"
                onClick={nextYear}
                title="下一年"
                aria-label="下一年"
              >
                »
              </button>
            </div>
          </div>

          <div className="ui-date-picker__grid">
            <div className="ui-date-picker__weekdays">
              {WEEKDAYS.map((wd) => (
                <span key={wd} className="ui-date-picker__weekday">
                  {wd}
                </span>
              ))}
            </div>

            <div className="ui-date-picker__days">
              {calendarDays.map((day) => {
                let cellClass = 'ui-date-picker__day'
                if (!day.isCurrentMonth) cellClass += ' is-muted'
                if (day.isSelected) cellClass += ' is-selected'
                if (day.isToday) cellClass += ' is-today'
                if (day.isDisabled) cellClass += ' is-disabled'

                return (
                  <button
                    key={day.dateStr}
                    type="button"
                    className={cellClass}
                    disabled={day.isDisabled}
                    onClick={() => selectDate(day.dateStr)}
                    title={day.dateStr}
                    aria-label={day.dateStr}
                  >
                    <span>{day.dayNum}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {(!showShortcuts || clearable && Boolean(inputText)) && <div className="ui-date-picker__footer">
            {!showShortcuts && <button
              type="button"
              className="ui-date-picker__footer-btn"
              onClick={() => selectDate(formatDateString(new Date()))}
              disabled={!withinRange(formatDateString(new Date()))}
            >
              今天
            </button>}
            {clearable && inputText && (
              <button
                type="button"
                className="ui-date-picker__footer-btn ui-date-picker__footer-btn--clear"
                onClick={(e) => {
                  handleClear(e)
                  inputRef.current?.focus()
                  setIsOpen(false)
                }}
              >
                清除
              </button>
            )}
          </div>}
        </div>
      , document.body)}
    </div>
  )
})
