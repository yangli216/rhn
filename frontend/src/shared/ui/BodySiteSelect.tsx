import { type ChangeEvent } from 'react'

export const DEFAULT_BODY_SITES = [
  '左前臂屈侧下段',
  '右前臂屈侧下段',
  '左前臂屈侧中段',
  '右前臂屈侧中段',
  '左前臂背侧',
  '右前臂背侧',
  '上臂三角肌下缘',
  '生理盐水对照侧',
]

export interface BodySiteSelectProps {
  id?: string
  className?: string
  value: string
  onChange: (value: string) => void
  presets?: string[]
  placeholder?: string
  disabled?: boolean
  readOnly?: boolean
  maxLength?: number
  clearable?: boolean
  showChips?: boolean
  'aria-label'?: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean | 'false' | 'true'
  'aria-required'?: boolean | 'false' | 'true'
}

export function BodySiteSelect({
  id,
  className = '',
  value = '',
  onChange,
  presets = DEFAULT_BODY_SITES,
  placeholder = '选择或输入部位',
  disabled = false,
  readOnly = false,
  maxLength = 128,
  clearable = true,
  showChips = true,
  'aria-label': ariaLabel,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
}: BodySiteSelectProps) {
  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value)
  }

  const handleSelectPreset = (site: string) => {
    if (disabled || readOnly) return
    onChange(site)
  }

  const handleClear = () => {
    if (disabled || readOnly) return
    onChange('')
  }

  return (
    <div
      className={`ui-body-site-select ${disabled ? 'is-disabled' : ''} ${readOnly ? 'is-readonly' : ''} ${className}`}
      data-testid="body-site-select"
    >
      <div className="ui-body-site-select__input-wrap">
        <input
          id={id}
          type="text"
          className="ui-body-site-select__input"
          value={value}
          placeholder={placeholder}
          maxLength={maxLength}
          disabled={disabled}
          readOnly={readOnly}
          aria-label={ariaLabel}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          aria-required={ariaRequired}
          onChange={handleInputChange}
        />

        {clearable && value && !disabled && !readOnly && (
          <button
            type="button"
            className="ui-body-site-select__clear"
            aria-label="清空部位"
            title="清空部位"
            onClick={handleClear}
          >
            ×
          </button>
        )}
      </div>

      {showChips && presets.length > 0 && (
        <div className="ui-body-site-select__chips" aria-label="快捷部位推荐">
          {presets.map((site) => {
            const isSelected = value === site
            return (
              <button
                type="button"
                key={site}
                className={`ui-body-site-select__chip ${isSelected ? 'is-selected' : ''}`}
                disabled={disabled || readOnly}
                onClick={() => handleSelectPreset(site)}
              >
                {site}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
