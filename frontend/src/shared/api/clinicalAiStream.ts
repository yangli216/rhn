import type { ClinicalAiRecordText, ClinicalAiSuggestion } from './clinicalAiApi'

/** Only the committed, validated `complete` event is an adoptable suggestion. */
export async function consumeClinicalAiStream(response: Response, onDelta: (text: string) => void): Promise<ClinicalAiSuggestion> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取生成结果，请重试。')
  const decoder = new TextDecoder()
  let buffer = '', event = '', data: string[] = []
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      if (buffer.length > 524288) throw new Error('生成结果过长，请重新整理。')
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end).replace(/\r$/, '')
        buffer = buffer.slice(end + 1)
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) data.push(line.slice(5).trimStart())
        else if (!line && data.length) {
          const value = JSON.parse(data.join('\n'))
          if (event === 'error') throw value
          if (event === 'complete') {
            if (!value?.id || !value.clientContextFingerprint || !value.recordDraft) throw new Error('生成结果不完整，请重试。')
            return value as ClinicalAiSuggestion
          }
          if (event === 'delta' && typeof value.text === 'string') onDelta(value.text)
          event = ''; data = []
        }
      }
      if (chunk.done) break
    }
    throw new Error('生成连接已中断，尚未取得完整结果，请重试。')
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export interface ClinicalAiFieldStream {
  encounterId: string
  contextFingerprint: string
  recordDraft: ClinicalAiRecordText
}

export interface ClinicalAiPreview { summary?: string; recordDraft: ClinicalAiRecordText }
const fields = new Set(['chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam', 'treatmentPlan'])

/** A small incremental JSON reader: never treats JSON embedded inside quoted text as a field. */
export function clinicalAiPreview(source: string): ClinicalAiPreview {
  const result: ClinicalAiPreview = { recordDraft: {} }
  let position = 0
  const whitespace = () => { while (/\s/.test(source[position] ?? '') && position < source.length) position++ }
  function string(): { value: string; complete: boolean } {
    let value = ''; position++
    while (position < source.length) {
      const character = source[position++]
      if (character === '"') return { value, complete: true }
      if (character !== '\\') { value += character; continue }
      const escape = source[position++]
      if (!escape) break
      if (escape === 'u') {
        const hex = source.slice(position, position + 4)
        if (!/^[a-fA-F0-9]{4}$/.test(hex)) break
        value += String.fromCharCode(parseInt(hex, 16)); position += 4
      } else {
        const escaped: Record<string, string> = { '"': '"', '\\': '\\', '/': '/', n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
        if (!(escape in escaped)) break
        value += escaped[escape]
      }
    }
    return { value, complete: false }
  }
  function read(path: string[], depth = 0): boolean {
    whitespace()
    if (depth > 32 || position >= source.length) return false
    if (source[position] === '"') {
      const text = string()
      if (path.length === 1 && path[0] === 'summary') result.summary = text.value
      if (path.length === 2 && path[0] === 'recordDraft' && fields.has(path[1])) {
        result.recordDraft[path[1] as keyof ClinicalAiRecordText] = text.value
      }
      return text.complete
    }
    if (source[position] === '{' || source[position] === '[') {
      const object = source[position++] === '{', closing = object ? '}' : ']'
      whitespace()
      if (source[position] === closing) { position++; return true }
      while (position < source.length) {
        let key = '*'
        if (object) {
          whitespace(); if (source[position] !== '"') return false
          const name = string(); if (!name.complete) return false
          key = name.value; whitespace(); if (source[position++] !== ':') return false
        }
        if (!read([...path, key], depth + 1)) return false
        whitespace()
        if (source[position] === closing) { position++; return true }
        if (source[position++] !== ',') return false
      }
      return false
    }
    while (position < source.length && !/[\s,}\]]/.test(source[position])) position++
    return position < source.length
  }
  read([])
  return result
}
