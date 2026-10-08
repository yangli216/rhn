const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/
const numberPrefix = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/

export function isParameterNumberText(value: string) { return numberPattern.test(value.trim()) }

/** A JSON number token, never converted through an IEEE-754 Number. */
export class ParameterJsonNumber {
  readonly text: string
  constructor(text: string) {
    if (!isParameterNumberText(text)) throw new SyntaxError('数值必须使用 JSON 十进制格式')
    this.text = text.trim()
  }
  toString() { return this.text }
}

export function isParameterJsonNumber(value: unknown): value is ParameterJsonNumber {
  return value instanceof ParameterJsonNumber
}

/** Syntax is checked by JSON.parse; the second pass retains every numeric token. */
export function parseParameterJson(source: string): unknown {
  JSON.parse(source)
  let offset = 0
  const whitespace = () => { while (/\s/.test(source[offset] ?? '') && offset < source.length) offset++ }
  const string = () => {
    const start = offset++
    while (offset < source.length) {
      const char = source[offset++]
      if (char === '\\') offset++
      else if (char === '"') return JSON.parse(source.slice(start, offset)) as string
    }
    throw new SyntaxError('JSON 字符串未结束')
  }
  const value = (): unknown => {
    whitespace()
    const char = source[offset]
    if (char === '"') return string()
    if (char === '{') {
      offset++; whitespace()
      const result: Record<string, unknown> = Object.create(null)
      if (source[offset] !== '}') {
        while (true) {
          whitespace()
          const key = string()
          if (Object.hasOwn(result, key)) throw new SyntaxError(`JSON 属性重复：${key}`)
          whitespace(); offset++ // colon, validated above
          result[key] = value(); whitespace()
          if (source[offset] !== ',') break
          offset++
        }
      }
      offset++
      return result
    }
    if (char === '[') {
      offset++; whitespace()
      const result: unknown[] = []
      if (source[offset] !== ']') {
        while (true) {
          result.push(value()); whitespace()
          if (source[offset] !== ',') break
          offset++
        }
      }
      offset++
      return result
    }
    for (const [token, parsed] of [['true', true], ['false', false], ['null', null]] as const) {
      if (source.startsWith(token, offset)) { offset += token.length; return parsed }
    }
    const token = source.slice(offset).match(numberPrefix)?.[0]
    if (!token) throw new SyntaxError('JSON 数值无效')
    offset += token.length
    return new ParameterJsonNumber(token)
  }
  return value()
}

export function stringifyParameterJson(value: unknown): string {
  if (isParameterJsonNumber(value)) return value.text
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stringifyParameterJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    return `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}:${stringifyParameterJson(item)}`).join(',')}}`
  }
  throw new TypeError('不支持的 JSON 内容')
}

export function compareParameterNumbers(left: ParameterJsonNumber, right: ParameterJsonNumber): number {
  const parts = (value: ParameterJsonNumber) => {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(value.text)!
    const digits = `${match[2]}${match[3] ?? ''}`.replace(/^0+/, '')
    return { sign: digits ? match[1] ? -1 : 1 : 0, digits,
      order: BigInt(digits.length) + BigInt(match[4] ?? '0') - BigInt(match[3]?.length ?? 0) }
  }
  const a = parts(left), b = parts(right)
  if (a.sign !== b.sign) return a.sign < b.sign ? -1 : 1
  if (a.sign === 0) return 0
  if (a.order !== b.order) return (a.order < b.order ? -1 : 1) * a.sign
  const length = Math.max(a.digits.length, b.digits.length)
  const x = a.digits.padEnd(length, '0'), y = b.digits.padEnd(length, '0')
  return x === y ? 0 : (x < y ? -1 : 1) * a.sign
}
