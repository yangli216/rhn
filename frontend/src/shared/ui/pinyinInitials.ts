const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  sensitivity: 'base',
  usage: 'sort',
})

const boundaries: Array<[initial: string, firstSyllable: string]> = [
  ['a', '阿'], ['b', '八'], ['c', '嚓'], ['d', '哒'], ['e', '妸'], ['f', '发'],
  ['g', '旮'], ['h', '哈'], ['j', '讥'], ['k', '咔'], ['l', '垃'], ['m', '妈'],
  ['n', '拿'], ['o', '噢'], ['p', '趴'], ['q', '七'], ['r', '呥'], ['s', '仨'],
  ['t', '他'], ['w', '挖'], ['x', '夕'], ['y', '丫'], ['z', '匝'],
]

const initialsCache = new Map<string, string>()

/**
 * Returns a compact search key such as “zjlx” for “证件类型”.
 * The browser's pinyin collation keeps the implementation dependency-free.
 */
export function pinyinInitials(value: string) {
  const cached = initialsCache.get(value)
  if (cached !== undefined) return cached
  const initials = Array.from(value.normalize('NFKC'))
    .map((character) => characterInitial(character))
    .join('')
    .toLocaleLowerCase()
  initialsCache.set(value, initials)
  return initials
}

function characterInitial(character: string) {
  if (/^[a-z0-9]$/i.test(character)) return character.toLowerCase()
  if (!/^\p{Script=Han}$/u.test(character)) return ''
  for (let i = boundaries.length - 1; i >= 0; i--) {
    if (collator.compare(character, boundaries[i][1]) >= 0) {
      return boundaries[i][0]
    }
  }
  return ''
}

/**
 * 智能匹配字段：包含原文文本（忽略大小写）、或者拼音首字母缩写包含 query
 */
export function matchesPinyinOrText(text: string | undefined | null, query: string): boolean {
  if (!text) return false
  const trimmedQuery = query.trim().toLowerCase()
  if (!trimmedQuery) return true
  const lowerText = text.toLowerCase()
  if (lowerText.includes(trimmedQuery)) return true
  const initials = pinyinInitials(text)
  return initials.includes(trimmedQuery)
}
