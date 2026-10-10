import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ClinicalContext } from "../../shared/clinical/workContext";
import type { ReceptionQueueItem, ReceptionQueueScope } from "../../shared/api/schedulingApi";
import type { Encounter } from "../../shared/model";
import { errorMessage, type RhnApi } from "../../shared/rhnApi";
import { Alert, Button, Icon, LoadingState, PageHeader } from "../../shared/ui";
import './waiting/waitingWorkspace.css'
import '../../styles/features/outpatient-doctor.css'
import '../../styles/doctor-ai-assistant.css'
import './templates/outpatient-plan-templates.css'
import { DedicatedWaitingWorkspace } from "./waiting/DedicatedWaitingWorkspace";
import { enhanceQueueList } from "./waiting/queueDataEnhancer";
import type { EnhancedQueueItem } from "./waiting/queueTypes";
import { type PatientSelection, businessDate, type QueueCommand, commandCode } from './workstation/workstationShared'
import { PatientWorkspace } from './workstation/PatientWorkspace'
import { ReferralInboxPanel } from './referrals/ReferralCoordination'
export { type EncounterDraftState } from './workstation/workstationShared'
export { draftStateLabels } from './workstation/workstationShared'
export { QueueRow } from './workstation/workstationShared'
export { AllergySafetyPanel } from './record/AllergySafetyPanel'
export { printPurposeLabel } from './printing/EncounterPrintPanel'
export { prescriptionCategoryLabel } from './printing/EncounterPrintPanel'
export { BatchPrintDialog } from './printing/EncounterPrintPanel'

export { mergeNoteTemplateContent, type NoteTemplateField } from './record/NoteTemplateBar'

export { createRecordSchema, diagnosisDraftSignature, moveDiagnosis, normalizeDiagnosisOrder,
  structuredFormSignature, validateStructuredForm } from './record/clinicalRecordDraft'

export { draftToBatchItem, persistOrderDrafts } from './orders/persistOrderDrafts'

const DirectVisitDialog = lazy(() => import('./DirectVisitDialog')
  .then((module) => ({ default: module.DirectVisitDialog })))

export function DoctorWorkstation({ api, clinicalContext, canEdit }: {
  api: RhnApi; clinicalContext: ClinicalContext; canEdit: boolean
}) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const linkedResidentId = params.get('residentId')
  const linkedEncounterId = params.get('encounterId')
  const [selected, setSelected] = useState<PatientSelection | null>(null)
  const [peekDrawerOpen, setPeekDrawerOpen] = useState(false)
  const [directVisitOpen, setDirectVisitOpen] = useState(false)
  const directVisitSettings = useQuery({
    queryKey: ['direct-visit-settings', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: () => api.encounters.directVisitSettings(),
    enabled: canEdit && Boolean(api.encounters.directVisitSettings),
  })
  const [queueScope, setQueueScope] = useState<ReceptionQueueScope>('PERSONAL')
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['outpatient-reception-queue', businessDate(), clinicalContext.department.id, queueScope],
    queryFn: () => api.scheduling.receptionQueue(businessDate(), undefined, queueScope),
    placeholderData: keepPreviousData,
  })
  const referralInbox = useQuery({
    queryKey: ['outpatient-referral-inbox', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: () => api.outpatientReferrals.inbox(),
  })
  const linkedResident = useQuery({
    queryKey: ['doctor-workstation-resident', linkedResidentId],
    queryFn: () => api.residents.get(linkedResidentId!),
    enabled: Boolean(linkedResidentId),
  })
  useEffect(() => {
    if (linkedResident.data) setSelected({ resident: linkedResident.data, encounterId: linkedEncounterId, entryIntent: 'READ' })
  }, [linkedEncounterId, linkedResident.data])
  const openPatient = useMutation({
    mutationFn: async ({ item, entryIntent }: { item: ReceptionQueueItem | EnhancedQueueItem; entryIntent: 'READ' | 'EDIT' }) => ({
      resident: await api.residents.get(item.residentId), item, entryIntent,
    }),
    onSuccess: ({ resident, item, entryIntent }) => setSelected({ resident, encounterId: item.encounterId, entryIntent }),
  })
  const queueAction = useMutation({
    mutationFn: ({ item, action }: { item: ReceptionQueueItem | EnhancedQueueItem; action: QueueCommand }) => {
      if (!item.ticketId) throw new Error('当前候诊记录缺少统一号票标识，请刷新后重试')
      return api.queueing.action(item.ticketId, action, {
        commandCode: commandCode(`QUEUE-${action.toUpperCase()}`, item.encounterId),
        description: {
          call: '门诊医生呼叫患者',
          recall: '门诊医生重新呼叫患者',
          miss: '患者未到并标记过号',
          requeue: '过号患者到达后重新排队',
        }[action],
      })
    },
    onSuccess: () => refreshQueue(),
  })

  const refreshQueue = () => queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] })
  const refreshInbox = () => queryClient.invalidateQueries({ queryKey: ['outpatient-referral-inbox'] })

  const rawQueue = (queue.data ?? []).filter((item) =>
    ['WAITING', 'CALLED', 'SERVING', 'SUSPENDED', 'MISSED', 'COMPLETED'].includes(item.status))
  const enhancedItems = useMemo(() => {
    return enhanceQueueList(rawQueue)
  }, [rawQueue])

  const handleQueueAction = (item: EnhancedQueueItem, action: QueueCommand) =>
    queueAction.mutateAsync({ item, action })

  if (selected) return <PatientWorkspace resident={selected.resident} encounterId={selected.encounterId}
    entryIntent={selected.entryIntent} api={api}
    clinicalContext={clinicalContext} canEdit={canEdit} onBack={() => setSelected(null)} onQueueRefresh={refreshQueue}
    enhancedQueueItems={enhancedItems}
    onSwitchPatient={(targetItem) => openPatient.mutate({ item: targetItem, entryIntent: 'EDIT' })}
    onQueueAction={handleQueueAction}
    peekDrawerOpen={peekDrawerOpen}
    setPeekDrawerOpen={setPeekDrawerOpen} />

  return <>
    <PageHeader compact eyebrow="门诊医疗 · 医生工作区" title="门诊医生站"
      description="门诊候诊、叫号调度与接诊状态协同工作台。"
      actions={<>
        <Button variant="secondary" onClick={() => navigate('/outpatient/plan-templates')}>
          <Icon name="sparkles" />临床模板库
        </Button>
        {canEdit && directVisitSettings.data?.enabled && (
          <Button onClick={() => setDirectVisitOpen(true)}><Icon name="add" />直接接诊</Button>
        )}
      </>} />
    {directVisitSettings.error && <Alert>{errorMessage(directVisitSettings.error)}</Alert>}
    {directVisitOpen && (
      <Suspense fallback={null}>
        <DirectVisitDialog api={api} hasServiceFee={Boolean(directVisitSettings.data?.catalogItemId)}
          onClose={() => setDirectVisitOpen(false)} onReceived={(resident, encounter) => {
            queryClient.setQueryData<Encounter[]>(['doctor-encounters', resident.id], values =>
              [encounter, ...(values ?? []).filter(value => value.id !== encounter.id)])
            void refreshQueue()
            setDirectVisitOpen(false)
            setSelected({ resident, encounterId: encounter.id, entryIntent: 'EDIT' })
          }} />
      </Suspense>
    )}
    {(queue.error || referralInbox.error || openPatient.error || linkedResident.error || queueAction.error) && <Alert className="ui-page-feedback">
      {errorMessage(queue.error || referralInbox.error || openPatient.error || linkedResident.error || queueAction.error)}</Alert>}

    <ReferralInboxPanel requests={referralInbox.data ?? []} loading={referralInbox.isPending}
      api={api} onRefresh={async () => { await Promise.all([refreshInbox(), refreshQueue()]) }} />

    {(!queue.data && queue.isPending) || (Boolean(linkedResidentId) && linkedResident.isPending) ? (
      <LoadingState label="正在加载候诊队列…" />
    ) : (
      <DedicatedWaitingWorkspace
        items={enhancedItems}
        queueScope={queueScope}
        onQueueScopeChange={setQueueScope}
        clinicalContext={clinicalContext}
        canEdit={canEdit}
        busy={openPatient.isPending || queueAction.isPending || queue.isFetching}
        onEnter={(item) => openPatient.mutate({ item, entryIntent: 'EDIT' })}
        onView={(item) => openPatient.mutate({ item, entryIntent: 'READ' })}
        onRefresh={() => void queue.refetch()}
        onCallItem={(item) => handleQueueAction(item, item.status === 'CALLED' ? 'recall' : 'call')}
        onMissItem={(item) => handleQueueAction(item, 'miss')}
        onRequeueItem={(item) => handleQueueAction(item, 'requeue')}
      />
    )}
  </>
}
