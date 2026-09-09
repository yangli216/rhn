import { forwardRef, useId, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'

export interface SwitchProps {
  /** 控件唯一标识 */
  id?: string
  /** 表单名称 */
  name?: string
  /** 受控选定状态 */
  checked?: boolean
  /** 默认非受控状态 */
  defaultChecked?: boolean
  /** 状态切换回调 */
  onChange?: (checked: boolean) => void
  /** 是否禁用 */
  disabled?: boolean
  /** 尺寸变体：md (默认 22px 高) 或 sm (紧凑 18px 高) */
  size?: 'sm' | 'md'
  /** 标签文本；未指定时自动回退为 checkedText / uncheckedText */
  label?: ReactNode
  /** 开启时展示的随动状态文本 */
  checkedText?: ReactNode
  /** 关闭时展示的随动状态文本 */
  uncheckedText?: ReactNode
  /** 气泡或原生 title 提示 */
  title?: string
  /** 自定义样式类名 */
  className?: string
  /** 读屏辅助无障碍标签 */
  'aria-label'?: string
  /** 无障碍关联说明 */
  'aria-describedby'?: string
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  {
    id,
    name,
    checked: controlledChecked,
    defaultChecked = false,
    onChange,
    disabled = false,
    size = 'md',
    label,
    checkedText,
    uncheckedText,
    title,
    className = '',
    'aria-label': ariaLabel,
    'aria-describedby': ariaDescribedBy,
  },
  ref,
) {
  const generatedId = useId()
  const switchId = id ?? generatedId
  const [internalChecked, setInternalChecked] = useState(defaultChecked)

  const isControlled = controlledChecked !== undefined
  const isChecked = isControlled ? controlledChecked : internalChecked

  function toggle() {
    if (disabled) return
    const next = !isChecked
    if (!isControlled) {
      setInternalChecked(next)
    }
    onChange?.(next)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      toggle()
    }
  }

  const stateText = isChecked ? checkedText : uncheckedText
  const displayLabel = label !== undefined ? label : stateText

  return (
    <label
      htmlFor={switchId}
      className={`ui-switch-wrapper ui-switch-wrapper--${size} ${disabled ? 'is-disabled' : ''} ${className}`}
      title={title}
    >
      <button
        ref={ref}
        type="button"
        role="switch"
        id={switchId}
        name={name}
        aria-checked={isChecked}
        aria-label={ariaLabel || (typeof displayLabel === 'string' ? displayLabel : undefined)}
        aria-describedby={ariaDescribedBy}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={`ui-switch ui-switch--${size} ${isChecked ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`}
      >
        <span className="ui-switch__track">
          <span className="ui-switch__thumb" />
        </span>
      </button>
      {displayLabel ? (
        <span className={`ui-switch__label ${isChecked ? 'is-checked' : ''}`}>
          {displayLabel}
        </span>
      ) : null}
    </label>
  )
})
