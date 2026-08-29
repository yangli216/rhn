const collator = new Intl.Collator('zh-Hans-CN-u-co-pinyin', {
  sensitivity: 'base',
  usage: 'sort',
})

const boundaries: Array<[initial: string, firstSyllable: string]> = [
  ['a', '阿'], ['b', '八'], ['c', '擦'], ['d', '搭'], ['e', '蛾'], ['f', '发'],
  ['g', '噶'], ['h', '哈'], ['j', '击'], ['k', '喀'], ['l', '垃'], ['m', '妈'],
  ['n', '拿'], ['o', '哦'], ['p', '啪'], ['q', '期'], ['r', '然'], ['s', '撒'],
  ['t', '塌'], ['w', '挖'], ['x', '昔'], ['y', '压'], ['z', '匝'],
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
  if (/^[a-z0-9]$/i.test(character)) return character
  if (!/^\p{Script=Han}$/u.test(character)) return ''
  let initial = ''
  for (const [candidate, boundary] of boundaries) {
    if (collator.compare(character, boundary) < 0) break
    initial = candidate
  }
  return initial
}
