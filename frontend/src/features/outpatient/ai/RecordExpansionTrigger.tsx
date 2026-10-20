import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Button, Icon } from '../../../shared/ui'

const shortcutLabel = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘+Enter' : 'Ctrl+Enter'

/**
 * Inline shortcut under the chief complaint. Ctrl/⌘+Enter inside the chief complaint field runs the same action;
 * the slot sits directly after that field, so the shortcut never fires from other record sections.
 */
export function RecordExpansionTrigger({ surface, disabled, expanding, error, onExpand }: {
  surface: HTMLDivElement
  disabled: boolean
  expanding: boolean
  error?: string
  onExpand: () => void
}) {
  useEffect(() => {
    const field = surface.previousElementSibling
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey) || event.isComposing) return
      if (!field?.contains(event.target as Node)) return
      event.preventDefault()
      if (!disabled && !expanding) onExpand()
    }
    document.addEventListener('keydown', keydown)
    return () => document.removeEventListener('keydown', keydown)
  }, [surface, disabled, expanding, onExpand])

  return createPortal(
    <div className="doctor-record-expand" role="group" aria-label="主诉扩写病历">
      <Button size="sm" variant="soft" busy={expanding} disabled={disabled} onClick={onExpand}
        title={`按主诉补全现病史、既往史、过敏史、查体、健康宣教和随访复诊（${shortcutLabel}）；已填写的段落保持不变，橙色标记为需重点核实的 AI 推荐内容`}>
        <Icon name="sparkles" />
        <span>{expanding ? '正在扩写…' : <>AI扩写<kbd className="doctor-record-expand__key">({shortcutLabel})</kbd></>}</span>
      </Button>
      {error && <span className="doctor-record-expand__error" role="alert">{error}</span>}
    </div>,
    surface,
  )
}
