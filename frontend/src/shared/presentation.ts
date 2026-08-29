import type { Encounter } from './model'

export type SemanticTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral'

export interface StatusPresentation {
  label: string
  tone: SemanticTone
}

const encounterStatuses: Record<Encounter['status'], StatusPresentation> = {
  REGISTERED: { label: '已挂号', tone: 'warning' },
  IN_PROGRESS: { label: '接诊中', tone: 'info' },
  COMPLETED: { label: '已完成', tone: 'success' },
  CANCELLED: { label: '已取消', tone: 'neutral' },
}

const timelineEventLabels: Record<string, string> = {
  OUTPATIENT_REGISTERED: '挂号',
  ENCOUNTER_STARTED: '接诊',
  VITAL_SIGNS_RECORDED: '生命体征',
  DIAGNOSIS_RECORDED: '诊断',
  ENCOUNTER_COMPLETED: '完成就诊',
  RESIDENT_MERGED: '居民合并',
  RESIDENT_SPLIT: '撤销合并',
  CLINICAL_DOCUMENT_SIGNED: '文档签署',
  CLINICAL_DOCUMENT_ARCHIVED: '文档归档',
}

export function encounterStatusPresentation(status: Encounter['status']) {
  return encounterStatuses[status]
}

export function timelineEventLabel(eventType: string) {
  return timelineEventLabels[eventType] ?? eventType
}
