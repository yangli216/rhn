import { useEffect, useRef } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import type { RecordForm } from './clinicalRecordDraft'
import { useClinicalDocumentSession } from './useClinicalDocumentSession'

export interface ClinicalDraftSession {
  assertCurrent: () => void
  assertUnchanged: () => void
  isCurrent: () => boolean
}

/** Preserve edits made during a save, including edits reverted before the response arrives. */
export function useClinicalDraftSession(api: object, identity: string, enabled: boolean,
  form: Pick<UseFormReturn<RecordForm>, 'getValues' | 'watch'>, relatedDrafts: unknown) {
  const captureContext = useClinicalDocumentSession(api, identity, enabled)
  const revision = useRef(0)
  const related = JSON.stringify(relatedDrafts)
  const previous = useRef(related)
  if (previous.current !== related) { previous.current = related; revision.current += 1 }
  const { getValues, watch } = form
  useEffect(() => {
    const subscription = watch(() => { revision.current += 1 })
    return () => subscription.unsubscribe()
  }, [watch])
  return (): ClinicalDraftSession => {
    const assertCurrent = captureContext()
    const capturedRevision = revision.current, capturedForm = JSON.stringify(getValues())
    return {
      assertCurrent,
      assertUnchanged: () => {
        assertCurrent()
        if (revision.current !== capturedRevision || JSON.stringify(getValues()) !== capturedForm
          || JSON.stringify(relatedDrafts) !== related) {
          throw new Error('草稿保存未确认：保存期间内容已变化。当前草稿已保留，后续操作已停止；此前提交可能已保存，请核实后重试')
        }
      },
      isCurrent: () => { try { assertCurrent(); return true } catch { return false } },
    }
  }
}
