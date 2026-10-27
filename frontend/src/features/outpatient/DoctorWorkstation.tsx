import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import type { ClinicalContext } from "../../shared/clinical/workContext";
import type { ReceptionLocateMatch, ReceptionQueueItem, ReceptionQueueScope } from "../../shared/api/schedulingApi";
import type { Encounter, Resident } from "../../shared/model";
import { errorMessage, type RhnApi } from "../../shared/rhnApi";
import { Alert, Button, Icon, LoadingState, PageHeader } from "../../shared/ui";
import './waiting/waitingWorkspace.css'
import '../../styles/features/outpatient-doctor.css'
import '../../styles/doctor-ai-assistant.css'
import './templates/outpatient-plan-templates.css'
import { DedicatedWaitingWorkspace } from "./waiting/DedicatedWaitingWorkspace";
import { LocateChoiceDialog, OutOfTurnDialog, TakeoverDialog } from "./waiting/LocateDialogs";
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
  // 小型门诊可关闭排队叫号：读取失败时按启用处理，保持原有叫号流程。
  const queueSettings = useQuery({
    queryKey: ['reception-queue-settings', clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: () => api.scheduling.queueSettings(),
    enabled: Boolean(api.scheduling.queueSettings),
    retry: false,
  })
  const callingEnabled = queueSettings.data?.callingEnabled ?? true
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

  // 搜索提交后才加载全部可见范围（本机构）的队列，不受当前视角限制。
  const [searchTerm, setSearchTerm] = useState('')
  const searchQueue = useQuery({
    queryKey: ['outpatient-reception-queue', businessDate(), clinicalContext.department.id, 'SEARCH'],
    queryFn: () => api.scheduling.receptionQueue(businessDate(), undefined, 'ORGANIZATION'),
    enabled: Boolean(searchTerm),
  })
  const searchItems = useMemo(() => enhanceQueueList((searchQueue.data ?? []).filter((item) =>
    ['WAITING', 'CALLED', 'SERVING', 'SUSPENDED', 'MISSED', 'COMPLETED'].includes(item.status))), [searchQueue.data])

  // 读卡、扫码等精确识别：由后端判定有效就诊及建议动作，这里按动作分发。
  const [notice, setNotice] = useState('')
  const [choice, setChoice] = useState<{ resident: Resident; matches: ReceptionLocateMatch[] } | null>(null)
  const [outOfTurn, setOutOfTurn] = useState<ReceptionLocateMatch | null>(null)
  const [takeover, setTakeover] = useState<ReceptionLocateMatch | null>(null)
  const takeoverMutation = useMutation({
    mutationFn: ({ match, reason }: { match: ReceptionLocateMatch; reason: string }) =>
      api.encounters.takeover(match.item.encounterId, {
        commandCode: commandCode('TAKEOVER', match.item.encounterId), reason, terminalCode: 'WEB-DOCTOR-WORKSTATION',
      }).then(() => match),
    onSuccess: (match) => { setTakeover(null); void refreshQueue(); openPatient.mutate({ item: match.item, entryIntent: 'EDIT' }) },
  })
  const startMatch = async (match: ReceptionLocateMatch) => {
    // 已过号的患者先回队，再进入接诊
    if (match.item.status === 'MISSED') await handleQueueAction(match.item as EnhancedQueueItem, 'requeue')
    openPatient.mutate({ item: match.item, entryIntent: 'EDIT' })
  }
  const actOnMatch = (match: ReceptionLocateMatch) => {
    setChoice(null)
    if (match.action === 'ENTER') {
      if (match.outOfTurn) setOutOfTurn(match); else void startMatch(match)
    } else if (match.action === 'CONFIRM_TAKEOVER') setTakeover(match)
    else if (match.item.status === 'COMPLETED') openPatient.mutate({ item: match.item, entryIntent: 'READ' })
    else setNotice(match.reason ?? '该就诊只能查看')
  }
  const locateResident = useMutation({
    mutationFn: (resident: Resident) => api.scheduling.locate(resident.id).then((view) => ({ resident, view })),
    onSuccess: ({ resident, view }) => {
      setNotice('')
      if (view.matches.length === 0) {
        setNotice(`${resident.fullName} 在本机构没有有效的就诊记录，可使用“直接接诊”或先挂号。`)
      } else if (view.matches.length === 1) actOnMatch(view.matches[0])
      else setChoice({ resident, matches: view.matches })
    },
  })
  // 列表里点击接诊：他人接诊或暂挂的患者先经后端判定，避免悄然抢占他人的接诊。
  const enterItem = useMutation({
    mutationFn: async (item: ReceptionQueueItem | EnhancedQueueItem) => {
      setNotice('')
      if (item.departmentId && item.departmentId !== clinicalContext.department.id) {
        setNotice(`${item.residentName} 的挂号属于${item.departmentName ?? '其他科室'}，只能查看。`)
        return
      }
      if (['SERVING', 'SUSPENDED'].includes(item.status) && api.scheduling.locate) {
        const view = await api.scheduling.locate(item.residentId)
        const match = view.matches.find((value) => value.item.registrationId === item.registrationId)
        if (match && match.action !== 'ENTER') { actOnMatch(match); return }
      }
      openPatient.mutate({ item, entryIntent: 'EDIT' })
    },
  })

  const refreshInbox = () => queryClient.invalidateQueries({ queryKey: ['outpatient-referral-inbox'] })

  const enhancedItems = useMemo(() => enhanceQueueList((queue.data ?? []).filter((item) =>
    ['WAITING', 'CALLED', 'SERVING', 'SUSPENDED', 'MISSED', 'COMPLETED'].includes(item.status))), [queue.data])

  const handleQueueAction = (item: EnhancedQueueItem, action: QueueCommand) =>
    queueAction.mutateAsync({ item, action })

  if (selected) return <PatientWorkspace key={selected.encounterId ?? selected.resident.id} resident={selected.resident} encounterId={selected.encounterId}
    entryIntent={selected.entryIntent} api={api}
    clinicalContext={clinicalContext} canEdit={canEdit} onBack={() => setSelected(null)} onQueueRefresh={refreshQueue}
    enhancedQueueItems={enhancedItems}
    callingEnabled={callingEnabled}
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
    {notice && <Alert tone="info" className="ui-page-feedback">{notice}</Alert>}
    {choice && <LocateChoiceDialog residentName={choice.resident.fullName} matches={choice.matches}
      onChoose={actOnMatch} onClose={() => setChoice(null)} />}
    {outOfTurn && <OutOfTurnDialog match={outOfTurn} onClose={() => setOutOfTurn(null)}
      onConfirm={() => { const match = outOfTurn; setOutOfTurn(null); void startMatch(match) }} />}
    {takeover && <TakeoverDialog match={takeover} busy={takeoverMutation.isPending} error={takeoverMutation.error}
      onClose={() => setTakeover(null)}
      onViewOnly={() => { const match = takeover; setTakeover(null); openPatient.mutate({ item: match.item, entryIntent: 'READ' }) }}
      onConfirm={(reason) => takeoverMutation.mutate({ match: takeover, reason })} />}
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
        api={api}
        callingEnabled={callingEnabled}
        busy={openPatient.isPending || queueAction.isPending || queue.isFetching || enterItem.isPending || locateResident.isPending}
        activeItemKey={
          openPatient.isPending
            ? (openPatient.variables?.item.registrationId ?? openPatient.variables?.item.encounterId)
            : queueAction.isPending
              ? (queueAction.variables?.item.registrationId ?? queueAction.variables?.item.encounterId)
              : null
        }
        searchItems={searchItems}
        searchLoading={searchQueue.isFetching}
        onSearchChange={setSearchTerm}
        onLocateResident={(resident) => locateResident.mutate(resident)}
        onEnter={(item) => enterItem.mutate(item)}
        onView={(item) => openPatient.mutate({ item, entryIntent: 'READ' })}
        onRefresh={() => void queue.refetch()}
        onCallItem={(item) => handleQueueAction(item, item.status === 'CALLED' ? 'recall' : 'call')}
        onMissItem={(item) => handleQueueAction(item, 'miss')}
        onRequeueItem={(item) => handleQueueAction(item, 'requeue')}
      />
    )}
  </>
}
