import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import type { Encounter } from '../../../shared/model'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import { Button, FormField, Icon } from '../../../shared/ui'
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
  const canRenew = !disabled && eligible && targetEncounter.status === 'IN_PROGRESS'
    && targetEncounter.residentId === encounter.residentId
    && Boolean(prescriptions.data?.some((rx) => rx.medicationRequests.some((item) => historicalMedicationSelectable(rx, item))))
  const ready = prescriptions.isSuccess && !prescriptions.isFetching
  const selectableIds = prescriptions.data?.flatMap(rx => rx.medicationRequests
    .filter(item => historicalMedicationSelectable(rx, item)).map(item => item.id)) ?? []
  const selectedCount = selectableIds.filter(id => selected.includes(id)).length
  const allSelected = selectableIds.length > 0 && selectedCount === selectableIds.length
  const unavailableReason = !eligible
    ? encounter.status !== 'COMPLETED' ? '历史就诊未完成，请在本次医嘱中重新评估开立。' : '仅支持近 90 天已完成就诊的处方续方。'
    : targetEncounter.status !== 'IN_PROGRESS' ? '本次就诊尚不可编辑医嘱。'
    : targetEncounter.residentId !== encounter.residentId ? '历史处方与当前患者不一致。' : ''
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
    <header className="doctor-history-prescriptions-head">
      <div className="doctor-history-group-title">
        {canRenew && <input type="checkbox" aria-label="选择全部可续方医嘱" checked={allSelected} disabled={blocked}
          ref={node => { if (node) node.indeterminate = selectedCount > 0 && !allSelected }}
          onChange={() => { setSelected(allSelected ? [] : selectableIds); setReviewed(false) }} />}
        <Icon name="pill" /><h3>历史医嘱 · 用药</h3>
      </div>
      <small>{canRenew ? `已选 ${selectedCount}/${selectableIds.length}`
        : `${prescriptions.data?.reduce((count, rx) => count + rx.medicationRequests.length, 0) ?? 0} 项`}</small>
    </header>
    <div className="doctor-history-prescriptions-body">
    <p>当次用药记录，不代表目前仍在服用。{canRenew && '勾选核对后带入本次医嘱草稿。'}</p>
    {prescriptions.isPending && <p>正在加载历史用药…</p>}
    {prescriptions.error && <div role="alert">{errorMessage(prescriptions.error)}<Button variant="text" onClick={() => void prescriptions.refetch()}>重新加载历史用药</Button></div>}
    {failure && <div role="alert">{failure}<Button variant="text" disabled={pending} onClick={() => void prescriptions.refetch()}>重新加载历史用药</Button></div>}
    {pending && <p role="status">正在核对本次可开立的药品…</p>}
    {prescriptions.data?.length === 0 && <p>此次就诊无用药记录。</p>}
    {prescriptions.data?.map((rx, index) => <div className="doctor-history-prescription" key={rx.id}>
      {rx.medicationRequests.map((item) => {
        const selectable = historicalMedicationSelectable(rx, item)
        const content = <span className="doctor-history-medication-content">
          <strong>{item.medicationName}{item.preparationSpec && <small>{item.preparationSpec}</small>}
            {prescriptions.data.length > 1 && <small>处方 {index + 1}</small>}</strong>
          <small>{item.doseValue == null ? '剂量待核对' : `每次 ${item.doseValue}${item.doseUnit}`}
            {' · '}{item.routeName || item.routeCode} · {item.frequencyName || item.frequencyCode}
            {item.durationValue != null ? ` · ${item.durationValue}${item.durationUnit || '疗程单位待核对'}` : ''}
            {' · '}总量 {item.quantity}{item.quantityUnit || '单位待核对'}</small>
          {!selectable && <small>此项不支持直接续方，请在本次医嘱中重新评估开立</small>}
        </span>
        return !disabled
          ? <label className="doctor-history-medication" key={item.id}><input type="checkbox" checked={selected.includes(item.id)}
              disabled={blocked || !selectable} aria-label={`选择历史医嘱 ${item.medicationName}`}
              title={unavailableReason || (!selectable ? '此项不支持直接续方' : undefined)}
              onChange={() => { setSelected((value) => value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id]); setReviewed(false) }} />
              {content}</label>
          : <article className="doctor-history-medication is-reference" key={item.id}>{content}</article>
      })}</div>)}
    {ready && prescriptions.data.length > 0 && !canRenew && <p>{unavailableReason || '仅供用药参考，需要开药时请在本次医嘱中重新评估。'}</p>}
    {canRenew && <div className="doctor-history-renewal-actions">
      {activeAllergies.length > 0 && <p>当前过敏记录：{activeAllergies.map((item) => item.substanceDisplay).join('、')}</p>}
      {activeAllergies.length > 0 && <FormField label="续方核对说明"><input value={overrideReason} disabled={blocked}
        onChange={(event) => { setOverrideReason(event.target.value); setReviewed(false) }} /></FormField>}
      <label><input type="checkbox" checked={reviewed} disabled={blocked || !selected.length}
        onChange={(event) => setReviewed(event.target.checked)} />已核对当前病情、用法及过敏风险</label>
      <Button size="sm" variant="secondary" disabled={blocked || !reviewed || !selected.length
        || (activeAllergies.length > 0 && !overrideReason.trim())} onClick={() => void stage()}>
        将所选 {selected.length} 项加入续方草稿</Button>
    </div>}
    </div>
  </section>
}
