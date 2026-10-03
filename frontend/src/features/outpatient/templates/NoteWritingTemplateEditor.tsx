import type { OutpatientNoteTemplateContent } from '../../../shared/api/outpatientNoteTemplatesApi'
import { FormField } from '../../../shared/ui'
import { noteTemplateFields } from '../record/NoteTemplateBar'
import { AnnotatedRecordField } from '../record/AnnotatedRecordField'
import { rebaseAnnotations } from '../record/recordAnnotations'

export function NoteWritingTemplateEditor({ content, onChange, disabled = false }: {
  disabled?: boolean
  content: OutpatientNoteTemplateContent
  onChange: (content: OutpatientNoteTemplateContent) => void
}) {
  return <section className="ai-plan-review-group" aria-label="配套病历书写模板">
    <div className="ai-plan-note-writing-grid">
      {noteTemplateFields.map(({ key, label }) => <FormField key={key} label={label} appearance="document">
        <AnnotatedRecordField field={key} showAnnotations={!disabled} annotations={content.annotations}
          disabled={disabled} rows={1} value={content[key] || ''} maxLength={key === 'chiefComplaint' ? 1000 : 4000}
          placeholder={['healthEducation', 'followUp'].includes(key) ? '填写可审核的宣教与随访建议' : key === 'physicalExam' ? '专科查体范文（含阴性指征，不含伪造体征数值）' : '填写常见临床范文（含阴性指征），医生微调即用'}
          onValueChange={(value) => onChange({ ...content, [key]: value,
            annotations: rebaseAnnotations(key, content[key] || '', value, content.annotations ?? []) })} />
      </FormField>)}
    </div>
  </section>
}
