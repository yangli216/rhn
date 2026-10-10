import { recordedMedicationAmount, sumRecordedAmounts, displayRecordedAmount } from "../medicationDisplay";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { ClinicalContext } from "../../../shared/clinical/workContext";
import type { MedicationRequest } from "../../../shared/api/encountersApi";
import type { DispenseTaskStatus, InventoryTraceCode, PharmacyInboxItem, PharmacyReviewResult } from "../../../shared/api/pharmacyApi";
import type { RhnApi } from "../../../shared/rhnApi";
import { errorMessage } from "../../../shared/rhnApi";
import { type PharmacyWorkspaceMode, type PharmacyQueryFilters, defaultPharmacyQueryFilters, activeTaskStatuses, postReviewTaskStatuses, returnTaskStatuses, closedTaskStatuses, pharmacyQueryItemMatches, pharmacyQueryItemInDateRange, type DispensingPatientGroup, patientMatchesSearch, CHINESE_NUMBER_WORDS, taskStatusText, groupTraceCodesByPrefix, TRACE_SCAN_DEBOUNCE_MS, parseTraceCodeBatch, inferDispenseSearchIntent, requestMatchesSearch, dispenseSearchIntentText, workspaceCopy, genderText, ageText } from './pharmacyShared'

export function usePharmacyWorkspace({ api, clinicalContext, mode = 'dispensing' }: {
  api: RhnApi; clinicalContext: ClinicalContext; mode?: PharmacyWorkspaceMode
}) {

  const queryClient = useQueryClient()

  const [searchParams, setSearchParams] = useSearchParams()

  const linkedEncounterId = searchParams.get('encounterId')

  const linkedResidentId = searchParams.get('residentId')

  const organizationId = clinicalContext.organization.id

  const departmentId = clinicalContext.department.id


  const [requestId, setRequestId] = useState('')

  const [selectedResidentId, setSelectedResidentId] = useState('')

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

  const [pharmacyQueryDraft, setPharmacyQueryDraft] = useState<PharmacyQueryFilters>(defaultPharmacyQueryFilters)

  const [pharmacyQueryFilters, setPharmacyQueryFilters] = useState<PharmacyQueryFilters>(defaultPharmacyQueryFilters)

  const [pharmacyQueryPage, setPharmacyQueryPage] = useState(0)

  const [pharmacyQueryPageSize, setPharmacyQueryPageSize] = useState(20)


  // Dispensing workbench specific UI states
  const [selectedWindow, setSelectedWindow] = useState('窗口1')

  const [autoCall, setAutoCall] = useState(false)

  const [scanKeyword, setScanKeyword] = useState('')

  const [appliedSearchKeyword, setAppliedSearchKeyword] = useState('')

  const [scanPending, setScanPending] = useState(false)

  const [queuedTraceCount, setQueuedTraceCount] = useState(0)

  const [expiryDaysFilter, setExpiryDaysFilter] = useState(100)

  const [checkedPrescriptionKeys, setCheckedPrescriptionKeys] = useState<Set<string>>(new Set())

  const [scannedTraceCodes, setScannedTraceCodes] = useState<Record<string, InventoryTraceCode[]>>({})

  const scannedTraceCodesRef = useRef<Record<string, InventoryTraceCode[]>>({})

  const pendingTraceCodesRef = useRef<string[]>([])

  const traceBatchTimerRef = useRef<number | null>(null)

  const traceBatchProcessingRef = useRef(false)

  const [lastScannedRequestId, setLastScannedRequestId] = useState('')

  const scanInputRef = useRef<HTMLInputElement>(null)

  const [activeHistorySummary, setActiveHistorySummary] = useState<{
    title: string
    encounterNo?: string
    clinicianId?: string
    chiefComplaint?: string
    diagnoses: Array<{ code: string; display: string; type: string }>
  } | null>(null)

  const [showAllergyModal, setShowAllergyModal] = useState(false)

  const [showQueueScreenModal, setShowQueueScreenModal] = useState(false)

  const [showSettingsModal, setShowSettingsModal] = useState(false)


  const [batchDispensing, setBatchDispensing] = useState(false)

  const [actionNotice, setActionNotice] = useState<{
    id: number
    tone: 'success' | 'info' | 'warning' | 'error'
    text: string
  } | null>(null)


  const showActionNotice = (tone: 'success' | 'info' | 'warning' | 'error', text: string) => {
    setActionNotice({ id: Date.now(), tone, text })
  }


  useEffect(() => {
    if (!actionNotice) return
    const timeout = window.setTimeout(
      () => setActionNotice(null),
      actionNotice.tone === 'error' || actionNotice.tone === 'warning' ? 8000 : 5000,
    )
    return () => window.clearTimeout(timeout)
  }, [actionNotice])


  useEffect(() => {
    scannedTraceCodesRef.current = scannedTraceCodes
  }, [scannedTraceCodes])


  useEffect(() => () => {
    if (traceBatchTimerRef.current !== null) window.clearTimeout(traceBatchTimerRef.current)
  }, [])


  const sites = useQuery({ queryKey: ['pharmacy-sites', organizationId], queryFn: () => api.pharmacy.sites(organizationId) })

  const eligibleSites = useMemo(() => (sites.data ?? []).filter((site) => site.active
    && site.siteType === 'PHARMACY'
    && site.departmentId === departmentId), [departmentId, sites.data])

  const selectedSite = eligibleSites[0]

  const siteId = selectedSite?.id ?? ''

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

  const departmentAssignments = useQuery({
    queryKey: ['pharmacy-department-assignments', organizationId, departmentId],
    queryFn: () => api.organization.assignments({ organizationId, departmentId }),
  })

  const practitioner = useQuery({
    queryKey: ['practitioner-detail', practitionerId], queryFn: () => api.organization.practitioner(practitionerId),
    enabled: Boolean(practitionerId),
  })

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


  const queryVisibleInbox = useMemo(() => {
    if (mode !== 'query') return visibleInbox
    return visibleInbox.filter((item) => (pharmacyQueryFilters.status === 'ALL'
      || item.taskStatus === pharmacyQueryFilters.status)
      && pharmacyQueryItemMatches(item, pharmacyQueryFilters.keyword)
      && pharmacyQueryItemInDateRange(item, pharmacyQueryFilters.startDate, pharmacyQueryFilters.endDate))
      .sort((left, right) => (right.dispensedAt ?? '').localeCompare(left.dispensedAt ?? ''))
  }, [mode, pharmacyQueryFilters, visibleInbox])


  const pharmacyQueryPageCount = Math.max(1, Math.ceil(queryVisibleInbox.length / pharmacyQueryPageSize))

  const pagedPharmacyQueryInbox = useMemo(() => queryVisibleInbox.slice(
    pharmacyQueryPage * pharmacyQueryPageSize,
    (pharmacyQueryPage + 1) * pharmacyQueryPageSize,
  ), [pharmacyQueryPage, pharmacyQueryPageSize, queryVisibleInbox])


  useEffect(() => {
    if (pharmacyQueryPage >= pharmacyQueryPageCount) setPharmacyQueryPage(pharmacyQueryPageCount - 1)
  }, [pharmacyQueryPage, pharmacyQueryPageCount])


  const displayInbox = mode === 'query' ? queryVisibleInbox : visibleInbox


  const querySummary = useMemo(() => {
    if (mode !== 'query') return { total: 0, completed: 0, returned: 0, exceptions: 0 }
    return queryVisibleInbox.reduce((summary, item) => {
      summary.total += 1
      if (item.taskStatus === 'COMPLETED') summary.completed += 1
      if (item.taskStatus === 'PARTIALLY_RETURNED' || item.taskStatus === 'RETURNED') summary.returned += 1
      if (item.taskStatus === 'REJECTED' || item.taskStatus === 'CANCELLED' || item.taskStatus === 'STOPPED') summary.exceptions += 1
      return summary
    }, { total: 0, completed: 0, returned: 0, exceptions: 0 })
  }, [mode, queryVisibleInbox])


  useEffect(() => {
    if ((!linkedEncounterId && !linkedResidentId) || !inbox.data) return
    const target = inbox.data.find((item) => linkedEncounterId
      ? item.request.encounterId === linkedEncounterId : item.request.residentId === linkedResidentId)
    if (target) {
      setRequestId(target.request.id)
      setSelectedResidentId(target.request.residentId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId')
    next.delete('residentId')
    setSearchParams(next, { replace: true })
  }, [inbox.data, linkedEncounterId, linkedResidentId, searchParams, setSearchParams])


  useEffect(() => {
    if (linkedEncounterId || linkedResidentId) return
    if (!requestId && displayInbox.length) setRequestId(displayInbox[0].request.id)
    if (requestId && !displayInbox.some((item) => item.request.id === requestId)) {
      setRequestId(displayInbox[0]?.request.id ?? '')
    }
  }, [displayInbox, linkedEncounterId, linkedResidentId, requestId])


  useEffect(() => {
    setStockItemId('')
    setReviewResult('PASS')
    setReasonCode('')
    setDescription('')
  }, [siteId, requestId])


  const selected = mode === 'ward' ? undefined : displayInbox.find((item) => item.request.id === requestId)


  const residentsLookup = useQuery({
    queryKey: ['pharmacy-residents-lookup', organizationId],
    queryFn: () => api.residents.page({ size: 200 }),
    enabled: mode === 'dispensing' || mode === 'query',
  })


  const residentMap = useMemo(() => {
    const byId = new Map<string, { fullName: string; gender?: string; birthDate?: string; maskedNationalId?: string; phone?: string }>()
    const byNo = new Map<string, { fullName: string; gender?: string; birthDate?: string; maskedNationalId?: string; phone?: string }>()
    for (const r of residentsLookup.data?.content ?? []) {
      const info = {
        fullName: r.fullName,
        gender: r.gender,
        birthDate: r.birthDate,
        maskedNationalId: r.maskedNationalId || undefined,
        phone: r.phone,
      }
      byId.set(r.id, info)
      if (r.healthRecordNo) byNo.set(r.healthRecordNo, info)
    }
    return {
      get(key?: string) {
        if (!key) return undefined
        return byId.get(key) || byNo.get(key)
      },
    }
  }, [residentsLookup.data])


  // In dispensing mode, we group inbox items by patient
  const patientGroups = useMemo(() => {
    if (mode !== 'dispensing') return []
    const groupsMap = new Map<string, DispensingPatientGroup>()

    for (const item of visibleInbox) {
      const resId = item.request.residentId || 'unknown'
      const existing = groupsMap.get(resId)
      const resInfo = residentMap.get(resId)
      const reqSnapshot = item.request.medicationSnapshot as Record<string, unknown> | undefined
      const snapName = resInfo?.fullName
        || (reqSnapshot?.residentName as string)
        || (item.request as unknown as { residentName?: string }).residentName
        || (resId !== 'unknown' && resId.length > 8 ? `患者 (${resId.slice(-4)})` : '患者')
      const snapGender = resInfo?.gender || (reqSnapshot?.gender as string | undefined)
      const snapBirth = resInfo?.birthDate || (reqSnapshot?.birthDate as string | undefined)
      const snapId = resInfo?.maskedNationalId || (reqSnapshot?.nationalId as string | undefined)
      const snapPhone = resInfo?.phone || (reqSnapshot?.phone as string | undefined)

      if (!existing) {
        groupsMap.set(resId, {
          residentId: resId,
          residentName: snapName,
          gender: snapGender,
          birthDate: snapBirth,
          nationalId: snapId,
          phone: snapPhone,
          encounterId: item.request.encounterId,
          encounterNo: item.clinicalContext?.encounterNo,
          clinicianId: item.clinicalContext?.clinicianId,
          items: [item],
        })
      } else {
        existing.items.push(item)
      }
    }

    return Array.from(groupsMap.values())
  }, [mode, residentMap, visibleInbox])


  const filteredPatientGroups = useMemo(() => {
    if (!appliedSearchKeyword) return patientGroups
    return patientGroups.filter((patient) => patientMatchesSearch(patient, appliedSearchKeyword))
  }, [appliedSearchKeyword, patientGroups])


  // Sync selected resident
  useEffect(() => {
    if (mode === 'dispensing') {
      if (!selectedResidentId && patientGroups.length > 0) {
        setSelectedResidentId(patientGroups[0].residentId)
      } else if (selectedResidentId && !patientGroups.some((p) => p.residentId === selectedResidentId)) {
        setSelectedResidentId(patientGroups[0]?.residentId ?? '')
      }
    }
  }, [mode, patientGroups, selectedResidentId])


  const activePatient = patientGroups.find((p) => p.residentId === selectedResidentId) ?? patientGroups[0]


  const activeResidentId = mode === 'dispensing' ? activePatient?.residentId : undefined

  const showDispenseVerification = Boolean(activeResidentId)


  const residentProfile = useQuery({
    queryKey: ['pharmacy-resident-profile', activeResidentId],
    queryFn: () => api.residents.profile(activeResidentId!),
    enabled: showDispenseVerification,
  })


  const resident = useQuery({
    queryKey: ['pharmacy-resident-verification', activeResidentId],
    queryFn: () => api.residents.get(activeResidentId!),
    enabled: showDispenseVerification,
  })


  const allergies = useQuery({
    queryKey: ['pharmacy-allergy-verification', activeResidentId],
    queryFn: () => api.residents.allergies(activeResidentId!),
    enabled: showDispenseVerification,
  })


  // Group prescriptions for active patient
  const prescriptionCards = useMemo(() => {
    if (!activePatient) return []
    const map = new Map<string, PharmacyInboxItem[]>()
    for (const item of activePatient.items) {
      const pKey = item.request.prescriptionId || item.request.requestNo || item.request.id
      const arr = map.get(pKey) || []
      arr.push(item)
      map.set(pKey, arr)
    }

    const cards = []
    let index = 1
    for (const [pKey, items] of map.entries()) {
      const first = items[0]
      const title = `处方${CHINESE_NUMBER_WORDS[index - 1] || index}`
      const totalAmount = sumRecordedAmounts(items.map((it) => recordedMedicationAmount(it.request)))
      const isDispensed = items.every((it) => it.taskStatus === 'COMPLETED')
      const isReady = items.some((it) => it.taskStatus === 'READY_TO_DISPENSE' || it.taskStatus === 'PARTIALLY_DISPENSED')
      const statusLabel = isDispensed ? '已发药' : isReady ? '已配药' : '未配药'
      const isChinese = items.some((it) => it.request.medicationType === 'CHINESE_PATENT' || it.request.medicationType === 'HERBAL')

      const snap = (first.request.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
      const orgName = (snap.organizationName as string) || '开立机构未记录'
      const deptName = (snap.departmentName as string) || '开立科室未记录'
      const doctorName = (snap.doctorName as string) || (snap.clinicianName as string) || (first.clinicalContext?.clinicianId ? `医生标识 ${first.clinicalContext.clinicianId}` : '开立医生未记录')

      cards.push({
        key: pKey,
        title,
        orgName,
        deptName,
        doctorName,
        authoredAt: first.request.authoredAt,
        statusLabel,
        isDispensed,
        isChinese,
        totalAmount,
        items,
        clinicalContext: first.clinicalContext,
      })
      index++
    }
    return cards
  }, [activePatient])


  // Refreshing the same prescription identities must preserve the pharmacist's selections.
  const selectionIdentity = useRef('')
  useEffect(() => {
    const identity = JSON.stringify([activePatient?.residentId, prescriptionCards.map(card => card.key).sort()])
    if (selectionIdentity.current === identity) return
    selectionIdentity.current = identity
    setCheckedPrescriptionKeys(new Set(prescriptionCards.map(card => card.key)))
  }, [activePatient?.residentId, prescriptionCards])


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
    enabled: mode !== 'query' && Boolean(selected?.taskId),
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
    queryFn: () => api.pharmacy.trace(selected!.taskId!), enabled: mode !== 'query' && Boolean(selected?.taskId),
  })

  const eligibleAssignments = useMemo(() => {
    const detailAssignments = practitioner.data?.assignments ?? []
    const directoryAssignments = departmentAssignments.data ?? []
    return (detailAssignments.length ? detailAssignments : directoryAssignments).filter((assignment) =>
      assignment.organizationId === organizationId && assignment.departmentId === departmentId
        && assignment.sdPersonnelStatus === 'ACTIVE'
        && (!assignment.practitionerId || assignment.practitionerId === practitionerId))
  }, [departmentAssignments.data, departmentId, organizationId, practitioner.data, practitionerId])


  const preferredDepartmentAssignment = useMemo(() => {
    const activeAssignments = (departmentAssignments.data ?? []).filter((assignment) =>
      assignment.organizationId === organizationId && assignment.departmentId === departmentId
        && assignment.sdPersonnelStatus === 'ACTIVE' && assignment.practitionerId)
    return activeAssignments.find((assignment) => assignment.sdPositionType === 'PHARMACY'
      && assignment.primaryAssignment)
      ?? activeAssignments.find((assignment) => assignment.sdPositionType === 'PHARMACY')
      ?? activeAssignments.find((assignment) => assignment.primaryAssignment)
      ?? activeAssignments[0]
  }, [departmentAssignments.data, departmentId, organizationId])


  useEffect(() => {
    if (!preferredDepartmentAssignment?.practitionerId) return
    if (!practitionerId) {
      setPractitionerId(preferredDepartmentAssignment.practitionerId)
      setAssignmentId(preferredDepartmentAssignment.id)
      return
    }
    if (practitionerId === preferredDepartmentAssignment.practitionerId && !assignmentId) {
      setAssignmentId(preferredDepartmentAssignment.id)
    }
  }, [assignmentId, practitionerId, preferredDepartmentAssignment])


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
    mutationFn: () => {
      const quantity = dispenseQuantity.trim() ? Number(dispenseQuantity)
        : selectedLine ? selectedLine.plannedQuantity - selectedLine.dispensedQuantity : NaN
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('缺少有效的待发药数量，请核实发药任务')
      return api.pharmacy.dispense(selected!.taskId!, {
      requestCode: `DSP-${task.data!.taskNo}-${Date.now()}`,
      operationQuantity: quantity,
      dispenserPractitionerId: practitionerId,
      dispenserAssignmentId: assignmentId,
      description: '已完成患者身份、处方内容与药品实物核对后发药',
      })
    },
    onSuccess: async (value) => {
      setDispenseQuantity(''); await refresh(value.taskId)
    },
  })


  // Batch Dispense handler for F4 shortcut and main button
  const handleBatchDispenseF4 = async () => {
    if (!activePatient || batchDispensing) return
    const checkedCards = prescriptionCards.filter((c) => checkedPrescriptionKeys.has(c.key))
    if (!checkedCards.length) {
      showActionNotice('info', '请至少勾选一张待发药处方')
      return
    }

    const pendingItems = checkedCards.flatMap((card) => card.items)
      .filter((item) => item.taskStatus !== 'COMPLETED')
    if (!pendingItems.length) {
      showActionNotice('info', '所选处方均已完成发药，无需重复处理')
      return
    }
    const invalidQuantity = pendingItems.find((item) => !Number.isFinite(item.request.quantity) || item.request.quantity <= 0)
    if (invalidQuantity) {
      showActionNotice('warning', `药品“${invalidQuantity.request.medicationName}”缺少有效的发药数量，请核实处方`)
      return
    }
    if (!practitionerId || !assignmentId) {
      showActionNotice('warning', departmentAssignments.isPending
        ? '正在加载当前药房的药师任职，请稍后重试'
        : '当前药房未找到有效的药师任职，请先在人员与岗位中配置后重试')
      return
    }
    const missingTraceScan = pendingItems.find((item) => itemRequiresTrace(item)
      && getItemScannedCount(item.request) < item.request.quantity)
    if (missingTraceScan) {
      setLastScannedRequestId(missingTraceScan.request.id)
      showActionNotice('warning', `请先扫齐“${missingTraceScan.request.medicationName}”的追溯码`)
      scanInputRef.current?.focus()
      return
    }

    setBatchDispensing(true)
    let dispensedCount = 0
    try {
      for (const card of checkedCards) {
        for (const item of card.items) {
          if (item.taskStatus === 'COMPLETED') continue
          // 1. Intake if task doesn't exist
          let currentTaskId = item.taskId
          let currentTaskStatus: DispenseTaskStatus | undefined = item.taskStatus
          if (!currentTaskId) {
            const availStockItem = findDispenseStockItem(item)
            if (availStockItem) {
              const res = await api.pharmacy.intake(item.request.id, availStockItem.id, '药房自动接方')
              currentTaskId = res.id
              currentTaskStatus = res.status
            }
          }
          if (!currentTaskId) {
            throw new Error(`药品“${item.request.medicationName}”未找到可用库存，无法完成发药`)
          }

          // Every required business step must succeed before this item counts as dispensed.
          if (currentTaskStatus === 'READY_TO_PICK') {
            const reservation = await api.pharmacy.reserve(currentTaskId, 30)
            currentTaskStatus = reservation.taskStatus
          }
          if (currentTaskStatus === 'PICKING') {
            const preparation = await api.pharmacy.completePicking(currentTaskId, {
              pickerPractitionerId: practitionerId,
              pickerAssignmentId: assignmentId,
              description: '发药前快速复核完成',
            })
            currentTaskStatus = preparation.taskStatus
          }
          if (currentTaskStatus !== 'READY_TO_DISPENSE' && currentTaskStatus !== 'PARTIALLY_DISPENSED') {
            throw new Error(`药品“${item.request.medicationName}”当前状态为${taskStatusText[currentTaskStatus ?? '']
              ?? currentTaskStatus ?? '未知'}，暂不能发药`)
          }
          await api.pharmacy.dispense(currentTaskId, {
            requestCode: `DSP-BATCH-${item.request.id}-${Date.now()}`,
            operationQuantity: item.request.quantity,
            dispenserPractitionerId: practitionerId,
            dispenserAssignmentId: assignmentId,
            description: '已核对处方与患者身份一键发药',
            traceCodeIds: scannedTraceCodes[item.request.id]?.map((code) => code.id),
          })
          clearItemScans(item.request.id)
          dispensedCount++
        }
      }
    } catch (err) {
      const failureReason = errorMessage(err)
      if (dispensedCount > 0) {
        showActionNotice(
          'warning',
          `部分发药完成：已完成 ${dispensedCount}/${pendingItems.length} 项；其余未完成原因：${failureReason}`,
        )
      } else {
        showActionNotice('error', `发药失败：${failureReason}`)
      }
      await refresh().catch(() => undefined)
      setBatchDispensing(false)
      return
    }

    const totalDispensedAmount = sumRecordedAmounts(checkedCards.map((card) => card.totalAmount))
    showActionNotice(
      'success',
      `已成功完成发药：${activePatient.residentName}，发药处方 ${checkedCards.length} 张，${displayRecordedAmount(totalDispensedAmount)}`,
    )
    try {
      await refresh()
    } catch (err) {
      showActionNotice('warning', `发药已完成，但列表刷新失败：${errorMessage(err)}`)
    } finally {
      setBatchDispensing(false)
    }
  }


  // Keyboard shortcut listener for F4
  // One keyboard listener uses the latest checked prescriptions and operation state.
  const batchDispenseHandler = useRef(handleBatchDispenseF4)
  useEffect(() => { batchDispenseHandler.current = handleBatchDispenseF4 })
  useEffect(() => {
    if (mode !== 'dispensing') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault()
        void batchDispenseHandler.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode])


  // Call patient speech/screen trigger
  const handleCallPatient = (patient: typeof activePatient) => {
    if (!patient) return
    const text = `请 ${patient.residentName} 到 ${selectedWindow} 取药`
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'zh-CN'
        utterance.rate = 1.0
        window.speechSynthesis.speak(utterance)
      } catch {
        // speech synthesis fallback
      }
    }
    showActionNotice('info', `正在叫号：${text}`)
    setSelectedResidentId(patient.residentId)
  }


  const togglePrescriptionCheck = (key: string) => {
    setCheckedPrescriptionKeys((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }


  const findDispenseStockItem = (item: PharmacyInboxItem) => {
    const activeItems = (stockItems.data ?? []).filter((value) => value.status === 'ACTIVE')
    return activeItems.find((value) => value.id === item.stockItemId)
      ?? activeItems.find((value) => value.catalogItemId === item.request.catalogItemId)
      ?? (item.request.substitutionAllowed
        ? activeItems.find((value) => value.medicationId === item.request.medicationId)
        : undefined)
  }


  const itemRequiresTrace = (item: PharmacyInboxItem) => {
    const configuredItem = findDispenseStockItem(item)
    if (configuredItem) return configuredItem.traceRequired
    if (item.request.id === selectedLine?.requestId) return selectedLine.traceRequired
    return Boolean(scannedTraceCodes[item.request.id]?.length)
  }


  const getItemScannedCount = (req: MedicationRequest) => (scannedTraceCodes[req.id] ?? [])
    .reduce((total, code) => total + code.packageQuantity, 0)


  const clearItemScans = (requestId: string) => {
    setScannedTraceCodes((previous) => {
      const next = { ...previous }
      delete next[requestId]
      scannedTraceCodesRef.current = next
      return next
    })
  }


  const matchesTraceItem = (item: PharmacyInboxItem, traceCode: InventoryTraceCode) => {
    if (item.stockItemId === traceCode.stockItemId) return true
    const configuredItem = (stockItems.data ?? []).find((value) => value.id === traceCode.stockItemId)
    if (!configuredItem) return false
    return configuredItem.catalogItemId === item.request.catalogItemId
      || (item.request.substitutionAllowed && configuredItem.medicationId === item.request.medicationId)
  }


  const processTraceCodeBatch = async (traceCodes: string[]) => {
    if (!siteId) {
      showActionNotice('warning', '当前科室未配置可用发药药房')
      return
    }

    const groups = groupTraceCodesByPrefix(traceCodes)
    const resolvedByCode = new Map<string, InventoryTraceCode>()
    const failures: string[] = []
    let failedCodeCount = 0
    const groupResults = await Promise.all(Array.from(groups.entries()).map(async ([prefix, codes]) => {
      try {
        return { prefix, codes, result: await api.pharmacy.scanTraceCodes(siteId, codes) }
      } catch (error) {
        return { prefix, codes, error }
      }
    }))
    for (const group of groupResults) {
      if ('error' in group) {
        failures.push(`前缀 ${group.prefix}：${errorMessage(group.error)}`)
        failedCodeCount += group.codes.length
        continue
      }
      for (const code of group.result.codes) {
        resolvedByCode.set(code.traceCode.replace(/\s+/g, '').toUpperCase(), code)
      }
      for (const missingCode of group.result.notFoundCodes) {
        failures.push(`${missingCode}：未找到追溯码`)
        failedCodeCount++
      }
    }

    const previous = scannedTraceCodesRef.current
    const next = Object.fromEntries(Object.entries(previous).map(([requestId, codes]) => [requestId, [...codes]]))
    const scannedIds = new Set(Object.values(next).flat().map((code) => code.id))
    const scannedCount = (request: MedicationRequest) => (next[request.id] ?? [])
      .reduce((total, code) => total + code.packageQuantity, 0)
    let successCount = 0
    let duplicateCount = 0
    let lastTarget: PharmacyInboxItem | undefined

    for (const inputCode of traceCodes) {
      const normalized = inputCode.replace(/\s+/g, '').toUpperCase()
      const traceCode = resolvedByCode.get(normalized)
      if (!traceCode) continue
      if (scannedIds.has(traceCode.id)) {
        duplicateCount++
        continue
      }
      if (traceCode.status !== 'AVAILABLE') {
        failures.push(`${traceCode.traceCode}：状态为 ${traceCode.status}`)
        failedCodeCount++
        continue
      }

      const matchingItems = visibleInbox.filter((item) => item.taskStatus !== 'COMPLETED'
        && matchesTraceItem(item, traceCode))
      const activeMatches = matchingItems.filter((item) => item.request.residentId === activePatient?.residentId)
      let target = activeMatches.find((item) => scannedCount(item.request) < item.request.quantity)
      if (!target && activeMatches.length) {
        failures.push(`${traceCode.traceCode}：“${activeMatches[0].request.medicationName}”已扫齐`)
        failedCodeCount++
        continue
      }
      if (!target) {
        const incompleteMatches = matchingItems.filter((item) => scannedCount(item.request) < item.request.quantity)
        if (new Set(incompleteMatches.map((item) => item.request.residentId)).size > 1) {
          failures.push(`${traceCode.traceCode}：多个患者包含该药品，请先选择患者`)
          failedCodeCount++
          continue
        }
        target = incompleteMatches[0]
      }
      if (!target) {
        failures.push(`${traceCode.traceCode}：当前待发药处方中没有“${traceCode.productName}”`)
        failedCodeCount++
        continue
      }

      next[target.request.id] = [...(next[target.request.id] ?? []), traceCode]
      scannedIds.add(traceCode.id)
      successCount++
      lastTarget = target
    }

    if (successCount > 0) {
      scannedTraceCodesRef.current = next
      setScannedTraceCodes(next)
      setAppliedSearchKeyword('')
      if (lastTarget) {
        setSelectedResidentId(lastTarget.request.residentId)
        setRequestId(lastTarget.request.id)
        setLastScannedRequestId(lastTarget.request.id)
      }
    }

    const failedCount = failedCodeCount
    const summary = `批量扫入完成：成功 ${successCount} 个，重复 ${duplicateCount} 个，失败 ${failedCount} 个，按前 7 位合并为 ${groups.size} 组请求`
    if (failedCount > 0) {
      showActionNotice('warning', `${summary}；${failures.slice(0, 3).join('；')}${failedCount > 3 ? '；其余失败请分批核对' : ''}`)
    } else if (duplicateCount > 0) {
      showActionNotice('warning', summary)
    } else {
      setActionNotice(null)
    }
  }


  const scheduleTraceBatchFlush = (delay = TRACE_SCAN_DEBOUNCE_MS) => {
    if (traceBatchTimerRef.current !== null) window.clearTimeout(traceBatchTimerRef.current)
    traceBatchTimerRef.current = window.setTimeout(() => {
      traceBatchTimerRef.current = null
      void flushTraceCodeQueue()
    }, delay)
  }


  const enqueueTraceCodes = (traceCodes: string[], flushImmediately = false) => {
    const queued = pendingTraceCodesRef.current
    const queuedNormalized = new Set(queued.map((code) => code.replace(/\s+/g, '').toUpperCase()))
    for (const traceCode of traceCodes) {
      const normalized = traceCode.replace(/\s+/g, '').toUpperCase()
      if (!queuedNormalized.has(normalized)) {
        queued.push(traceCode)
        queuedNormalized.add(normalized)
      }
    }
    setQueuedTraceCount(queued.length)
    if (flushImmediately) void flushTraceCodeQueue()
    else scheduleTraceBatchFlush()
  }


  async function flushTraceCodeQueue() {
    if (traceBatchProcessingRef.current) {
      scheduleTraceBatchFlush()
      return
    }
    if (traceBatchTimerRef.current !== null) {
      window.clearTimeout(traceBatchTimerRef.current)
      traceBatchTimerRef.current = null
    }
    const traceCodes = pendingTraceCodesRef.current.splice(0)
    setQueuedTraceCount(0)
    if (!traceCodes.length) return
    traceBatchProcessingRef.current = true
    setScanPending(true)
    try {
      await processTraceCodeBatch(traceCodes)
    } finally {
      traceBatchProcessingRef.current = false
      setScanPending(false)
      if (pendingTraceCodesRef.current.length) scheduleTraceBatchFlush()
    }
  }


  const handleScanOrSearch = (flushImmediately = false) => {
    const rawCode = scanKeyword.trim()
    if (!rawCode) {
      if (pendingTraceCodesRef.current.length) {
        void flushTraceCodeQueue()
        return
      }
      setAppliedSearchKeyword('')
      showActionNotice('info', '已清除查询条件，显示全部待发药患者')
      return
    }

    const parsedTraceCodes = parseTraceCodeBatch(rawCode)
    if (parsedTraceCodes.length > 1) {
      setScanKeyword('')
      enqueueTraceCodes(parsedTraceCodes, flushImmediately)
      return
    }

    const localMatches = patientGroups.filter((patient) => patientMatchesSearch(patient, rawCode))
    const searchIntent = inferDispenseSearchIntent(rawCode, localMatches.length ? localMatches : patientGroups)
    if (searchIntent !== 'TRACE_CODE') {
      setAppliedSearchKeyword(rawCode)
      const targetPatient = localMatches[0]
      if (targetPatient) {
        const normalizedKeyword = rawCode.toLowerCase()
        const targetItem = targetPatient.items.find((item) => requestMatchesSearch(item, normalizedKeyword))
          ?? targetPatient.items[0]
        setSelectedResidentId(targetPatient.residentId)
        if (targetItem) setRequestId(targetItem.request.id)
        showActionNotice('info', `已按${dispenseSearchIntentText[searchIntent]}查询，匹配 ${localMatches.length} 位待发药患者`)
      } else {
        showActionNotice('warning', `未找到匹配该${dispenseSearchIntentText[searchIntent]}的待发药患者`)
      }
      return
    }

    setScanKeyword('')
    enqueueTraceCodes(parsedTraceCodes, flushImmediately)
  }


  useEffect(() => {
    if (!lastScannedRequestId) return
    const row = Array.from(document.querySelectorAll<HTMLElement>('[data-request-id]'))
      .find((element) => element.dataset.requestId === lastScannedRequestId)
    if (typeof row?.scrollIntoView === 'function') {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [lastScannedRequestId, selectedResidentId, scannedTraceCodes])


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


  const verificationError = showDispenseVerification ? resident.error || allergies.error : null

  const error = sites.error || inbox.error || (mode === 'review' ? prescriptionReviewMode.error : null)
    || stockItems.error || task.error || practitioners.error || departmentAssignments.error
    || practitioner.error || balances.error || reservations.error || intake.error || review.error
    || reserve.error || releaseReservation.error || trace.error || completePicking.error
    || dispense.error || returnMedication.error || verificationError


  const configuredReviewMode = prescriptionReviewMode.data?.mode ?? 'DISABLED'

  const canReview = configuredReviewMode === 'PRE_DISPENSE'
    ? task.data?.status === 'PENDING_REVIEW' || task.data?.status === 'INTERVENTION'
    : configuredReviewMode === 'POST_DISPENSE' && Boolean(task.data && postReviewTaskStatuses.has(task.data.status)
      && !task.data.reviews.length)

  const activeDrugAllergies = (allergies.data ?? []).filter((value) => value.assertionType === 'ALLERGY'
    && (!value.categoryCode || value.categoryCode === 'DRUG'))

  const hasNoKnownDrugAllergy = (allergies.data ?? []).some((value) => value.assertionType === 'NO_KNOWN_DRUG_ALLERGY'
    || value.assertionType === 'NO_KNOWN_ALLERGY')

  const copy = workspaceCopy[mode]


  const applyPharmacyQuery = () => {
    if (pharmacyQueryDraft.startDate && pharmacyQueryDraft.endDate
      && pharmacyQueryDraft.startDate > pharmacyQueryDraft.endDate) {
      showActionNotice('warning', '开始日期不能晚于结束日期')
      return
    }
    setPharmacyQueryFilters({ ...pharmacyQueryDraft, keyword: pharmacyQueryDraft.keyword.trim() })
    setPharmacyQueryPage(0)
  }


  const resetPharmacyQuery = () => {
    const defaults = defaultPharmacyQueryFilters()
    setPharmacyQueryDraft(defaults)
    setPharmacyQueryFilters(defaults)
    setPharmacyQueryPage(0)
    setRequestId('')
  }


  // Calculations for bottom summary in dispensing mode
  const checkedPrescriptions = prescriptionCards.filter((c) => checkedPrescriptionKeys.has(c.key))

  const westernAmount = sumRecordedAmounts(checkedPrescriptions.filter((c) => !c.isChinese).map((c) => c.totalAmount))

  const chineseAmount = sumRecordedAmounts(checkedPrescriptions.filter((c) => c.isChinese).map((c) => c.totalAmount))

  const selectedTotalAmount = sumRecordedAmounts(checkedPrescriptions.map((c) => c.totalAmount))

  const patientTotalAmount = sumRecordedAmounts(prescriptionCards.map((c) => c.totalAmount))


  // Patient profile fields
  const pProfile = residentProfile.data

  const pResident = resident.data || pProfile?.resident

  const pFullName = pResident?.fullName || activePatient?.residentName || '患者'

  const pGender = genderText(pResident?.gender || activePatient?.gender)

  const pAge = ageText(pResident?.birthDate || activePatient?.birthDate)

  const pEthnicity = pProfile?.demographicProfile?.ethnicityCodeText || '民族未维护'

  const pCoverage = pProfile?.coverages?.[0]?.sdCoverageTypeText || pProfile?.coverages?.[0]?.sdCoverageType || '费用类别未知'

  const pNationalId = pResident?.maskedNationalId || activePatient?.nationalId || '未维护'

  const pPhone = pResident?.phone || activePatient?.phone || '未维护'

  const pAddress = pProfile?.addresses?.[0]?.addressText || '未维护'
 return { practitioners, queryVisibleInbox, pharmacyQueryPage, pharmacyQueryPageSize, setPharmacyQueryDraft, setPharmacyQueryFilters, setPharmacyQueryPage, copy, refresh, actionNotice, setActionNotice, error, sites, inbox, eligibleSites, pharmacyQueryDraft, applyPharmacyQuery, resetPharmacyQuery, pagedPharmacyQueryInbox, residentMap, querySummary, setPharmacyQueryPageSize, pharmacyQueryPageCount, mode, prescriptionReviewMode, selected, selectedSite, api, organizationId, stockItems, eligibleAssignments, practitionerId, assignmentId, setPractitionerId, setAssignmentId, displayInbox, visibleInbox, requestId, setRequestId, task, configuredReviewMode, canReview, reviewResult, setReviewResult, reasonCode, setReasonCode, description, setDescription, review, returnLineId, setReturnLineId, returnableLines, selectedReturnLine, returnQuantity, setReturnQuantity, returnDisposition, setReturnDisposition, returnReason, setReturnReason, returnMedication, trace, selectedWindow, setSelectedWindow, autoCall, setAutoCall, scanInputRef, scanKeyword, setScanKeyword, scanPending, queuedTraceCount, enqueueTraceCodes, handleScanOrSearch, setShowQueueScreenModal, batchDispensing, handleBatchDispenseF4, completePicking, showActionNotice, setShowSettingsModal, expiryDaysFilter, setExpiryDaysFilter, filteredPatientGroups, appliedSearchKeyword, activePatient, setSelectedResidentId, handleCallPatient, pFullName, pGender, pAge, pEthnicity, pCoverage, pNationalId, pPhone, pAddress, activeDrugAllergies, setShowAllergyModal, prescriptionCards, checkedPrescriptionKeys, togglePrescriptionCheck, setActiveHistorySummary, itemRequiresTrace, getItemScannedCount, lastScannedRequestId, clearItemScans, westernAmount, chineseAmount, selectedTotalAmount, patientTotalAmount, activeHistorySummary, showAllergyModal, hasNoKnownDrugAllergy, showQueueScreenModal, showSettingsModal }
}
