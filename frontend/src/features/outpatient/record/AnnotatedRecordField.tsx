import type { TextareaHTMLAttributes } from 'react'
import type { RecordAnnotation, RecordTextField } from '../../../shared/api/recordAnnotations'
import { AnnotatedTextarea } from '../../../shared/ui/AnnotatedTextarea'
import { annotationSegments, anchorAnnotations } from './recordAnnotations'

const sourceNames = { TEMPLATE: '模板预设', VOICE: '本次口述', CONTEXT: '已有资料', DOCTOR: '医生修改', AI: 'AI 补充' }
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
    .filter((item) => item.field === field)).flatMap(({ annotation: item }) => item ? [{
      start: item.start!, text: item.text,
      label: `${sourceNames[item.source]}${item.label ? ` · ${item.label}` : ''}${item.confirmed ? ' · 已保存确认' : ''}`,
      description: annotationDescription(item) || undefined,
      tone: item.kind === 'CONFLICT' ? 'conflict' as const : item.kind === 'IMPORTANT' ? 'important' as const
        : item.kind === 'VARIABLE' ? 'variable' as const : 'source' as const,
    }] : [])
  return <AnnotatedTextarea {...props} value={value} annotations={marks} showAnnotations={showAnnotations}
    onValueChange={onValueChange} />
}
