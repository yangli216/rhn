import rules from '../../docs/database/physical-column-abbreviations.json' with { type: 'json' }

export const columnNamingRules = rules

// Full-name exceptions are deliberately narrow: FOO_REVISION is not REVISION.
export function columnNamingIssues(name) {
  const issues = []
  if (!/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name) || name.length > rules.maxIdentifierLength) {
    issues.push(`${name}：物理字段须为大写字母/数字/下划线，不能有空词段，且不超过 ${rules.maxIdentifierLength} 字符`)
  }
  if (Object.hasOwn(rules.identifierExceptions, name)) return issues
  const longWords = name.split('_').filter(word => word.length > rules.maxTokenLength)
  if (longWords.length) {
    const unknown = longWords.filter(word => !rules.abbreviations[word])
    const suggested = name.split('_').map(word => rules.abbreviations[word] ?? word).join('_')
    issues.push(`${name}：词段 ${longWords.join('、')} 超过 ${rules.maxTokenLength} 字符；${unknown.length
      ? `请先登记 ${unknown.join('、')} 的统一缩写，禁止任意截断`
      : `按统一词典使用 ${suggested}`}`)
  }
  return issues
}
