import { type ChangeEvent } from 'react'

export interface UnitOption {
  value: string
  label: string
}

export interface UnitNumberInputProps {
  id?: string
  className?: string
  value?: number | string
  unit?: string
  onValueChange?: (value: string) => void
  onUnitChange?: (unit: string) => void
  units?: (string | UnitOption)[]
  placeholder?: string
  min?: number | string
  max?: number | string
  step?: number | string
  disabled?: boolean
  readOnly?: boolean
  unitReadOnly?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true'
  'aria-required'?: boolean | 'false' | 'true'
}

export function UnitNumberInput({
  id,
  className = '',
  value = '',
  unit = '',
  onValueChange,
  onUnitChange,
  units,
  placeholder = '请输入数值',
  min,
  max,
  step,
  disabled = false,
  readOnly = false,
  unitReadOnly = false,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: UnitNumberInputProps) {
  const normalizedUnits: UnitOption[] = (units ?? []).map((u) => {
    if (typeof u === 'string') return { value: u, label: u }
    return u
  })

  const hasUnitOptions = normalizedUnits.length > 0

  const handleNumberChange = (e: ChangeEvent<HTMLInputElement>) => {
    onValueChange?.(e.target.value)
  }

  const handleUnitChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    onUnitChange?.(e.target.value)
  }

  return (
    <div
      className={`ui-unit-number-input ${disabled ? 'is-disabled' : ''} ${readOnly ? 'is-readonly' : ''} ${className}`}
      data-testid="unit-number-input"
    >
      <input
        id={id}
        type="number"
        className="ui-unit-number-input__number"
        value={value}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={ariaRequired}
        onChange={handleNumberChange}
      />

      <span className="ui-unit-number-input__divider" aria-hidden="true" />

      <div className="ui-unit-number-input__unit-wrap">
        {hasUnitOptions && !unitReadOnly ? (
          <select
            className="ui-unit-number-input__unit-select"
            value={unit}
            disabled={disabled || readOnly}
            aria-label="单位"
            onChange={handleUnitChange}
          >
            {normalizedUnits.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : unitReadOnly ? (
          <span className="ui-unit-number-input__unit-label" aria-label="单位">
            {unit}
          </span>
        ) : (
          <input
            type="text"
            className="ui-unit-number-input__unit-input"
            value={unit}
            disabled={disabled}
            readOnly={readOnly}
            placeholder="单位"
            aria-label="单位"
            maxLength={32}
            onChange={handleUnitChange}
          />
        )}
      </div>
    </div>
  )
}
