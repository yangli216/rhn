import type { OutpatientNoteTemplateContent } from '../../../shared/api/outpatientNoteTemplatesApi'
import { FormField } from '../../../shared/ui'
import { noteTemplateFields } from '../record/NoteTemplateBar'

export function NoteWritingTemplateEditor({ content, onChange, disabled = false }: {
  disabled?: boolean
  content: OutpatientNoteTemplateContent
  onChange: (content: OutpatientNoteTemplateContent) => void
}) {
  return <section className="ai-plan-review-group" aria-label="配套病历书写模板">
    <div className="ai-plan-note-writing-grid">
      {noteTemplateFields.map(({ key, label }) => <FormField key={key} label={label} appearance="document">
        <textarea disabled={disabled} rows={1} value={content[key] || ''} maxLength={key === 'chiefComplaint' ? 1000 : 4000}
          placeholder={['healthEducation', 'followUp'].includes(key) ? '填写可审核的宣教与随访建议' : key === 'physicalExam' ? '专科查体范文（含阴性指征，不含伪造体征数值）' : '填写常见临床范文（含阴性指征），医生微调即用'}
          onChange={(event) => onChange({ ...content, [key]: event.target.value })} />
      </FormField>)}
    </div>
  </section>
}
