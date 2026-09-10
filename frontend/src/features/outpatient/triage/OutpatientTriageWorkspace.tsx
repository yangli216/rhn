import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ClinicalContext } from '../../../app/AppShell'
import type {
  CreateTriageInput,
  DepartmentRecommendation,
  PendingEncounter,
  TriageArrivalMethod,
  TriageCompanionType,
  TriageConsciousness,
  TriageDisposition,
  TriageGreenChannel,
  TriageLevel,
  TriageRecord,
} from '../../../shared/api/outpatientTriageApi'
import type { Resident } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import {
  Alert,
  Button,
  EmptyState,
  Icon,
  LoadingState,
  PageHeader,
  Panel,
  PanelHead,
  PatientIdentitySearch,
  SearchField,
  Select,
  StatusBadge,
  Switch,
  Tabs,
} from '../../../shared/ui'
import { TriageTicketModal } from './TriageTicketModal'
import {
  COMMON_SYMPTOM_TAGS,
  GREEN_CHANNEL_OPTIONS,
  TRIAGE_LEVEL_DEFINITIONS,
  assessVitals,
} from './triageAssessmentRules'

export interface OutpatientTriageWorkspaceProps {
  api: RhnApi
  clinicalContext: ClinicalContext
  canEdit?: boolean
  onNavigate?: (path: string) => void
}

const ARRIVAL_METHOD_OPTIONS = [
  { value: 'WALK_IN', label: '自行步行' },
  { value: 'WHEELCHAIR', label: '轮椅推入' },
  { value: 'STRETCHER', label: '平车转运' },
  { value: 'AMBULANCE_120', label: '120急救送医' },
]

const COMPANION_TYPE_OPTIONS = [
  { value: 'NONE', label: '无陪伴人员' },
  { value: 'FAMILY', label: '家属陪同' },
  { value: 'ESCORT', label: '专职陪护' },
  { value: 'GREEN_CHANNEL_STAFF', label: '绿通医护专人护送' },
]

const CONSCIOUSNESS_OPTIONS = [
  { value: 'ALERT', label: '清醒 (Alert)' },
  { value: 'VOICE', label: '对声音有反应 (Voice - 嗜睡)' },
  { value: 'PAIN', label: '对疼痛有反应 (Pain - 浅昏迷/昏睡)' },
  { value: 'UNRESPONSIVE', label: '无反应 (Unresponsive - 深昏迷)' },
]

const DISPOSITION_OPTIONS = [
  { value: 'WAITING_QUEUE', label: '普通候诊排队' },
  { value: 'REGISTER_GUIDE', label: '引导前往挂号' },
  { value: 'RESCUE_ROOM', label: '即刻送抢救室' },
  { value: 'FEVER_CLINIC', label: '分流发热门诊' },
  { value: 'EMERGENCY_TRANSFER', label: '转送急诊科' },
]

const PAIN_SCORE_OPTIONS = [
  { value: '0', label: '0 分 (无痛)' },
  { value: '1', label: '1 分 (轻微轻度痛)' },
  { value: '2', label: '2 分 (轻度疼痛)' },
  { value: '3', label: '3 分 (微痛不影响日常)' },
  { value: '4', label: '4 分 (中度疼痛可忍受)' },
  { value: '5', label: '5 分 (中度持续疼痛)' },
  { value: '6', label: '6 分 (中重度影响作息)' },
  { value: '7', label: '7 分 (重度剧烈疼痛)' },
  { value: '8', label: '8 分 (剧痛不能耐受)' },
  { value: '9', label: '9 分 (极剧烈难以忍受)' },
  { value: '10', label: '10 分 (无法忍受濒死感)' },
]

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [delayMs, value])

  return debouncedValue
}

export function OutpatientTriageWorkspace({
  api,
  clinicalContext,
  canEdit = true,
  onNavigate,
}: OutpatientTriageWorkspaceProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // 队列与检索过滤
  const [queueTab, setQueueTab] = useState<'PENDING' | 'TRIAGED'>('PENDING')
  const [queueSearchQuery, setQueueSearchQuery] = useState('')
  const initialPendingSelectionRef = useRef(false)

  // 当前正在评估的患者上下文与分诊记录
  const [activeEncounterId, setActiveEncounterId] = useState<string | null>(null)
  const [activeRegistrationId, setActiveRegistrationId] = useState<string | null>(null)
  const [activeResidentId, setActiveResidentId] = useState<string | null>(null)
  const [activeTriageId, setActiveTriageId] = useState<string | null>(null)
  const [activeTriageNo, setActiveTriageNo] = useState<string | null>(null)

  // 基础身份表单
  const [patientName, setPatientName] = useState('')
  const [gender, setGender] = useState('MALE')
  const [age, setAge] = useState<number | ''>('')
  const [birthDate, setBirthDate] = useState('')
  const [phone, setPhone] = useState('')
  const [idCardNo, setIdCardNo] = useState('')
  const [healthRecordNo, setHealthRecordNo] = useState('')
  const [arrivalMethod, setArrivalMethod] = useState<TriageArrivalMethod>('WALK_IN')
  const [companionType, setCompanionType] = useState<TriageCompanionType>('NONE')

  // 生命体征录入
  const [temperature, setTemperature] = useState<number | ''>('')
  const [pulseRate, setPulseRate] = useState<number | ''>('')
  const [respiratoryRate, setRespiratoryRate] = useState<number | ''>('')
  const [systolic, setSystolic] = useState<number | ''>('')
  const [diastolic, setDiastolic] = useState<number | ''>('')
  const [oxygenSaturation, setOxygenSaturation] = useState<number | ''>('')
  const [bloodGlucose, setBloodGlucose] = useState<number | ''>('')
  const [painScore, setPainScore] = useState('0')
  const [consciousness, setConsciousness] = useState<TriageConsciousness>('ALERT')

  // 发热与流行病排查
  const [fever, setFever] = useState(false)
  const [hasRespiratorySymptom, setHasRespiratorySymptom] = useState(false)
  const [hasDiarrheaSymptom, setHasDiarrheaSymptom] = useState(false)
  const [hasRashSymptom, setHasRashSymptom] = useState(false)
  const [epidemicHistory, setEpidemicHistory] = useState('')

  // 临床主诉与症状标签
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [selectedSymptomTags, setSelectedSymptomTags] = useState<string[]>([])

  // 分诊定级与去向
  const [triageLevel, setTriageLevel] = useState<TriageLevel>('LEVEL_4_NON_URGENT')
  const [triageReason, setTriageReason] = useState('')
  const [targetDepartmentId, setTargetDepartmentId] = useState('')
  const [targetDepartmentName, setTargetDepartmentName] = useState('')
  const [targetDoctorId, setTargetDoctorId] = useState('')
  const [targetDoctorName, setTargetDoctorName] = useState('')
  const [greenChannel, setGreenChannel] = useState<TriageGreenChannel>('NONE')
  const [disposition, setDisposition] = useState<TriageDisposition>('WAITING_QUEUE')
  const [notes, setNotes] = useState('')

  // 弹窗与反馈
  const [ticketModalOpen, setTicketModalOpen] = useState(false)
  const [savedTicketRecord, setSavedTicketRecord] = useState<TriageRecord | null>(null)
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'warning' | 'error' | 'info' } | null>(null)

  // 异步数据查询
  const statsQuery = useQuery({
    queryKey: ['outpatient-triage-stats', clinicalContext.organization.id],
    queryFn: () => api.outpatientTriage.statistics(),
    refetchInterval: 15_000,
  })

  const pendingQuery = useQuery({
    queryKey: ['outpatient-triage-pending', clinicalContext.organization.id],
    queryFn: () => api.outpatientTriage.pendingEncounters(),
    refetchInterval: 10_000,
  })

  const triagedQuery = useQuery({
    queryKey: ['outpatient-triage-triaged', clinicalContext.organization.id],
    queryFn: () => api.outpatientTriage.search({ size: 50 }),
    refetchInterval: 15_000,
  })

  const recommendationInput = useMemo(() => ({
    chiefComplaint,
    symptoms: selectedSymptomTags.join(','),
    temperature: typeof temperature === 'number' ? temperature : undefined,
    systolic: typeof systolic === 'number' ? systolic : undefined,
    diastolic: typeof diastolic === 'number' ? diastolic : undefined,
    oxygenSaturation: typeof oxygenSaturation === 'number' ? oxygenSaturation : undefined,
    pulseRate: typeof pulseRate === 'number' ? pulseRate : undefined,
    age: typeof age === 'number' ? age : undefined,
    gender,
  }), [chiefComplaint, selectedSymptomTags, temperature, systolic, diastolic, oxygenSaturation, pulseRate, age, gender])
  const debouncedRecommendationInput = useDebouncedValue(recommendationInput, 350)

  // 智能科室推荐：等待连续输入结束后再请求，避免每个按键都触发计算。
  const recommendQuery = useQuery({
    queryKey: ['outpatient-triage-recommend', debouncedRecommendationInput],
    queryFn: () => api.outpatientTriage.recommendDepartments(debouncedRecommendationInput),
    enabled: Boolean(
      debouncedRecommendationInput.chiefComplaint.trim()
      || debouncedRecommendationInput.symptoms
      || debouncedRecommendationInput.temperature != null
      || debouncedRecommendationInput.systolic != null
    ),
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  })

  // 实时体征与危重评估
  const vitalsAssessment = useMemo(() => {
    return assessVitals({
      temperature: typeof temperature === 'number' ? temperature : undefined,
      pulseRate: typeof pulseRate === 'number' ? pulseRate : undefined,
      respiratoryRate: typeof respiratoryRate === 'number' ? respiratoryRate : undefined,
      systolic: typeof systolic === 'number' ? systolic : undefined,
      diastolic: typeof diastolic === 'number' ? diastolic : undefined,
      oxygenSaturation: typeof oxygenSaturation === 'number' ? oxygenSaturation : undefined,
      bloodGlucose: typeof bloodGlucose === 'number' ? bloodGlucose : undefined,
      painScore: Number(painScore) || 0,
      consciousness,
    })
  }, [temperature, pulseRate, respiratoryRate, systolic, diastolic, oxygenSaturation, bloodGlucose, painScore, consciousness])

  // 当体征产生危象时自动提示或自动联动等级
  useEffect(() => {
    if (vitalsAssessment.hasCritical) {
      setTriageLevel('LEVEL_1_CRITICAL')
      setTriageReason((prev) => prev || vitalsAssessment.suggestedReason)
    }
    if (typeof temperature === 'number' && temperature >= 37.3) {
      setFever(true)
    }
  }, [vitalsAssessment, temperature])

  // 切换患者清空或回填
  const resetForm = useCallback(() => {
    setActiveEncounterId(null)
    setActiveRegistrationId(null)
    setActiveResidentId(null)
    setActiveTriageId(null)
    setActiveTriageNo(null)
    setPatientName('')
    setGender('MALE')
    setAge('')
    setBirthDate('')
    setPhone('')
    setIdCardNo('')
    setHealthRecordNo('')
    setArrivalMethod('WALK_IN')
    setCompanionType('NONE')
    setTemperature('')
    setPulseRate('')
    setRespiratoryRate('')
    setSystolic('')
    setDiastolic('')
    setOxygenSaturation('')
    setBloodGlucose('')
    setPainScore('0')
    setConsciousness('ALERT')
    setFever(false)
    setHasRespiratorySymptom(false)
    setHasDiarrheaSymptom(false)
    setHasRashSymptom(false)
    setEpidemicHistory('')
    setChiefComplaint('')
    setSelectedSymptomTags([])
    setTriageLevel('LEVEL_4_NON_URGENT')
    setTriageReason('')
    setTargetDepartmentId('')
    setTargetDepartmentName('')
    setTargetDoctorId('')
    setTargetDoctorName('')
    setGreenChannel('NONE')
    setDisposition('WAITING_QUEUE')
    setNotes('')
    setSavedTicketRecord(null)
    setTicketModalOpen(false)
    setFeedback(null)
  }, [])

  // 选中待分诊患者
  const handleSelectPending = (item: PendingEncounter) => {
    resetForm()
    setActiveEncounterId(item.encounterId)
    setActiveRegistrationId(item.registrationId)
    setActiveResidentId(item.residentId)
    setPatientName(item.residentName)
    setGender(item.gender || 'MALE')
    if (item.age) setAge(item.age)
    if (item.birthDate) setBirthDate(item.birthDate)
    if (item.phone) setPhone(item.phone)
    if (item.healthRecordNo) setHealthRecordNo(item.healthRecordNo)
    setTargetDepartmentName(item.departmentName || '')
    if (item.practitionerName) setTargetDoctorName(item.practitionerName)

    if (item.triageId) {
      setActiveTriageId(item.triageId)
      setActiveTriageNo(item.triageNo || null)
      if (item.triageLevel) setTriageLevel(item.triageLevel)
    }
  }

  // 选中已分诊患者
  const handleSelectTriaged = (record: TriageRecord) => {
    setActiveTriageId(record.id)
    setActiveTriageNo(record.triageNo)
    setActiveEncounterId(record.encounterId || null)
    setActiveRegistrationId(record.registrationId || null)
    setActiveResidentId(record.residentId || null)
    setPatientName(record.patientName)
    setGender(record.gender)
    setAge(record.age != null ? record.age : '')
    setBirthDate(record.birthDate || '')
    setPhone(record.phone || '')
    setIdCardNo(record.idCardNo || '')
    setHealthRecordNo(record.healthRecordNo || '')
    setArrivalMethod(record.arrivalMethod)
    setCompanionType(record.companionType)
    setTemperature(record.temperature != null ? record.temperature : '')
    setPulseRate(record.pulseRate != null ? record.pulseRate : '')
    setRespiratoryRate(record.respiratoryRate != null ? record.respiratoryRate : '')
    setSystolic(record.systolic != null ? record.systolic : '')
    setDiastolic(record.diastolic != null ? record.diastolic : '')
    setOxygenSaturation(record.oxygenSaturation != null ? record.oxygenSaturation : '')
    setBloodGlucose(record.bloodGlucose != null ? record.bloodGlucose : '')
    setPainScore(record.painScore != null ? String(record.painScore) : '0')
    setConsciousness(record.consciousness)
    setFever(record.fever)
    setEpidemicHistory(record.epidemicHistory || '')
    setChiefComplaint(record.chiefComplaint || '')
    setSelectedSymptomTags(record.symptoms ? record.symptoms.split(',').filter(Boolean) : [])
    setTriageLevel(record.triageLevel)
    setTriageReason(record.triageReason || '')
    setTargetDepartmentId(record.targetDepartmentId || '')
    setTargetDepartmentName(record.targetDepartmentName || '')
    setTargetDoctorId(record.targetDoctorId || '')
    setTargetDoctorName(record.targetDoctorName || '')
    setGreenChannel(record.greenChannel)
    setDisposition(record.disposition)
    setNotes(record.notes || '')
    setSavedTicketRecord(record)
  }

  // 选中居民档案
  const handleSelectResident = (res: Resident) => {
    setActiveResidentId(res.id)
    setPatientName(res.fullName)
    setGender(res.gender)
    setPhone(res.phone || '')
    setHealthRecordNo(res.healthRecordNo)
    if (res.birthDate) {
      setBirthDate(res.birthDate)
      try {
        const y = Number.parseInt(res.birthDate.slice(0, 4), 10)
        if (!Number.isNaN(y)) setAge(new Date().getFullYear() - y)
      } catch {
        // ignore
      }
    }
  }

  // 症状标签点选
  const handleToggleSymptomChip = (tag: string) => {
    const exists = selectedSymptomTags.includes(tag)
    setSelectedSymptomTags(exists
      ? selectedSymptomTags.filter((item) => item !== tag)
      : [...selectedSymptomTags, tag])
    setChiefComplaint((current) => {
      if (!exists) return current ? `${current}、${tag}` : tag
      return current
        .split('、')
        .filter((part) => part.trim() && part.trim() !== tag)
        .join('、')
    })
  }

  // 采纳智能科室推荐
  const handleApplyRecommendation = (dept: DepartmentRecommendation) => {
    setTargetDepartmentId(dept.departmentId)
    setTargetDepartmentName(dept.departmentName)
    if (dept.score >= 95) {
      setTriageReason((r) => r || dept.rationale)
    }
    setFeedback({
      message: `已采纳推荐科室：${dept.departmentName}（匹配度 ${dept.score}%）`,
      tone: 'success',
    })
  }

  // 提交保存 Mutation
  const saveMutation = useMutation({
    mutationFn: async (printAfter: boolean) => {
      if (!patientName.trim()) throw new Error('请输入患者姓名')

      const riskList: string[] = []
      if (hasRespiratorySymptom) riskList.push('呼吸道感染')
      if (hasDiarrheaSymptom) riskList.push('消化道腹泻')
      if (hasRashSymptom) riskList.push('皮疹出疹')

      const payload: CreateTriageInput = {
        organizationId: clinicalContext.organization.id,
        residentId: activeResidentId || undefined,
        encounterId: activeEncounterId || undefined,
        registrationId: activeRegistrationId || undefined,
        patientName: patientName.trim(),
        gender,
        age: typeof age === 'number' ? age : undefined,
        birthDate: birthDate || undefined,
        phone: phone.trim() || undefined,
        idCardNo: idCardNo.trim() || undefined,
        healthRecordNo: healthRecordNo.trim() || undefined,
        arrivalMethod,
        companionType,
        chiefComplaint: chiefComplaint.trim() || undefined,
        symptoms: selectedSymptomTags.join(','),
        temperature: typeof temperature === 'number' ? temperature : undefined,
        pulseRate: typeof pulseRate === 'number' ? pulseRate : undefined,
        respiratoryRate: typeof respiratoryRate === 'number' ? respiratoryRate : undefined,
        systolic: typeof systolic === 'number' ? systolic : undefined,
        diastolic: typeof diastolic === 'number' ? diastolic : undefined,
        oxygenSaturation: typeof oxygenSaturation === 'number' ? oxygenSaturation : undefined,
        bloodGlucose: typeof bloodGlucose === 'number' ? bloodGlucose : undefined,
        painScore: Number(painScore) || 0,
        consciousness,
        fever,
        epidemicHistory: epidemicHistory.trim() || undefined,
        riskTags: riskList.join(','),
        triageLevel,
        triageReason: triageReason.trim() || undefined,
        targetDepartmentId: targetDepartmentId || undefined,
        targetDepartmentName: targetDepartmentName || undefined,
        targetDoctorId: targetDoctorId || undefined,
        targetDoctorName: targetDoctorName || undefined,
        greenChannel,
        disposition,
        notes: notes.trim() || undefined,
        nurseId: 'nurse-01',
        nurseName: '分诊护士',
      }

      let result: TriageRecord
      if (activeTriageId) {
        result = await api.outpatientTriage.update(activeTriageId, payload)
      } else {
        result = await api.outpatientTriage.create(payload)
      }
      return { result, printAfter }
    },
    onSuccess: ({ result, printAfter }) => {
      setActiveTriageId(result.id)
      setActiveTriageNo(result.triageNo)
      setSavedTicketRecord(result)
      queryClient.invalidateQueries({ queryKey: ['outpatient-triage-stats'] })
      queryClient.invalidateQueries({ queryKey: ['outpatient-triage-pending'] })
      queryClient.invalidateQueries({ queryKey: ['outpatient-triage-triaged'] })

      setFeedback({
        message: `预检分诊记录已成功保存！分诊单号：${result.triageNo}，级别：${TRIAGE_LEVEL_DEFINITIONS[result.triageLevel].label}`,
        tone: 'success',
      })

      if (printAfter) {
        setTicketModalOpen(true)
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : '保存预检分诊记录失败'
      setFeedback({ message: msg, tone: 'error' })
    },
  })

  // 一键直通挂号
  const handleNavigateToRegistration = () => {
    const params = new URLSearchParams()
    if (activeResidentId) params.set('residentId', activeResidentId)
    if (targetDepartmentId) params.set('deptId', targetDepartmentId)
    if (activeTriageId) params.set('triageId', activeTriageId)
    const targetUrl = `/outpatient/registration?${params.toString()}`
    if (onNavigate) {
      onNavigate(targetUrl)
    } else {
      navigate(targetUrl)
    }
  }

  // 过滤后的队列
  const filteredPendingList = useMemo(() => {
    const list = pendingQuery.data ?? []
    if (!queueSearchQuery.trim()) return list
    const q = queueSearchQuery.toLowerCase().trim()
    return list.filter(
      (item) =>
        item.residentName.toLowerCase().includes(q) ||
        item.registrationNo.toLowerCase().includes(q) ||
        (item.phone && item.phone.includes(q))
    )
  }, [pendingQuery.data, queueSearchQuery])

  const filteredTriagedList = useMemo(() => {
    const list = triagedQuery.data?.content ?? []
    if (!queueSearchQuery.trim()) return list
    const q = queueSearchQuery.toLowerCase().trim()
    return list.filter(
      (item) =>
        item.patientName.toLowerCase().includes(q) ||
        item.triageNo.toLowerCase().includes(q) ||
        (item.phone && item.phone.includes(q))
    )
  }, [triagedQuery.data?.content, queueSearchQuery])

  useEffect(() => {
    if (initialPendingSelectionRef.current || pendingQuery.isLoading) return
    if (activeEncounterId || activeResidentId || activeTriageId) {
      initialPendingSelectionRef.current = true
      return
    }
    const firstPending = pendingQuery.data?.[0]
    if (!firstPending) return
    initialPendingSelectionRef.current = true
    handleSelectPending(firstPending)
  }, [activeEncounterId, activeResidentId, activeTriageId, pendingQuery.data, pendingQuery.isLoading])

  const stats = statsQuery.data

  return (
    <div className="triage-workspace">
      {/* 顶部指标与控制栏 */}
      <PageHeader
        compact
        eyebrow="门诊服务"
        title="门诊预检分诊"
        description="采集生命体征、发热筛查、急慢四级定级与智能导医分流。"
        actions={
          <div className="triage-metrics-actions">
            <Button size="sm" variant="secondary" onClick={resetForm}>
              <Icon name="add" />
              <span>新患者分诊</span>
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                queryClient.invalidateQueries({ queryKey: ['outpatient-triage-stats'] })
                queryClient.invalidateQueries({ queryKey: ['outpatient-triage-pending'] })
                queryClient.invalidateQueries({ queryKey: ['outpatient-triage-triaged'] })
              }}
            >
              <Icon name="refresh" />
              <span>刷新队列</span>
            </Button>
          </div>
        }
      />

      {/* 统计指标浮动条 */}
      <section className="triage-metrics-bar" aria-label="今日分诊统计看板">
        <div className="triage-metrics-grid">
          <div className="triage-metric-card">
            <span>今日分诊总数</span>
            <span className="triage-metric-card__value">{stats?.totalCount ?? 0}</span>
          </div>
          <div className="triage-metric-card triage-metric-card--danger">
            <span>Ⅰ级 濒危(红)</span>
            <span className="triage-metric-card__value">{stats?.level1CriticalCount ?? 0}</span>
          </div>
          <div className="triage-metric-card triage-metric-card--warning">
            <span>Ⅱ级 危重(橙)</span>
            <span className="triage-metric-card__value">{stats?.level2UrgentCount ?? 0}</span>
          </div>
          <div className="triage-metric-card triage-metric-card--info">
            <span>Ⅲ级 急症(黄)</span>
            <span className="triage-metric-card__value">{stats?.level3RoutineUrgentCount ?? 0}</span>
          </div>
          <div className="triage-metric-card triage-metric-card--success">
            <span>Ⅳ级 非急症(绿)</span>
            <span className="triage-metric-card__value">{stats?.level4NonUrgentCount ?? 0}</span>
          </div>
          <div className="triage-metric-card triage-metric-card--warning">
            <span>发热预警</span>
            <span className="triage-metric-card__value">{stats?.feverCount ?? 0}</span>
          </div>
          <div className="triage-metric-card triage-metric-card--danger">
            <span>绿色通道</span>
            <span className="triage-metric-card__value">{stats?.greenChannelCount ?? 0}</span>
          </div>
        </div>

        {activeTriageNo && (
          <div className="triage-metrics-meta">
            <StatusBadge tone="info">当前单号：{activeTriageNo}</StatusBadge>
          </div>
        )}
      </section>

      {/* 全局反馈提示 */}
      {feedback && (
        <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {/* 主三栏工作台 */}
      <main className="triage-main-layout">
        {/* ========================================================================= */}
        {/* 左栏：分诊工作队列 (320px)                                              */}
        {/* ========================================================================= */}
        <aside className="triage-left-pane">
          <div className="triage-left-search-box">
            <SearchField
              label="搜索队列患者"
              placeholder="搜索姓名、就诊号或电话"
              value={queueSearchQuery}
              onChange={setQueueSearchQuery}
            />
          </div>

          <Tabs
            label="分诊队列类型切换"
            variant="workspace"
            items={[
              { value: 'PENDING', label: `待分诊 (${filteredPendingList.length})` },
              { value: 'TRIAGED', label: `已分诊 (${filteredTriagedList.length})` },
            ]}
            value={queueTab}
            onChange={(val) => setQueueTab(val as 'PENDING' | 'TRIAGED')}
          />

          <div className="triage-queue-list">
            {queueTab === 'PENDING' && (
              <>
                {pendingQuery.isLoading && <LoadingState label="加载待分诊患者中..." />}
                {!pendingQuery.isLoading && filteredPendingList.length === 0 && (
                  <EmptyState icon="clinical" title="暂无待分诊挂号患者" copy="今日已挂号患者测录体征后将自动更新至就诊病历。" />
                )}
                {filteredPendingList.map((item) => {
                  const isActive = activeEncounterId === item.encounterId
                  return (
                    <article
                      key={item.encounterId}
                      className={`triage-queue-card ${isActive ? 'triage-queue-card--active' : ''}`}
                      onClick={() => handleSelectPending(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleSelectPending(item)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <div className="triage-queue-card__header">
                        <span className="triage-queue-card__name">{item.residentName}</span>
                        <StatusBadge tone={item.triaged ? 'success' : 'warning'}>
                          {item.triaged ? '已录体征' : '待录体征'}
                        </StatusBadge>
                      </div>
                      <div className="triage-queue-card__body">
                        <span>{item.departmentName}</span>
                        <span>{item.gender === 'MALE' ? '男' : '女'} · {item.age}岁</span>
                      </div>
                      <div className="triage-queue-card__footer">
                        <span className="triage-queue-card__meta">序号：{item.sequenceNo}号</span>
                        <span className="triage-queue-card__meta">{item.ticketNo}</span>
                        {item.triageLevel && (
                          <StatusBadge tone={TRIAGE_LEVEL_DEFINITIONS[item.triageLevel].badgeTone}>
                            {TRIAGE_LEVEL_DEFINITIONS[item.triageLevel].codeName}
                          </StatusBadge>
                        )}
                      </div>
                    </article>
                  )
                })}
              </>
            )}

            {queueTab === 'TRIAGED' && (
              <>
                {triagedQuery.isLoading && <LoadingState label="加载已分诊记录中..." />}
                {!triagedQuery.isLoading && filteredTriagedList.length === 0 && (
                  <EmptyState icon="check" title="今日暂无已分诊记录" copy="新分诊保存后将呈现在此处。" />
                )}
                {filteredTriagedList.map((item) => {
                  const isActive = activeTriageId === item.id
                  const levelDef = TRIAGE_LEVEL_DEFINITIONS[item.triageLevel]
                  return (
                    <article
                      key={item.id}
                      className={`triage-queue-card ${isActive ? 'triage-queue-card--active' : ''}`}
                      onClick={() => handleSelectTriaged(item)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleSelectTriaged(item)
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-current={isActive ? 'true' : undefined}
                    >
                      <div className="triage-queue-card__header">
                        <span className="triage-queue-card__name">{item.patientName}</span>
                        <StatusBadge tone={levelDef.badgeTone}>{levelDef.codeName} {levelDef.label}</StatusBadge>
                      </div>
                      <div className="triage-queue-card__body">
                        <span>{item.targetDepartmentName || '全科医疗科'}</span>
                        <span>{item.temperature != null ? `${item.temperature}℃` : '--'}</span>
                      </div>
                      <div className="triage-queue-card__footer">
                        <span className="triage-queue-card__meta">{item.triageNo}</span>
                        {item.greenChannel && item.greenChannel !== 'NONE' && (
                          <StatusBadge tone="danger">绿通</StatusBadge>
                        )}
                      </div>
                    </article>
                  )
                })}
              </>
            )}
          </div>
        </aside>

        {/* ========================================================================= */}
        {/* 中栏：临床主评估作业区 (minmax 560px, 1fr)                                */}
        {/* ========================================================================= */}
        <section className="triage-center-pane">
          {/* 1. 患者身份与到院方式 */}
          <section className="triage-patient-strip" aria-label="当前分诊患者">
              <div className="triage-patient-strip__profile">
                <div className="triage-patient-strip__avatar">{patientName ? patientName.slice(-1) : '患'}</div>
                <div className="triage-patient-strip__info">
                  <h3>{patientName || '待分诊患者'}</h3>
                  <span className="triage-patient-strip__sub">
                    {gender === 'MALE' ? '男' : '女'} · {age ? `${age}岁` : '年龄未知'}
                    {phone ? ` · 电话：${phone}` : ''} · 档案号：{healthRecordNo || '临时分诊'}
                  </span>
                </div>
              </div>

              {!activeResidentId && !activeEncounterId && (
                <div className="triage-patient-search">
                  <PatientIdentitySearch
                    search={(q) => api.residents.search(q)}
                    queryKey="triage-patient-search"
                    onSelect={handleSelectResident}
                    placeholder="检索姓名/身份证/档案号..."
                    compact
                    showInitialEmpty={false}
                  />
                </div>
              )}

              <div className="triage-patient-strip__arrival">
                <Select
                  options={ARRIVAL_METHOD_OPTIONS}
                  value={arrivalMethod}
                  onChange={(v) => setArrivalMethod(v as TriageArrivalMethod)}
                />
                <Select
                  options={COMPANION_TYPE_OPTIONS}
                  value={companionType}
                  onChange={(v) => setCompanionType(v as TriageCompanionType)}
                />
                <Button size="sm" variant="text" onClick={resetForm}>
                  清空更换
                </Button>
              </div>
          </section>

          {/* 2. 生命体征采集与流行病发热排查（超紧凑一体化） */}
          <Panel>
            <PanelHead
              title="生命体征采集与早期越界预警"
              meta={vitalsAssessment.hasCritical ? '存在危象体征' : (vitalsAssessment.hasWarning ? '存在预警体征' : '未发现危急值')}
            />

            <div className="triage-vitals-container">
              {vitalsAssessment.hasCritical && (
                <div className="triage-vitals-alert" role="alert">
                  <Icon name="warning" />
                  <strong>危象预警：</strong>
                  <span>{vitalsAssessment.criticalMessages.join('；')}</span>
                </div>
              )}

              <div className="triage-vitals-grid">
                {/* 体温 */}
                <div className={`triage-vital-input-card ${((temperature || 0) >= 40 || ((temperature || 36) < 35 && temperature !== '')) ? 'triage-vital-input-card--critical' : ((temperature || 0) >= 37.3 ? 'triage-vital-input-card--warning' : '')}`}>
                  <div className="triage-vital-header">
                    <span>体温</span>
                    <span className="triage-vital-unit">℃</span>
                  </div>
                  <div className="triage-vital-input-row">
                    <input
                      type="number"
                      step="0.1"
                      aria-label="体温"
                      placeholder="未测"
                      className="triage-vital-field"
                      value={temperature}
                      onChange={(e) => setTemperature(e.target.value === '' ? '' : Number.parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="triage-vital-hint">
                    {(temperature || 0) >= 40 || ((temperature || 36) < 35 && temperature !== '')
                      ? '体温危象'
                      : ((temperature || 0) >= 38.5 ? '高热预警' : ((temperature || 0) >= 37.3 ? '发热警戒' : '正常: 36.0~37.2'))}
                  </div>
                </div>

                {/* 血压 */}
                <div className={`triage-vital-input-card ${(systolic || 0) >= 180 || (diastolic || 0) >= 110 ? 'triage-vital-input-card--critical' : ((systolic || 0) >= 150 ? 'triage-vital-input-card--warning' : '')}`}>
                  <div className="triage-vital-header">
                    <span>血压</span>
                    <span className="triage-vital-unit">mmHg</span>
                  </div>
                  <div className="triage-vital-input-row">
                    <input
                      type="number"
                      aria-label="收缩压"
                      placeholder="未测"
                      className="triage-vital-field"
                      value={systolic}
                      onChange={(e) => setSystolic(e.target.value === '' ? '' : Number.parseInt(e.target.value, 10))}
                    />
                    <span>/</span>
                    <input
                      type="number"
                      aria-label="舒张压"
                      placeholder="未测"
                      className="triage-vital-field"
                      value={diastolic}
                      onChange={(e) => setDiastolic(e.target.value === '' ? '' : Number.parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div className="triage-vital-hint">
                    {(systolic || 0) >= 180 ? '高血压危象' : '正常: 90~139/60~89'}
                  </div>
                </div>

                {/* 脉搏/心率 */}
                <div className={`triage-vital-input-card ${(pulseRate || 0) > 130 || ((pulseRate || 0) < 45 && pulseRate !== '') ? 'triage-vital-input-card--critical' : ((pulseRate || 0) > 100 ? 'triage-vital-input-card--warning' : '')}`}>
                  <div className="triage-vital-header">
                    <span>脉搏</span>
                    <span className="triage-vital-unit">次/分</span>
                  </div>
                  <div className="triage-vital-input-row">
                    <input
                      type="number"
                      aria-label="脉搏"
                      placeholder="未测"
                      className="triage-vital-field"
                      value={pulseRate}
                      onChange={(e) => setPulseRate(e.target.value === '' ? '' : Number.parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div className="triage-vital-hint">
                    {(pulseRate || 0) > 130 ? '极速过速' : '正常: 60~100'}
                  </div>
                </div>

                {/* 呼吸频率 */}
                <div className={`triage-vital-input-card ${(respiratoryRate || 0) > 30 ? 'triage-vital-input-card--critical' : ((respiratoryRate || 0) > 24 ? 'triage-vital-input-card--warning' : '')}`}>
                  <div className="triage-vital-header">
                    <span>呼吸</span>
                    <span className="triage-vital-unit">次/分</span>
                  </div>
                  <div className="triage-vital-input-row">
                    <input
                      type="number"
                      aria-label="呼吸频率"
                      placeholder="未测"
                      className="triage-vital-field"
                      value={respiratoryRate}
                      onChange={(e) => setRespiratoryRate(e.target.value === '' ? '' : Number.parseInt(e.target.value, 10))}
                    />
                  </div>
                  <div className="triage-vital-hint">
                    {(respiratoryRate || 0) > 24 ? '气促困难' : '正常: 12~20'}
                  </div>
                </div>

                {/* 血氧饱和度 */}
                <div className={`triage-vital-input-card ${(oxygenSaturation || 100) < 93 && oxygenSaturation !== '' ? 'triage-vital-input-card--critical' : ((oxygenSaturation || 100) < 95 && oxygenSaturation !== '' ? 'triage-vital-input-card--warning' : '')}`}>
                  <div className="triage-vital-header">
                    <span>血氧</span>
                    <span className="triage-vital-unit">%</span>
                  </div>
                  <div className="triage-vital-input-row">
                    <input
                      type="number"
                      step="0.1"
                      aria-label="血氧饱和度"
                      placeholder="未测"
                      className="triage-vital-field"
                      value={oxygenSaturation}
                      onChange={(e) => setOxygenSaturation(e.target.value === '' ? '' : Number.parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="triage-vital-hint">
                    {(oxygenSaturation || 100) < 93 && oxygenSaturation !== '' ? '低氧危象(<93%)' : '正常: ≥95%'}
                  </div>
                </div>

                {/* 随机末梢血糖 */}
                <div className={`triage-vital-input-card ${(bloodGlucose || 0) >= 16.7 || ((bloodGlucose || 10) < 2.8 && bloodGlucose !== '') ? 'triage-vital-input-card--critical' : ''}`}>
                  <div className="triage-vital-header">
                    <span>血糖</span>
                    <span className="triage-vital-unit">mmol/L</span>
                  </div>
                  <div className="triage-vital-input-row">
                    <input
                      type="number"
                      step="0.1"
                      aria-label="末梢血糖"
                      placeholder="未测"
                      className="triage-vital-field"
                      value={bloodGlucose}
                      onChange={(e) => setBloodGlucose(e.target.value === '' ? '' : Number.parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="triage-vital-hint">
                    {(bloodGlucose || 0) >= 16.7 ? '血糖危象' : '正常: 3.9~6.1'}
                  </div>
                </div>

                {/* 意识状态 AVPU */}
                <div className="triage-vital-input-card">
                  <div className="triage-vital-header">
                    <span>意识</span>
                  </div>
                  <Select
                    options={CONSCIOUSNESS_OPTIONS}
                    value={consciousness}
                    onChange={(v) => setConsciousness(v as TriageConsciousness)}
                  />
                  <div className="triage-vital-hint">
                    {consciousness !== 'ALERT' ? '意识异常需优先' : '清醒'}
                  </div>
                </div>

                {/* 疼痛评分 */}
                <div className="triage-vital-input-card">
                  <div className="triage-vital-header">
                    <span>疼痛</span>
                  </div>
                  <Select
                    options={PAIN_SCORE_OPTIONS}
                    value={painScore}
                    onChange={setPainScore}
                  />
                  <div className="triage-vital-hint">
                    {Number(painScore) >= 7 ? '重度疼痛优先' : '0~10分'}
                  </div>
                </div>
              </div>

              {/* 发热与流行病排查内联条 */}
              <div className="triage-fever-alert">
                <div className="triage-fever-primary">
                  <Switch checked={fever} onChange={setFever} label="发热筛查 (≥37.3℃)" />
                  {fever && <strong>【建议指引至发热门诊】</strong>}
                </div>
                <div className="triage-fever-checks">
                  <label>
                    <input
                      type="checkbox"
                      checked={hasRespiratorySymptom}
                      onChange={(e) => setHasRespiratorySymptom(e.target.checked)}
                    />
                    <span>伴咳嗽咳痰</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={hasDiarrheaSymptom}
                      onChange={(e) => setHasDiarrheaSymptom(e.target.checked)}
                    />
                    <span>伴呕吐腹泻</span>
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={hasRashSymptom}
                      onChange={(e) => setHasRashSymptom(e.target.checked)}
                    />
                    <span>伴皮疹</span>
                  </label>
                </div>
                <div className="triage-fever-history">
                  <input
                    type="text"
                    placeholder="近14天重点传染病疫区接触史、聚集性发病说明..."
                    value={epidemicHistory}
                    onChange={(e) => setEpidemicHistory(e.target.value)}
                    className="triage-fever-history-input"
                  />
                </div>
              </div>
            </div>
          </Panel>

          {/* 3. 主诉问诊与高频症状矩阵（紧凑） */}
          <Panel>
            <PanelHead
              title="主诉问诊与症状快捷录入"
              meta={`已选 ${selectedSymptomTags.length} 项症状`}
            />
            <div className="triage-symptoms-section">
              <input
                type="text"
                placeholder="例如：突发胸痛胸闷伴大汗2小时；发热咳嗽咳黄痰3天等"
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                className="triage-chief-complaint-input"
              />

              <div className="triage-symptoms-categories">
                {COMMON_SYMPTOM_TAGS.map((cat) => (
                  <div key={cat.category} className="triage-symptom-row">
                    <span className="triage-symptom-category-title">{cat.category}：</span>
                    <div className="triage-symptom-chips">
                      {cat.tags.map((tag) => {
                        const isSelected = selectedSymptomTags.includes(tag)
                        return (
                          <button
                            key={tag}
                            type="button"
                            className={`triage-symptom-chip ${isSelected ? 'triage-symptom-chip--active' : ''}`}
                            onClick={() => handleToggleSymptomChip(tag)}
                            aria-pressed={isSelected}
                          >
                            {tag}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          {/* 4. 急慢四级定级、绿通与去向流向（紧凑单行胶囊 + 三列栅格） */}
          <Panel>
            <PanelHead
              title="急慢分诊定级与去向判定"
              meta={`系统建议 ${TRIAGE_LEVEL_DEFINITIONS[vitalsAssessment.suggestedLevel].codeName}`}
            />

            {/* 四级定级单行卡片 */}
            <div className="triage-level-cards">
              {Object.values(TRIAGE_LEVEL_DEFINITIONS).map((def) => {
                const isSelected = triageLevel === def.level
                return (
                  <button
                    key={def.level}
                    type="button"
                    className={`triage-level-card ${isSelected ? `triage-level-card--selected-${def.colorName}` : ''}`}
                    onClick={() => setTriageLevel(def.level)}
                    title={def.description}
                    aria-pressed={isSelected}
                  >
                    <span className={`triage-level-card__tag triage-level-card__tag--${def.colorName}`}>
                      {def.codeName}
                    </span>
                    <span className="triage-level-card__title">{def.label.replace(/\s*\([^)]*\)$/, '')}</span>
                    {isSelected && <Icon name="check" />}
                  </button>
                )
              })}
            </div>

            {/* 定级依据、绿色通道与去向三栏紧凑行 */}
            <div className="triage-routing-grid">
              <div className="triage-routing-field">
                <span className="triage-routing-label">
                  分诊处置去向
                </span>
                <Select
                  options={DISPOSITION_OPTIONS}
                  value={disposition}
                  onChange={(v) => setDisposition(v as TriageDisposition)}
                />
              </div>

              <div className="triage-routing-field">
                <span className="triage-routing-label">
                  优先就医绿色通道
                </span>
                <div className="triage-green-channel-chips">
                  {GREEN_CHANNEL_OPTIONS.map((gc) => {
                    const isSelected = greenChannel === gc.key
                    return (
                      <button
                        key={gc.key}
                        type="button"
                        className={`triage-green-channel-btn ${isSelected ? 'triage-green-channel-btn--active' : ''}`}
                        onClick={() => setGreenChannel(gc.key)}
                        title={gc.desc}
                        aria-pressed={isSelected}
                      >
                        <Icon name={gc.icon as any} />
                        <span>{gc.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="triage-routing-field">
                <span className="triage-routing-label">
                  分诊依据与调级说明
                </span>
                <input
                  type="text"
                  placeholder="如：胸痛心电图异常，Ⅰ级濒危入胸痛中心..."
                  value={triageReason}
                  onChange={(e) => setTriageReason(e.target.value)}
                  className="triage-routing-reason"
                />
              </div>
            </div>
          </Panel>

          {/* 底部操作工具条 */}
          <footer className="triage-action-bar">
            <div className="triage-action-bar__left">
              <Button size="md" variant="secondary" onClick={resetForm}>
                <Icon name="close" />
                <span>重置</span>
              </Button>
              <Button
                size="md"
                variant="secondary"
                onClick={() => {
                  setTriageLevel(vitalsAssessment.suggestedLevel)
                  setTriageReason(vitalsAssessment.suggestedReason)
                  setFeedback({ message: `已自动算级：${TRIAGE_LEVEL_DEFINITIONS[vitalsAssessment.suggestedLevel].label}`, tone: 'info' })
                }}
              >
                <Icon name="sparkles" />
                <span>自动定级</span>
              </Button>
            </div>

            <div className="triage-action-bar__right">
              <Button
                size="md"
                variant="secondary"
                busy={saveMutation.isPending}
                disabled={!canEdit}
                onClick={() => saveMutation.mutate(false)}
              >
                <Icon name="check" />
                <span>保存</span>
              </Button>
              <Button
                size="md"
                variant="primary"
                busy={saveMutation.isPending}
                disabled={!canEdit}
                onClick={() => saveMutation.mutate(true)}
              >
                <Icon name="print" />
                <span>保存并打印</span>
              </Button>
              <Button
                size="md"
                variant="primary"
                onClick={handleNavigateToRegistration}
                disabled={!activeTriageId}
                title="带入推荐科室直接跳转门诊挂号台"
              >
                <Icon name="chevron-right" />
                <span>直通挂号</span>
              </Button>
            </div>
          </footer>
        </section>

        {/* 右栏：分诊决策辅助与结果 */}
        <aside className="triage-right-pane">
          <Panel className="triage-decision-panel">
            <PanelHead
              title="分诊辅助"
              meta={recommendQuery.isFetching ? '正在更新推荐' : '动态评估'}
            />
            <div className={`triage-decision-summary triage-decision-summary--${TRIAGE_LEVEL_DEFINITIONS[triageLevel].colorName}`}>
              <div>
                <span>当前分级</span>
                <strong>{TRIAGE_LEVEL_DEFINITIONS[triageLevel].codeName} {TRIAGE_LEVEL_DEFINITIONS[triageLevel].label}</strong>
              </div>
              <div className={triageLevel !== vitalsAssessment.suggestedLevel ? 'triage-decision-summary__suggestion' : ''}>
                <span>系统建议</span>
                <strong>
                  {TRIAGE_LEVEL_DEFINITIONS[vitalsAssessment.suggestedLevel].codeName}
                  {' '}{TRIAGE_LEVEL_DEFINITIONS[vitalsAssessment.suggestedLevel].label}
                </strong>
              </div>
              <div>
                <span>接诊去向</span>
                <strong>{targetDepartmentName || '待选择科室'}</strong>
              </div>
            </div>

            <div className="triage-assist-section-title">
              <span>智能科室推荐</span>
              {recommendQuery.isFetching && <span className="triage-assist-status"><Icon name="refresh" />计算中</span>}
            </div>
            <div className="triage-recommendations-list">
              {recommendQuery.isLoading && <LoadingState label="计算推荐科室中..." />}
              {!recommendQuery.isLoading && (recommendQuery.data == null || recommendQuery.data.length === 0) && (
                <div className="triage-compact-empty">
                  <Icon name="clinical" />
                  <span>{patientName ? '录入主诉、症状或体征后显示推荐' : '请先从左侧队列选择患者'}</span>
                </div>
              )}
              {(recommendQuery.data ?? []).map((rec, idx) => (
                <div
                  key={rec.departmentId}
                  className={`triage-recommendation-card ${idx === 0 ? 'triage-recommendation-card--top' : ''}`}
                >
                  <div className="triage-recommendation-card__header">
                    <span className="triage-recommendation-card__title">
                      {rec.departmentName}
                    </span>
                    <span className="triage-recommendation-card__score">匹配度 {rec.score}%</span>
                  </div>
                  <p className="triage-recommendation-card__reason">{rec.rationale}</p>
                  {rec.alertNotice && (
                    <div className="triage-recommendation-card__alert">
                      <Icon name="info" />
                      <span>{rec.alertNotice}</span>
                    </div>
                  )}
                  <div className="triage-recommendation-card__footer">
                    <span className="triage-recommendation-card__capacity">
                      今日号源余量：{rec.availableScheduleCount} 个
                    </span>
                    <Button
                      size="sm"
                      variant={targetDepartmentName === rec.departmentName ? 'primary' : 'secondary'}
                      onClick={() => handleApplyRecommendation(rec)}
                    >
                      {targetDepartmentName === rec.departmentName ? '已采纳' : '采纳科室'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            <details className="triage-reference">
              <summary>国家四级分诊指征速查</summary>
              <div className="triage-reference__content">
              <div>
                <strong className="triage-reference__level triage-reference__level--red">Ⅰ级 (濒危·红)：</strong>
                <span>心跳呼吸骤停、重度窒息、深昏迷、严重休克。0分钟立即抢救。</span>
              </div>
              <div>
                <strong className="triage-reference__level triage-reference__level--orange">Ⅱ级 (危重·橙)：</strong>
                <span>急性胸痛、突发口角歪斜偏瘫、高热惊厥、SBP≥180且剧烈头痛。10分钟优先接诊。</span>
              </div>
              <div>
                <strong className="triage-reference__level triage-reference__level--yellow">Ⅲ级 (急症·黄)：</strong>
                <span>急性高热、急性中重度腹痛、中度外伤骨折扭伤。30分钟内接诊。</span>
              </div>
              <div>
                <strong className="triage-reference__level triage-reference__level--green">Ⅳ级 (非急症·绿)：</strong>
                <span>慢性病复查配药、轻度咽痛鼻塞、体征平稳。常规门诊排队。</span>
              </div>
              </div>
            </details>
          </Panel>

          <Panel className="triage-ticket-panel">
            <PanelHead
              title="分诊凭条"
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!activeTriageId && !savedTicketRecord}
                  onClick={() => setTicketModalOpen(true)}
                >
                  <Icon name="print" />
                  <span>预览与打印</span>
                </Button>
              }
            />
            <div className="triage-ticket-summary">
              {savedTicketRecord ? (
                <div className="triage-ticket-summary__grid">
                  <span>分诊单号<strong>{savedTicketRecord.triageNo}</strong></span>
                  <span>患者<strong>{savedTicketRecord.patientName}</strong></span>
                  <span>分级<strong>{TRIAGE_LEVEL_DEFINITIONS[savedTicketRecord.triageLevel].codeName}</strong></span>
                  <span>科室<strong>{savedTicketRecord.targetDepartmentName || '全科医疗科'}</strong></span>
                </div>
              ) : (
                <div className="triage-compact-empty">
                  <Icon name="print" />
                  <span>保存后可预览并打印分诊凭条</span>
                </div>
              )}
            </div>
          </Panel>
        </aside>
      </main>

      {/* 分诊小票打印弹窗 */}
      {ticketModalOpen && (
        <TriageTicketModal
          open={ticketModalOpen}
          record={savedTicketRecord}
          hospitalName="区域健康医疗协同平台中心医院"
          onClose={() => setTicketModalOpen(false)}
        />
      )}
    </div>
  )
}
