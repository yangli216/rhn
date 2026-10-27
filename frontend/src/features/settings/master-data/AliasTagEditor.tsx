import { useState } from "react";
import { Button } from "../../../shared/ui";

const SEPARATORS = /[,，;；、]/

/** 药品与诊疗项目共用的别名编辑：标签 + 输入框，回车、逗号或失焦即加入，重复项自动合并。 */
export function parseAliases(text?: string | null) {
  return [...new Set((text ?? '').split(/[,，;；、\s]+/).map((value) => value.trim()).filter(Boolean))]
}

export function AliasTagEditor({ names, onChange, disabled, label = '新增别名', placeholder = '输入别名，回车添加' }: {
  names: string[]; onChange: (next: string[]) => void; disabled?: boolean; label?: string; placeholder?: string
}) {
  const [draft, setDraft] = useState('')
  const commit = (text = draft) => {
    const additions = text.split(SEPARATORS).map((value) => value.trim()).filter(Boolean)
    if (additions.length) onChange([...new Set([...names, ...additions])])
    setDraft('')
  }
  return <div className={`alias-tag-editor${disabled ? ' is-disabled' : ''}`}>
    {names.map((name) => <span className="alias-tag-editor__tag" key={name}>
      {name}
      <Button type="button" size="sm" variant="text" aria-label={`移除别名${name}`} disabled={disabled}
        onClick={() => onChange(names.filter((value) => value !== name))}>×</Button>
    </span>)}
    <input value={draft} disabled={disabled} aria-label={label} placeholder={names.length ? '' : placeholder}
      onChange={(event) => { const next = event.target.value; SEPARATORS.test(next) ? commit(next) : setDraft(next) }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit() }
        else if (event.key === 'Backspace' && !draft && names.length) onChange(names.slice(0, -1))
      }}
      onBlur={() => commit()} />
  </div>
}
