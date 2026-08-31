import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { PersonnelAssignment } from '../../shared/api/organizationApi'
import type { PharmacyReviewResult, PrescriptionReviewMode, WardDelivery } from '../../shared/api/pharmacyApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'
import { WardDailySupplyPanel } from './WardDailySupplyPanel'
import { WardMedicationReturnInbox } from './WardMedicationReturnInbox'

const taskStatusText: Record<string, string> = {
  PENDING_REVIEW: '待审方', INTERVENTION: '待干预', READY_TO_PICK: '待拣货', PICKING: '拣货中',
  READY_TO_DISPENSE: '待发药', PARTIALLY_DISPENSED: '部分发药', COMPLETED: '已完成',
  PARTIALLY_RETURNED: '部分退药', RETURN_REQUIRED: '停嘱待退', RETURNED: '已全部退药', REJECTED: '已驳回',
  CANCELLED: '停嘱已取消', STOPPED: '停嘱已清算',
}

const reviewText: Record<PharmacyReviewResult, string> = {
  PASS: '通过', REJECT: '驳回', INTERVENE: '干预', OVERRIDE: '强制通过',
}

type PharmacyWorkspaceMode = 'dispensing' | 'review' | 'returns' | 'query' | 'ward'

const workspaceCopy: Record<PharmacyWorkspaceMode, {
  eyebrow: string; title: string; description: string; queueTitle: string; emptyTitle: string; emptyCopy: string
}> = {
  dispensing: {
    eyebrow: '药事管理 · 门诊执行', title: '门诊发药',
    description: '集中处理门诊处方接方、库存预留、配药复核和实际发药。',
    queueTitle: '待发药处方', emptyTitle: '暂无待发药处方', emptyCopy: '新的门诊处方会进入这里。',
  },
  review: {
    eyebrow: '药事管理 · 药学审核', title: '处方审方',
    description: '按系统参数独立处理事前或事后审方，不与门诊发药操作混排。',
    queueTitle: '待审处方', emptyTitle: '暂无待审处方', emptyCopy: '符合当前审方模式的处方会进入这里。',
  },
  returns: {
    eyebrow: '药事管理 · 反向业务', title: '退药管理',
    description: '统一处理患者退药与病区退药验收，形成可追溯的库存回退记录。',
    queueTitle: '患者退药', emptyTitle: '暂无可退药处方', emptyCopy: '已发药且仍有可退数量的处方会进入这里。',
  },
  query: {
    eyebrow: '药事管理 · 业务查询', title: '发药查询',
    description: '查询已完成、已驳回、已取消和已退药记录，查看批次及人员追溯信息。',
    queueTitle: '历史发药记录', emptyTitle: '暂无历史记录', emptyCopy: '已结束的发药任务会进入这里。',
  },
  ward: {
    eyebrow: '药事管理 · 住院供药', title: '病区配送',
    description: '按班次汇总住院用药，完成批量接方、配药发药和病区配送交接。',
    queueTitle: '', emptyTitle: '', emptyCopy: '',
  },
}

const activeTaskStatuses = new Set(['READY_TO_PICK', 'PICKING', 'READY_TO_DISPENSE', 'PARTIALLY_DISPENSED'])
const postReviewTaskStatuses = new Set(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED'])
const returnTaskStatuses = new Set(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURN_REQUIRED'])
const closedTaskStatuses = new Set(['COMPLETED', 'PARTIALLY_RETURNED', 'RETURNED', 'REJECTED', 'CANCELLED', 'STOPPED'])

function statusTone(status?: string) {
  if (status === 'READY_TO_PICK' || status === 'COMPLETED') return 'success' as const
  if (status === 'INTERVENTION' || status === 'RETURN_REQUIRED') return 'warning' as const
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger' as const
  if (status === 'STOPPED' || status === 'RETURNED') return 'neutral' as const
  return 'info' as const
}

export function PharmacyWorkspace({ api, clinicalContext, mode = 'dispensing' }: {
  api: RhnApi; clinicalContext: ClinicalContext; mode?: PharmacyWorkspaceMode
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const linkedResidentId = searchParams.get('residentId')
  const organizationId = clinicalContext.organization.id
  const departmentId = clinicalContext.department.id
  const [siteId, setSiteId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [stockItemId, setStockItemId] = useState('')
  const [practitionerId, setPractitionerId] = useState('')
  const [assignmentId, setAssignmentId] = useState('')
  const [reviewResult, setReviewResult] = useState<PharmacyReviewResult>('PASS')
  const [reasonCode, setReasonCode] = useState('')
  const [description, setDescription] = useState('')
  const [releaseReason, setReleaseReason] = useState('')
  const [dispenseQuantity, setDispenseQuantity] = useState('')
  const [returnLineId, setReturnLineId] = useState('')
  const [returnQuantity, setReturnQuantity] = useState('')
  const [returnDisposition, setReturnDisposition] = useState('RESTOCK')
  const [returnReason, setReturnReason] = useState('PATIENT_NOT_USE')
  const [patientIdentityChecked, setPatientIdentityChecked] = useState(false)
  const [prescriptionChecked, setPrescriptionChecked] = useState(false)
  const [dispenseProductChecked, setDispenseProductChecked] = useState(false)

  const sites = useQuery({ queryKey: ['pharmacy-sites', organizationId], queryFn: () => api.pharmacy.sites(organizationId) })
  const inbox = useQuery({
    queryKey: ['pharmacy-inbox', organizationId, departmentId],
    queryFn: () => api.pharmacy.inbox(organizationId),
  })
  const prescriptionReviewMode = useQuery({
    queryKey: ['pharmacy-prescription-review-mode', organizationId, departmentId],
    queryFn: () => api.pharmacy.prescriptionReviewMode(organizationId),
    enabled: mode === 'review',
  })
  const stockItems = useQuery({
    queryKey: ['pharmacy-stock-items', siteId], queryFn: () => api.pharmacy.stockItems(siteId), enabled: Boolean(siteId),
  })
  const practitioners = useQuery({ queryKey: ['practitioners'], queryFn: api.organization.practitioners })
  const practitioner = useQuery({
    queryKey: ['practitioner-detail', practitionerId], queryFn: () => api.organization.practitioner(practitionerId),
    enabled: Boolean(practitionerId),
  })
  const eligibleSites = useMemo(() => (sites.data ?? []).filter((site) => site.active
    && site.siteType === 'PHARMACY'
    && site.departmentId === departmentId), [departmentId, sites.data])
  const selectedSite = eligibleSites.find((site) => site.id === siteId)
  const visibleInbox = useMemo(() => (inbox.data ?? []).filter((item) => {
    if (mode === 'dispensing') return !item.taskStatus || activeTaskStatuses.has(item.taskStatus)
    if (mode === 'review') {
      if (prescriptionReviewMode.data?.mode === 'PRE_DISPENSE') {
        return item.taskStatus === 'PENDING_REVIEW' || item.taskStatus === 'INTERVENTION'
      }
      if (prescriptionReviewMode.data?.mode === 'POST_DISPENSE') {
        return Boolean(item.taskStatus && postReviewTaskStatuses.has(item.taskStatus) && !item.latestReviewResult)
      }
      return false
    }
    if (mode === 'returns') return Boolean(item.taskStatus && returnTaskStatuses.has(item.taskStatus))
    if (mode === 'query') return Boolean(item.taskStatus && closedTaskStatuses.has(item.taskStatus))
    return false
  }), [inbox.data, mode, prescriptionReviewMode.data?.mode])

  useEffect(() => {
    if (!siteId && eligibleSites.length) setSiteId(eligibleSites[0].id)
    if (siteId && !eligibleSites.some((site) => site.id === siteId)) setSiteId(eligibleSites[0]?.id ?? '')
  }, [eligibleSites, siteId])

  useEffect(() => {
    if ((!linkedEncounterId && !linkedResidentId) || !inbox.data) return
    const target = inbox.data.find((item) => linkedEncounterId
      ? item.request.encounterId === linkedEncounterId : item.request.residentId === linkedResidentId)
    if (target) setRequestId(target.request.id)
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId')
    next.delete('residentId')
    setSearchParams(next, { replace: true })
  }, [inbox.data, linkedEncounterId, linkedResidentId, searchParams, setSearchParams])

  useEffect(() => {
    if (linkedEncounterId || linkedResidentId) return
    if (!requestId && visibleInbox.length) setRequestId(visibleInbox[0].request.id)
    if (requestId && !visibleInbox.some((item) => item.request.id === requestId)) {
      setRequestId(visibleInbox[0]?.request.id ?? '')
    }
  }, [linkedEncounterId, linkedResidentId, requestId, visibleInbox])

  useEffect(() => {
    setStockItemId('')
    setPatientIdentityChecked(false)
    setPrescriptionChecked(false)
    setDispenseProductChecked(false)
  }, [siteId, requestId])

  const selected = mode === 'ward' ? undefined : visibleInbox.find((item) => item.request.id === requestId)
  const showDispenseVerification = mode === 'dispensing' && Boolean(selected)
  const resident = useQuery({
    queryKey: ['pharmacy-resident-verification', selected?.request.residentId],
    queryFn: () => api.residents.get(selected!.request.residentId),
    enabled: showDispenseVerification,
  })
  const allergies = useQuery({
    queryKey: ['pharmacy-allergy-verification', selected?.request.residentId],
    queryFn: () => api.residents.allergies(selected!.request.residentId),
    enabled: showDispenseVerification,
  })
  useEffect(() => {
    if (!selected || selected.taskId || !stockItems.data?.length) return
    const candidates = stockItems.data.filter((item) => item.status === 'ACTIVE')
    const preferred = candidates.find((item) => item.catalogItemId === selected.request.catalogItemId)
      ?? (selected.request.substitutionAllowed
        ? candidates.find((item) => item.medicationId === selected.request.medicationId) : undefined)
    if (preferred && stockItemId !== preferred.id) setStockItemId(preferred.id)
  }, [selected, stockItemId, stockItems.data])
  const task = useQuery({
    queryKey: ['pharmacy-task', selected?.taskId], queryFn: () => api.pharmacy.task(selected!.taskId!),
    enabled: Boolean(selected?.taskId),
  })
  const selectedLine = task.data?.lines[0]
  const balances = useQuery({
    queryKey: ['pharmacy-inventory-balances', task.data?.stockSiteId, selectedLine?.stockItemId],
    queryFn: () => api.pharmacy.balances(task.data!.stockSiteId, selectedLine!.stockItemId),
    enabled: mode === 'dispensing' && Boolean(task.data?.stockSiteId && selectedLine?.stockItemId),
  })
  const reservations = useQuery({
    queryKey: ['pharmacy-reservations', selected?.taskId],
    queryFn: () => api.pharmacy.reservations(selected!.taskId!),
    enabled: mode === 'dispensing' && Boolean(selected?.taskId),
  })
  const trace = useQuery({
    queryKey: ['pharmacy-dispense-trace', selected?.taskId],
    queryFn: () => api.pharmacy.trace(selected!.taskId!), enabled: Boolean(selected?.taskId),
  })
  const eligibleAssignments = useMemo(() => practitioner.data?.assignments.filter((assignment) =>
    assignment.organizationId === organizationId && assignment.departmentId === departmentId
      && assignment.sdPersonnelStatus === 'ACTIVE') ?? [], [departmentId, organizationId, practitioner.data])

  useEffect(() => {
    if (assignmentId && !eligibleAssignments.some((assignment) => assignment.id === assignmentId)) setAssignmentId('')
    if (!assignmentId && eligibleAssignments.length === 1) setAssignmentId(eligibleAssignments[0].id)
  }, [assignmentId, eligibleAssignments])

  const refresh = async (taskId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['pharmacy-inbox', organizationId] }),
      queryClient.invalidateQueries({ queryKey: ['pharmacy-task', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['pharmacy-reservations', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['pharmacy-dispense-trace', taskId] }),
      queryClient.invalidateQueries({ queryKey: ['ward-deliveries'] }),
      queryClient.invalidateQueries({ queryKey: ['pharmacy-inventory-balances'] }),
    ])
  }
  const intake = useMutation({
    mutationFn: () => api.pharmacy.intake(requestId, stockItemId, '药房接方'),
    onSuccess: (value) => refresh(value.id),
  })
  const review = useMutation({
    mutationFn: () => api.pharmacy.review(selected!.taskId!, {
      result: reviewResult, reasonCode: reasonCode || undefined, description: description || undefined,
      pharmacistPractitionerId: practitionerId, reviewerAssignmentId: assignmentId,
    }),
    onSuccess: async (value) => {
      setReasonCode(''); setDescription(''); await refresh(value.id)
    },
  })
  const reserve = useMutation({
    mutationFn: () => api.pharmacy.reserve(selected!.taskId!, 30),
    onSuccess: (value) => refresh(value.taskId),
  })
  const releaseReservation = useMutation({
    mutationFn: () => api.pharmacy.releaseReservation(selected!.taskId!, releaseReason.trim()),
    onSuccess: async (value) => {
      setReleaseReason(''); await refresh(value.taskId)
    },
  })
  const completePicking = useMutation({
    mutationFn: () => api.pharmacy.completePicking(selected!.taskId!, {
      pickerPractitionerId: practitionerId, pickerAssignmentId: assignmentId,
      description: '批次、数量及配药结果核对完成',
    }),
    onSuccess: (value) => refresh(value.taskId),
  })
  const dispense = useMutation({
    mutationFn: () => api.pharmacy.dispense(selected!.taskId!, {
      requestCode: `DSP-${task.data!.taskNo}-${Date.now()}`,
      operationQuantity: Number(dispenseQuantity), dispenserPractitionerId: practitionerId,
      dispenserAssignmentId: assignmentId, description: '已完成患者身份、处方内容与药品实物核对后发药',
    }),
    onSuccess: async (value) => {
      setDispenseQuantity(''); await refresh(value.taskId)
    },
  })
  const returnedByOriginalLine = useMemo(() => {
    const result = new Map<string, number>()
    for (const event of trace.data?.events ?? []) {
      if (event.dispenseType !== 'RETURN') continue
      for (const line of event.lines) {
        if (!line.originalDispenseLineId) continue
        result.set(line.originalDispenseLineId,
          (result.get(line.originalDispenseLineId) ?? 0) + line.quantityDispensed)
      }
    }
    return result
  }, [trace.data])
  const returnableLines = useMemo(() => (trace.data?.events ?? [])
    .filter((event) => event.dispenseType === 'DISPENSE' || event.dispenseType === 'REDISPENSE')
    .flatMap((event) => event.lines.map((line) => ({ event, line,
      remaining: line.quantityDispensed - (returnedByOriginalLine.get(line.id) ?? 0) })))
    .filter((value) => value.remaining > 0), [returnedByOriginalLine, trace.data])
  const selectedReturnLine = returnableLines.find((value) => value.line.id === returnLineId)
  useEffect(() => {
    if (returnLineId && !returnableLines.some((value) => value.line.id === returnLineId)) setReturnLineId('')
    if (!returnLineId && returnableLines.length) setReturnLineId(returnableLines[0].line.id)
  }, [returnLineId, returnableLines])
  const returnMedication = useMutation({
    mutationFn: () => api.pharmacy.returnMedication(selectedReturnLine!.event.id, {
      returnNo: `RET-${task.data!.taskNo}-${Date.now()}`, reasonCode: returnReason.trim(),
      processorPractitionerId: practitionerId, processorAssignmentId: assignmentId,
      description: '退药确认', lines: [{ originalDispenseLineId: selectedReturnLine!.line.id,
        quantity: Number(returnQuantity), disposition: returnDisposition }],
    }),
    onSuccess: async () => {
      setReturnQuantity(''); await refresh(selected?.taskId)
    },
  })

  const verificationError = showDispenseVerification
    ? resident.error || allergies.error : null
  const error = sites.error || inbox.error || (mode === 'review' ? prescriptionReviewMode.error : null)
    || stockItems.error || task.error || practitioners.error
    || practitioner.error || balances.error || reservations.error || intake.error || review.error
    || reserve.error || releaseReservation.error || trace.error || completePicking.error
    || dispense.error || returnMedication.error || verificationError
  const configuredReviewMode = prescriptionReviewMode.data?.mode ?? 'DISABLED'
  const canReview = configuredReviewMode === 'PRE_DISPENSE'
    ? task.data?.status === 'PENDING_REVIEW' || task.data?.status === 'INTERVENTION'
    : configuredReviewMode === 'POST_DISPENSE' && Boolean(task.data && postReviewTaskStatuses.has(task.data.status)
      && !task.data.reviews.length)
  const taskClosedAfterStop = task.data?.status === 'CANCELLED' || task.data?.status === 'STOPPED'
  const taskNeedsReturn = task.data?.status === 'RETURN_REQUIRED'
  const availableQuantity = balances.data?.filter((value) => value.stockStatus === 'AVAILABLE')
    .reduce((total, value) => total + value.quantityAvailable, 0) ?? 0
  const remainingToDispense = selectedLine
    ? selectedLine.plannedQuantity - selectedLine.dispensedQuantity : 0
  const prescriptionLines = selected?.prescriptionRequests?.length
    ? selected.prescriptionRequests : selected ? [selected.request] : []
  const activeDrugAllergies = (allergies.data ?? []).filter((value) => value.assertionType === 'ALLERGY'
    && (!value.categoryCode || value.categoryCode === 'DRUG'))
  const hasNoKnownDrugAllergy = (allergies.data ?? []).some((value) => value.assertionType === 'NO_KNOWN_DRUG_ALLERGY'
    || value.assertionType === 'NO_KNOWN_ALLERGY')
  const dispensingCheckComplete = patientIdentityChecked && prescriptionChecked && dispenseProductChecked
  const copy = workspaceCopy[mode]

  return <>
    <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description}
      actions={<Button variant="secondary" onClick={() => void refresh(selected?.taskId)}>刷新队列</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    {mode === 'review' && prescriptionReviewMode.data?.mode === 'PRE_DISPENSE'
      && <Alert tone="info">当前为事前审方：审方通过后，处方才会进入门诊发药队列。</Alert>}
    {mode === 'review' && prescriptionReviewMode.data?.mode === 'POST_DISPENSE'
      && <Alert tone="info">当前为事后审方：门诊先完成发药，审方结论作为独立药学记录留存。</Alert>}
    <div className="pharmacy-toolbar">
      <FormField label="当前药房">
        <Select value={siteId} onChange={(value) => setSiteId(value)} placeholder="请选择当前药房"
          options={eligibleSites.map((site) => ({ value: site.id, label: site.name, code: site.code }))} />
      </FormField>
      <div className="pharmacy-toolbar__context">
        <span>当前工作上下文</span><strong>{clinicalContext.organization.name} · {clinicalContext.department.name}</strong>
      </div>
      <div className="pharmacy-toolbar__metrics">
        <span>{mode === 'ward' ? '服务范围' : copy.queueTitle}</span>
        <strong>{mode === 'ward' ? serviceScopeText(selectedSite?.serviceScope) : visibleInbox.length}</strong>
      </div>
    </div>
    {mode === 'ward' && !sites.isPending && selectedSite && (selectedSite.serviceScope === 'INPATIENT'
      || selectedSite.serviceScope === 'MIXED') && <WardDailySupplyPanel api={api} organizationId={organizationId}
      stockSiteId={selectedSite.id} stockItems={stockItems.data ?? []}
      practitioners={practitioners.data ?? []} assignments={eligibleAssignments}
      practitionerId={practitionerId} assignmentId={assignmentId}
      onPractitionerChange={setPractitionerId} onAssignmentChange={setAssignmentId} defaultOpen />}
    {mode === 'ward' && !sites.isPending && selectedSite && (selectedSite.serviceScope === 'INPATIENT'
      || selectedSite.serviceScope === 'MIXED') && <WardDeliveryQueue api={api} stockSiteId={selectedSite.id} />}
    {mode === 'ward' && !sites.isPending && selectedSite && selectedSite.serviceScope !== 'INPATIENT'
      && selectedSite.serviceScope !== 'MIXED' && <Panel><EmptyState icon="pharmacy" title="当前药房不承担病区配送"
        copy="病区配送仅对住院或混合服务范围的药房开放，请切换到相应药房后继续。" /></Panel>}
    {mode === 'returns' && !sites.isPending && eligibleSites.length > 0 && <WardMedicationReturnInbox api={api}
      practitioners={practitioners.data ?? []} assignments={eligibleAssignments}
      practitionerId={practitionerId} assignmentId={assignmentId}
      onPractitionerChange={setPractitionerId} onAssignmentChange={setAssignmentId} />}
    {(sites.isPending || inbox.isPending || mode === 'review' && prescriptionReviewMode.isPending)
      && <Panel><LoadingState label="正在加载药房工作队列…" /></Panel>}
    {!sites.isPending && eligibleSites.length === 0 && <Panel><EmptyState icon="pharmacy" title="当前科室不是已配置药房"
      copy="请在顶部工作上下文切换到门诊或住院药房；若仍无可选站点，请由管理员完成药房库存配置。" /></Panel>}
    {mode === 'review' && !prescriptionReviewMode.isPending && !prescriptionReviewMode.data?.enabled
      && <Panel><EmptyState icon="pharmacy" title="处方审方未启用"
        copy="当前参数为“不启用审方”。如需启用，请在参数管理中将处方审方模式改为事前审方或事后审方。" /></Panel>}
    {mode !== 'ward' && !inbox.isPending && (mode !== 'review' || !prescriptionReviewMode.isPending)
      && eligibleSites.length > 0
      && (mode !== 'review' || prescriptionReviewMode.data?.enabled) && <div className={`pharmacy-workspace pharmacy-workspace--${mode}`}>
      <Panel className="pharmacy-queue">
        <header className="pharmacy-section-head"><div><h2>{copy.queueTitle}</h2><span>{visibleInbox.length} 条</span></div></header>
        {!visibleInbox.length ? <EmptyState icon="pharmacy" title={copy.emptyTitle} copy={copy.emptyCopy} />
          : <div className="pharmacy-queue__list">{visibleInbox.map((item) => <button type="button"
            className={item.request.id === requestId ? 'is-selected' : ''} key={item.request.id}
            onClick={() => setRequestId(item.request.id)}>
            <div className="pharmacy-queue__title"><strong>{item.request.medicationName}</strong>
              <StatusBadge tone={statusTone(item.taskStatus)}>{taskStatusText[item.taskStatus ?? ''] ?? '待接方'}</StatusBadge></div>
            <span>{item.request.itemName} · {formatQuantityWithUnit(item.request.quantity,
              requestPackageUnit(item.request.quantityUnit, item.request.packageUnitName))}</span>
            <small>{item.request.requestNo} · {formatTime(item.request.authoredAt)}</small>
          </button>)}</div>}
      </Panel>
      <Panel className="pharmacy-detail">
        {!selected ? <EmptyState icon="pharmacy" title={`请选择一条${mode === 'query' ? '发药记录' : '处方'}`}
          copy={mode === 'query' ? '左侧选择后可查看发药、批次和人员追溯信息。' : '左侧选择后可继续处理当前业务。'} />
          : <>
            <header className="pharmacy-detail__head"><div><span className="ui-eyebrow">{selected.request.requestNo}</span>
              <h2>{selected.request.medicationName}</h2><p>{selected.request.itemName}</p></div>
              <StatusBadge tone={statusTone(selected.taskStatus)}>{taskStatusText[selected.taskStatus ?? ''] ?? '待接方'}</StatusBadge>
            </header>
            {mode === 'dispensing' && <section className="pharmacy-dispense-verification" aria-label="患者与处方核对">
              <div className="pharmacy-section-head"><div><h3>患者与处方核对</h3>
                <span>发药前核实患者身份、临床信息、整张处方和药品实物</span></div>
                <StatusBadge tone={dispensingCheckComplete ? 'success' : 'warning'}>
                  {dispensingCheckComplete ? '核对完成' : '待核对'}</StatusBadge></div>
              {(resident.isPending || allergies.isPending)
                ? <LoadingState label="正在加载患者与处方信息…" /> : <>
                <div className="pharmacy-patient-context">
                  <article className="pharmacy-patient-card">
                    <header><div><strong>{resident.data?.fullName ?? '患者信息缺失'}</strong>
                      <span>{genderText(resident.data?.gender)} · {ageText(resident.data?.birthDate)}</span></div>
                      {resident.data?.deceased && <StatusBadge tone="danger">已故标识</StatusBadge>}</header>
                    <dl><div><dt>健康档案号</dt><dd>{resident.data?.healthRecordNo ?? '—'}</dd></div>
                      <div><dt>证件号码</dt><dd>{resident.data?.maskedNationalId ?? '未登记'}</dd></div>
                      <div><dt>出生日期</dt><dd>{resident.data?.birthDate ?? '未登记'}</dd></div>
                      <div><dt>联系电话</dt><dd>{maskPhone(resident.data?.phone)}</dd></div></dl>
                  </article>
                  <article className="pharmacy-clinical-card">
                    <dl><div><dt>就诊号</dt><dd>{selected.clinicalContext?.encounterNo ?? '待服务更新'}</dd></div>
                      <div><dt>开方医生</dt><dd>{selected.clinicalContext?.clinicianId ?? '未记录'}</dd></div>
                      <div><dt>诊断</dt><dd>{selected.clinicalContext?.diagnoses.length
                        ? selected.clinicalContext.diagnoses.map((value) => `${value.display}（${value.code}）`).join('；')
                        : selected.clinicalContext ? '未记录诊断' : '临床摘要将在服务更新后显示'}</dd></div>
                      <div><dt>主诉</dt><dd>{selected.clinicalContext?.chiefComplaint
                        ?? (selected.clinicalContext ? '未记录主诉' : '临床摘要将在服务更新后显示')}</dd></div></dl>
                    <div className={`pharmacy-allergy-summary ${activeDrugAllergies.length ? 'is-warning' : ''}`}>
                      <strong>药物过敏</strong><span>{activeDrugAllergies.length
                        ? activeDrugAllergies.map((value) => [value.substanceDisplay, value.reactionText]
                          .filter(Boolean).join('：')).join('；')
                        : hasNoKnownDrugAllergy ? '已记录：无已知药物过敏' : '未见有效药物过敏记录，请向患者确认'}</span>
                    </div>
                  </article>
                </div>
                <div className="pharmacy-prescription-card">
                  <header><div><strong>整张处方明细</strong>
                    <span>申请单 {selected.request.requestNo} · 开立于 {formatTime(selected.request.authoredAt)}</span></div>
                    <span>共 {prescriptionLines.length} 项</span></header>
                  <div className="pharmacy-prescription-lines" role="table" aria-label="处方药品明细">
                    <div className="pharmacy-prescription-lines__head" role="row">
                      <span>药品与规格</span><span>单次剂量</span><span>用法频次</span><span>疗程</span><span>发药数量</span>
                    </div>
                    {prescriptionLines.map((line) => <div key={line.id} role="row"
                      className={line.id === selected.request.id ? 'is-current' : ''}>
                      <div><strong>{line.medicationName}</strong><small>{line.itemName}</small></div>
                      <span>{line.doseValue ? `${line.doseValue}${displayUnitName(line.doseUnit)}` : '未填写'}</span>
                      <span>{[line.routeCode, line.frequencyName ?? line.frequencyCode].filter(Boolean).join(' · ') || '未填写'}</span>
                      <span>{line.durationValue ? `${line.durationValue}${durationUnitText(line.durationUnit)}` : '未填写'}</span>
                      <strong>{formatRequestQuantity(line)}</strong>
                    </div>)}
                  </div>
                  {selected.request.medicationInstruction && <p className="pharmacy-prescription-note">
                    <strong>用药嘱托</strong>{selected.request.medicationInstruction}</p>}
                </div>
                <fieldset className="pharmacy-dispense-checks"><legend>发药核对</legend>
                  <label><input type="checkbox" checked={patientIdentityChecked}
                    onChange={(event) => setPatientIdentityChecked(event.target.checked)} />
                    <span><strong>患者身份已核对</strong><small>姓名、出生日期或证件信息与取药人确认一致</small></span></label>
                  <label><input type="checkbox" checked={prescriptionChecked}
                    onChange={(event) => setPrescriptionChecked(event.target.checked)} />
                    <span><strong>处方内容已核对</strong><small>药品、规格、用法用量、疗程及数量核对无误</small></span></label>
                  <label><input type="checkbox" checked={dispenseProductChecked}
                    disabled={!task.data || task.data.status !== 'READY_TO_DISPENSE' && task.data.status !== 'PARTIALLY_DISPENSED'}
                    onChange={(event) => setDispenseProductChecked(event.target.checked)} />
                    <span><strong>药品实物已核对</strong><small>{!task.data || task.data.status !== 'READY_TO_DISPENSE'
                      && task.data.status !== 'PARTIALLY_DISPENSED' ? '完成配药复核后核对批号、效期和实发数量' : '批号、效期、包装和实发数量核对无误'}</small></span></label>
                </fieldset>
              </>}
            </section>}
            <dl className="pharmacy-facts">
              <div><dt>申请数量</dt><dd>{formatRequestQuantity(selected.request)}</dd></div>
              <div><dt>包装换算</dt><dd>{formatPackageConversion(selected.request)}</dd></div>
              <div><dt>用法</dt><dd>{[selected.request.routeCode, selected.request.frequencyCode].filter(Boolean).join(' · ') || '未填写'}</dd></div>
              <div><dt>处方属性快照</dt><dd>{Object.keys((selected.request.itemAttributeSnapshot.attributes as object | undefined) ?? {}).length} 项</dd></div>
            </dl>
            {mode === 'query' && <details className="pharmacy-snapshot pharmacy-snapshot--details">
              <summary>查看业务凭据</summary><code>{selected.request.itemAttributeHash}</code>
            </details>}
            {mode === 'dispensing' && !selected.taskId && <section className="pharmacy-action-section">
              <div className="pharmacy-section-head"><div><h3>接方与产品确认</h3><span>按当前药房经营目录选择发药产品</span></div></div>
              <div className="pharmacy-intake-form"><FormField label="发药产品" required>
                <Select value={stockItemId} onChange={(value) => setStockItemId(value)} placeholder="请选择库存经营项目"
                  searchable showValue options={(stockItems.data ?? []).filter((item) => item.status === 'ACTIVE')
                    .map((item) => ({ value: item.id, label: `${item.productName} · ${item.packageSpec ?? item.packageUnitName}`,
                      code: item.productCode }))} />
              </FormField><Button disabled={!siteId || !stockItemId} busy={intake.isPending} onClick={() => intake.mutate()}>确认接方</Button></div>
            </section>}
            {selected.taskId && (task.isPending ? <LoadingState label="正在加载发药任务…" /> : task.data && <>
              <section className="pharmacy-action-section">
                <div className="pharmacy-section-head"><div><h3>发药任务</h3><span>{task.data.taskNo}</span></div></div>
                <div className="pharmacy-task-lines">{task.data.lines.map((line) => <article key={line.id}>
                  <div><strong>{line.productName}</strong><code>{line.productCode}</code></div>
                  <span>计划 {formatQuantityWithUnit(line.plannedQuantity, displayUnitName(line.dispenseUnitCode))}
                    {' '}· 已发 {formatQuantityWithUnit(line.dispensedQuantity, displayUnitName(line.dispenseUnitCode))}
                    {' '}· 已退 {formatQuantityWithUnit(line.returnedQuantity, displayUnitName(line.dispenseUnitCode))}</span>
                  <StatusBadge tone={line.status === 'READY' ? 'success' : 'neutral'}>{line.status}</StatusBadge>
                </article>)}</div>
              </section>
              {mode === 'review' && <section className="pharmacy-action-section pharmacy-action-section--primary">
                <div className="pharmacy-section-head"><div><h3>{configuredReviewMode === 'PRE_DISPENSE'
                  ? '事前审方' : '事后审方'}</h3><span>{configuredReviewMode === 'PRE_DISPENSE'
                  ? '审方通过后进入库存预留与发药' : '对已完成发药的处方补充药学审核结论'}</span></div></div>
                {canReview ? <div className="pharmacy-review-form">
                  <FormField label="审方药师" required><Select value={practitionerId} onChange={(value) => setPractitionerId(value)}
                    placeholder="请选择药师" searchable showValue options={(practitioners.data ?? [])
                      .filter((value) => value.sdPersonnelStatus === 'ACTIVE')
                      .map((value) => ({ value: value.id, label: value.fullName, code: value.code }))} /></FormField>
                  <FormField label="当前任职" required><Select value={assignmentId} onChange={(value) => setAssignmentId(value)}
                    placeholder="请选择当前科室任职" options={eligibleAssignments.map(assignmentOption)} /></FormField>
                  <FormField label="审方结论" required><Select value={reviewResult}
                    onChange={(value) => setReviewResult(value as PharmacyReviewResult)} options={(
                      (configuredReviewMode === 'POST_DISPENSE' ? ['PASS', 'INTERVENE', 'REJECT']
                        : ['PASS', 'INTERVENE', 'REJECT', 'OVERRIDE']) as PharmacyReviewResult[])
                      .map((value) => ({ value, label: reviewText[value], code: value }))} /></FormField>
                  <FormField label="原因编码" required={reviewResult !== 'PASS'}><input value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value)} placeholder={reviewResult === 'PASS' ? '通过时可不填' : '例如 DOSE_CONFIRM'} /></FormField>
                  <FormField label="审方说明" required={reviewResult !== 'PASS'} className="pharmacy-review-form__description"><textarea
                    value={description} onChange={(event) => setDescription(event.target.value)} placeholder="记录审方判断或干预说明" /></FormField>
                  <Button className="pharmacy-review-form__submit" disabled={!practitionerId || !assignmentId
                    || reviewResult !== 'PASS' && (!reasonCode.trim() || !description.trim())}
                    busy={review.isPending} onClick={() => review.mutate()}>提交审方结论</Button>
                </div> : <Alert tone="info">当前任务已完成审方，审方记录已归档。</Alert>}
              </section>}
              {mode === 'dispensing' && <section className="pharmacy-action-section">
                <div className="pharmacy-section-head"><div><h3>批次库存与预留</h3>
                  <span>库存流水是事实源，余额为并发维护的可重建投影</span></div>
                  <div className="pharmacy-inventory-summary"><span>当前可用</span>
                    <strong>{availableQuantity}{selectedLine?.baseQuantityFactor
                      ? displayUnitName(selected.request.baseUnit) : ''}</strong></div></div>
                {balances.isPending || reservations.isPending ? <LoadingState label="正在核对批次库存…" /> : <>
                  {!balances.data?.length ? <Alert tone="warning">当前经营项目尚无可用库存，请先完成批次合格入账。</Alert>
                    : <div className="pharmacy-balance-table" role="table" aria-label="批次库存余额">
                      <div className="pharmacy-balance-table__head" role="row">
                        <span>批号 / 效期</span><span>货位</span><span>状态</span><span>在手</span><span>已预留</span><span>可用</span>
                      </div>
                      {balances.data.map((value) => <div key={value.id} role="row">
                        <div><strong>{value.lotNo}</strong><small>{value.expiryDate ?? '无固定效期'}</small></div>
                        <code>{value.stockBinCode}</code><StatusBadge tone={value.stockStatus === 'AVAILABLE'
                          ? 'success' : 'warning'}>{value.stockStatus}</StatusBadge><span>{value.quantityOnHand}</span>
                        <span>{value.quantityReserved}</span><strong>{formatQuantityWithUnit(value.quantityAvailable,
                          displayUnitName(value.baseUnitCode))}</strong>
                      </div>)}
                    </div>}
                  {!!reservations.data?.allocations.length && <div className="pharmacy-reservation-list">
                    {reservations.data.allocations.map((value) => <article key={value.id}>
                      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'RELEASED'
                        ? 'neutral' : 'warning'}>{value.status}</StatusBadge>
                      <div><strong>{value.lotNo} · {formatQuantityWithUnit(value.quantityReserved,
                        displayUnitName(value.baseUnitCode))}</strong>
                        <span>{value.stockBinCode} · {value.reservationGroupCode}</span></div>
                      <time>{value.expiresAt ? `有效至 ${formatTime(value.expiresAt)}` : '不自动失效'}</time>
                    </article>)}
                  </div>}
                  {task.data.status === 'READY_TO_PICK' && <div className="pharmacy-reservation-action">
                    <div><strong>FEFO 自动分配</strong><span>按最近效期优先并在同一事务内锁定全部批次；库存不足时整单回滚。</span></div>
                    <Button busy={reserve.isPending} disabled={!balances.data?.length} onClick={() => reserve.mutate()}>
                      预留库存并进入拣货</Button>
                  </div>}
                  {(task.data.status === 'PICKING' || task.data.status === 'PARTIALLY_DISPENSED')
                    && <div className="pharmacy-reservation-release">
                    <FormField label="释放原因" required><input value={releaseReason}
                      onChange={(event) => setReleaseReason(event.target.value)}
                      placeholder="例如：患者暂缓取药" /></FormField>
                    <Button variant="secondary" busy={releaseReservation.isPending} disabled={!releaseReason.trim()}
                      onClick={() => releaseReservation.mutate()}>释放全部预留</Button>
                  </div>}
                </>}
              </section>}
              {(mode === 'dispensing' || mode === 'returns' || mode === 'query') && <section className="pharmacy-action-section">
                <div className="pharmacy-section-head"><div><h3>{mode === 'returns' ? '患者退药处理'
                  : mode === 'query' ? '调剂与退药流水' : '配药与发药'}</h3>
                  <span>{mode === 'query' ? '按发生时间保留实际发药与退药事实' : '实际动作形成批次事实与库存分录'}</span></div></div>
                {taskClosedAfterStop && <Alert tone="info">医嘱已停并完成药品收口，当前任务不可继续预留、配药或发药。</Alert>}
                {taskNeedsReturn && <Alert tone="warning">医嘱已停，当前任务不可继续预留、配药或发药；请在上方“病区退药接收”完成实物验收。</Alert>}
                {mode !== 'query' && !taskClosedAfterStop && <div className="pharmacy-execution-operator">
                  <FormField label="执行药师" required><Select value={practitionerId}
                    onChange={(value) => setPractitionerId(value)} placeholder="请选择执行药师" searchable showValue
                    options={(practitioners.data ?? []).filter((value) => value.sdPersonnelStatus === 'ACTIVE')
                      .map((value) => ({ value: value.id, label: value.fullName, code: value.code }))} /></FormField>
                  <FormField label="当前任职" required><Select value={assignmentId}
                    onChange={(value) => setAssignmentId(value)} placeholder="请选择当前科室任职"
                    options={eligibleAssignments.map(assignmentOption)} /></FormField>
                  <div><span>任务进度</span><strong>{selectedLine?.dispensedQuantity ?? 0} / {selectedLine?.plannedQuantity ?? 0}
                    {' '}{displayUnitName(selectedLine?.dispenseUnitCode)}</strong></div>
                </div>}
                {mode === 'dispensing' && task.data.status === 'PICKING' && <div className="pharmacy-execution-action">
                  <div><strong>完成配药核对</strong><span>确认预留批次、实物数量和包装后进入待发药。</span></div>
                  <Button busy={completePicking.isPending} disabled={!practitionerId || !assignmentId}
                    onClick={() => completePicking.mutate()}>配药复核通过</Button>
                </div>}
                {mode === 'dispensing' && (task.data.status === 'READY_TO_DISPENSE' || task.data.status === 'PARTIALLY_DISPENSED')
                  && <div className="pharmacy-execution-form">
                    <FormField label={`本次发药数量（剩余 ${remainingToDispense}）`} required><input type="number"
                      min="0.00000001" max={remainingToDispense} step="any" value={dispenseQuantity}
                      onChange={(event) => setDispenseQuantity(event.target.value)} placeholder="支持部分发药" /></FormField>
                    <Button busy={dispense.isPending} disabled={!practitionerId || !assignmentId
                      || !dispensingCheckComplete
                      || Number(dispenseQuantity) <= 0 || Number(dispenseQuantity) > remainingToDispense}
                      onClick={() => dispense.mutate()}>确认实际发药</Button>
                  </div>}
                {mode === 'returns' && (task.data.status === 'COMPLETED' || task.data.status === 'PARTIALLY_RETURNED')
                  && <div className="pharmacy-return-form">
                    <FormField label="原发药批次" required><Select value={returnLineId} onChange={setReturnLineId}
                      placeholder="请选择可退批次" searchable showValue options={returnableLines.map((value) => ({
                        value: value.line.id, label: `${value.line.lotNo} · 可退 ${formatQuantityWithUnit(value.remaining,
                          displayUnitName(value.line.dispenseUnitCode))}`,
                        code: value.event.dispenseNo,
                      }))} /></FormField>
                    <FormField label="退药数量" required><input type="number" min="0.00000001"
                      max={selectedReturnLine?.remaining} step="any" value={returnQuantity}
                      onChange={(event) => setReturnQuantity(event.target.value)} placeholder="不超过原批次可退量" /></FormField>
                    <FormField label="处置方式" required><Select value={returnDisposition}
                      onChange={setReturnDisposition} options={[
                        { value: 'RESTOCK', label: '核验合格，重新入库' },
                        { value: 'QUARANTINE', label: '隔离待质量处理' },
                        { value: 'DESTROY', label: '待销毁区' },
                      ]} /></FormField>
                    <FormField label="退药原因编码" required><input value={returnReason}
                      onChange={(event) => setReturnReason(event.target.value)} placeholder="例如 PATIENT_NOT_USE" /></FormField>
                    <Button busy={returnMedication.isPending} disabled={!practitionerId || !assignmentId
                      || !selectedReturnLine || !returnReason.trim() || Number(returnQuantity) <= 0
                      || Number(returnQuantity) > (selectedReturnLine?.remaining ?? 0)}
                      onClick={() => returnMedication.mutate()}>确认患者退药</Button>
                  </div>}
                {(mode === 'returns' || mode === 'query') && !!trace.data?.events.length && <div className="pharmacy-trace-list">
                  {trace.data.events.map((event) => <article key={event.id}>
                    <StatusBadge tone={event.dispenseType === 'RETURN' ? 'warning' : 'success'}>
                      {event.dispenseType}</StatusBadge>
                    <div><strong>{event.dispenseNo}</strong><span>{event.lines.map((line) =>
                      `${line.lotNo} ${formatQuantityWithUnit(line.quantityDispensed,
                        displayUnitName(line.dispenseUnitCode))}`).join('；')}</span></div>
                    <time>{formatTime(event.occurredAt)}</time>
                  </article>)}
                </div>}
              </section>}
              {mode === 'query' && <section className="pharmacy-action-section">
                <div className="pharmacy-section-head"><div><h3>审方记录</h3><span>审方事实只追加、不覆盖</span></div></div>
                {!!task.data.reviews.length && <div className="pharmacy-review-history">{task.data.reviews.map((value) => <article key={value.id}>
                  <StatusBadge tone={value.result === 'PASS' || value.result === 'OVERRIDE' ? 'success'
                    : value.result === 'INTERVENE' ? 'warning' : 'danger'}>{reviewText[value.result]}</StatusBadge>
                  <div><strong>{value.reviewNo}</strong><span>{value.description || '审方通过'}</span></div>
                  <time>{formatTime(value.reviewedAt)}</time>
                </article>)}</div>}
                {!task.data.reviews.length && <EmptyState icon="pharmacy" title="暂无审方记录" copy="该任务未形成药师审方事件。" />}
              </section>}
            </>)}
          </>}
      </Panel>
    </div>}
  </>
}

function assignmentOption(value: PersonnelAssignment) {
  return { value: value.id, label: `${value.positionName} · ${value.departmentName}`, code: value.code }
}

const deliveryStatusText: Record<string, string> = {
  PENDING_DISPATCH: '待送出', IN_TRANSIT: '配送中', RECEIVED: '病区已签收',
  DISCREPANCY: '存在差异', RESOLVED: '差异已处理',
}

function WardDeliveryQueue({ api, stockSiteId }: { api: RhnApi; stockSiteId: string }) {
  const deliveries = useQuery({
    queryKey: ['ward-deliveries', stockSiteId, 'ALL'],
    queryFn: () => api.pharmacy.wardDeliveries({ status: 'ALL' }),
    select: (values) => values.filter((value) => value.stockSiteId === stockSiteId),
  })
  return <Panel className="pharmacy-ward-delivery-queue" aria-label="配送交接">
    <header className="pharmacy-section-head"><div><h2>配送交接</h2>
      <span>{deliveries.data?.filter((value) => value.status === 'PENDING_DISPATCH'
        || value.status === 'IN_TRANSIT' || value.status === 'DISCREPANCY').length ?? 0} 单待处理</span></div>
      <Button size="sm" variant="secondary" onClick={() => void deliveries.refetch()}>刷新配送状态</Button></header>
    {deliveries.error && <Alert>{errorMessage(deliveries.error)}</Alert>}
    {deliveries.isPending ? <LoadingState label="正在加载配送交接…" /> : !deliveries.data?.length
      ? <EmptyState icon="pharmacy" title="暂无配送交接单" copy="整批发药后，系统会在这里生成病区配送交接单。" />
      : <div className="pharmacy-ward-delivery-queue__list">{deliveries.data.map((delivery) =>
        <WardDeliveryRow key={delivery.id} api={api} delivery={delivery} />)}</div>}
  </Panel>
}

function WardDeliveryRow({ api, delivery }: { api: RhnApi; delivery: WardDelivery }) {
  const queryClient = useQueryClient()
  const [resolutionCode, setResolutionCode] = useState<'SUPPLEMENTED' | 'RETURNED_TO_PHARMACY' | 'ACCEPTED_VARIANCE'>('SUPPLEMENTED')
  const [resolutionNote, setResolutionNote] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['ward-deliveries'] })
  const dispatch = useMutation({
    mutationFn: () => api.pharmacy.dispatchWardDelivery(delivery.id, {
      expectedRevision: delivery.revision, commandCode: `WD-DISPATCH-${delivery.id}`, note: '药房核对后交出',
    }), onSuccess: refresh,
  })
  const resolve = useMutation({
    mutationFn: () => api.pharmacy.resolveWardDelivery(delivery.id, {
      expectedRevision: delivery.revision, commandCode: `WD-RESOLVE-${delivery.id}`,
      resolutionCode, note: resolutionNote.trim(),
    }), onSuccess: async () => { setResolutionNote(''); await refresh() },
  })
  const error = dispatch.error || resolve.error
  return <article className="pharmacy-ward-delivery">
    {error && <Alert>{errorMessage(error)}</Alert>}
    <>
      <div><strong>{delivery.deliveryNo}</strong><span>{delivery.stockSiteName} → {delivery.nursingUnitName}
        · {delivery.lines.length} 项</span></div>
      <StatusBadge tone={delivery.status === 'DISCREPANCY' ? 'warning'
        : delivery.status === 'RECEIVED' || delivery.status === 'RESOLVED' ? 'success' : 'info'}>
        {deliveryStatusText[delivery.status]}</StatusBadge>
      {delivery.status === 'PENDING_DISPATCH' && <Button busy={dispatch.isPending}
        onClick={() => dispatch.mutate()}>确认送出</Button>}
      {delivery.status === 'IN_TRANSIT' && <span>等待病区逐项签收</span>}
      {delivery.status === 'RECEIVED' && <span>{formatTime(delivery.receivedAt!)} 完成签收</span>}
      {delivery.status === 'DISCREPANCY' && <div className="pharmacy-ward-delivery__resolve">
        <Alert tone="warning">{delivery.discrepancyNote}</Alert>
        <Select value={resolutionCode} onChange={(value) => setResolutionCode(value as typeof resolutionCode)} options={[
          { value: 'SUPPLEMENTED', label: '已补送' },
          { value: 'RETURNED_TO_PHARMACY', label: '已退回药房' },
          { value: 'ACCEPTED_VARIANCE', label: '确认接受差异' },
        ]} />
        <input value={resolutionNote} onChange={(event) => setResolutionNote(event.target.value)}
          placeholder="填写双方确认的处置结果" />
        <Button busy={resolve.isPending} disabled={!resolutionNote.trim()}
          onClick={() => resolve.mutate()}>确认差异处置</Button>
      </div>}
      {delivery.status === 'RESOLVED' && <span>{delivery.resolutionNote}</span>}
    </>
  </article>
}

function serviceScopeText(value?: string) {
  const labels: Record<string, string> = {
    OUTPATIENT: '门诊', INPATIENT: '住院', EMERGENCY: '急诊', COMMUNITY: '基层', MIXED: '综合',
  }
  return labels[value ?? ''] ?? '未设置'
}

interface RequestQuantityView {
  quantity: number
  quantityUnit: string
  baseQuantity: number
  baseUnit: string
  packageFactor: number
  packageUnitName?: string
}

function formatRequestQuantity(request: RequestQuantityView) {
  const packageUnit = requestPackageUnit(request.quantityUnit, request.packageUnitName)
  const baseUnit = displayUnitName(request.baseUnit)
  const packageQuantity = formatQuantityWithUnit(request.quantity, packageUnit)
  const baseQuantity = formatQuantityWithUnit(request.baseQuantity, baseUnit)
  return request.packageFactor === 1 && packageUnit === baseUnit && request.quantity === request.baseQuantity
    ? packageQuantity : `${packageQuantity}（${baseQuantity}）`
}

function formatPackageConversion(request: RequestQuantityView) {
  const packageUnit = requestPackageUnit(request.quantityUnit, request.packageUnitName)
  const baseUnit = displayUnitName(request.baseUnit)
  if (!request.packageFactor || request.packageFactor <= 0) return '未配置换算'
  if (request.packageFactor === 1 && packageUnit === baseUnit) return '无需换算'
  return `1${packageUnit} = ${formatQuantityWithUnit(request.packageFactor, baseUnit)}`
}

function requestPackageUnit(code: string, name?: string) {
  return name?.trim() || displayUnitName(code)
}

function formatQuantityWithUnit(value: number, unit: string) {
  return `${new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value)}${unit}`
}

function displayUnitName(code?: string) {
  if (!code) return ''
  const value = code.trim()
  const labels: Record<string, string> = {
    BOX: '盒', BOTTLE: '瓶', BAG: '袋', PACK: '包', VIAL: '瓶', AMP: '支', AMPOULE: '支',
    TABLET: '片', TAB: '片', CAPSULE: '粒', CAP: '粒', PIECE: '个', PCS: '个',
    ML: '毫升', L: '升', MG: '毫克', G: '克', DOSE: '剂', UNIT: '单位',
  }
  return labels[value.toUpperCase()] ?? value
}

function genderText(value?: string) {
  return { MALE: '男', FEMALE: '女', UNKNOWN: '性别未知' }[value ?? ''] ?? '性别未知'
}

function ageText(birthDate?: string) {
  if (!birthDate) return '年龄未知'
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '年龄未知'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth()
    || today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) age -= 1
  return `${Math.max(age, 0)}岁`
}

function maskPhone(value?: string) {
  if (!value) return '未登记'
  return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value
}

function durationUnitText(value?: string) {
  const labels: Record<string, string> = { DAY: '天', DAYS: '天', WEEK: '周', WEEKS: '周', MONTH: '月', MONTHS: '月' }
  return labels[value?.toUpperCase() ?? ''] ?? displayUnitName(value)
}
