import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { ClinicalDocument, ClinicalDocumentVersion } from '../../../shared/api/clinicalDocumentsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { diffText, hasChanges, type DiffSegment } from './recordDiff'

/** Narrative fields shown by the reading view, in the order they appear in the note. */
export const traceableRecordFields = [
  ['chiefComplaint', '主诉'], ['presentIllness', '现病史'], ['medicalHistory', '既往史'], ['physicalExam', '查体所见'],
  ['auxiliaryExaminations', '辅助检查结果'], ['healthEducation', '健康宣教'], ['followUp', '随访复诊'],
] as const
export type TraceableRecordField = (typeof traceableRecordFields)[number][0]
export type RecordChanges = Partial<Record<TraceableRecordField, DiffSegment[]>>

/** Signed amendments, newest first. Unsigned amendments are still being written and are not traced. */
export function signedAmendments(history: ClinicalDocumentVersion[] | undefined) {
  return (history ?? []).filter((item) => item.changeType === 'AMENDMENT' && item.signedAt)
    .sort((left, right) => right.version - left.version)
}

/** The signed version an amendment replaced: the closest earlier version that was signed. */
export function replacedVersion(history: ClinicalDocumentVersion[], version: number) {
  return history.filter((item) => item.version < version && item.signedAt)
    .sort((left, right) => right.version - left.version)[0]
}

const text = (content: Record<string, unknown> | undefined, field: string) =>
  typeof content?.[field] === 'string' ? content[field] as string : ''

export function useRecordChangeTrace(api: RhnApi, document: ClinicalDocument | undefined, enabled: boolean) {
  const amendments = useMemo(() => signedAmendments(document?.history), [document?.history])
  const [picked, setPicked] = useState<number | null>(null)
  const selected = amendments.find((item) => item.version === picked) ?? amendments[0]
  const base = selected && document ? replacedVersion(document.history, selected.version) : undefined
  const active = enabled && Boolean(document && selected && base)
  const after = useQuery({
    queryKey: ['doctor-document-version', document?.id, selected?.version],
    queryFn: () => api.clinicalDocuments.version(document!.id, selected!.version), enabled: active,
  })
  const before = useQuery({
    queryKey: ['doctor-document-version', document?.id, base?.version],
    queryFn: () => api.clinicalDocuments.version(document!.id, base!.version), enabled: active,
  })
  const changes = useMemo<RecordChanges>(() => {
    if (!after.data || !before.data) return {}
    const result: RecordChanges = {}
    for (const [field] of traceableRecordFields) {
      const segments = diffText(text(before.data.content, field), text(after.data.content, field))
      if (hasChanges(segments)) result[field] = segments
    }
    return result
  }, [after.data, before.data])
  return {
    amendments, selected, base, changes, setPicked,
    loading: active && (after.isPending || before.isPending),
    error: after.error ?? before.error,
    ready: active && Boolean(after.data && before.data),
  }
}
