export interface AnnotationQuickAction {
  label: string
  /** The complete replacement for the marked text. */
  nextText: string
}

interface Rule {
  word: string
  to: readonly string[]
  /** Rejects accidental hits such as 无力 / 无锡 / 比较. */
  accept?: (text: string, index: number) => boolean
}

const MAX_ACTIONS = 4
const after = (text: string, index: number, chars: string) => index > 0 && chars.includes(text[index - 1])
const startsAt = (text: string, index: number, words: readonly string[]) => words.some((word) => text.startsWith(word, index))

const notWuWords = ['无力', '无锡', '无论', '无法', '无需', '无须', '无关', '无意', '无菌', '无所', '无以', '无从', '无疑',
  '无数', '无限', '无尽', '无聊', '无奈', '无辜', '无效', '无助', '无知']
const notYouWords = ['有力', '有效', '有关', '有时', '有点', '有些', '有所', '有人', '有机', '有限', '有利', '有益', '有害',
  '有名', '有序', '有意', '有无', '有余', '有望']

/** Presence: 有/无, 伴/不伴, 诉→否认, 否认→有. Longest and earliest match wins. */
const presence: Rule[] = [
  { word: '不伴', to: ['伴'] },
  { word: '否认', to: ['有'] },
  { word: '伴', to: ['不伴'], accept: (text, i) => !after(text, i, '陪同结') && !text.startsWith('伴侣', i) },
  { word: '无', to: ['有'], accept: (text, i) => !startsAt(text, i, notWuWords) && !after(text, i, '有') && !after(text, i, '虚') },
  { word: '有', to: ['无'], accept: (text, i) => !startsAt(text, i, notYouWords) && !after(text, i, '所拥具含占持没唯另既现已共') },
  { word: '诉', to: ['否认'], accept: (text, i) => !after(text, i, '主告倾申投起哭控上抗') },
]

const polarity: Rule[] = [
  { word: '阳性', to: ['阴性'] },
  { word: '阴性', to: ['阳性'] },
  { word: '(+)', to: ['(-)'] },
  { word: '(-)', to: ['(+)'] },
  { word: '（+）', to: ['（-）'] },
  { word: '（-）', to: ['（+）'] },
]

const groups = [['轻度', '中度', '重度'], ['轻微', '明显', '严重'], ['稍', '较', '明显']]
const negated = (text: string, i: number) => after(text, i, '无不未')
const degree: Rule[] = [...new Set(groups.flat())].map((word) => ({
  word,
  to: [...new Set(groups.filter((group) => group.includes(word)).flatMap((group) => group.filter((item) => item !== word)))],
  accept: word === '明显' ? (text, i) => !negated(text, i)
    : word === '稍' ? (text, i) => !startsAt(text, i, ['稍微', '稍事'])
      : word === '较' ? (text, i) => !after(text, i, '比相对攀') && !startsAt(text, i, ['较前', '较之', '较去', '较往', '较量'])
        : undefined,
}))

const PUNCTUATION = '，。；：、,.;:！？!?\n '
/** The swapped word with a few neighbouring characters, so a lone 有/较 still reads as a phrase. */
function phrase(text: string, index: number, word: string, to: string) {
  const end = index + word.length
  let tail = ''
  for (let i = end; i < text.length && tail.length < 4 && !PUNCTUATION.includes(text[i]); i++) tail += text[i]
  if (tail) return to + tail
  let head = ''
  for (let i = index - 1; i >= 0 && head.length < 3 && !PUNCTUATION.includes(text[i]); i--) head = text[i] + head
  return head + to
}

function firstHit(text: string, rules: readonly Rule[]) {
  const ordered = [...rules].sort((a, b) => b.word.length - a.word.length)
  for (let index = 0; index < text.length; index++) {
    const rule = ordered.find((item) => text.startsWith(item.word, index) && (item.accept?.(text, index) ?? true))
    if (rule) return { rule, index }
  }
  return null
}

/** Quick wording alternatives for one mark; empty when the text hits no vocabulary. */
export function annotationQuickActions(text: string): AnnotationQuickAction[] {
  const seen = new Set<string>()
  const result: AnnotationQuickAction[] = []
  for (const category of [presence, polarity, degree]) {
    const hit = firstHit(text, category)
    if (!hit) continue
    for (const to of hit.rule.to) {
      const nextText = text.slice(0, hit.index) + to + text.slice(hit.index + hit.rule.word.length)
      if (seen.has(nextText)) continue
      seen.add(nextText)
      result.push({ label: `改为：${phrase(text, hit.index, hit.rule.word, to)}`, nextText })
    }
  }
  return result.slice(0, MAX_ACTIONS)
}
