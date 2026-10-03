import type { OutpatientNoteTemplateContent } from '../../../shared/api/outpatientNoteTemplatesApi'

/** One writing projection for compilation and library detail. Explicitly cleared fields stay empty. */
export function planNoteContent(content: OutpatientNoteTemplateContent = {},
  items: Array<{ kind: string; text: string; details?: string }> = []): OutpatientNoteTemplateContent {
  return { ...content,
    healthEducation: content.healthEducation ?? items.filter((item) => item.kind === 'EDUCATION').map((item) => item.details || item.text).join('\n'),
    followUp: content.followUp ?? items.filter((item) => item.kind === 'FOLLOW_UP').map((item) => item.details || item.text).join('\n'),
  }
}
