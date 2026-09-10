import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { Encounter } from '../../../shared/model'
import type { Prescription } from '../../../shared/api/encountersApi'
import type { AllergyIntolerance } from '../../../shared/api/residentsApi'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import { Alert, Button, FormField } from '../../../shared/ui'
import type { MedicationPlanDraft } from '../PrescriptionListEditor'

export function historicalMedicationDrafts(prescriptions: Prescription[], selectedIds: string[],
  allergyOverrideReason = ''): MedicationPlanDraft[] {
  const seen = new Set<string>()
  return prescriptions.filter((rx) => rx.status === 'ACTIVE' && ['WESTERN', 'CHINESE_PATENT'].includes(rx.categoryCode))
    .flatMap((rx) => rx.medicationRequests.filter((item) => item.status === 'ACTIVE' && selectedIds.includes(item.id)
      && !item.antimicrobial && !item.skinTestRequired && item.routeExecutionType !== 'INFUSION')
      .flatMap((item): MedicationPlanDraft[] => {
        const key = [item.medicationId, item.catalogItemId, item.routeCode, item.frequencyCode].join('|')
        if (seen.has(key)) return []
        seen.add(key)
        return [{ id: crypto.randomUUID(), editorMode: 'regular', categoryCode: rx.categoryCode,
          medicationName: item.medicationName, medicationCode: item.medicationCode, productName: item.itemName,
          preparationSpec: item.preparationSpec, routeName: item.routeName, routeExecutionType: item.routeExecutionType,
          request: { medicationId: item.medicationId, catalogItemId: item.catalogItemId, packageId: item.packageId,
            doseValue: item.doseValue, doseUnit: item.doseUnit, routeCode: item.routeCode, frequencyCode: item.frequencyCode,
            durationValue: item.durationValue, durationUnit: item.durationUnit, quantity: item.quantity,
            quantityUnit: item.quantityUnit, medicationInstruction: item.medicationInstruction,
            substitutionAllowed: false, selfProvided: false, allergyReviewConfirmed: true,
            allergyOverrideReason: allergyOverrideReason.trim() || undefined,
            reason: `历史处方续方参考：${rx.prescriptionNo}` } }]
      }))
}

export function HistoryPrescriptionReference({ encounter, api, disabled, allergies, allergyReady, onStage }: {
  encounter: Encounter; api: RhnApi; disabled: boolean; allergies: AllergyIntolerance[]; allergyReady: boolean
  onStage: (drafts: MedicationPlanDraft[]) => void
}) {
  const prescriptions = useQuery({ queryKey: ['doctor-prescriptions', encounter.id],
    queryFn: () => api.encounters.prescriptions(encounter.id) })
  const [selected, setSelected] = useState<string[]>([])
  const [reviewed, setReviewed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const allergyKey = JSON.stringify(allergies)
  useEffect(() => { setReviewed(false) }, [allergyKey, allergyReady])
  const activeAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY')
  const eligible = encounter.status === 'COMPLETED' && Date.parse(encounter.registeredAt) >= Date.now() - 90 * 86_400_000
    && Date.parse(encounter.registeredAt) <= Date.now()
  const drafts = historicalMedicationDrafts(prescriptions.data ?? [], selected, overrideReason)
  return <section className="doctor-history-prescriptions" aria-label="历史处方参考">
    <h4>历史处方参考 / 续方</h4>
    <p>历史用药不代表目前仍在服用。勾选后核对适应证、控制情况、过敏、剂量与疗程，再加入待开立医嘱。</p>
    {prescriptions.isPending && <p>正在加载历史处方…</p>}
    {prescriptions.error && <Alert>{errorMessage(prescriptions.error)}<Button variant="text" onClick={() => void prescriptions.refetch()}>重试</Button></Alert>}
    {prescriptions.data?.length === 0 && <p>本次历史就诊无处方记录。</p>}
    {prescriptions.data?.map((rx) => <div key={rx.id}><strong>{rx.prescriptionNo} · {rx.status === 'ACTIVE' ? '已开立' : '不可续方'}</strong>
      {rx.medicationRequests.map((item) => {
        const selectable = historicalMedicationDrafts([rx], [item.id]).length > 0
        return <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)}
          disabled={disabled || !eligible || !selectable || !allergyReady}
          onChange={() => { setSelected((value) => value.includes(item.id) ? value.filter((id) => id !== item.id) : [...value, item.id]); setReviewed(false) }} />
          <span>{item.medicationName} · {item.preparationSpec} · {item.doseValue ?? '剂量待核对'}{item.doseUnit} · {item.routeName || item.routeCode} · {item.frequencyName || item.frequencyCode}
            {item.durationValue ? ` · ${item.durationValue}${item.durationUnit || '天'}` : ''} · 数量 {item.quantity}{item.quantityUnit}
            {!selectable && <small> · 请在医嘱区重新评估开立</small>}</span></label>
      })}</div>)}
    {!eligible && <p>仅支持近90天已完成就诊的处方生成续方草稿。</p>}
    {activeAllergies.length > 0 && <p>当前过敏记录：{activeAllergies.map((item) => item.substanceDisplay).join('、')}</p>}
    {activeAllergies.length > 0 && <FormField label="存在过敏记录时的续方核对说明"><input value={overrideReason}
      onChange={(event) => { setOverrideReason(event.target.value); setReviewed(false) }} /></FormField>}
    <label><input type="checkbox" checked={reviewed} disabled={disabled || !allergyReady || !drafts.length}
      onChange={(event) => setReviewed(event.target.checked)} />已核对当前病情、历史用法及患者过敏和药品风险</label>
    <Button size="sm" variant="secondary" disabled={disabled || !eligible || !allergyReady || !reviewed || !drafts.length
      || (activeAllergies.length > 0 && !overrideReason.trim())} onClick={() => onStage(drafts)}>
      将所选 {drafts.length} 项加入续方草稿</Button>
  </section>
}
