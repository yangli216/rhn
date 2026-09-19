import { createContext, useContext, useId, useState, type HTMLAttributes, type ReactNode,
  type TableHTMLAttributes, type TdHTMLAttributes } from 'react'

const EditableRowContext = createContext<string | undefined>(undefined)

/** Floating editors carry this scope so moving focus into a portal keeps its row in edit mode. */
export const useEditableRowScope = () => useContext(EditableRowContext)

export function EditableTable({ className = '', onKeyDown, onAppendRow, ...props }:
  TableHTMLAttributes<HTMLTableElement> & { onAppendRow?: () => void }) {
  return <table {...props} className={`ui-data-table ui-editable-table ${className}`} onKeyDown={(event) => {
    onKeyDown?.(event)
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.key !== 'Enter'
      || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
    // Select/calendar portals own their keyboard interaction; only advance actual table fields.
    const target = event.target as HTMLElement
    if (!event.currentTarget.contains(target) || target.tagName === 'TEXTAREA'
      || target.getAttribute('role') === 'combobox' && target.getAttribute('aria-expanded') === 'true') return
    const fields = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      '[data-editable-cell] input:not([type="hidden"]):not([readonly]):not(:disabled), [data-editable-cell] button[role="combobox"]:not(:disabled)',
    ))
    const index = fields.indexOf(target)
    if (index < 0) return
    event.preventDefault()
    if (fields[index + 1]) fields[index + 1].focus()
    else onAppendRow?.()
  }} />
}

export function EditableRow({ className = '', onFocusCapture, onBlurCapture, ...props }:
  HTMLAttributes<HTMLTableRowElement>) {
  const scope = useId()
  const [editing, setEditing] = useState(false)
  return <EditableRowContext.Provider value={scope}>
    <tr {...props} data-editable-row={scope} data-mode={editing ? 'edit' : 'read'}
      className={`ui-editable-row ${editing ? 'is-editing' : ''} ${className}`}
      onFocusCapture={(event) => { setEditing(true); onFocusCapture?.(event) }}
      onBlurCapture={(event) => {
        const next = event.relatedTarget
        if (!(next instanceof Element) || next.closest('[data-editable-row]')?.getAttribute('data-editable-row') !== scope) {
          setEditing(false)
        }
        onBlurCapture?.(event)
      }} />
  </EditableRowContext.Provider>
}

export function EditableCell({ display, placeholder = '—', children, className = '', ...props }:
  TdHTMLAttributes<HTMLTableCellElement> & { display?: ReactNode; placeholder?: string }) {
  const empty = display === undefined || display === null || display === ''
  return <td {...props} className={`ui-editable-cell ${className}`} data-editable-cell>
    <div className="ui-editable-cell__field">
      <div className={`ui-editable-cell__read ${empty ? 'is-empty' : ''}`} aria-hidden="true">
        {empty ? placeholder : display}
      </div>
      {/* Keep controls mounted and focusable: mouse, Tab and external refs all enter edit mode directly. */}
      <div className="ui-editable-cell__editor">{children}</div>
    </div>
  </td>
}
