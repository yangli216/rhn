import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Encounter } from '../../../shared/model'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import { Button, FormField } from '../../../shared/ui'
import type { MedicationPlanDraft } from '../PrescriptionListEditor'
import { historicalEncounterEligible, historicalMedicationSelectable, requireHistoricalPrescriptions,
  resolveHistoricalPrescriptionImport } from './historicalPrescriptionImport'

const apiScopes = new WeakMap<RhnApi, number>()
let nextApiScope = 0

export function HistoryPrescriptionReference({ encounter, targetEncounter, api, disabled, allergies, allergyReady, onStage }: {
  encounter: Encounter; targetEncounter: Encounter; api: RhnApi; disabled: boolean; allergies: AllergyIntolerance[]; allergyReady: boolean
  onStage: (drafts: MedicationPlanDraft[]) => void
}) {
  if (!apiScopes.has(api)) apiScopes.set(api, ++nextApiScope)
  const prescriptions = useQuery({ queryKey: ['history-prescription-reference', apiScopes.get(api), encounter.id, encounter.residentId],
    queryFn: async () => requireHistoricalPrescriptions(await api.encounters.prescriptions(encounter.id), encounter), retry: false })
  const [selected, setSelected] = useState<string[]>([])
  const [reviewed, setReviewed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState('')
  const generation = useRef(0), inFlight = useRef(false)
  const allergyKey = JSON.stringify(allergies)
  const contextKey = JSON.stringify([encounter.id, encounter.residentId, encounter.status, encounter.registeredAt,
    targetEncounter.id, targetEncounter.residentId, targetEncounter.organizationId, targetEncounter.departmentId,
    targetEncounter.status, disabled, allergyReady, allergyKey, apiScopes.get(api),
    prescriptions.dataUpdatedAt, prescriptions.isFetching, prescriptions.isError])
  const latest = useRef({ contextKey, onStage })
  latest.current = { contextKey, onStage }
  useEffect(() => {
    generation.current += 1; inFlight.current = false
    setReviewed(false); setPending(false); setFailure('')
    return () => { generation.current += 1; inFlight.current = false }
  }, [contextKey])
  useEffect(() => { setReviewed(false) }, [prescriptions.dataUpdatedAt])
  const activeAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY')
  const eligible = historicalEncounterEligible(encounter)
  const ready = prescriptions.isSuccess && !prescriptions.isFetching
  const blocked = disabled || !eligible || !allergyReady || !ready || pending
    || targetEncounter.status !== 'IN_PROGRESS' || targetEncounter.residentId !== encounter.residentId
  async function stage() {
    if (blocked || !reviewed || !selected.length || inFlight.current
      || (activeAllergies.length > 0 && !overrideReason.trim()) || !prescriptions.data) return
    const current = ++generation.current, capturedKey = contextKey
    const stillCurrent = () => current === generation.current && capturedKey === latest.current.contextKey
    inFlight.current = true; setPending(true); setFailure('')
    try {
      const drafts = await resolveHistoricalPrescriptionImport({ source: encounter, target: targetEncounter,
        viewed: prescriptions.data, selectedIds: selected, api, allergyOverrideReason: overrideReason })
      if (stillCurrent()) {
        latest.current.onStage(drafts)
        setSelected([]); setReviewed(false)
      }
    } catch (error) {
      if (stillCurrent()) setFailure(errorMessage(error))
    } finally {
      if (current === generation.current) { inFlight.current = false; setPending(false) }
    }
  }
  return <section className="doctor-history-prescriptions" aria-label="历史处方参考">
    <h4>历史处方参考 / 续方</h4>
    <p>历史用药不代表目前仍在服用。勾选后核对适应证、控制情况、过敏、剂量与疗程，再加入待开立医嘱。</p>
    {prescriptions.isPending && <p>正在加载历史处方…</p>}
    {prescriptions.error && <div role="alert">{errorMessage(prescriptions.error)}<Button variant="text" onClick={() => void prescriptions.refetch()}>重新加载历史处方</Button></div>}
    {failure && <div role="alert">{failure}<Button variant="text" disabled={pending} onClick={() => void prescriptions.refetch()}>重新加载历史处方</Button></div>}
    {pending && <p role="status">正在核对当前药品、包装、价格及库存…</p>}
    {prescriptions.data?.length === 0 && <p>本次历史就诊无处方记录。</p>}
    {prescriptions.data?.map((rx) => <div key={rx.id}><strong>{rx.prescriptionNo} · {rx.status === 'ACTIVE' ? '已开立' : '不可续方'}</strong>
      {rx.medicationRequests.map((item) => {
        const selectable = historicalMedicationSelectable(rx, item)
        return <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)}
          disabled={blocked || !selectable}
          onChange={() => { setSelected((value) => value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id]); setReviewed(false) }} />
          <span>{item.medicationName} · {item.preparationSpec} · {item.doseValue ?? '剂量待核对'}{item.doseUnit} · {item.routeName || item.routeCode} · {item.frequencyName || item.frequencyCode}
            {item.durationValue != null ? ` · ${item.durationValue}${item.durationUnit || '疗程单位待核对'}` : ''} · 数量 {item.quantity}{item.quantityUnit || '单位待核对'}
            {!selectable && <small> · 请在医嘱区重新评估开立</small>}</span></label>
      })}</div>)}
    {!eligible && <p>仅支持近90天已完成就诊的处方生成续方草稿。</p>}
    {activeAllergies.length > 0 && <p>当前过敏记录：{activeAllergies.map((item) => item.substanceDisplay).join('、')}</p>}
    {activeAllergies.length > 0 && <FormField label="存在过敏记录时的续方核对说明"><input value={overrideReason} disabled={blocked}
      onChange={(event) => { setOverrideReason(event.target.value); setReviewed(false) }} /></FormField>}
    <label><input type="checkbox" checked={reviewed} disabled={blocked || !selected.length}
      onChange={(event) => setReviewed(event.target.checked)} />已核对当前病情、历史用法及患者过敏和药品风险</label>
    <Button size="sm" variant="secondary" disabled={blocked || !reviewed || !selected.length
      || (activeAllergies.length > 0 && !overrideReason.trim())} onClick={() => void stage()}>
      将所选 {selected.length} 项加入续方草稿</Button>
  </section>
}
