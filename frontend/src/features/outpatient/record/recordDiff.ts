export type DiffSegment = { type: 'same' | 'add' | 'del'; text: string }

/** Beyond this many character pairs the exact diff is skipped and the whole middle is shown as replaced. */
const MAX_LCS_CELLS = 250_000

/**
 * Character-level diff used to show what an amendment changed in a signed note. Common prefix and suffix are kept
 * as-is; the differing middle uses a longest-common-subsequence match so Chinese text without word boundaries still
 * produces small, readable edits.
 */
export function diffText(before: string, after: string): DiffSegment[] {
  const a = Array.from(before)
  const b = Array.from(after)
  let start = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  let endA = a.length
  let endB = b.length
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }
  const segments: DiffSegment[] = []
  const push = (type: DiffSegment['type'], chars: string[]) => {
    if (chars.length === 0) return
    const text = chars.join('')
    const last = segments[segments.length - 1]
    if (last?.type === type) last.text += text
    else segments.push({ type, text })
  }
  push('same', a.slice(0, start))
  const midA = a.slice(start, endA)
  const midB = b.slice(start, endB)
  if (midA.length * midB.length > MAX_LCS_CELLS || midA.length === 0 || midB.length === 0) {
    push('del', midA)
    push('add', midB)
  } else {
    const width = midB.length + 1
    const table = new Uint16Array((midA.length + 1) * width)
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        table[i * width + j] = midA[i] === midB[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1])
      }
    }
    let i = 0
    let j = 0
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) { push('same', [midA[i]]); i++; j++ }
      else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { push('del', [midA[i]]); i++ }
      else { push('add', [midB[j]]); j++ }
    }
    push('del', midA.slice(i))
    push('add', midB.slice(j))
  }
  push('same', a.slice(endA))
  return segments
}

export function hasChanges(segments: DiffSegment[]) {
  return segments.some((segment) => segment.type !== 'same')
}
