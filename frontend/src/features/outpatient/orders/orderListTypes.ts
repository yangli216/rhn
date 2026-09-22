export interface EditingOrderDraft {
  kind: 'medication' | 'service'
  id: string
}

export type GroupingComposerTarget = { type: 'saved' | 'draft'; index: number } | null

export interface HerbalComposerFormula {
  herbalDoseCount: number | ''
  herbalMethod: string
  frequencyCode: string
  instruction: string
}
