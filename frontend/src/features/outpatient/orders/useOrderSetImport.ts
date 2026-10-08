import { useEffect, useRef, useState } from 'react'
import type { ItemGroup } from '../../../shared/api/masterDataApi'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/api/httpClient'
import { resolveOrderSetImport } from './orderSetImport'

type Selection = Pick<ItemGroup, 'id' | 'revision' | 'code' | 'groupType'>
export function useOrderSetImport({ encounter, api, busy, readOnly, onResolved }: {
  encounter: Pick<Encounter, 'id' | 'residentId' | 'organizationId' | 'departmentId'>
  api: RhnApi; busy: boolean; readOnly: boolean
  onResolved: (result: Awaited<ReturnType<typeof resolveOrderSetImport>>) => void
}) {
  const generation = useRef(0), inFlight = useRef(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<{ selection: Selection; message: string }>()
  const latest = useRef({ encounter, api, busy, readOnly, onResolved })
  latest.current = { encounter, api, busy, readOnly, onResolved }
  useEffect(() => {
    generation.current += 1; inFlight.current = false
    setPending(false); setFailure(undefined)
    return () => { generation.current += 1; inFlight.current = false }
  }, [encounter.id, encounter.residentId, encounter.organizationId, encounter.departmentId, api, busy, readOnly])
  function cancel() {
    generation.current += 1; inFlight.current = false
    setPending(false); setFailure(undefined)
  }
  async function start(value: Selection) {
    if (latest.current.busy || latest.current.readOnly || inFlight.current) return
    const selection = { id: value.id, code: value.code, revision: value.revision, groupType: value.groupType }
    const captured = { ...latest.current.encounter }, capturedApi = latest.current.api
    const current = ++generation.current
    inFlight.current = true; setPending(true); setFailure(undefined)
    const stillCurrent = () => current === generation.current && capturedApi === latest.current.api
      && !latest.current.busy && !latest.current.readOnly
      && captured.id === latest.current.encounter.id && captured.residentId === latest.current.encounter.residentId
      && captured.organizationId === latest.current.encounter.organizationId && captured.departmentId === latest.current.encounter.departmentId
    try {
      const resolved = await resolveOrderSetImport(selection, captured, capturedApi)
      if (stillCurrent()) latest.current.onResolved(resolved)
    } catch (error) {
      if (stillCurrent()) setFailure({ selection, message: `组套未导入：${errorMessage(error)}` })
    } finally {
      if (current === generation.current) { inFlight.current = false; setPending(false) }
    }
  }
  return { pending, error: failure?.message, start, cancel,
    retry: () => { if (failure) void start(failure.selection) } }
}
