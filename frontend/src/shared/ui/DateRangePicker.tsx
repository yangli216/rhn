import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent } from 'react'
import {
  DEFAULT_QUERY_PRESETS,
  findMatchingPreset,
  type DateRange,
  type PresetKey,
  type PresetOption,
} from '../utils/dateRange'
import { Icon } from './index'

export interface DateRangePickerProps {
  value: DateRange
  onChange: (range: DateRange, presetKey?: PresetKey) => void
  presets?: PresetOption[]
  showPresets?: boolean
  min?: string
  max?: string
  compact?: boolean
  className?: string
  disabled?: boolean
  startAriaLabel?: string
  endAriaLabel?: string
  id?: string
  placeholder?: [string, string]
}

export function DateRangePicker({
  value,
  onChange,
  presets = DEFAULT_QUERY_PRESETS,
  showPresets = true,
  min,
  max,
  compact = false,
  className = '',
  disabled = false,
  startAriaLabel = '开始日期',
  endAriaLabel = '结束日期',
  id,
  placeholder = ['开始日期', '结束日期'],
}: DateRangePickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const defaultId = useId()
  const componentId = id ?? defaultId

  const activePreset = useMemo(
    () => findMatchingPreset(value, presets),
    [value, presets],
  )

  const activePresetLabel = useMemo(() => {
    if (!activePreset) return '快捷范围'
    const found = presets.find((p) => p.key === activePreset)
    return found ? found.label : '快捷范围'
  }, [activePreset, presets])

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  const handlePresetSelect = (preset: PresetOption) => {
    if (disabled) return
    const range = preset.getRange()
    onChange(range, preset.key)
    setMenuOpen(false)
  }

  const handleStartChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFrom = event.target.value
    let nextTo = value.to
    if (nextFrom && nextTo && nextFrom > nextTo) {
      nextTo = nextFrom
    }
    const nextRange = { from: nextFrom, to: nextTo }
    onChange(nextRange, findMatchingPreset(nextRange, presets) ?? undefined)
  }

  const handleEndChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextTo = event.target.value
    let nextFrom = value.from
    if (nextFrom && nextTo && nextTo < nextFrom) {
      nextFrom = nextTo
    }
    const nextRange = { from: nextFrom, to: nextTo }
    onChange(nextRange, findMatchingPreset(nextRange, presets) ?? undefined)
  }

  const handleClear = (event: React.MouseEvent) => {
    event.stopPropagation()
    if (disabled) return
    onChange({ from: '', to: '' }, undefined)
  }

  const hasValue = Boolean(value.from || value.to)

  return (
    <div
      ref={containerRef}
      id={componentId}
      className={`ui-date-range-picker ${compact ? 'ui-date-range-picker--compact' : ''} ${menuOpen ? 'is-open' : ''} ${className}`}
      data-testid="date-range-picker"
    >
      {showPresets && presets.length > 0 && (
        <div className="ui-date-range-preset-dropdown">
          <button
            type="button"
            className={`ui-date-range-preset-trigger ${activePreset ? 'has-active' : ''}`}
            onClick={() => !disabled && setMenuOpen((prev) => !prev)}
            disabled={disabled}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            title="点击切换快捷日期范围"
          >
            <span className="ui-date-range-preset-trigger__label">{activePresetLabel}</span>
            <Icon name="chevron-down" className="ui-date-range-preset-trigger__arrow" />
          </button>

          {menuOpen && (
            <div className="ui-date-range-menu-popover" role="listbox" aria-label="快捷日期选项">
              <div className="ui-date-range-menu-popover__title">快捷时间范围</div>
              {presets.map((preset) => {
                const isActive = activePreset === preset.key
                return (
                  <button
                    key={preset.key}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    className={`ui-date-range-menu-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => handlePresetSelect(preset)}
                  >
                    <span>{preset.label}</span>
                    {isActive && <Icon name="check" className="ui-date-range-menu-item__check" />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="ui-date-range-inputs">
        <span className="ui-date-range-icon" aria-hidden="true">
          <Icon name="calendar" />
        </span>
        <input
          type="date"
          className="ui-date-range-input ui-date-range-input--start"
          aria-label={startAriaLabel}
          placeholder={placeholder[0]}
          value={value.from}
          onChange={handleStartChange}
          min={min}
          max={value.to || max}
          disabled={disabled}
        />
        <span className="ui-date-range-separator" aria-hidden="true">
          至
        </span>
        <input
          type="date"
          className="ui-date-range-input ui-date-range-input--end"
          aria-label={endAriaLabel}
          placeholder={placeholder[1]}
          value={value.to}
          onChange={handleEndChange}
          min={value.from || min}
          max={max}
          disabled={disabled}
        />
        {hasValue && !disabled && (
          <button
            type="button"
            className="ui-date-range-clear-btn"
            onClick={handleClear}
            aria-label="清空日期"
            title="清空日期"
          >
            <Icon name="close" />
          </button>
        )}
      </div>
    </div>
  )
}
