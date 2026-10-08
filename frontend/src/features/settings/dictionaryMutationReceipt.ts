import type { DictionaryAttributeDataType, DictionaryAttributeDefinition, DictionaryAttributeValueSet } from '../../shared/rhnApi'
import { isIsoInstant } from '../../shared/validation/instant'

export function dictionaryCommandKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(dictionaryCommandKey).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${dictionaryCommandKey(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'undefined'
}

function serverTrim(value: string) {
  // DictionaryAttributeService uses Java String.trim(), which only removes U+0000–U+0020.
  return value.replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
}

function scalarIdentity(type: DictionaryAttributeDataType, value: string): string {
  const text = serverTrim(value)
  if (type === 'INTEGER' || type === 'DICT_REF') {
    if (!/^[+-]?\d+$/.test(text)) throw new Error('Invalid integer')
    return BigInt(text).toString()
  }
  if (type === 'DECIMAL') {
    const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/.exec(text)
    if (!match || !(match[2] || match[3])) throw new Error('Invalid decimal')
    const digits = `${match[2]}${match[3] ?? ''}`.replace(/^0+/, '')
    if (!digits) return '0'
    const significant = digits.replace(/0+$/, '')
    const exponent = BigInt(match[4] ?? '0') - BigInt((match[3] ?? '').length) + BigInt(digits.length - significant.length)
    return `${match[1] === '-' ? '-' : ''}${significant}e${exponent}`
  }
  if (type === 'DATETIME') {
    if (!isIsoInstant(text)) throw new Error('Invalid instant')
    const match = /^(.*T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(text)!
    const seconds = BigInt(Date.parse(`${match[1]}${match[3]}`)) * 1_000_000n
    return (seconds + BigInt((match[2] ?? '').padEnd(9, '0'))).toString()
  }
  if (type === 'BOOLEAN') {
    if (!['true', 'false'].includes(text.toLowerCase())) throw new Error('Invalid boolean')
    return text.toLowerCase()
  }
  return text
}

export function requireSavedAttributeValues(definition: DictionaryAttributeDefinition,
  saved: DictionaryAttributeValueSet | undefined, scopeCode: string, mode: 'OVERRIDE' | 'EXPLICIT_EMPTY', values: string[]) {
  let confirmed = Boolean(saved && saved.scopeCode === scopeCode && saved.valueMode === mode)
  if (confirmed && saved) {
    if (mode === 'EXPLICIT_EMPTY') confirmed = saved.values.length === 0
    else {
      // Match the server's trim/dedup policy without converting decimal or integer values to JS numbers.
      const expected = [...new Set(values.map(serverTrim).filter(Boolean))]
      try {
        const actual = saved.values.map((member) => definition.dataType === 'DICT_REF' ? member.referenceItemId! : member.value!)
        confirmed = expected.length === actual.length && expected.every((value, index) => value === actual[index]
          || scalarIdentity(definition.dataType, value) === scalarIdentity(definition.dataType, actual[index]))
      } catch { confirmed = false }
    }
  }
  if (!confirmed) throw new Error('服务端返回的属性值与提交内容不一致，保存未确认')
}
