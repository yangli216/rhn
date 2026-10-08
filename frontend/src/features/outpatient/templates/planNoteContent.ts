import type { OutpatientNoteTemplateContent } from '../../../shared/api/outpatientNoteTemplatesApi'

/** One writing projection for compilation and library detail. Explicitly cleared fields stay empty. */
export function planNoteContent(content: OutpatientNoteTemplateContent = {},
  items?: Array<{ kind: string; text: string; details?: string }> | null): OutpatientNoteTemplateContent {
  const safeItems = items ?? []
  return { ...content,
    healthEducation: content.healthEducation ?? safeItems.filter((item) => item.kind === 'EDUCATION').map((item) => item.details || item.text).join('\n'),
    followUp: content.followUp ?? safeItems.filter((item) => item.kind === 'FOLLOW_UP').map((item) => item.details || item.text).join('\n'),
  }
}
