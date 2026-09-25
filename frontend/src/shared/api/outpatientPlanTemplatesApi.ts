import type { CreateMedicationRequestInput, CreateServiceRequestInput, DiagnosisInput } from './encountersApi'
import type { ApiClient } from './httpClient'

export type OutpatientPlanTemplateScope = 'PERSONAL' | 'DEPARTMENT' | 'HOSPITAL'
export type OutpatientPlanTemplateSourceType = 'MANUAL' | 'AI_INPUT' | 'AI_MINED' | 'AI_GUIDELINE'

export interface OutpatientPlanTask {
  kind: 'DIAGNOSIS' | 'MEDICATION' | 'LABORATORY' | 'EXAMINATION' | 'EDUCATION' | 'FOLLOW_UP' | 'CONDITION'
  text: string
  sourceQuote?: string
  origin: 'EXPLICIT' | 'SUGGESTED'
  status: 'MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED'
  details?: string
}

export interface OutpatientPlanTemplateMedication extends Omit<CreateMedicationRequestInput,
  'prescriptionId' | 'parentRequestId' | 'allergyReviewConfirmed' | 'allergyOverrideReason'> {
  lineId: string
  medicationId: string
  editorMode: 'regular' | 'herbal'
  categoryCode: string
  medicationCode: string
  medicationName: string
  preparationSpec?: string
  productName?: string
  routeName?: string
  routeExecutionType?: 'NONE' | 'ADMINISTRATION' | 'INFUSION'
}

export interface OutpatientPlanTemplateService extends CreateServiceRequestInput {
  itemCode: string
  itemName: string
  serviceType: 'LABORATORY' | 'EXAMINATION' | 'TREATMENT' | 'OTHER'
}

export interface OutpatientPlanTemplate {
  id: string
  revision: number
  scopeType: OutpatientPlanTemplateScope
  name: string
  description?: string
  status: 'ACTIVE' | 'INACTIVE'
  sourceType?: OutpatientPlanTemplateSourceType
  guidelineReference?: string
  sortOrder: number
  useCount: number
  lastUsedAt?: string
  diagnoses: DiagnosisInput[]
  medications: OutpatientPlanTemplateMedication[]
  services: OutpatientPlanTemplateService[]
  tasks: OutpatientPlanTask[]
  createdAt: string
  updatedAt: string
}

export interface CompiledPlanMedicationItem extends Omit<CreateMedicationRequestInput,
  'prescriptionId' | 'parentRequestId' | 'allergyReviewConfirmed' | 'allergyOverrideReason'> {
  medicationName?: string
  preparationSpec?: string
}

export interface CompiledPlanServiceItem extends CreateServiceRequestInput {
  itemCode?: string
  itemName?: string
  serviceType?: 'LABORATORY' | 'EXAMINATION' | 'TREATMENT' | 'OTHER'
}

export interface SaveOutpatientPlanTemplateInput {
  scopeType: OutpatientPlanTemplateScope
  name: string
  description?: string
  sourceType?: OutpatientPlanTemplateSourceType
  guidelineReference?: string
  sortOrder?: number
  diagnoses: DiagnosisInput[]
  medications: CompiledPlanMedicationItem[]
  services: CompiledPlanServiceItem[]
  tasks?: OutpatientPlanTask[]
}

export interface PlanTextDraft {
  scopeType: OutpatientPlanTemplateScope
  name: string
  narrative: string
  sourceType?: OutpatientPlanTemplateSourceType
  guidelineReference?: string
  reviewItems: PlanTextReviewItem[]
}

export interface PlanTextReviewItem {
  kind: OutpatientPlanTask['kind']
  text: string
  sourceQuote?: string
  origin: OutpatientPlanTask['origin']
  details?: string
}

export async function consumePlanTextDraftStream(response: Response,
  onDelta: (text: string) => void): Promise<PlanTextDraft> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('无法读取方案生成结果，请重试。')
  const decoder = new TextDecoder()
  let buffer = '', event = '', data: string[] = []
  try {
    while (true) {
      const chunk = await reader.read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      if (buffer.length > 524288) throw new Error('方案生成结果过长，请缩短输入后重试。')
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
            if (!value?.name || !value?.narrative || !Array.isArray(value.reviewItems)) {
              throw new Error('方案生成结果不完整，请重试。')
            }
            return value as PlanTextDraft
          }
          if (event === 'delta' && typeof value.text === 'string') onDelta(value.text)
          event = ''; data = []
        }
      }
      if (chunk.done) break
    }
    throw new Error('方案生成连接已中断，尚未取得完整结果，请重试。')
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}

export interface PlanStreamPreviewResult {
  name: string
  narrative: string
  items: PlanTextReviewItem[]
}

function extractStreamingItems(source: string): PlanTextReviewItem[] {
  const items: PlanTextReviewItem[] = []
  const itemsKeyIdx = source.indexOf('"items"')
  if (itemsKeyIdx === -1) return items
  const openBracketIdx = source.indexOf('[', itemsKeyIdx)
  if (openBracketIdx === -1) return items

  let i = openBracketIdx + 1
  while (i < source.length) {
    while (i < source.length && /[\s,]/.test(source[i])) i++
    if (i >= source.length || source[i] === ']') break
    if (source[i] === '{') {
      const start = i
      let depth = 0
      let inString = false
      let escaped = false
      let end = -1
      for (let j = start; j < source.length; j++) {
        const char = source[j]
        if (inString) {
          if (escaped) escaped = false
          else if (char === '\\') escaped = true
          else if (char === '"') inString = false
        } else {
          if (char === '"') inString = true
          else if (char === '{') depth++
          else if (char === '}') {
            depth--
            if (depth === 0) {
              end = j
              break
            }
          }
        }
      }
      if (end !== -1) {
        const jsonStr = source.slice(start, end + 1)
        try {
          const parsed = JSON.parse(jsonStr)
          if (parsed && typeof parsed.name === 'string' && typeof parsed.kind === 'string') {
            items.push({
              kind: parsed.kind,
              text: parsed.name,
              sourceQuote: parsed.sourceQuote,
              origin: parsed.origin || 'SUGGESTED',
              details: parsed.details,
            })
          }
        } catch {
          // ignore partial parse error
        }
        i = end + 1
      } else {
        // 部分生成中的项
        const partialStr = source.slice(start)
        const kindMatch = /"kind"\s*:\s*"([^"]+)"/.exec(partialStr)
        const nameMatch = /"name"\s*:\s*"([^"]+)"/.exec(partialStr)
        if (kindMatch && nameMatch) {
          items.push({
            kind: kindMatch[1] as any,
            text: nameMatch[1],
            origin: 'SUGGESTED',
            details: '正在生成细节...',
          })
        }
        break
      }
    } else {
      i++
    }
  }
  return items
}

export function planTextStreamPreview(source: string): PlanStreamPreviewResult {
  const readTopLevelString = (target: string) => {
    let position = 0
    const whitespace = () => { while (/\s/.test(source[position] ?? '') && position < source.length) position++ }
    const string = () => {
      let value = ''; position++
      while (position < source.length) {
        const character = source[position++]
        if (character === '"') return value
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
      return value
    }
    whitespace()
    if (source[position++] !== '{') return ''
    while (position < source.length) {
      whitespace()
      if (source[position] !== '"') return ''
      const key = string()
      whitespace()
      if (source[position++] !== ':') return ''
      whitespace()
      if (key === target && source[position] === '"') return string()
      let depth = 0, quoted = false, escaped = false
      while (position < source.length) {
        const character = source[position]
        if (quoted) {
          position++
          if (escaped) escaped = false
          else if (character === '\\') escaped = true
          else if (character === '"') quoted = false
          continue
        }
        if (character === '"') { quoted = true; position++; continue }
        if (character === '{' || character === '[') depth++
        else if (character === '}' || character === ']') {
          if (depth === 0) return ''
          depth--
        } else if (character === ',' && depth === 0) { position++; break }
        position++
      }
    }
    return ''
  }
  return {
    name: readTopLevelString('name'),
    narrative: readTopLevelString('narrative'),
    items: extractStreamingItems(source),
  }
}

export interface MinedPlanSuggestion {
  patternKey: string
  suggestedName: string
  description: string
  occurrenceCount: number
  diagnoses: DiagnosisInput[]
  medications: CompiledPlanMedicationItem[]
  services: CompiledPlanServiceItem[]
}

export interface HistoricalStablePlan {
  encounterId: string
  sourceEncounterId: string
  sourceEncounterTime?: string
  conditionTitle: string
  summary: string
  diagnoses: DiagnosisInput[]
  medications: Array<Omit<OutpatientPlanTemplateMedication,
    'lineId' | 'editorMode' | 'categoryCode' | 'medicationCode' | 'medicationName' | 'preparationSpec' | 'productName'>>
  services: CreateServiceRequestInput[]
  guidanceNotes: string[]
}

export interface UpdateOutpatientPlanTemplateInput {
  expectedRevision: number
  scopeType: OutpatientPlanTemplateScope
  name: string
  description?: string
  guidelineReference?: string
  sortOrder?: number
  diagnoses: DiagnosisInput[]
  medications: CompiledPlanMedicationItem[]
  services: CompiledPlanServiceItem[]
  tasks?: OutpatientPlanTask[]
}

export function createOutpatientPlanTemplatesApi(client: ApiClient) {
  return {
    list: (keyword = '') => client.request<OutpatientPlanTemplate[]>(
      `/api/outpatient/plan-templates${keyword ? `?keyword=${encodeURIComponent(keyword)}` : ''}`),
    create: (input: SaveOutpatientPlanTemplateInput) => client.request<OutpatientPlanTemplate>(
      '/api/outpatient/plan-templates', { method: 'POST', body: JSON.stringify(input) }),
    update: (id: string, input: UpdateOutpatientPlanTemplateInput) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    use: (id: string) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}/use`, { method: 'POST' }),
    disable: (id: string, expectedRevision: number) => client.request<OutpatientPlanTemplate>(
      `/api/outpatient/plan-templates/${id}/disable`, {
        method: 'POST', body: JSON.stringify({ expectedRevision }),
      }),
    compileDraft: (naturalInput: string, scopeType: OutpatientPlanTemplateScope = 'PERSONAL') =>
      client.request<PlanTextDraft>('/api/ai/clinical-assistant/plan-templates/draft', {
        method: 'POST',
        body: JSON.stringify({ naturalInput, scopeType }),
      }),
    compileDraftStream: async (naturalInput: string, scopeType: OutpatientPlanTemplateScope,
      signal: AbortSignal, onDelta: (text: string) => void) => {
      try {
        return await consumePlanTextDraftStream(
          await client.eventStream('/api/ai/clinical-assistant/plan-templates/draft/stream', signal, undefined, {
            method: 'POST', body: JSON.stringify({ naturalInput, scopeType }),
          }), onDelta)
      } catch (streamError) {
        if (signal.aborted) throw streamError
        return await client.request<PlanTextDraft>('/api/ai/clinical-assistant/plan-templates/draft', {
          method: 'POST', body: JSON.stringify({ naturalInput, scopeType }), signal,
        })
      }
    },
    reviseDraftStream: async (naturalInput: string, currentNarrative: string, revisionInstruction: string,
      scopeType: OutpatientPlanTemplateScope, signal: AbortSignal, onDelta: (text: string) => void) => {
      const body = JSON.stringify({ naturalInput, confirmedNarrative: currentNarrative, revisionInstruction, scopeType })
      try {
        return await consumePlanTextDraftStream(
          await client.eventStream('/api/ai/clinical-assistant/plan-templates/draft/stream', signal, undefined, {
            method: 'POST', body,
          }), onDelta)
      } catch (streamError) {
        if (signal.aborted) throw streamError
        return await client.request<PlanTextDraft>('/api/ai/clinical-assistant/plan-templates/draft', {
          method: 'POST', body, signal,
        })
      }
    },
    convertDraft: (naturalInput: string, confirmedNarrative: string, confirmedName: string,
      reviewItems: PlanTextReviewItem[], scopeType: OutpatientPlanTemplateScope = 'PERSONAL') =>
      client.request<SaveOutpatientPlanTemplateInput>('/api/ai/clinical-assistant/plan-templates/draft/convert', {
        method: 'POST',
        body: JSON.stringify({ naturalInput, confirmedNarrative, confirmedName, reviewItems, scopeType }),
      }),
    compileGuideline: (guidelineText: string, guidelineName: string, versionYear?: string, scopeType: OutpatientPlanTemplateScope = 'HOSPITAL') =>
      client.request<PlanTextDraft>('/api/ai/clinical-assistant/plan-templates/guideline-extract', {
        method: 'POST',
        body: JSON.stringify({ guidelineText, guidelineName, versionYear, scopeType }),
      }),
    compileGuidelineStream: async (guidelineText: string, guidelineName: string, versionYear: string | undefined,
      scopeType: OutpatientPlanTemplateScope, signal: AbortSignal, onDelta: (text: string) => void) => {
      try {
        return await consumePlanTextDraftStream(
          await client.eventStream('/api/ai/clinical-assistant/plan-templates/guideline-extract/stream', signal, undefined, {
            method: 'POST', body: JSON.stringify({ guidelineText, guidelineName, versionYear, scopeType }),
          }), onDelta)
      } catch (streamError) {
        if (signal.aborted) throw streamError
        return await client.request<PlanTextDraft>('/api/ai/clinical-assistant/plan-templates/guideline-extract', {
          method: 'POST', body: JSON.stringify({ guidelineText, guidelineName, versionYear, scopeType }), signal,
        })
      }
    },
    reviseGuidelineStream: async (guidelineText: string, guidelineName: string, versionYear: string | undefined,
      currentNarrative: string, revisionInstruction: string, scopeType: OutpatientPlanTemplateScope,
      signal: AbortSignal, onDelta: (text: string) => void) => {
      const body = JSON.stringify({ guidelineText, guidelineName, versionYear, confirmedNarrative: currentNarrative,
        revisionInstruction, scopeType })
      try {
        return await consumePlanTextDraftStream(
          await client.eventStream('/api/ai/clinical-assistant/plan-templates/guideline-extract/stream', signal, undefined, {
            method: 'POST', body,
          }), onDelta)
      } catch (streamError) {
        if (signal.aborted) throw streamError
        return await client.request<PlanTextDraft>('/api/ai/clinical-assistant/plan-templates/guideline-extract', {
          method: 'POST', body, signal,
        })
      }
    },
    convertGuideline: (guidelineText: string, guidelineName: string, versionYear: string | undefined,
                       confirmedNarrative: string, scopeType: OutpatientPlanTemplateScope = 'HOSPITAL') =>
      client.request<SaveOutpatientPlanTemplateInput>('/api/ai/clinical-assistant/plan-templates/guideline-extract/convert', {
        method: 'POST',
        body: JSON.stringify({ guidelineText, guidelineName, versionYear, confirmedNarrative, scopeType }),
      }),
    minedSuggestions: () =>
      client.request<MinedPlanSuggestion[]>('/api/ai/clinical-assistant/plan-templates/mined-suggestions'),
    getHistoricalStablePlan: (encounterId: string) =>
      client.request<HistoricalStablePlan | null>(`/api/ai/clinical-assistant/encounters/${encounterId}/historical-stable-plan`),
  }
}
