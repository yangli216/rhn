import type { TextareaHTMLAttributes } from 'react'
import type { RecordAnnotation, RecordTextField } from '../../../shared/api/recordAnnotations'
import { AnnotatedTextarea } from '../../../shared/ui/AnnotatedTextarea'
import { annotationQuickActions } from './annotationQuickActions'
import { annotationSegments, anchorAnnotations, annotationKey, isHighlighted } from './recordAnnotations'

const sourceNames = { TEMPLATE: '模板内容', VOICE: '本次口述', CONTEXT: '已有资料', DOCTOR: '医生修改', AI: 'AI 补充' }
/** Status-only title; never combines contradictory states. */
function annotationTitle(item: RecordAnnotation) {
  if (item.kind === 'CONFLICT') return '信息冲突'
  if (item.source === 'TEMPLATE' && item.kind === 'VARIABLE') return '模板内容 · 需按本次患者替换'
  if (item.source === 'AI') return 'AI 推荐 · 待核实'
  if (item.kind === 'VARIABLE') return '需按本次患者替换'
  return item.source === 'TEMPLATE' ? '模板内容 · 待核实' : sourceNames[item.source]
}
function annotationDescription(item: RecordAnnotation) {
  const text = item.text.trim()
  const reason = item.reason?.trim()
  const quote = item.sourceQuote?.trim()
  const redundantVoiceReason = item.source === 'VOICE' && item.kind === 'FACT' && Boolean(text)
    && Boolean(reason?.includes(text))
  return [redundantVoiceReason ? '' : reason, quote && quote !== text ? `原话：${quote}` : '']
    .filter(Boolean).join('\n')
}

export function AnnotatedRecordField({ field, value = '', annotations, onValueChange, showAnnotations,
  ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  field: RecordTextField; value?: string; annotations?: readonly RecordAnnotation[] | null; showAnnotations: boolean
  onValueChange: (value: string) => void
}) {
  const safeAnnotations = annotations ?? []
  const marks = annotationSegments(value, anchorAnnotations({ [field]: value }, safeAnnotations)
    .filter((item) => item.field === field)).flatMap(({ annotation: item }) => item && isHighlighted(item) ? [{
      start: item.start!, text: item.text,
      label: annotationTitle(item), key: annotationKey(item),
      description: annotationDescription(item) || undefined,
      tone: item.kind === 'CONFLICT' ? 'conflict' as const : item.kind === 'IMPORTANT' ? 'important' as const
        : item.kind === 'VARIABLE' ? 'variable' as const : 'source' as const,
    }] : [])
  return <AnnotatedTextarea {...props} value={value} annotations={marks} showAnnotations={showAnnotations}
    onValueChange={onValueChange} quickActions={annotationQuickActions} />
}
