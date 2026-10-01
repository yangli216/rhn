import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/api'
import type { DiagnosisInput } from '../../../shared/api/encountersApi'
import type { MedicationPlanDraft } from '../orders/medicationDraft'
import type { ServicePlanDraft } from '../orders/orderDraftTypes'
import { Alert } from '../../../shared/ui'

/** Read-only projection of the same diagnosis/order sources used by the workbench. */
export function ClinicalRecordReferences({ api, encounterId, diagnoses, medicationDrafts, serviceDrafts }: {
  api: RhnApi
  encounterId: string
  diagnoses: DiagnosisInput[]
  medicationDrafts: MedicationPlanDraft[]
  serviceDrafts: ServicePlanDraft[]
}) {
  const medications = useQuery({ queryKey: ['doctor-medications', encounterId],
    queryFn: () => api.encounters.medicationRequests(encounterId) })
  const services = useQuery({ queryKey: ['doctor-services', encounterId],
    queryFn: () => api.encounters.serviceRequests(encounterId) })
  const savedMedications = medications.data?.filter((item) => item.status !== 'CANCELLED') ?? []
  const savedServices = services.data?.filter((item) => item.status !== 'CANCELLED') ?? []
  return <div className="doctor-record-read doctor-record-references" aria-label="诊断与诊疗计划只读引用">
    <div className="doctor-record-read__body">
      <section><h3>诊断（引用）</h3>
        <p>{diagnoses.map((item) => `${item.display} [${item.code}]`).join('；') || '暂无诊断，请在诊断工作区维护'}</p>
      </section>
      <section><h3>诊疗计划（医嘱引用）</h3>
        {(medications.error || services.error) && <Alert tone="warning">医嘱引用加载失败，请在医嘱工作区核对。</Alert>}
        {(medications.isPending || services.isPending) && <p>正在加载已保存医嘱…</p>}
        {savedMedications.map((item) => <p key={`med-${item.id}`}>
          {item.medicationName} · 每次 {item.doseValue}{item.doseUnit} · {item.routeCode} · {item.frequencyCode}
          {item.status === 'DRAFT' ? '（已保存草稿）' : '（已开立）'}
        </p>)}
        {savedServices.map((item) => <p key={`service-${item.id}`}>{item.itemName}（已开立）</p>)}
        {medicationDrafts.map((item) => <p key={`draft-med-${item.id}`}>
          {item.medicationName} · 每次 {item.request.doseValue}{item.request.doseUnit} · {item.request.routeCode} · {item.request.frequencyCode}（待保存草稿）
        </p>)}
        {serviceDrafts.map((item) => <p key={`draft-service-${item.id}`}>{item.itemName}（待保存草稿）</p>)}
        {!medications.isPending && !services.isPending && !medications.error && !services.error
          && !savedMedications.length && !savedServices.length && !medicationDrafts.length && !serviceDrafts.length
          && <p>暂无医嘱，请在医嘱工作区维护</p>}
      </section>
    </div>
  </div>
}
