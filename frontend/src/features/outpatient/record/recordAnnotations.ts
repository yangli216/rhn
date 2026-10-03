import { recordTextFields, type RecordAnnotation, type RecordText, type RecordTextField } from '../../../shared/api/recordAnnotations'

export function anchorAnnotations(content: RecordText, values: readonly RecordAnnotation[] = []): RecordAnnotation[] {
  const seen = new Set<string>()
  return values.slice(0, 200).flatMap((item) => {
    if (!item || !recordTextFields.includes(item.field) || typeof item.text !== 'string' || !item.text
      || !['TEMPLATE', 'VOICE', 'CONTEXT', 'DOCTOR', 'AI'].includes(item.source)
      || !['PRESET', 'VARIABLE', 'IMPORTANT', 'FACT', 'CONFLICT'].includes(item.kind)) return []
    const text = content[item.field] || ''
    const start = item.start ?? text.indexOf(item.text)
    if (!Number.isInteger(start) || start < 0 || !text.startsWith(item.text, start)
      || (item.start == null && text.indexOf(item.text, start + 1) >= 0)) return []
    const key = JSON.stringify([item.field, start, item.text, item.source, item.kind, item.binding])
    if (seen.has(key)) return []
    seen.add(key)
    return [{ ...item, start }]
  })
}

/** Fresh template use retains the whole preset as provenance without highlighting the whole paragraph. */
export function templateAnnotations(content: RecordText, annotations: readonly RecordAnnotation[] = []): RecordAnnotation[] {
  const defaults: RecordAnnotation[] = recordTextFields.flatMap((field) => content[field]
    ? [{ field, text: content[field]!, start: 0, source: 'TEMPLATE', kind: 'PRESET', confirmed: false }] : [])
  return anchorAnnotations(content, [...defaults, ...annotations.map((item) => ({ ...item, source: 'TEMPLATE' as const, confirmed: false }))])
}

export function annotationSegments(text: string, values: readonly RecordAnnotation[]) {
  const selected: RecordAnnotation[] = []
  // Manual edits retain provenance for merge protection, without highlighting ordinary typing.
  const candidates = values.filter((item) => item.kind !== 'PRESET' && item.source !== 'DOCTOR'
    && item.start != null && text.startsWith(item.text, item.start))
    .sort((a, b) => (a.kind === 'CONFLICT' ? -1 : b.kind === 'CONFLICT' ? 1 : 0) || a.text.length - b.text.length)
  for (const item of candidates) {
    if (!selected.some((other) => item.start! < other.start! + other.text.length && other.start! < item.start! + item.text.length)) selected.push(item)
  }
  selected.sort((a, b) => a.start! - b.start!)
  const result: Array<{ text: string; annotation?: RecordAnnotation }> = []
  let cursor = 0
  for (const item of selected) {
    if (item.start! > cursor) result.push({ text: text.slice(cursor, item.start) })
    result.push({ text: item.text, annotation: item })
    cursor = item.start! + item.text.length
  }
  if (cursor < text.length) result.push({ text: text.slice(cursor) })
  return result
}

/** Rebase only provably unchanged ranges. Never re-find an edited phrase elsewhere in the document. */
export function rebaseAnnotations(field: RecordTextField, before: string, after: string, values: readonly RecordAnnotation[]): RecordAnnotation[] {
  if (before === after) return [...values]
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const oldEnd = before.length - suffix
  const newEnd = after.length - suffix
  const delta = after.length - before.length
  const result: RecordAnnotation[] = []
  const touchedBindings = new Set<string>()
  for (const item of values) {
    if (item.field !== field) { result.push(item); continue }
    if (item.start == null || !before.startsWith(item.text, item.start)) continue
    const end = item.start + item.text.length
    if (end <= prefix) result.push(item)
    else if (item.start >= oldEnd) result.push({ ...item, start: item.start + delta })
    else {
      if (item.binding) touchedBindings.add(item.binding)
      if (item.kind === 'PRESET') {
        if (item.start < prefix) result.push({ ...item, text: before.slice(item.start, prefix) })
        if (end > oldEnd) result.push({ ...item, start: newEnd, text: before.slice(oldEnd, end) })
      }
    }
  }
  if (newEnd > prefix) result.push({ field, start: prefix, text: after.slice(prefix, newEnd), source: 'DOCTOR', kind: 'FACT',
    binding: touchedBindings.size === 1 ? [...touchedBindings][0] : undefined, confirmed: false, label: '医生修改' })
  const compact: RecordAnnotation[] = []
  for (const item of result.sort((a, b) => a.field.localeCompare(b.field) || (a.start ?? 0) - (b.start ?? 0))) {
    const last = compact.at(-1)
    if (last && last.field === item.field && last.source === 'DOCTOR' && item.source === 'DOCTOR'
      && last.binding === item.binding && last.start! + last.text.length === item.start) last.text += item.text
    else compact.push({ ...item })
  }
  return compact
}

/** Unconfirmed presets remain in the editor but do not prove their own applicability. */
export function recordEvidence(content: RecordText, annotations: readonly RecordAnnotation[]): RecordText {
  const anchored = anchorAnnotations(content, annotations)
  return Object.fromEntries(recordTextFields.map((field) => {
    const text = content[field] || ''
    const exclude = anchored.filter((item) => item.field === field && !item.confirmed
      && (item.source === 'TEMPLATE' || item.source === 'AI'))
    const include = anchored.filter((item) => item.field === field && (item.confirmed
      || ['VOICE', 'CONTEXT', 'DOCTOR'].includes(item.source)))
    // Segment boundaries preserve punctuation while preventing unrelated words joining after a removed preset.
    const boundaries = [...new Set([0, text.length, ...[...exclude, ...include].flatMap((item) => [item.start!, item.start! + item.text.length])])].sort((a, b) => a - b)
    return [field, boundaries.slice(0, -1).map((start, i) => {
      const end = boundaries[i + 1]
      const covered = (item: RecordAnnotation) => item.start! <= start && item.start! + item.text.length >= end
      return exclude.some(covered) && !include.some(covered) ? ' ' : text.slice(start, end)
    }).join('').trim()]
  }))
}

/** Update a semantic slot, never all occurrences of a number such as 3天. */
export function applyBoundFacts(content: RecordText, annotations: readonly RecordAnnotation[], incoming: readonly RecordAnnotation[]) {
  const next = { ...content }
  let marks = anchorAnnotations(content, annotations)
  for (const fact of incoming) {
    if (!fact.binding || !['VOICE', 'CONTEXT'].includes(fact.source) || !fact.text) continue
    const targets = marks.filter((item) => item.binding === fact.binding && item.field === fact.field)
    const manual = targets.find((item) => item.source === 'DOCTOR')
    if (manual) {
      marks = marks.filter((item) => !(item.field === fact.field && item.binding === fact.binding && item.kind === 'CONFLICT'))
      if (manual.text !== fact.text) marks.push({ ...manual, source: 'AI', kind: 'CONFLICT', confirmed: false,
        label: '新信息与手工修改不同', reason: `保留医生修改；新信息为“${fact.text}”`, sourceQuote: fact.sourceQuote })
      continue
    }
    const editable = targets.filter((item) => ['TEMPLATE', 'VOICE', 'CONTEXT', 'AI'].includes(item.source) && !['PRESET', 'CONFLICT'].includes(item.kind))
    if (editable.length !== 1) continue
    const target = editable[0]
    if (target.text === fact.text) continue
    const before = next[target.field] || ''
    const start = target.start!
    const after = before.slice(0, start) + fact.text + before.slice(start + target.text.length)
    marks = rebaseAnnotations(target.field, before, after, marks)
      .filter((item) => !(item.field === fact.field && item.start === start && item.source === 'DOCTOR'))
    marks.push({ ...fact, start, confirmed: false })
    next[target.field] = after
  }
  return { content: next, annotations: anchorAnnotations(next, marks) }
}
