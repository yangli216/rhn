import type { ClinicalAiRecordText, ClinicalAiSuggestion } from './clinicalAiApi'

export interface ClinicalAiStreamStage {
  phase: 'DIAGNOSES' | 'TREATMENTS'
  clientContextFingerprint: string
  content: Pick<ClinicalAiSuggestion, 'recordDraft' | 'summary' | 'diagnosisCandidates' | 'treatmentRecommendations'>
}

/** Stages are read-only previews; only the committed `complete` event is adoptable. */
export async function consumeClinicalAiStream(response: Response, onDelta: (text: string) => void,
  onStage?: (stage: ClinicalAiStreamStage) => void): Promise<ClinicalAiSuggestion> {
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
          if (event === 'stage') {
            if (!['DIAGNOSES', 'TREATMENTS'].includes(value?.phase) || !value.clientContextFingerprint
              || !value.content?.recordDraft || !Array.isArray(value.content.diagnosisCandidates)
              || !Array.isArray(value.content.treatmentRecommendations)) throw new Error('生成阶段结果不完整，请重试。')
            onStage?.(value as ClinicalAiStreamStage)
          }
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

export interface ClinicalAiPreview {
  summary?: string
  recordDraft: ClinicalAiRecordText
  phase?: ClinicalAiStreamStage['phase']
  diagnosisCandidates?: ClinicalAiSuggestion['diagnosisCandidates']
  treatmentRecommendations?: ClinicalAiSuggestion['treatmentRecommendations']
}
const fields = new Set(['chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam', 'treatmentPlan',
  'allergyHistory', 'medicationHistory', 'auxiliaryExaminations', 'healthEducation', 'followUp'])

interface InterimDiagnosis {
  code?: string
  display?: string
  type?: 'PRIMARY' | 'SECONDARY'
  confidence?: number
  rationale?: string
}

interface InterimTreatment {
  type?: 'MEDICATION' | 'LABORATORY' | 'EXAMINATION'
  catalogItemId?: string
  code?: string
  name?: string
  specification?: string
  rationale?: string
  purpose?: string
}

/** A small incremental JSON reader: never treats JSON embedded inside quoted text as a field. */
export function clinicalAiPreview(source: string): ClinicalAiPreview {
  const result: ClinicalAiPreview = { recordDraft: {} }
  const rawDiagnoses: InterimDiagnosis[] = []
  const rawTreatments: InterimTreatment[] = []
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
      if (path.length === 3 && path[0] === 'diagnosisCandidates') {
        const index = parseInt(path[1], 10)
        if (!Number.isNaN(index)) {
          const item = (rawDiagnoses[index] ??= {})
          const prop = path[2]
          if (prop === 'code') item.code = text.value
          else if (prop === 'display') item.display = text.value
          else if (prop === 'type') item.type = text.value === 'SECONDARY' ? 'SECONDARY' : 'PRIMARY'
          else if (prop === 'rationale') item.rationale = text.value
        }
      }
      if (path.length === 3 && path[0] === 'treatmentRecommendations') {
        const index = parseInt(path[1], 10)
        if (!Number.isNaN(index)) {
          const item = (rawTreatments[index] ??= {})
          const prop = path[2]
          if (prop === 'type') {
            const upper = text.value.toUpperCase()
            item.type = (upper === 'LABORATORY' || upper === 'EXAMINATION') ? upper : 'MEDICATION'
          } else if (prop === 'name') item.name = text.value
          else if (prop === 'specification') item.specification = text.value
          else if (prop === 'rationale') item.rationale = text.value
          else if (prop === 'purpose') item.purpose = text.value
        }
      }
      return text.complete
    }
    if (source[position] === '{' || source[position] === '[') {
      const object = source[position++] === '{', closing = object ? '}' : ']'
      whitespace()
      if (source[position] === closing) { position++; return true }
      let itemIndex = 0
      while (position < source.length) {
        let key = '*'
        if (object) {
          whitespace(); if (source[position] !== '"') return false
          const name = string(); if (!name.complete) return false
          key = name.value; whitespace(); if (source[position++] !== ':') return false
        } else {
          key = String(itemIndex++)
        }
        if (!read([...path, key], depth + 1)) return false
        whitespace()
        if (source[position] === closing) { position++; return true }
        if (source[position++] !== ',') return false
      }
      return false
    }
    const primStart = position
    while (position < source.length && !/[\s,}\]]/.test(source[position])) position++
    const primitiveText = source.slice(primStart, position)
    if (path.length === 3 && path[0] === 'diagnosisCandidates' && path[2] === 'confidence') {
      const num = parseFloat(primitiveText)
      const index = parseInt(path[1], 10)
      if (!Number.isNaN(index) && !Number.isNaN(num)) {
        const item = (rawDiagnoses[index] ??= {})
        item.confidence = num
      }
    }
    return position < source.length
  }
  read([])

  const candidates = rawDiagnoses
    .filter(item => item.code?.trim() && item.display?.trim())
    .map(item => ({
      code: item.code!.trim(),
      display: item.display!.trim(),
      type: item.type === 'SECONDARY' ? 'SECONDARY' as const : 'PRIMARY' as const,
      confidence: typeof item.confidence === 'number' ? item.confidence : 0.85,
      rationale: item.rationale?.trim() || null,
    }))
  if (candidates.length > 0) result.diagnosisCandidates = candidates

  const treatments = rawTreatments
    .filter(item => item.name?.trim())
    .map((item, index) => ({
      type: item.type || 'MEDICATION' as const,
      catalogItemId: item.catalogItemId || `intent-${index}`,
      code: item.code || '',
      name: item.name!.trim(),
      specification: item.specification?.trim() || '',
      rationale: item.rationale?.trim() || null,
      purpose: item.purpose?.trim() || undefined,
    }))
  if (treatments.length > 0) result.treatmentRecommendations = treatments

  return result
}
