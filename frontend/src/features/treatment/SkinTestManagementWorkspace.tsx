import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type {
  SkinTestResult, SkinTestStatus, SkinTestWorkItem, StartSkinTestInput,
} from '../../shared/api/treatmentApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, BodySiteSelect, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge, UnitNumberInput } from '../../shared/ui'
import '../../styles/features/treatment-skintest.css'

type StatusFilter = 'ACTIONABLE' | 'OBSERVING' | 'FINISHED' | 'ALL'

const statusLabel: Record<SkinTestStatus, string> = {
  WAITING_SETTLEMENT: '待结算',
  WAITING_DISPENSE: '待发药',
  PENDING: '待皮试',
  IN_PROGRESS: '观察中',
  NEGATIVE: '阴性',
  POSITIVE: '阳性',
  UNCERTAIN: '可疑',
  INVALID: '无效',
}

function statusTone(value: SkinTestStatus) {
  if (value === 'NEGATIVE') return 'success' as const
  if (value === 'POSITIVE') return 'danger' as const
  if (['WAITING_SETTLEMENT', 'WAITING_DISPENSE', 'UNCERTAIN', 'INVALID'].includes(value)) return 'warning' as const
  return 'info' as const
}

const COMMON_BODY_SITES = [
  '左前臂屈侧下段',
  '右前臂屈侧下段',
  '左前臂背侧',
  '右前臂背侧',
  '生理盐水对照侧',
]

const WHEAL_STEPS = [0, 5, 8, 10, 15, 20]
const FLARE_STEPS = [0, 5, 10, 15, 20, 30]

const CLINICAL_SIGNS = [
  '伪足(假足)',
  '局部隆起硬结',
  '明显发痒/烧灼感',
  '周围苍白圈',
  '局部荨麻疹',
  '全身皮疹',
  '胸闷/头晕',
]

export function SkinTestManagementWorkspace({ api, clinicalContext }: {
  api: RhnApi; clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const linkedEncounterId = searchParams.get('encounterId')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ACTIONABLE')
  const [keyword, setKeyword] = useState('')
  const [selectedRequestId, setSelectedRequestId] = useState('')
  const [now, setNow] = useState(Date.now())

  // Global heartbeat for observation countdown
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const worklist = useQuery({
    queryKey: ['skin-test-worklist'],
    queryFn: () => api.treatments.skinTestWorklist(),
    refetchInterval: 20_000,
  })
  const allItems = worklist.data ?? []

  const values = useMemo(() => {
    const term = keyword.trim().toLowerCase()
    return allItems.filter((item) => {
      if (statusFilter === 'ACTIONABLE' && !['PENDING', 'IN_PROGRESS', 'UNCERTAIN', 'INVALID',
        'WAITING_SETTLEMENT', 'WAITING_DISPENSE'].includes(item.status)) return false
      if (statusFilter === 'OBSERVING' && item.status !== 'IN_PROGRESS') return false
      if (statusFilter === 'FINISHED' && !['NEGATIVE', 'POSITIVE'].includes(item.status)) return false
      if (!term) return true
      return [item.residentName, item.healthRecordNo, item.requestNo, item.medicationName, item.itemName]
        .some((value) => value?.toLowerCase().includes(term))
    })
  }, [allItems, keyword, statusFilter])

  useEffect(() => {
    if (!linkedEncounterId || !worklist.data) return
    const target = worklist.data.find((item) => item.encounterId === linkedEncounterId)
    if (target) {
      setStatusFilter(['NEGATIVE', 'POSITIVE'].includes(target.status) ? 'FINISHED' : 'ACTIONABLE')
      setSelectedRequestId(target.medicationRequestId)
    }
    const next = new URLSearchParams(searchParams)
    next.delete('encounterId')
    setSearchParams(next, { replace: true })
  }, [linkedEncounterId, searchParams, setSearchParams, worklist.data])

  useEffect(() => {
    if (linkedEncounterId) return
    if (!selectedRequestId && values.length) setSelectedRequestId(values[0].medicationRequestId)
    if (selectedRequestId && !values.some((item) => item.medicationRequestId === selectedRequestId)) {
      setSelectedRequestId(values[0]?.medicationRequestId ?? '')
    }
  }, [linkedEncounterId, selectedRequestId, values])

  const selected = values.find((item) => item.medicationRequestId === selectedRequestId)
    ?? allItems.find((item) => item.medicationRequestId === selectedRequestId)

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['skin-test-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['treatment-worklist'] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-skin-tests'] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-allergies'] }),
    ])
  }

  // Calculate observation statistics for KPI cards
  const observingItems = allItems.filter((item) => item.status === 'IN_PROGRESS')
  const overdueCount = observingItems.filter((item) => {
    if (!item.startedAt || !item.observationMinutes) return false
    const readyAt = new Date(item.startedAt).getTime() + item.observationMinutes * 60_000
    return now >= readyAt
  }).length

  const nearDueCount = observingItems.filter((item) => {
    if (!item.startedAt || !item.observationMinutes) return false
    const readyAt = new Date(item.startedAt).getTime() + item.observationMinutes * 60_000
    const rem = (readyAt - now) / 60_000
    return rem > 0 && rem <= 3
  }).length

  const metrics = {
    pending: allItems.filter((item) => ['PENDING', 'UNCERTAIN', 'INVALID', 'WAITING_SETTLEMENT', 'WAITING_DISPENSE'].includes(item.status)).length,
    observing: observingItems.length,
    positive: allItems.filter((item) => item.status === 'POSITIVE').length,
    negative: allItems.filter((item) => item.status === 'NEGATIVE').length,
  }

  return <>
    <PageHeader
      eyebrow="门诊医疗 · 用药安全工作台"
      title="皮试与观察质控中心"
      description="承接需皮试用药的注射准备、群体留观倒计时质控、客观标尺辅助判读与双人复核放行。"
      actions={<div className="skin-test-header-actions">
        <div className="skin-test-quick-stat-capsule" aria-label="队列实时概览">
          <span className="skin-test-stat-item">
            <small>待处理</small>
            <strong>{metrics.pending}</strong>
          </span>
          <span className="skin-test-stat-divider" />
          <span className="skin-test-stat-item">
            <small>留观中</small>
            <strong>{metrics.observing}</strong>
          </span>
          {overdueCount > 0 ? (
            <span className="skin-test-stat-badge is-danger">⚠️ 超期 {overdueCount}</span>
          ) : nearDueCount > 0 ? (
            <span className="skin-test-stat-badge is-warning">临近 {nearDueCount}</span>
          ) : null}
        </div>
        <Button variant="secondary" onClick={() => void refresh()}>刷新队列</Button>
      </div>}
    />
    {worklist.error && <Alert>{errorMessage(worklist.error)}</Alert>}

    {/* Modern Desktop 3-Column Workbench */}
    <div className="skin-test-workbench-triad">
      {/* Col 1: Queue with Live Micro-Countdowns */}
      <Panel className="skin-test-col-queue">
        <header className="skin-test-section-head">
          <div>
            <h2>皮试队列</h2>
          </div>
          <input
            aria-label="搜索皮试任务"
            value={keyword}
            placeholder="姓名 / 档案号 / 药品"
            onChange={(event) => setKeyword(event.target.value)}
          />
        </header>

        <nav className="skin-test-filters" aria-label="皮试状态筛选">
          {([
            ['ACTIONABLE', '待处理', metrics.pending, false],
            ['OBSERVING', '观察中', metrics.observing, overdueCount > 0],
            ['FINISHED', '已判读', metrics.negative + metrics.positive, false],
            ['ALL', '全部', allItems.length, false],
          ] as [StatusFilter, string, number, boolean][]).map(([value, label, count, hasOverdue]) => (
            <button
              type="button"
              key={value}
              className={`skin-test-filter-pill ${statusFilter === value ? 'is-active' : ''} ${hasOverdue ? 'has-overdue' : ''}`}
              onClick={() => setStatusFilter(value)}
            >
              <span className="skin-test-filter-name">{label}</span>
              <span className={`skin-test-filter-count ${hasOverdue ? 'is-danger' : ''}`}>
                {count}
                {hasOverdue && <span className="skin-test-dot-alert" title={`有 ${overdueCount} 人已超期`} />}
              </span>
            </button>
          ))}
        </nav>

        {worklist.isPending && <LoadingState label="正在加载皮试队列…" />}
        {!worklist.isPending && values.length === 0 && (
          <EmptyState
            icon="clinical"
            title="当前没有皮试任务"
            copy="门诊需皮试药品开立后将自动进入此工作台。"
          />
        )}

        <div className="skin-test-queue-list">
          {values.map((item) => {
            const isSelected = item.medicationRequestId === selectedRequestId
            const isObserving = item.status === 'IN_PROGRESS'
            const readyAt = item.startedAt && item.observationMinutes
              ? new Date(item.startedAt).getTime() + item.observationMinutes * 60_000
              : 0
            const remMin = readyAt ? Math.ceil((readyAt - now) / 60_000) : 0
            const isOverdue = readyAt > 0 && now >= readyAt
            const overdueMin = readyAt > 0 && now >= readyAt ? Math.floor((now - readyAt) / 60_000) : 0
            const totalMin = item.observationMinutes || 20
            const elapsedMin = readyAt ? Math.max(0, Math.floor((now - new Date(item.startedAt!).getTime()) / 60_000)) : 0
            const progressRatio = Math.min(100, Math.max(0, (elapsedMin / totalMin) * 100))

            return (
              <button
                type="button"
                key={item.medicationRequestId}
                className={`skin-test-queue-item ${isSelected ? 'is-active' : ''} ${isOverdue ? 'is-overdue-warning' : ''}`}
                onClick={() => setSelectedRequestId(item.medicationRequestId)}
              >
                <div className="skin-test-queue-item__row1">
                  <div className="skin-test-queue-item__name">
                    <strong>{item.residentName}</strong>
                    <small>{item.healthRecordNo}</small>
                  </div>
                  <StatusBadge tone={statusTone(item.status)}>{statusLabel[item.status]}</StatusBadge>
                </div>

                <div className="skin-test-queue-item__med">
                  <span>{item.itemName || item.medicationName}</span>
                </div>

                {isObserving && (
                  <div className="skin-test-queue-item__countdown">
                    <div className="skin-test-countdown-bar">
                      <div
                        className={`skin-test-countdown-fill ${isOverdue ? 'is-overdue' : (remMin <= 3 ? 'is-neardue' : '')}`}
                        style={{ width: `${progressRatio}%` }}
                      />
                    </div>
                    <div className="skin-test-countdown-labels">
                      {isOverdue ? (
                        <span className="skin-test-time-overdue">已超期 +{overdueMin}m</span>
                      ) : remMin <= 3 ? (
                        <span className="skin-test-time-neardue">即刻到点（剩 {remMin}m）</span>
                      ) : (
                        <span className="skin-test-time-normal">观察中（剩 {remMin}m）</span>
                      )}
                      <small>共 {totalMin}m</small>
                    </div>
                  </div>
                )}

                {!isObserving && (
                  <div className="skin-test-queue-item__footer">
                    <small>{item.requestNo}</small>
                    <small>{item.startedAt ? formatTime(item.startedAt) : '未开始'}</small>
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </Panel>

      {/* Col 2: Core Clinical Operation & Objective Reading Panel */}
      <Panel className="skin-test-col-main">
        {!selected ? (
          <EmptyState icon="clinical" title="请选择皮试任务" copy="从左侧队列点击患者卡片即可开启临床作业。" />
        ) : (
          <SkinTestDetail
            key={`${selected.medicationRequestId}:${selected.eventId ?? 'pending'}:${selected.eventRevision ?? 0}`}
            item={selected}
            api={api}
            departmentName={clinicalContext.department.name}
            onRefresh={refresh}
          />
        )}
      </Panel>

      {/* Col 3: Quality Control, Historical Profile & Medication Safety */}
      <Panel className="skin-test-col-side">
        {selected ? (
          <SkinTestPatientSafetySidecar item={selected} api={api} allItems={allItems} />
        ) : (
          <div className="skin-test-sidecar-empty">
            <p>选择患者后查看用药安全画像、既往过敏史档案与药品主数据规范。</p>
          </div>
        )}
      </Panel>
    </div>
  </>
}

function SkinTestDetail({ item, api, departmentName, onRefresh }: {
  item: SkinTestWorkItem; api: RhnApi; departmentName: string; onRefresh: () => Promise<void>
}) {
  const [identityVerified, setIdentityVerified] = useState(false)
  const [verificationMethod, setVerificationMethod] = useState<StartSkinTestInput['verificationMethod']>('NAME_AND_IDENTIFIER')
  const testMethod = item.configuredTestMethod ?? 'INTRADERMAL'
  const originalSolution = item.configuredSolutionMode === 'ORIGINAL_SOLUTION'
  const observationMinutes = item.configuredObservationMinutes ?? 20
  const [solutionName, setSolutionName] = useState(originalSolution
    ? (item.itemName || item.medicationName) : '按主数据方案配制的皮试液')
  const [lotNo, setLotNo] = useState('')
  const [concentration, setConcentration] = useState('')
  const [concentrationUnit, setConcentrationUnit] = useState('U/ml')
  const [bodySite, setBodySite] = useState('左前臂屈侧下段')

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: () => api.organization.practitioners(),
    staleTime: 5 * 60 * 1000,
  })
  const verifierOptions = useMemo(() => {
    return (practitioners.data ?? [])
      .filter((p) => p.sdPersonnelStatus === 'ACTIVE' || !p.sdPersonnelStatus)
      .map((p) => ({
        value: p.id,
        label: `${p.fullName}${p.code ? ` (${p.code})` : ''}`,
        searchKeywords: [p.fullName, p.code || ''],
      }))
  }, [practitioners.data])
  const [verifierPractitionerId, setVerifierPractitionerId] = useState<string>('')
  const selectedVerifier = practitioners.data?.find((p) => p.id === verifierPractitionerId)

  const [result, setResult] = useState<SkinTestResult>('NEGATIVE')
  const [wheal, setWheal] = useState('')
  const [flare, setFlare] = useState('')
  const [reaction, setReaction] = useState('')
  const [selectedSigns, setSelectedSigns] = useState<string[]>([])
  const [earlyReadReason, setEarlyReadReason] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [emergencyAlertOpen, setEmergencyAlertOpen] = useState(false)
  const [clock, setClock] = useState(Date.now())

  useEffect(() => {
    if (item.status !== 'IN_PROGRESS') return
    const timer = window.setInterval(() => setClock(Date.now()), 5_000)
    return () => window.clearInterval(timer)
  }, [item.status])

  const refresh = async () => { await onRefresh() }
  const start = useMutation({
    mutationFn: () => api.treatments.startSkinTest(item.medicationRequestId, {
      expectedMedicationRevision: item.medicationRequestRevision,
      identityVerified,
      verificationMethod,
      testMethod,
      originalSolution,
      solutionName: solutionName.trim() || undefined,
      lotNo: lotNo.trim() || undefined,
      concentration: concentration ? Number(concentration) : undefined,
      concentrationUnit: concentration ? concentrationUnit.trim() || undefined : undefined,
      bodySite: bodySite.trim() || undefined,
      observationMinutes,
    }),
    onSuccess: refresh,
  })

  const complete = useMutation({
    mutationFn: () => api.treatments.completeSkinTest(item.eventId!, {
      expectedRevision: item.eventRevision!,
      result,
      whealDiameterMm: wheal ? Number(wheal) : undefined,
      flareDiameterMm: flare ? Number(flare) : undefined,
      reactionDescription: reaction.trim() || undefined,
      earlyReadReason: earlyReadReason.trim() || undefined,
      verifiedByPractitionerId: verifierPractitionerId || undefined,
      verifiedByName: selectedVerifier?.fullName || undefined,
    }),
    onSuccess: refresh,
  })

  const cancel = useMutation({
    mutationFn: () => api.treatments.cancelSkinTest(item.eventId!, item.eventRevision!, cancelReason.trim()),
    onSuccess: refresh,
  })

  const readyAt = item.startedAt && item.observationMinutes
    ? new Date(item.startedAt).getTime() + item.observationMinutes * 60_000 : 0
  const remainingMinutes = readyAt ? Math.max(0, Math.ceil((readyAt - clock) / 60_000)) : 0
  const elapsedMinutes = item.startedAt ? Math.floor((clock - new Date(item.startedAt).getTime()) / 60_000) : 0
  const overdueMinutes = readyAt ? Math.max(0, Math.floor((clock - readyAt) / 60_000)) : 0
  const isOverdue = overdueMinutes >= 1
  const negativeBeforeObservationEnds = remainingMinutes > 0 && result === 'NEGATIVE'
  const error = start.error || complete.error || cancel.error
  const canStart = ['PENDING', 'UNCERTAIN', 'INVALID'].includes(item.status)
  const showConfiguration = ['WAITING_SETTLEMENT', 'WAITING_DISPENSE',
    'PENDING', 'UNCERTAIN', 'INVALID'].includes(item.status)
  const dose = [item.doseValue, item.doseUnit].filter((value) => value !== undefined && value !== '').join(' ')

  // Toggle clinical signs and auto-append to reaction description
  const toggleSign = (sign: string) => {
    let next: string[]
    if (selectedSigns.includes(sign)) {
      next = selectedSigns.filter((s) => s !== sign)
    } else {
      next = [...selectedSigns, sign]
    }
    setSelectedSigns(next)
    if (next.length > 0) {
      const summary = `局部体征：${next.join('、')}`
      if (!reaction.includes('局部体征：')) {
        setReaction(reaction ? `${reaction}；${summary}` : summary)
      } else {
        setReaction(reaction.replace(/局部体征：[^；;\n]*/, summary))
      }
    }
  }

  // Objective suggestion check: if wheal >= 10mm or pseudopod present, suggest positive
  const objectiveSuggestsPositive = Number(wheal) >= 10 || selectedSigns.includes('伪足(假足)')

  // Trigger Code Red: Emergency Anaphylaxis Straight Channel
  const triggerEmergencyAnaphylaxis = () => {
    setResult('POSITIVE')
    setWheal('15')
    setFlare('25')
    if (!selectedSigns.includes('伪足(假足)')) {
      setSelectedSigns([...selectedSigns, '伪足(假足)', '局部荨麻疹', '胸闷/头晕'])
    }
    setEarlyReadReason('突发严重急性过敏反应，紧急阻断并启动抢救预案')
    setReaction('【🚨突发严重急性过敏/休克反应】留观中患者突发急性全身皮疹、呼吸窘迫及胸闷，立即中止观察并断定阳性阻断处方！启动休克抢救预案，通知经治医师。')
    setEmergencyAlertOpen(true)
  }

  return <>
    {/* Integrated Clinical Cockpit Head */}
    <header className="skin-test-unified-cockpit">
      {/* Upper: Patient Identity + Medication + Gate Control */}
      <div className="skin-test-cockpit-upper">
        <div className="skin-test-patient-identity">
          <div className="skin-test-patient-avatar" aria-hidden="true">{item.residentName.slice(0, 1)}</div>
          <div className="skin-test-patient-meta">
            <div className="skin-test-patient-name-row">
              <h2 className="skin-test-patient-name">{item.residentName}</h2>
              <span className="skin-test-id-pill" title="健康档案号">{item.healthRecordNo}</span>
              <span className="skin-test-id-pill" title="医嘱处方号">{item.requestNo}</span>
              <span className="skin-test-dept-badge">{departmentName} · 第 {item.attemptNo ?? 1} 次注射</span>
            </div>
            <div className="skin-test-med-highlight">
              <strong className="skin-test-med-name">{item.itemName || item.medicationName}</strong>
              {item.medicationCode && <span className="skin-test-med-code">({item.medicationCode})</span>}
              <span className="skin-test-med-dosage">
                {[dose, item.routeCode].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>
        </div>

        <div className="skin-test-cockpit-gate">
          <div className="skin-test-gate-pill-box">
            <span className="skin-test-gate-label">处方门禁管控</span>
            <div className={`skin-test-gate-status is-${item.status === 'NEGATIVE' ? 'released' : item.status === 'POSITIVE' ? 'blocked' : 'waiting'}`}>
              <span className="skin-test-gate-dot" />
              <strong>
                {item.status === 'NEGATIVE' ? '已安全放行' : item.status === 'POSITIVE' ? '已强制阻断' : '未放行 (待判读)'}
              </strong>
            </div>
            <small className="skin-test-gate-tip">
              {item.status === 'NEGATIVE' ? '处方发药/输液可继续' : item.status === 'POSITIVE' ? '已拦截医嘱执行' : '需取得合规阴性结果'}
            </small>
          </div>
          <StatusBadge tone={statusTone(item.status)}>{statusLabel[item.status]}</StatusBadge>
        </div>
      </div>

      {/* Lower: Master Skin Test Protocol Strip */}
      {showConfiguration && (
        <div className="skin-test-cockpit-protocol">
          <dl className="skin-test-config-strip" aria-label="药品主数据皮试方案">
            <div><dt>皮试方式</dt><dd>{testMethodLabel(testMethod)}</dd></div>
            <div><dt>试液类型</dt><dd>{solutionModeLabel(item.configuredSolutionMode)}</dd></div>
            <div><dt>执行前置</dt><dd>{originalSolution ? '收费并发药后' : '可先皮试'}</dd></div>
            <div><dt>观察时长</dt><dd>{observationMinutes} 分钟</dd></div>
          </dl>
          <div className="skin-test-protocol-notice">
            <span className="skin-test-notice-icon">ℹ️</span>
            <p>
              {originalSolution
                ? '原液皮试使用本次处方药品，系统将在开始前校验药品已结算且已发药。'
                : '非原液皮试使用独立配制试液，可在药品结算和发药前进行；阴性后用药仍须完成收费发药。'}
              {item.configurationInstructions ? ` ${item.configurationInstructions}` : ''}
              {item.resultValidityHours ? ` 阴性结果有效 ${item.resultValidityHours} 小时。` : ''}
            </p>
          </div>
        </div>
      )}
    </header>

    {error && <Alert>{errorMessage(error)}</Alert>}

    {['WAITING_SETTLEMENT', 'WAITING_DISPENSE'].includes(item.status) && (
      <Alert tone="warning">
        {item.gateMessage || '当前药品尚未满足皮试执行条件，请指导患者先行完成缴费与药房取药。'}
      </Alert>
    )}

    {/* Section B: Ready to Start (Preparation & Intradermal Injection) */}
    {canStart && (
      <section className="skin-test-action-card">
        {['UNCERTAIN', 'INVALID'].includes(item.status) && (
          <Alert tone="info">上次判读为{statusLabel[item.status]}，请在对侧肢体重新规范执行皮试并计时。</Alert>
        )}
        <div className="skin-test-card-title">
          <h3>开始皮试（皮内注射）</h3>
          <span className="skin-test-guide-tag">注射 0.1ml 形成 6~8mm 圆形皮丘</span>
        </div>

        <label className="treatment-identity-check">
          <input
            type="checkbox"
            checked={identityVerified}
            onChange={(event) => setIdentityVerified(event.target.checked)}
          />
          <span>
            <strong>已当面核对患者身份、药品和皮试液（三查七对）</strong>
            <small>严格核对姓名、卡号/条码，并已确认无明确同类药物过敏史</small>
          </span>
        </label>

        <div className="skin-test-form-grid">
          <FormField label="核对方式">
            <Select
              value={verificationMethod}
              searchable={false}
              clearable={false}
              onChange={(value) => setVerificationMethod(value as typeof verificationMethod)}
              options={[
                { value: 'NAME_AND_IDENTIFIER', label: '姓名 + 证件/卡' },
                { value: 'CARD', label: '读卡核对' },
                { value: 'MANUAL', label: '人工核对' },
              ]}
            />
          </FormField>

          <FormField label="试液 / 配制说明">
            <input
              value={solutionName}
              maxLength={300}
              onChange={(event) => setSolutionName(event.target.value)}
            />
          </FormField>

          <FormField label="药品或试液批号">
            <input
              value={lotNo}
              maxLength={128}
              placeholder="扫码或录入批号"
              onChange={(event) => setLotNo(event.target.value)}
            />
          </FormField>

          <FormField label="浓度">
            <UnitNumberInput
              value={concentration}
              unit={concentrationUnit}
              units={['U/ml', 'mg/ml', 'μg/ml', '%', 'IU/ml', 'mg/0.1ml']}
              placeholder="按规范浓度"
              step="0.01"
              min="0"
              onValueChange={(val) => setConcentration(val)}
              onUnitChange={(u) => setConcentrationUnit(u)}
            />
          </FormField>

          <FormField label="皮试部位" className="skin-test-grid-full">
            <BodySiteSelect
              value={bodySite}
              onChange={(site) => setBodySite(site)}
              presets={COMMON_BODY_SITES}
              placeholder="选择或输入规范皮试部位"
            />
          </FormField>
        </div>

        <div className="ui-form-actions skin-test-start-action">
          <Button
            size="lg"
            busy={start.isPending}
            disabled={!identityVerified}
            onClick={() => start.mutate()}
          >
            确认开始并计时（启动 {observationMinutes} 分钟留观）
          </Button>
        </div>
      </section>
    )}

    {/* Section C: Observing & Objective Interpretation */}
    {item.status === 'IN_PROGRESS' && (
      <section className="skin-test-action-card is-observing">
        {/* Dynamic Countdown Header Banner */}
        <div className={`skin-test-timer-banner ${isOverdue ? 'is-overdue' : (remainingMinutes <= 3 ? 'is-neardue' : 'is-normal')}`}>
          <div className="skin-test-timer-main">
            <span className="skin-test-timer-label">观察留观计时</span>
            <strong className="skin-test-timer-value">
              {remainingMinutes > 0 ? `还需 ${remainingMinutes} 分钟` : '已到判读时间'}
            </strong>
            <small>
              开始于 {formatTime(item.startedAt!)} · 预计于 {formatTime(new Date(readyAt).toISOString())} 判读
            </small>
          </div>
          <div className="skin-test-timer-side">
            <StatusBadge tone={remainingMinutes > 0 ? 'warning' : isOverdue ? 'danger' : 'success'}>
              {isOverdue ? `超期 ${overdueMinutes}m` : `${item.observationMinutes} 分钟`}
            </StatusBadge>
            <Button
              size="sm"
              variant="danger"
              className="skin-test-emergency-btn"
              onClick={triggerEmergencyAnaphylaxis}
            >
              🚨 突发严重过敏 / 一键急救
            </Button>
          </div>
        </div>

        {isOverdue && (
          <Alert tone="warning">
            ⚠️ 留观已超期 {overdueMinutes} 分钟（累计观察 {elapsedMinutes} 分钟）。请立即完成双人复核判读，以防皮丘反应消退或假阴性！
          </Alert>
        )}

        {emergencyAlertOpen && (
          <div className="skin-test-emergency-alert-box">
            <h4>🚨 已启动过敏性休克急救直通通道：</h4>
            <ol>
              <li>立即停止观察，就地平卧、保暖、吸氧，保持呼吸道通畅；</li>
              <li>首选 1:1000 盐酸肾上腺素 0.3~0.5ml（小儿按 0.01ml/kg）肌注；</li>
              <li>迅速建立静脉通路，紧急呼叫值班医师并备齐地塞米松、多巴胺；</li>
              <li>当前已自动为您填充阳性阻断与高危过敏描述，请指定复核护士后提交存档。</li>
            </ol>
          </div>
        )}

        {/* Injection Facts Summary */}
        <dl className="skin-test-facts">
          <div><dt>开始时刻</dt><dd>{formatTime(item.startedAt!)}</dd></div>
          <div><dt>注射部位</dt><dd>{item.bodySite || '未记录'}</dd></div>
          <div><dt>试液类型</dt><dd>{item.solutionName || (item.originalSolution ? '原液' : '配制皮试液')}</dd></div>
          <div><dt>试液批号</dt><dd>{item.lotNo || '未记录'}</dd></div>
        </dl>

        {/* Objective Clinical Ruler & Sign Checklist */}
        <div className="skin-test-reading-section">
          <div className="skin-test-reading-title">
            <h3>客观指标测定（客观标尺辅助）</h3>
            <span className="skin-test-guide-tag">皮丘隆起明显、有伪足或风团≥10mm为阳性指征</span>
          </div>

          <div className="skin-test-ruler-grid">
            <FormField label="风团直径（皮丘硬结）">
              <div className="skin-test-ruler-input-group">
                <UnitNumberInput
                  value={wheal}
                  unit="mm"
                  unitReadOnly
                  min="0"
                  step="0.1"
                  placeholder="测定值"
                  onValueChange={(val) => setWheal(val)}
                />
                <div className="skin-test-ruler-steps">
                  {WHEAL_STEPS.map((step) => (
                    <button
                      type="button"
                      key={step}
                      className={Number(wheal) === step ? 'is-active' : ''}
                      onClick={() => setWheal(String(step))}
                    >
                      {step}
                    </button>
                  ))}
                </div>
              </div>
            </FormField>

            <FormField label="红晕直径">
              <div className="skin-test-ruler-input-group">
                <UnitNumberInput
                  value={flare}
                  unit="mm"
                  unitReadOnly
                  min="0"
                  step="0.1"
                  placeholder="测定值"
                  onValueChange={(val) => setFlare(val)}
                />
                <div className="skin-test-ruler-steps">
                  {FLARE_STEPS.map((step) => (
                    <button
                      type="button"
                      key={step}
                      className={Number(flare) === step ? 'is-active' : ''}
                      onClick={() => setFlare(String(step))}
                    >
                      {step}
                    </button>
                  ))}
                </div>
              </div>
            </FormField>
          </div>

          {/* Clinical Signs Checkbox Chips */}
          <div className="skin-test-signs-box">
            <span className="skin-test-signs-label">局部与全身临床体征辅助勾选：</span>
            <div className="skin-test-signs-chips">
              {CLINICAL_SIGNS.map((sign) => {
                const checked = selectedSigns.includes(sign)
                return (
                  <button
                    type="button"
                    key={sign}
                    className={`skin-test-sign-btn ${checked ? 'is-checked' : ''}`}
                    onClick={() => toggleSign(sign)}
                  >
                    {checked ? '✓ ' : '+ '}
                    {sign}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Objective suggestion warning */}
          {objectiveSuggestsPositive && result !== 'POSITIVE' && (
            <div className="skin-test-smart-hint">
              💡 <strong>临床指征提示：</strong>检测到风团直径 ≥10mm 或存在伪足（假足），符合皮试阳性判定指征，建议判定为“阳性”。
            </div>
          )}

          {/* Result Selection Segment */}
          <div className="skin-test-result-picker">
            <span className="skin-test-result-picker-label">最终判读结论：</span>
            <div className="skin-test-result-options">
              {([
                ['NEGATIVE', '阴性 (-) 放行'],
                ['POSITIVE', '阳性 (+) 阻断'],
                ['UNCERTAIN', '可疑 (±) 对照'],
                ['INVALID', '无效 重试'],
              ] as [SkinTestResult, string][]).map(([value, label]) => (
                <label key={value} className={`skin-test-res-opt is-${value.toLowerCase()} ${result === value ? 'is-active' : ''}`}>
                  <input
                    type="radio"
                    name="skin-test-result"
                    value={value}
                    checked={result === value}
                    onChange={() => setResult(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Dual Verification Nurse Section */}
          <div className="skin-test-dual-verification-card">
            <div className="skin-test-verification-header">
              <div>
                <strong>双人复核（Double Check 核心制度）</strong>
                <small>高危药品皮试结果必须由第二名护士现场核验皮丘并联署签名</small>
              </div>
              <span className="skin-test-verification-seal">三甲质控</span>
            </div>

            <FormField label="复核护士（双人复核）" required>
              <Select
                value={verifierPractitionerId}
                options={verifierOptions}
                placeholder="检索并选择同科室现场复核护士"
                searchable
                clearable
                onChange={(val) => setVerifierPractitionerId(val || '')}
              />
            </FormField>
          </div>

          {/* Reaction and Clinical Description */}
          <FormField
            label={result === 'POSITIVE' ? '严重反应表现与处置记录' : '判读说明与局部体征备注'}
            required={result === 'POSITIVE'}
          >
            <textarea
              rows={2}
              value={reaction}
              maxLength={1000}
              placeholder={result === 'POSITIVE' ? '记录局部皮丘表现、全身伴随症状及抢救处置措施' : '可录入局部皮丘表现与复核说明'}
              onChange={(event) => setReaction(event.target.value)}
            />
          </FormField>

          {negativeBeforeObservationEnds && (
            <Alert tone="warning">
              ⚠️ 阴性结果必须观察满规定时长（{item.observationMinutes} 分钟）后才能判读，以防假阴性！
            </Alert>
          )}

          {remainingMinutes > 0 && result !== 'NEGATIVE' && (
            <FormField label="提前判读原因" required>
              <input
                value={earlyReadReason}
                maxLength={1000}
                placeholder="如突发急性反应、全身红斑荨麻疹或休克表现"
                onChange={(event) => setEarlyReadReason(event.target.value)}
              />
            </FormField>
          )}

          {/* Action Row */}
          <div className="skin-test-action-row">
            <Button
              variant="text"
              onClick={() => setCancelOpen((value) => !value)}
            >
              {cancelOpen ? '收起取消' : '取消本次皮试…'}
            </Button>
            <Button
              size="lg"
              variant={result === 'POSITIVE' ? 'danger' : 'primary'}
              busy={complete.isPending}
              disabled={
                (result === 'POSITIVE' && !reaction.trim())
                || negativeBeforeObservationEnds
                || !verifierPractitionerId
                || (remainingMinutes > 0 && result !== 'NEGATIVE' && !earlyReadReason.trim())
              }
              onClick={() => complete.mutate()}
            >
              {negativeBeforeObservationEnds ? '等待观察期结束' : '确认判读并签名'}
            </Button>
          </div>

          {cancelOpen && (
            <div className="skin-test-cancel-row">
              <input
                value={cancelReason}
                maxLength={1000}
                placeholder="填写取消原因（如患者拒绝、提前离院等）"
                onChange={(event) => setCancelReason(event.target.value)}
              />
              <Button
                size="sm"
                variant="danger"
                busy={cancel.isPending}
                disabled={!cancelReason.trim()}
                onClick={() => cancel.mutate()}
              >
                确认取消本次皮试
              </Button>
            </div>
          )}
        </div>
      </section>
    )}

    {/* Section D: Completed and Archived */}
    {['NEGATIVE', 'POSITIVE'].includes(item.status) && (
      <section className={`skin-test-result-summary is-${item.status.toLowerCase()}`}>
        <header>
          <div className="skin-test-archive-title">
            <span className="skin-test-archive-badge">
              {item.status === 'NEGATIVE' ? '安全阴性' : '高危阳性'}
            </span>
            <h3>皮试最终结论：【{statusLabel[item.status]}】</h3>
          </div>
          <StatusBadge tone={statusTone(item.status)}>{formatTime(item.completedAt!)}</StatusBadge>
        </header>

        <dl className="skin-test-facts">
          <div><dt>皮试方式</dt><dd>{testMethodLabel(item.testMethod)}</dd></div>
          <div><dt>部位</dt><dd>{item.bodySite || '未记录'}</dd></div>
          <div><dt>风团直径</dt><dd>{item.whealDiameterMm === undefined ? '未记录' : `${item.whealDiameterMm} mm`}</dd></div>
          <div><dt>红晕直径</dt><dd>{item.flareDiameterMm === undefined ? '未记录' : `${item.flareDiameterMm} mm`}</dd></div>
          <div><dt>执行护士</dt><dd>{item.readByPractitionerId ? `工号 ${item.readByPractitionerId}` : (item.performedByPractitionerId ? `工号 ${item.performedByPractitionerId}` : '执行护士')}</dd></div>
          <div><dt>复核护士</dt><dd>{item.verifiedByName ? `${item.verifiedByName}${item.verifiedByPractitionerId ? ` (${item.verifiedByPractitionerId})` : ''}` : '已双人复核'}{item.verifiedAt ? ` · ${formatTime(item.verifiedAt)}` : ''}</dd></div>
        </dl>

        {item.reactionDescription && (
          <div className="skin-test-reaction-box">
            <strong>反应与处置记录：</strong>
            <p>{item.reactionDescription}</p>
          </div>
        )}

        {item.status === 'POSITIVE' ? (
          <Alert tone="error">
            🚨 <strong>已执行用药安全拦截：</strong>禁止当前药品及同类交联抗生素执行，且已将该药物过敏信息同步记入患者过敏史档案中！
          </Alert>
        ) : (
          <Alert tone="success">
            ✓ <strong>用药门禁已放行：</strong>阴性皮试结果已关联到处方医嘱，门诊药房与注射输液室已允许正常执行。
          </Alert>
        )}
      </section>
    )}
  </>
}

type SidecarTab = 'safety' | 'history'

function SkinTestPatientSafetySidecar({
  item, api, allItems,
}: {
  item: SkinTestWorkItem; api: RhnApi; allItems: SkinTestWorkItem[]
}) {
  const [activeTab, setActiveTab] = useState<SidecarTab>('safety')

  // Query resident's existing allergies
  const allergies = useQuery({
    queryKey: ['resident-allergies', item.residentId],
    queryFn: () => api.residents.allergies(item.residentId, true),
    staleTime: 60_000,
  })

  const historyItems = useMemo(() => {
    return allItems
      .filter((i) => i.residentId === item.residentId && i.medicationRequestId !== item.medicationRequestId)
  }, [allItems, item.medicationRequestId, item.residentId])

  const allergyList = allergies.data ?? []
  const hasKnownAllergies = allergyList.some((a) => a.assertionType === 'ALLERGY' && a.clinicalStatus === 'ACTIVE')

  return (
    <div className="skin-test-sidecar-container">
      {/* Sidecar Tab Switcher */}
      <div className="skin-test-sidecar-tabs" role="tablist" aria-label="质控侧栏视图切换">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'safety'}
          className={`skin-test-sidecar-tab-btn ${activeTab === 'safety' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('safety')}
        >
          <span>用药安全与急救</span>
          {hasKnownAllergies && <span className="skin-test-tab-alert-dot" title="存在确诊药物过敏" />}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          className={`skin-test-sidecar-tab-btn ${activeTab === 'history' ? 'is-active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <span>历史皮试与处方</span>
          {historyItems.length > 0 && <span className="skin-test-tab-count-badge">{historyItems.length}</span>}
        </button>
      </div>

      <div className="skin-test-sidecar-content">
        {activeTab === 'safety' ? (
          <>
            {/* Block 1: Allergy Profile */}
            <section className="skin-test-sidecar-card">
              <header className="skin-test-sidecar-head">
                <h4>既往药物过敏档案</h4>
                <span className={`skin-test-sidecar-tag ${hasKnownAllergies ? 'is-danger' : 'is-success'}`}>
                  {hasKnownAllergies ? '存在过敏史' : '未见药物过敏'}
                </span>
              </header>

              {allergies.isPending && <LoadingState label="加载过敏史…" />}
              {!allergies.isPending && allergyList.length === 0 && (
                <p className="skin-test-sidecar-empty-text">患者电子健康档案中暂无过敏登记。</p>
              )}

              {allergyList.length > 0 && (
                <ul className="skin-test-sidecar-allergy-list">
                  {allergyList.map((a) => (
                    <li key={a.id} className={a.assertionType === 'ALLERGY' ? 'is-allergy-item' : 'is-clear-item'}>
                      <strong>{a.substanceDisplay || (a.assertionType === 'ALLERGY' ? '特定药物过敏' : '无已知过敏')}</strong>
                      <small>{a.reactionText || (a.reactionSeverity ? `程度: ${a.reactionSeverity}` : '已确证')}</small>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Block 2: Medication Knowledge & Emergency Prep */}
            <section className="skin-test-sidecar-card">
              <header className="skin-test-sidecar-head">
                <h4>皮试规程与急救备药</h4>
                <span className="skin-test-sidecar-tag">临床质控</span>
              </header>
              <div className="skin-test-spec-content">
                <div className="skin-test-spec-row">
                  <span>标准浓度</span>
                  <strong>{item.configurationInstructions || '按药品规程稀释'}</strong>
                </div>
                <div className="skin-test-spec-row">
                  <span>留观规范</span>
                  <strong>严密观察 {item.configuredObservationMinutes ?? 20} 分钟</strong>
                </div>
                <div className="skin-test-spec-row">
                  <span>阴性有效期</span>
                  <strong>{item.resultValidityHours ?? 24} 小时有效</strong>
                </div>
                <div className="skin-test-spec-emergency-hint">
                  <strong>⚠️ 抢救应急备药要求：</strong>
                  <p>观察室必须备齐 1:1000 盐酸肾上腺素注射液、吸氧面罩及地塞米松，随时应对突发过敏性休克。</p>
                </div>
              </div>
            </section>
          </>
        ) : (
          <>
            {/* Block 3: Linked Prescription Info */}
            <section className="skin-test-sidecar-card">
              <header className="skin-test-sidecar-head">
                <h4>本次处方关联</h4>
                <small>{item.requestNo}</small>
              </header>
              <div className="skin-test-spec-content">
                <div className="skin-test-spec-row">
                  <span>药品规格</span>
                  <strong>{item.itemName || item.medicationName}</strong>
                </div>
                <div className="skin-test-spec-row">
                  <span>给药途径</span>
                  <strong>{item.routeCode || '静脉注射/滴注'}</strong>
                </div>
                <div className="skin-test-spec-row">
                  <span>医嘱开立号</span>
                  <strong>{item.medicationRequestId}</strong>
                </div>
              </div>
            </section>

            {/* Block 4: Historical Skin Tests */}
            <section className="skin-test-sidecar-card">
              <header className="skin-test-sidecar-head">
                <h4>本患者历史皮试记录</h4>
                <span className="skin-test-sidecar-tag">{historyItems.length} 次</span>
              </header>

              {historyItems.length === 0 ? (
                <p className="skin-test-sidecar-empty-text">本次为患者首个皮试记录。</p>
              ) : (
                <ul className="skin-test-sidecar-history-list">
                  {historyItems.map((hist) => (
                    <li key={hist.medicationRequestId}>
                      <div className="skin-test-hist-top">
                        <strong>{hist.medicationName}</strong>
                        <StatusBadge tone={statusTone(hist.status)}>{statusLabel[hist.status]}</StatusBadge>
                      </div>
                      <div className="skin-test-hist-meta">
                        <small>{hist.completedAt ? formatTime(hist.completedAt) : (hist.startedAt ? formatTime(hist.startedAt) : '未开始')}</small>
                        <small>第 {hist.attemptNo ?? 1} 次</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function testMethodLabel(value?: SkinTestWorkItem['testMethod']) {
  if (value === 'PRICK') return '点刺试验'
  if (value === 'OTHER') return '其他'
  return '皮内试验'
}

function solutionModeLabel(value?: SkinTestWorkItem['configuredSolutionMode']) {
  return value === 'ORIGINAL_SOLUTION' ? '原液' : '非原液（配制试液）'
}
