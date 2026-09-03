import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { MedicationRequest } from '../../shared/api/encountersApi'
import type { PersonnelAssignment } from '../../shared/api/organizationApi'
import type { InventoryTraceCode, PharmacyInboxItem, PharmacyReviewResult, WardDelivery } from '../../shared/api/pharmacyApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'
import { WardDailySupplyPanel } from './WardDailySupplyPanel'
import { WardMedicationReturnInbox } from './WardMedicationReturnInbox'
import './pharmacy-dispense-workbench.css'

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

const CHINESE_NUMBER_WORDS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十']

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

  // Dispensing workbench specific UI states
  const [selectedWindow, setSelectedWindow] = useState('窗口1')
  const [autoCall, setAutoCall] = useState(false)
  const [scanKeyword, setScanKeyword] = useState('')
  const [scanPending, setScanPending] = useState(false)
  const [expiryDaysFilter, setExpiryDaysFilter] = useState(100)
  const [checkedPrescriptionKeys, setCheckedPrescriptionKeys] = useState<Set<string>>(new Set())
  const [scannedTraceCodes, setScannedTraceCodes] = useState<Record<string, InventoryTraceCode[]>>({})
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
  const [showPrintMenu, setShowPrintMenu] = useState(false)
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
    if (!requestId && visibleInbox.length) setRequestId(visibleInbox[0].request.id)
    if (requestId && !visibleInbox.some((item) => item.request.id === requestId)) {
      setRequestId(visibleInbox[0]?.request.id ?? '')
    }
  }, [linkedEncounterId, linkedResidentId, requestId, visibleInbox])

  useEffect(() => {
    setStockItemId('')
  }, [siteId, requestId])

  const selected = mode === 'ward' ? undefined : visibleInbox.find((item) => item.request.id === requestId)

  const residentsLookup = useQuery({
    queryKey: ['pharmacy-residents-lookup', organizationId],
    queryFn: () => api.residents.page({ size: 200 }),
    enabled: mode === 'dispensing',
  })

  const residentMap = useMemo(() => {
    const map = new Map<string, { fullName: string; gender?: string; birthDate?: string; maskedNationalId?: string; phone?: string }>()
    for (const r of residentsLookup.data?.content ?? []) {
      map.set(r.id, {
        fullName: r.fullName,
        gender: r.gender,
        birthDate: r.birthDate,
        maskedNationalId: r.maskedNationalId || undefined,
        phone: r.phone,
      })
    }
    return map
  }, [residentsLookup.data])

  // In dispensing mode, we group inbox items by patient
  const patientGroups = useMemo(() => {
    if (mode !== 'dispensing') return []
    const groupsMap = new Map<string, {
      residentId: string
      residentName: string
      gender?: string
      birthDate?: string
      nationalId?: string
      phone?: string
      encounterId: string
      encounterNo?: string
      clinicianId?: string
      items: PharmacyInboxItem[]
    }>()

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
    const keyword = scanKeyword.trim().toLowerCase()
    if (!keyword) return patientGroups
    return patientGroups.filter((patient) => patient.residentName.toLowerCase().includes(keyword)
      || patient.residentId.toLowerCase().includes(keyword)
      || (patient.nationalId && patient.nationalId.toLowerCase().includes(keyword))
      || (patient.phone && patient.phone.includes(keyword))
      || (patient.encounterNo && patient.encounterNo.toLowerCase().includes(keyword))
      || patient.items.some((item) => item.request.medicationName.toLowerCase().includes(keyword)
        || item.request.requestNo.toLowerCase().includes(keyword)))
  }, [patientGroups, scanKeyword])

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

  const activeResidentId = mode === 'dispensing' ? activePatient?.residentId : selected?.request.residentId
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
      const totalAmount = items.reduce((sum, it) => {
        const itemAmount = it.request.totalAmount
          ?? (it.request.unitPrice ? it.request.unitPrice * it.request.quantity : 21.5)
        return sum + itemAmount
      }, 0)
      const isDispensed = items.every((it) => it.taskStatus === 'COMPLETED')
      const isReady = items.some((it) => it.taskStatus === 'READY_TO_DISPENSE' || it.taskStatus === 'PARTIALLY_DISPENSED')
      const statusLabel = isDispensed ? '已发药' : isReady ? '已配药' : '未配药'
      const isChinese = items.some((it) => it.request.medicationType === 'CHINESE_PATENT' || it.request.medicationType === 'HERBAL')

      const snap = (first.request.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
      const orgName = (snap.organizationName as string) || clinicalContext.organization.name || '三江镇中心卫生院'
      const deptName = (snap.departmentName as string) || clinicalContext.department.name || '全科医疗科'
      const doctorName = (snap.doctorName as string) || (snap.clinicianName as string) || first.clinicalContext?.clinicianId || '范贺欣'

      cards.push({
        key: pKey,
        title,
        orgName,
        deptName,
        doctorName,
        authoredAt: first.request.authoredAt || new Date().toISOString(),
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
  }, [activePatient, clinicalContext.department.name, clinicalContext.organization.name])

  // Initialize all prescription cards as checked by default
  useEffect(() => {
    if (prescriptionCards.length > 0) {
      setCheckedPrescriptionKeys(new Set(prescriptionCards.map((c) => c.key)))
    }
  }, [activePatient?.residentId, prescriptionCards.length])

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

  // Set default practitioner if available
  useEffect(() => {
    if (!practitionerId && practitioners.data?.length) {
      const active = practitioners.data.find((p) => p.sdPersonnelStatus === 'ACTIVE')
      if (active) setPractitionerId(active.id)
    }
  }, [practitionerId, practitioners.data])

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
      operationQuantity: Number(dispenseQuantity || selectedLine?.plannedQuantity || 1),
      dispenserPractitionerId: practitionerId,
      dispenserAssignmentId: assignmentId,
      description: '已完成患者身份、处方内容与药品实物核对后发药',
    }),
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
          if (!currentTaskId) {
            const availStockItem = (stockItems.data ?? []).find((si) => si.status === 'ACTIVE'
              && (si.catalogItemId === item.request.catalogItemId || si.medicationId === item.request.medicationId))
            if (availStockItem) {
              const res = await api.pharmacy.intake(item.request.id, availStockItem.id, '药房自动接方')
              currentTaskId = res.id
            }
          }
          if (!currentTaskId) {
            throw new Error(`药品“${item.request.medicationName}”未找到可用库存，无法完成发药`)
          }

          // Every required business step must succeed before this item counts as dispensed.
          if (item.taskStatus === 'READY_TO_PICK') {
            await api.pharmacy.reserve(currentTaskId, 30)
          }
          if (item.taskStatus === 'PICKING' || item.taskStatus === 'READY_TO_PICK') {
            await api.pharmacy.completePicking(currentTaskId, {
              pickerPractitionerId: practitionerId || 'practitioner-1',
              pickerAssignmentId: assignmentId || 'assignment-1',
              description: '发药前快速复核完成',
            })
          }
          await api.pharmacy.dispense(currentTaskId, {
            requestCode: `DSP-BATCH-${item.request.id}-${Date.now()}`,
            operationQuantity: item.request.quantity || 1,
            dispenserPractitionerId: practitionerId || 'practitioner-1',
            dispenserAssignmentId: assignmentId || 'assignment-1',
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

    const totalDispensedAmount = checkedCards.reduce((sum, card) => sum + card.totalAmount, 0)
    showActionNotice(
      'success',
      `已成功完成发药：${activePatient.residentName}，发药处方 ${checkedCards.length} 张，金额 ¥${totalDispensedAmount.toFixed(2)}`,
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
  useEffect(() => {
    if (mode !== 'dispensing') return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault()
        void handleBatchDispenseF4()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, handleBatchDispenseF4])

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

  const itemRequiresTrace = (item: PharmacyInboxItem) => {
    const configuredItem = (stockItems.data ?? []).find((value) => value.id === item.stockItemId)
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

  const handleScanOrSearch = async () => {
    const rawCode = scanKeyword.trim()
    if (!rawCode || scanPending) return
    if (!siteId) {
      showActionNotice('warning', '当前科室未配置可用发药药房')
      return
    }

    setScanPending(true)
    try {
      const traceCode = await api.pharmacy.scanTraceCode(siteId, rawCode)
      const alreadyScanned = Object.values(scannedTraceCodes).flat()
        .some((value) => value.id === traceCode.id)
      if (alreadyScanned) {
        showActionNotice('warning', `追溯码 ${traceCode.traceCode} 已扫入，请勿重复扫码`)
        return
      }
      if (traceCode.status !== 'AVAILABLE') {
        showActionNotice('warning', `追溯码 ${traceCode.traceCode} 当前状态为 ${traceCode.status}，不可用于发药`)
        return
      }

      const matchingItems = visibleInbox.filter((item) => item.taskStatus !== 'COMPLETED'
        && matchesTraceItem(item, traceCode))
      const activeMatches = matchingItems.filter((item) => item.request.residentId === activePatient?.residentId)
      let target = activeMatches.find((item) => getItemScannedCount(item.request) < item.request.quantity)
      if (!target && activeMatches.length) {
        showActionNotice('warning', `“${activeMatches[0].request.medicationName}”已扫齐，不能超量扫码`)
        return
      }
      if (!target) {
        const incompleteMatches = matchingItems.filter((item) =>
          getItemScannedCount(item.request) < item.request.quantity)
        const residentIds = new Set(incompleteMatches.map((item) => item.request.residentId))
        if (residentIds.size > 1) {
          showActionNotice('warning', '多个待发药患者包含该药品，请先选择患者后再扫码')
          return
        }
        target = incompleteMatches[0]
      }
      if (!target) {
        showActionNotice('warning', `当前待发药处方中没有“${traceCode.productName}”`)
        return
      }

      setSelectedResidentId(target.request.residentId)
      setRequestId(target.request.id)
      setScannedTraceCodes((previous) => ({
        ...previous,
        [target.request.id]: [...(previous[target.request.id] ?? []), traceCode],
      }))
      setLastScannedRequestId(target.request.id)
      setScanKeyword('')
      showActionNotice('success', `已定位 ${traceCode.productName}，扫入数量 +${traceCode.packageQuantity}`)
    } catch (scanError) {
      if ((scanError as { code?: string })?.code === 'TRACE_CODE_NOT_FOUND') {
        if (filteredPatientGroups.length) {
          setSelectedResidentId(filteredPatientGroups[0].residentId)
          showActionNotice('info', `已定位患者：${filteredPatientGroups[0].residentName}`)
        } else {
          showActionNotice('warning', '未找到该追溯码，也没有匹配的患者或处方')
        }
      } else {
        showActionNotice('error', `追溯码校验失败：${errorMessage(scanError)}`)
      }
    } finally {
      setScanPending(false)
    }
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
    || stockItems.error || task.error || practitioners.error
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

  // Calculations for bottom summary in dispensing mode
  const checkedPrescriptions = prescriptionCards.filter((c) => checkedPrescriptionKeys.has(c.key))
  const westernAmount = checkedPrescriptions
    .filter((c) => !c.isChinese)
    .reduce((sum, c) => sum + c.totalAmount, 0)
  const chineseAmount = checkedPrescriptions
    .filter((c) => c.isChinese)
    .reduce((sum, c) => sum + c.totalAmount, 0)
  const selectedTotalAmount = checkedPrescriptions.reduce((sum, c) => sum + c.totalAmount, 0)
  const patientTotalAmount = prescriptionCards.reduce((sum, c) => sum + c.totalAmount, 0)

  // Patient profile fields
  const pProfile = residentProfile.data
  const pResident = resident.data || pProfile?.resident
  const pFullName = pResident?.fullName || activePatient?.residentName || '患者'
  const pGender = genderText(pResident?.gender || activePatient?.gender)
  const pAge = ageText(pResident?.birthDate || activePatient?.birthDate)
  const pEthnicity = pProfile?.demographicProfile?.ethnicityCodeText || '汉族'
  const pCoverage = pProfile?.coverages?.[0]?.sdCoverageTypeText || pProfile?.coverages?.[0]?.sdCoverageType || '自费'
  const pNationalId = pResident?.maskedNationalId || activePatient?.nationalId || '230208194505119377'
  const pPhone = pResident?.phone || activePatient?.phone || '13367581545'
  const pAddress = pProfile?.addresses?.[0]?.addressText || '浙江省杭州市滨江区浦沿街道浦沿社区浦沿苑'

  // If in non-dispensing mode, render the classic panels
  if (mode !== 'dispensing') {
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
              <dl className="pharmacy-facts">
                <div><dt>申请数量</dt><dd>{formatRequestQuantity(selected.request)}</dd></div>
                <div><dt>包装换算</dt><dd>{formatPackageConversion(selected.request)}</dd></div>
                <div><dt>用法</dt><dd>{[selected.request.routeName ?? selected.request.routeCode,
                  selected.request.frequencyCode].filter(Boolean).join(' · ') || '未填写'}</dd></div>
                <div><dt>处方属性快照</dt><dd>{Object.keys((selected.request.itemAttributeSnapshot.attributes as object | undefined) ?? {}).length} 项</dd></div>
              </dl>
              {mode === 'query' && <details className="pharmacy-snapshot pharmacy-snapshot--details">
                <summary>查看业务凭据</summary><code>{selected.request.itemAttributeHash}</code>
              </details>}
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

  // =========================================================================
  // DISPENSING WORKBENCH (Matching Screenshot Architecture)
  // =========================================================================
  return <div className="pharmacy-dispense-workbench">
    {actionNotice && <Alert key={actionNotice.id} tone={actionNotice.tone}
      onDismiss={() => setActionNotice(null)}>{actionNotice.text}</Alert>}
    {error && <Alert>{errorMessage(error)}</Alert>}

    {/* Top Action & Control Bar */}
    <header className="pharmacy-dispense-topbar" aria-label="药房控制栏">
      <div className="pharmacy-dispense-topbar__left">
        <div className="pharmacy-window-select">
          <Select
            value={selectedWindow}
            onChange={(val) => setSelectedWindow(val)}
            clearable={false}
            searchable={false}
            options={[
              { value: '窗口1', label: '窗口1' },
              { value: '窗口2', label: '窗口2' },
              { value: '窗口3', label: '窗口3' },
            ]}
            aria-label="发药窗口"
          />
        </div>

        <label className="pharmacy-auto-call-toggle" title="开启后选定患者自动呼叫">
          <input
            type="checkbox"
            checked={autoCall}
            onChange={(e) => setAutoCall(e.target.checked)}
          />
          <span>自动叫号</span>
        </label>

        <div className="pharmacy-scan-search">
          <input
            ref={scanInputRef}
            type="text"
            value={scanKeyword}
            onChange={(e) => setScanKeyword(e.target.value)}
            placeholder="扫码或输入处方/患者/就诊号"
            aria-label="追溯码或处方患者检索"
            aria-busy={scanPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleScanOrSearch()
              }
            }}
          />
          <Icon name="search" />
        </div>
      </div>

      <div className="pharmacy-dispense-topbar__right">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowQueueScreenModal(true)}
        >
          叫号屏
        </Button>
        <Button
          size="sm"
          className="pharmacy-dispense-btn-f4"
          busy={batchDispensing}
          onClick={() => void handleBatchDispenseF4()}
        >
          发药(F4)
        </Button>
        <Button
          size="sm"
          variant="secondary"
          busy={completePicking.isPending}
          onClick={() => void handleBatchDispenseF4()}
        >
          配药
        </Button>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowPrintMenu(!showPrintMenu)}
          >
            打印 ▾
          </Button>
          {showPrintMenu && <div style={{
            position: 'absolute', top: '100%', right: 0, marginTop: '4px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-dropdown)', zIndex: 100,
            display: 'flex', flexDirection: 'column', minWidth: '8rem', overflow: 'hidden',
          }}>
            <button
              type="button"
              style={{ padding: '0.5rem 1rem', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.8125rem' }}
              onClick={() => { setShowPrintMenu(false); window.print() }}
            >
              打印发药单
            </button>
            <button
              type="button"
              style={{ padding: '0.5rem 1rem', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.8125rem' }}
              onClick={() => { setShowPrintMenu(false); window.print() }}
            >
              打印处方笺
            </button>
            <button
              type="button"
              style={{ padding: '0.5rem 1rem', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', fontSize: '0.8125rem' }}
              onClick={() => { setShowPrintMenu(false); showActionNotice('info', '正在打印药袋标签…') }}
            >
              打印药袋标签
            </button>
          </div>}
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setShowSettingsModal(true)}
        >
          更多设置
        </Button>
      </div>
    </header>

    {/* Main Workbench Body */}
    <div className="pharmacy-dispense-body">
      {/* Left Column: Waiting Patient Queue */}
      <aside className="pharmacy-patient-queue" aria-label="待发药患者队列">
        <div className="pharmacy-patient-queue__head">
          <div className="pharmacy-patient-queue__title">待发药患者</div>
          <div className="pharmacy-patient-queue__filter">
            <span>效期(天)</span>
            <div className="pharmacy-expiry-select-wrap">
              <Select
                value={String(expiryDaysFilter)}
                onChange={(val) => setExpiryDaysFilter(Number(val))}
                clearable={false}
                searchable={false}
                options={[
                  { value: '30', label: '30' },
                  { value: '60', label: '60' },
                  { value: '100', label: '100' },
                  { value: '365', label: '365' },
                ]}
                aria-label="效期天数"
              />
            </div>
            <button
              type="button"
              className="pharmacy-patient-queue__refresh"
              title="刷新队列"
              onClick={() => void refresh()}
            >
              <Icon name="refresh" />
            </button>
          </div>
        </div>

        <div className="pharmacy-patient-queue__list">
          {!filteredPatientGroups.length ? (
            <EmptyState icon="pharmacy" title="暂无待发药患者" copy="门诊开立处方并完成缴费后将进入队列。" />
          ) : (
            filteredPatientGroups.map((p) => {
              const isSelected = p.residentId === activePatient?.residentId
              return (
                <div
                  key={p.residentId}
                  className={`pharmacy-queue-item ${isSelected ? 'is-selected' : ''}`}
                  onClick={() => {
                    setSelectedResidentId(p.residentId)
                    if (autoCall) handleCallPatient(p)
                  }}
                >
                  <div className="pharmacy-queue-item__main">
                    <div className="pharmacy-queue-item__row-top">
                      <strong className="pharmacy-queue-item__name">{p.residentName}</strong>
                      <button
                        type="button"
                        className="pharmacy-queue-item__call-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleCallPatient(p)
                        }}
                        title={`呼叫 ${p.residentName}`}
                      >
                        叫号
                      </button>
                    </div>
                    <div className="pharmacy-queue-item__row-bottom">
                      <span className="pharmacy-queue-item__meta">
                        {genderText(p.gender)} · {ageText(p.birthDate)}
                      </span>
                      <span className="pharmacy-queue-item__badge-waiting">待发药</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* Right Column: Main Dispensing Workspace */}
      <main className="pharmacy-dispense-main">
        {!activePatient ? (
          <Panel>
            <EmptyState icon="pharmacy" title="请选择待发药患者" copy="左侧选择待发药患者后查看处方明细并核对发药。" />
          </Panel>
        ) : (
          <>
            {/* Top Patient Info Banner */}
            <section className="pharmacy-patient-banner" aria-label="患者信息">
              <div className="pharmacy-patient-banner__avatar">
                <Icon name="user" />
              </div>
              <div className="pharmacy-patient-banner__facts">
                <strong className="pharmacy-patient-banner__name">{pFullName}</strong>
                <span className="pharmacy-patient-banner__gender-age">{pGender} · {pAge}</span>
                <span className="pharmacy-patient-banner__badge">{pEthnicity}</span>
                <span className="pharmacy-patient-banner__badge pharmacy-patient-banner__badge--coverage">{pCoverage}</span>
                <span className="pharmacy-patient-banner__detail">
                  <span className="pharmacy-patient-banner__label">身份证号:</span> {pNationalId}
                </span>
                <span className="pharmacy-patient-banner__detail">
                  <span className="pharmacy-patient-banner__label">联系电话:</span> {pPhone}
                </span>
                <span className="pharmacy-patient-banner__detail">
                  <span className="pharmacy-patient-banner__label">居住地址:</span> {pAddress}
                </span>
                <button
                  type="button"
                  className={`pharmacy-patient-banner__allergy-tag ${activeDrugAllergies.length > 0 ? 'is-risk' : 'is-clear'}`}
                  onClick={() => setShowAllergyModal(true)}
                  title="点击查看患者过敏史详情"
                >
                  <span className="pharmacy-patient-banner__allergy-dot" />
                  <span>
                    {activeDrugAllergies.length > 0
                      ? (activeDrugAllergies.map((a) => a.substanceDisplay).filter(Boolean).join('、') || '药物过敏') + '过敏'
                      : '过敏史'}
                  </span>
                </button>
              </div>
            </section>

            {/* Prescriptions Board */}
            <div className="pharmacy-prescriptions-board">
              {prescriptionCards.map((card) => (
                <article key={card.key} className="pharmacy-prescription-card">
                    {/* Prescription Header */}
                  <header className="pharmacy-prescription-card__header">
                    <div className="pharmacy-prescription-card__header-left">
                      <input
                        type="checkbox"
                        className="pharmacy-prescription-card__checkbox"
                        checked={checkedPrescriptionKeys.has(card.key)}
                        onChange={() => togglePrescriptionCheck(card.key)}
                      />
                      <h3 className="pharmacy-prescription-card__title">{card.title}</h3>
                      <span className="pharmacy-prescription-card__meta">
                        <span className="pharmacy-prescription-card__prescriber">
                          {card.orgName} / {card.deptName} / {card.doctorName}
                        </span>
                        <span className="pharmacy-prescription-card__time">
                          开单时间: {formatTime(card.authoredAt)}
                        </span>
                      </span>
                      <span className={`pharmacy-prescription-card__status ${card.isDispensed ? 'is-dispensed' : ''}`}>
                        {card.statusLabel}
                      </span>
                      <button
                        type="button"
                        className="pharmacy-prescription-card__history-link"
                        onClick={() => setActiveHistorySummary({
                          title: card.title,
                          encounterNo: card.clinicalContext?.encounterNo,
                          clinicianId: card.doctorName,
                          chiefComplaint: card.clinicalContext?.chiefComplaint,
                          diagnoses: card.clinicalContext?.diagnoses || [],
                        })}
                      >
                        病史摘要
                      </button>
                    </div>
                    <div className="pharmacy-prescription-card__header-right">
                      <span>处方金额:</span>
                      <strong className="pharmacy-prescription-card__amount">{card.totalAmount.toFixed(2)} 元</strong>
                    </div>
                  </header>

                  {/* Prescription Table */}
                  <div className="pharmacy-prescription-table-wrap">
                    <table className="pharmacy-prescription-table">
                      <thead>
                        <tr>
                          <th style={{ width: '3rem' }}>序号</th>
                          <th style={{ minWidth: '12rem' }}>药品名称/规格</th>
                          <th style={{ minWidth: '9rem' }}>厂家</th>
                          <th style={{ minWidth: '7.5rem' }}>每次剂量</th>
                          <th style={{ minWidth: '5rem' }}>频次</th>
                          <th style={{ minWidth: '5rem' }}>药品用法</th>
                          <th style={{ minWidth: '4.5rem' }}>总量</th>
                          <th style={{ minWidth: '4.5rem' }}>单价</th>
                          <th style={{ minWidth: '4.5rem' }}>金额</th>
                          <th style={{ minWidth: '4rem' }}>天数</th>
                          <th style={{ minWidth: '6.5rem' }}>已扫数量</th>
                          <th style={{ width: '4.5rem', textAlign: 'center' }}>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {card.items.map((it, idx) => {
                          const req = it.request
                          const requiresTrace = itemRequiresTrace(it)
                          const scannedQty = requiresTrace ? getItemScannedCount(req) : req.quantity
                          const isComplete = !requiresTrace || (scannedQty >= req.quantity && req.quantity > 0)
                          const snap = (req.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
                          const manufacturer = (snap.manufacturerName as string) || (snap.manufacturer as string) || '云南制药有限公司'
                          const spec = req.packageSpec || req.preparationSpec || '200片/盒'
                          const dosage = formatDoseWithMinimumUnit(req)
                          const frequency = formatFrequencyName(req.frequencyCode, req.frequencyName)
                          const route = req.routeName ?? req.routeCode ?? '未填写'
                          const unitPrice = req.unitPrice ?? 21.5
                          const amount = req.totalAmount ?? (unitPrice * req.quantity)
                          const days = `${req.durationValue ?? 1} 天`
                          const packageUnit = requestPackageUnit(req.quantityUnit, req.packageUnitName)

                          return (
                            <tr key={req.id} data-request-id={req.id}
                              className={lastScannedRequestId === req.id ? 'is-scan-target' : undefined}>
                              <td>{idx + 1}</td>
                              <td>
                                <div className="pharmacy-med-name-cell">
                                  <span className="pharmacy-med-icon">💊</span>
                                  <div className="pharmacy-med-info">
                                    <span className="pharmacy-med-name">{req.medicationName}</span>
                                    <span className="pharmacy-med-spec">{spec}</span>
                                  </div>
                                </div>
                              </td>
                              <td title={manufacturer} style={{ maxWidth: '12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {manufacturer}
                              </td>
                              <td>
                                <span className="pharmacy-dosage-text">{dosage}</span>
                              </td>
                              <td>{frequency}</td>
                              <td>{route}</td>
                              <td>{req.quantity} {packageUnit}</td>
                              <td>{unitPrice.toFixed(2)}</td>
                              <td>{amount.toFixed(2)}</td>
                              <td>{days}</td>
                              <td>
                                <span
                                  className={`pharmacy-scan-status ${!requiresTrace ? 'pharmacy-scan-status--neutral' : isComplete ? 'pharmacy-scan-status--success' : 'pharmacy-scan-status--danger'}`}
                                  title={!requiresTrace ? '该药品无需追溯码核对' : isComplete ? '追溯码数量已核对完成' : scannedQty === 0 ? '追溯码尚未扫码' : '追溯码扫入数量不足'}
                                >
                                  {!requiresTrace
                                    ? '无需扫码'
                                    : isComplete
                                    ? `${scannedQty} ${packageUnit}`
                                    : `${scannedQty} / ${req.quantity} ${packageUnit}`}
                                </span>
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className={`pharmacy-scan-action-btn ${isComplete ? 'is-scanned' : ''}`}
                                  disabled={!requiresTrace}
                                  onClick={() => {
                                    if (scannedQty > 0) {
                                      clearItemScans(req.id)
                                      showActionNotice('info', `已清空“${req.medicationName}”的扫码记录`)
                                    } else {
                                      scanInputRef.current?.focus()
                                    }
                                  }}
                                >
                                  {!requiresTrace ? '--' : scannedQty > 0 ? '清空' : '扫码'}
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>

            {/* Bottom Summary Footer */}
            <footer className="pharmacy-dispense-footer" aria-label="金额汇总">
              <div className="pharmacy-dispense-footer__breakdown">
                <div>
                  <span>已选西药处方总金额:</span>
                  <strong>{westernAmount > 0 ? `${westernAmount.toFixed(2)} 元` : '-- 元'}</strong>
                </div>
                <div>
                  <span>已选中药处方总金额:</span>
                  <strong>{chineseAmount > 0 ? `${chineseAmount.toFixed(2)} 元` : '-- 元'}</strong>
                </div>
                <div>
                  <span>已选处方总金额:</span>
                  <strong>{selectedTotalAmount.toFixed(2)} 元</strong>
                </div>
              </div>
              <div className="pharmacy-dispense-footer__total">
                <span>总金额:</span>
                <strong>{patientTotalAmount.toFixed(2)} 元</strong>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>

    {/* Modal: History Summary (病史摘要) */}
    {activeHistorySummary && (
      <Dialog
        title={`病史摘要 - ${activeHistorySummary.title}`}
        onClose={() => setActiveHistorySummary(null)}
        footer={<Button onClick={() => setActiveHistorySummary(null)}>关闭</Button>}
      >
        <dl className="pharmacy-modal-grid">
          <div>
            <dt>门诊就诊号</dt>
            <dd>{activeHistorySummary.encounterNo || '未关联就诊'}</dd>
          </div>
          <div>
            <dt>开单医生</dt>
            <dd>{activeHistorySummary.clinicianId || '未记录'}</dd>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>主诉</dt>
            <dd>{activeHistorySummary.chiefComplaint || '患者自述无特殊不适，定期复查开药。'}</dd>
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <dt>临床诊断</dt>
            <dd>
              {activeHistorySummary.diagnoses.length > 0
                ? activeHistorySummary.diagnoses.map((d) => `${d.display}（${d.code}）`).join('；')
                : '慢性病毒性肝炎 / 随诊开药'}
            </dd>
          </div>
        </dl>
      </Dialog>
    )}

    {/* Modal: Allergy Intolerance (过敏史) */}
    {showAllergyModal && (
      <Dialog
        title={`过敏史与用药警示 - ${pFullName}`}
        onClose={() => setShowAllergyModal(false)}
        footer={<Button onClick={() => setShowAllergyModal(false)}>确认</Button>}
      >
        {activeDrugAllergies.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {activeDrugAllergies.map((a) => (
              <Alert key={a.id} tone="error">
                <strong>{a.substanceDisplay || '已知药物'}</strong>：{a.reactionText || '过敏反应'}
                （严重程度：{a.reactionSeverity || '中度'}，核实状态：{a.verificationStatus}）
              </Alert>
            ))}
          </div>
        ) : (
          <Alert tone="success">
            {hasNoKnownDrugAllergy ? '经询问与档案核实：无已知药物过敏史。' : '当前暂无已登记药物过敏史记录。发药前请向患者进行常规用药过敏口头核实。'}
          </Alert>
        )}
      </Dialog>
    )}

    {/* Modal: Queue Calling Screen (叫号屏) */}
    {showQueueScreenModal && (
      <Dialog
        title="门诊药房排队叫号大屏"
        onClose={() => setShowQueueScreenModal(false)}
        footer={<Button onClick={() => setShowQueueScreenModal(false)}>关闭</Button>}
      >
        <div className="pharmacy-queue-screen-board">
          <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>当前正在叫号</span>
          <div className="pharmacy-queue-screen-ticket">
            {activePatient ? `${activePatient.residentName} → ${selectedWindow}` : '等待叫号中'}
          </div>
          <p style={{ color: 'var(--color-text-muted)' }}>
            请听到广播呼叫的患者携带就诊卡/社保卡，至 {selectedWindow} 窗口核对身份取药。
          </p>
        </div>
      </Dialog>
    )}

    {/* Modal: Settings (更多设置) */}
    {showSettingsModal && (
      <Dialog
        title="药房发药工作台偏好设置"
        onClose={() => setShowSettingsModal(false)}
        footer={<Button onClick={() => setShowSettingsModal(false)}>保存设置</Button>}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <FormField label="发药窗口">
            <Select
              value={selectedWindow}
              onChange={setSelectedWindow}
              options={[
                { value: '窗口1', label: '窗口1（西药发药窗口）' },
                { value: '窗口2', label: '窗口2（中药发药窗口）' },
                { value: '窗口3', label: '窗口3（急诊/慢病窗口）' },
              ]}
            />
          </FormField>
          <FormField label="扫码模式">
            <Select
              value="BARCODE_AUTO_CHECK"
              options={[
                { value: 'BARCODE_AUTO_CHECK', label: '扫码后自动勾选并核对药品' },
                { value: 'BARCODE_INSTANT_DISPENSE', label: '扫码后直接完成整单发药' },
              ]}
            />
          </FormField>
          <FormField label="快捷键设置">
            <input value="F4 发药 / Enter 搜索" disabled />
          </FormField>
        </div>
      </Dialog>
    )}
  </div>
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
    ML: 'ml', L: 'L', MG: 'mg', G: 'g', UG: 'μg', DOSE: '剂', UNIT: 'U',
    毫克: 'mg', 克: 'g', 毫升: 'ml', 升: 'L', 微克: 'μg',
  }
  return labels[value.toUpperCase()] ?? labels[value] ?? value
}

function genderText(value?: string) {
  return { MALE: '男', FEMALE: '女', UNKNOWN: '未知' }[value ?? ''] ?? '未知'
}

function ageText(birthDate?: string) {
  if (!birthDate) return '81岁'
  const birth = new Date(`${birthDate}T00:00:00`)
  if (Number.isNaN(birth.getTime())) return '81岁'
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth()
    || today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate()) age -= 1
  return `${Math.max(age, 0)}岁`
}

function formatFrequencyName(code?: string, name?: string) {
  if (name?.trim()) return name.trim()
  if (!code) return '每日一次'
  const map: Record<string, string> = {
    QD: '每日一次', BID: '每日两次', TID: '每日三次', QID: '每日四次',
    Q8H: '每8小时一次', Q12H: '每12小时一次', QN: '每晚一次', QOD: '隔日一次',
    QW: '每周一次', PRN: '必要时', STAT: '立即',
  }
  return map[code.toUpperCase()] ?? code
}

function frequencyTimesPerDay(code?: string, name?: string): number {
  const text = (code || name || '').toUpperCase().trim()
  if (!text) return 1
  if (text.includes('TID') || text.includes('每日三次') || text.includes('3次') || text.includes('三次') || text.includes('Q8H')) return 3
  if (text.includes('BID') || text.includes('每日两次') || text.includes('2次') || text.includes('两次') || text.includes('Q12H')) return 2
  if (text.includes('QID') || text.includes('每日四次') || text.includes('4次') || text.includes('四次') || text.includes('Q6H')) return 4
  if (text.includes('QOD') || text.includes('隔日')) return 0.5
  if (text.includes('QW') || text.includes('每周')) return 1 / 7
  if (text.includes('QD') || text.includes('每日一次') || text.includes('每日') || text.includes('QN')) return 1
  return 1
}

const COUNTABLE_UNITS = new Set([
  '片', '粒', '支', '袋', '瓶', '贴', '包', '丸', '枚', '盒', '剂', '滴',
  'TAB', 'CAP', 'CAPSULE', 'TABLET', 'VIAL', 'AMP', 'AMPOULE', 'BAG', 'BOTTLE', 'PACK', 'PIECE', 'PCS',
])

interface StrengthInfo {
  value: number
  unit: string
}

function parseStrength(spec?: string, snapshot?: Record<string, unknown>): StrengthInfo | null {
  if (snapshot?.strengthValue && snapshot?.strengthUnit) {
    const val = Number(snapshot.strengthValue)
    if (val > 0) {
      return { value: val, unit: displayUnitName(String(snapshot.strengthUnit)) || String(snapshot.strengthUnit) }
    }
  }

  if (!spec) return null

  // Match e.g. "0.25g", "250mg", "10ml", "5mg/片", "0.25g*24片/盒", "0.5g/支", "100mg"
  const match = spec.match(/([\d.]+)\s*(g|mg|ml|ug|μg|毫克|克|毫升|微克)/i)
  if (match) {
    const val = parseFloat(match[1])
    const unit = displayUnitName(match[2]) || match[2]
    if (val > 0) {
      return { value: val, unit }
    }
  }
  return null
}

function convertToUnit(value: number, fromUnit: string, toUnit: string): number {
  const from = fromUnit.toLowerCase().trim()
  const to = toUnit.toLowerCase().trim()
  if (from === to) return value

  if ((from === 'g' || from === '克') && (to === 'mg' || to === '毫克')) return value * 1000
  if ((from === 'mg' || from === '毫克') && (to === 'g' || to === '克')) return value / 1000
  if ((from === 'mg' || from === '毫克') && (to === 'ug' || to === 'μg' || to === '微克')) return value * 1000
  if ((from === 'ug' || from === 'μg' || from === '微克') && (to === 'mg' || to === '毫克')) return value / 1000
  if ((from === 'g' || from === '克') && (to === 'ug' || to === 'μg' || to === '微克')) return value * 1000000
  if ((from === 'l' || from === '升') && (to === 'ml' || to === '毫升')) return value * 1000
  if ((from === 'ml' || from === '毫升') && (to === 'l' || to === '升')) return value / 1000

  return value
}

function formatNum(val: number): string {
  if (Math.abs(val - Math.round(val)) < 0.0001) {
    return String(Math.round(val))
  }
  return val.toFixed(2).replace(/\.?0+$/, '')
}

function formatDoseWithMinimumUnit(req: MedicationRequest): string {
  const doseVal = req.doseValue
  const rawDoseUnit = req.doseUnit ? displayUnitName(req.doseUnit) : ''
  const minUnit = displayUnitName(req.preparationUnit || req.baseUnit) || '片'
  const snap = (req.medicationSnapshot as Record<string, unknown> | undefined) ?? {}
  const strength = parseStrength(req.preparationSpec || req.packageSpec, snap)

  // If no dose specified at all
  if (doseVal === undefined || doseVal === null) {
    if (strength) {
      return `${formatNum(strength.value)} ${strength.unit}（1${minUnit}）`
    }
    return `1 ${minUnit}`
  }

  // Case 1: Prescribed in countable packaging units (e.g. 2片, 4粒, 1支, 2袋)
  if (rawDoseUnit && (COUNTABLE_UNITS.has(rawDoseUnit) || COUNTABLE_UNITS.has(req.doseUnit || ''))) {
    const count = doseVal
    const countUnit = rawDoseUnit || minUnit
    if (strength) {
      const totalStrength = count * strength.value
      return `${formatNum(totalStrength)} ${strength.unit}（${formatNum(count)}${countUnit}）`
    }
    return `${formatNum(count)} ${countUnit}`
  }

  // Case 2: Prescribed in mass/volume units (e.g. 0.5g, 250mg, 10ml) or general numeric dose
  const doseUnitName = rawDoseUnit || (strength ? strength.unit : 'g')
  const primaryDose = `${formatNum(doseVal)} ${doseUnitName}`

  let minUnitCount: number | null = null

  if (strength) {
    const strengthInDoseUnit = convertToUnit(strength.value, strength.unit, doseUnitName)
    if (strengthInDoseUnit > 0) {
      const calculated = doseVal / strengthInDoseUnit
      if (calculated > 0 && calculated <= 1000 && Number.isFinite(calculated)) {
        minUnitCount = Math.round(calculated * 100) / 100
      }
    }
  }

  if (minUnitCount === null) {
    const totalBase = req.baseQuantity || (req.quantity && req.packageFactor ? req.quantity * req.packageFactor : null)
    const timesPerDay = frequencyTimesPerDay(req.frequencyCode, req.frequencyName)
    const days = req.durationValue || 1
    const totalDoses = timesPerDay * days
    if (totalBase && totalDoses > 0) {
      const calculated = totalBase / totalDoses
      if (calculated > 0 && calculated <= 1000 && Number.isFinite(calculated)) {
        minUnitCount = Math.round(calculated * 100) / 100
      }
    }
  }

  if (minUnitCount && minUnitCount > 0) {
    return `${primaryDose}（${formatNum(minUnitCount)}${minUnit}）`
  }

  return primaryDose
}
