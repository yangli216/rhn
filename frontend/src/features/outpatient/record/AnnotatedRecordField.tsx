import type { TextareaHTMLAttributes } from 'react'
import type { RecordAnnotation, RecordTextField } from '../../../shared/api/recordAnnotations'
import { AnnotatedTextarea } from '../../../shared/ui/AnnotatedTextarea'
import { annotationSegments, anchorAnnotations } from './recordAnnotations'

const sourceNames = { TEMPLATE: '模板预设', VOICE: '本次口述', CONTEXT: '已有资料', DOCTOR: '医生修改', AI: 'AI 补充' }
export function AnnotatedRecordField({ field, value = '', annotations = [], onValueChange, showAnnotations,
  ...props }: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  field: RecordTextField; value?: string; annotations?: RecordAnnotation[]; showAnnotations: boolean
  onValueChange: (value: string) => void
}) {
  const marks = annotationSegments(value, anchorAnnotations({ [field]: value }, annotations)
    .filter((item) => item.field === field)).flatMap(({ annotation: item }) => item ? [{
      start: item.start!, text: item.text,
      label: `${sourceNames[item.source]}${item.label ? ` · ${item.label}` : ''}${item.confirmed ? ' · 已保存确认' : ''}`,
      description: [item.reason, item.sourceQuote ? `原话：${item.sourceQuote}` : ''].filter(Boolean).join('\n'),
      tone: item.kind === 'CONFLICT' ? 'conflict' as const : item.kind === 'IMPORTANT' ? 'important' as const
        : item.kind === 'VARIABLE' ? 'variable' as const : 'source' as const,
    }] : [])
  return <AnnotatedTextarea {...props} value={value} annotations={marks} showAnnotations={showAnnotations}
    onValueChange={onValueChange} />
}
