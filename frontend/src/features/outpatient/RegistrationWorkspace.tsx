import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { RegistrationBillingIntent, Settlement } from '../../shared/api/billingApi'
import { systemEnumItems } from '../../shared/api/dictionaryApi'
import type { ResidentCoverageInput } from '../../shared/api/residentsApi'
import { SCHEDULING_SYSTEM_ENUM, type ReceptionQueueItem, type ServiceSchedule } from '../../shared/api/schedulingApi'
import { age, genderLabel } from '../../shared/format'
import type { Encounter, Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { SettlementPaymentPanel, type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import { Alert, Button, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, PanelHead,
  PatientIdentitySearch, Select } from '../../shared/ui'

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function clock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(value))
}

function availableSchedules(schedules: ServiceSchedule[]) {
  return schedules.filter((item) => item.sdStatus === 'PUBLISHED' && item.availableCount > 0)
}

interface RegistrationSuccess {
  encounter: Encounter
  receipt?: ReceptionQueueItem
}

type ActiveMedicalCoverage = ResidentCoverageInput & { id: string }

export function OutpatientRegistrationWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const today = useMemo(businessDate, [])
  const [selected, setSelected] = useState<Resident | null>(null)
  const [scheduleId, setScheduleId] = useState('')
  const [visitType, setVisitType] = useState<'GENERAL' | 'FOLLOW_UP' | 'EMERGENCY'>('GENERAL')
  const [coverageSelection, setCoverageSelection] = useState('SELF_PAY')
  const [coverageTouched, setCoverageTouched] = useState(false)
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null)
  const [intentId, setIntentId] = useState('')
  const linkedResidentId = searchParams.get('residentId')
  const linkedAppointmentId = searchParams.get('appointmentId')

  const linkedResident = useQuery({
    queryKey: ['registration-resident-deep-link', linkedResidentId],
    queryFn: () => api.residents.get(linkedResidentId!),
    enabled: Boolean(linkedResidentId),
  })
  const linkedAppointment = useQuery({
    queryKey: ['registration-appointment-deep-link', linkedAppointmentId],
    queryFn: () => api.appointments.get(linkedAppointmentId!),
    enabled: Boolean(linkedAppointmentId),
  })
  const residentProfile = useQuery({
    queryKey: ['registration-resident-profile', selected?.id],
    queryFn: () => api.residents.profile(selected!.id),
    enabled: Boolean(selected),
  })
  const schedules = useQuery({
    queryKey: ['registration-schedules', clinicalContext.department.id, today],
    queryFn: () => api.scheduling.schedules(today, today),
  })
  const visitTypes = useQuery({
    queryKey: ['system-enum', SCHEDULING_SYSTEM_ENUM.visitType],
    queryFn: () => api.dictionaries.systemEnum(SCHEDULING_SYSTEM_ENUM.visitType),
  })
  const paymentMethods = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'],
    queryFn: () => api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CASHIER'),
  })
  const intent = useQuery({
    queryKey: ['registration-billing-intent', intentId],
    queryFn: () => api.billing.registrationIntent(intentId), enabled: Boolean(intentId),
    refetchInterval: (query) => ['PAYMENT_PENDING', 'PAID', 'COMPLETING'].includes(
      (query.state.data as RegistrationBillingIntent | undefined)?.status ?? '') ? 2500 : false,
  })
  const intentSettlement = useQuery({
    queryKey: ['registration-settlement', intent.data?.settlementId],
    queryFn: () => api.billing.settlement(intent.data!.settlementId!),
    enabled: Boolean(intent.data?.settlementId),
    refetchInterval: (query) => intent.data?.settlementMode === 'MEDICAL_INSURANCE'
      && query.state.data && !insuranceSettlementReady(query.state.data as Settlement) ? 2500 : false,
  })
  const paymentOrders = useQuery({
    queryKey: ['registration-payment-orders', intent.data?.patientAccountId],
    queryFn: () => api.billing.paymentOrders(intent.data!.patientAccountId!),
    enabled: Boolean(intent.data?.patientAccountId),
    refetchInterval: (query) => (query.state.data ?? []).some((value) =>
      ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)) ? 2500 : false,
  })

  const available = useMemo(() => availableSchedules(schedules.data ?? []), [schedules.data])
  const linkedSchedule = linkedAppointment.data
    ? (schedules.data ?? []).find((item) => item.id === linkedAppointment.data?.scheduleId) : undefined
  const canUseDirect = !linkedAppointmentId && (available.length === 0 || visitType === 'EMERGENCY')
  const selectedSchedule = linkedSchedule ?? available.find((item) => item.id === scheduleId)
  const visitTypeOptions = systemEnumItems(visitTypes.data ? [visitTypes.data] : undefined,
    SCHEDULING_SYSTEM_ENUM.visitType).map((item) => ({ value: item.code, label: item.name }))
  const activeMedicalCoverages = useMemo(() => (residentProfile.data?.coverages ?? [])
    .filter((value) => isActiveMedicalCoverage(value, today)), [residentProfile.data?.coverages, today])
  const coverageOptions = useMemo(() => [
    { value: 'SELF_PAY', label: '自费', secondaryText: '患者个人承担' },
    ...activeMedicalCoverages.map((value) => ({ value: `COVERAGE:${value.id}`,
      label: value.sdCoverageTypeText ?? medicalCoverageLabel(value.sdCoverageType),
      secondaryText: `${value.payerName}${value.primary ? ' · 主要保障' : ''}` })),
  ], [activeMedicalCoverages])
  const selectedCoverage = activeMedicalCoverages.find((value) => `COVERAGE:${value.id}` === coverageSelection)

  useEffect(() => {
    if (linkedResident.data) setSelected(linkedResident.data)
  }, [linkedResident.data])

  useEffect(() => {
    if (linkedAppointment.data) setScheduleId(linkedAppointment.data.scheduleId)
  }, [linkedAppointment.data])

  useEffect(() => {
    setCoverageSelection('SELF_PAY')
    setCoverageTouched(false)
  }, [selected?.id])

  useEffect(() => {
    if (!selected || residentProfile.isPending || coverageTouched) return
    const preferred = activeMedicalCoverages.find((value) => value.primary) ?? activeMedicalCoverages[0]
    setCoverageSelection(preferred?.id ? `COVERAGE:${preferred.id}` : 'SELF_PAY')
  }, [activeMedicalCoverages, coverageTouched, residentProfile.isPending, selected])

  useEffect(() => {
    if (linkedAppointment.data) return
    if (scheduleId && ((scheduleId === 'DIRECT' && canUseDirect)
      || available.some((item) => item.id === scheduleId))) return
    setScheduleId(available[0]?.id ?? 'DIRECT')
  }, [available, canUseDirect, linkedAppointment.data, scheduleId])

  useEffect(() => {
    setSelected(null)
    setSuccess(null)
    setIntentId('')
  }, [clinicalContext.department.id])

  const createIntent = useMutation({
    mutationFn: () => api.billing.createRegistrationIntent({
      residentId: selected!.id,
      appointmentId: linkedAppointmentId || undefined,
      scheduleId: scheduleId === 'DIRECT' ? undefined : scheduleId,
      organizationId: clinicalContext.organization.id,
      departmentId: clinicalContext.department.id,
      idempotencyCode: `REG-INTENT-${crypto.randomUUID()}`,
      registrationSource: scheduleId === 'DIRECT' ? (visitType === 'EMERGENCY' ? 'EMERGENCY' : 'DIRECT') : 'WINDOW',
      visitType,
      settlementMode: selectedCoverage ? 'MEDICAL_INSURANCE' : 'SELF_PAY',
      coverageId: selectedCoverage?.id,
    }),
    onSuccess: async (value) => {
      setIntentId(value.id)
      await queryClient.invalidateQueries({ queryKey: ['registration-schedules'] })
    },
  })

  const createPaymentOrder = useMutation({
    mutationFn: (command: SettlementPaymentCommand) => api.billing.createPaymentOrder(command.settlementId, {
      idempotencyKey: command.idempotencyKey, businessScene: 'REGISTRATION', paymentSceneCode: 'CASHIER',
      paymentMethodCode: command.paymentMethodCode, amount: command.amount,
      correlationId: `REGISTRATION-${intentId}`, terminalCode: 'REGISTRATION-WINDOW-WEB',
      expiresAt: intent.data?.expiresAt,
    }),
    onSuccess: async () => {
      await Promise.all([intent.refetch(), paymentOrders.refetch(),
        queryClient.invalidateQueries({ queryKey: ['registration-schedules'] })])
    },
  })

  const retryCompletion = useMutation({
    mutationFn: () => api.billing.retryRegistrationCompletion(intentId),
    onSuccess: async () => { await intent.refetch() },
  })
  const cancelIntent = useMutation({
    mutationFn: () => api.billing.cancelRegistrationIntent(intentId),
    onSuccess: async () => {
      setIntentId('')
      await queryClient.invalidateQueries({ queryKey: ['registration-schedules'] })
    },
  })
  const finishRegistration = useCallback(async (value: RegistrationBillingIntent) => {
    if (!value.encounterId) return
    const [queue, encounters] = await Promise.all([
      api.scheduling.receptionQueue(today), api.encounters.byResident(value.residentId),
    ])
    const encounter = encounters.find((item) => item.id === value.encounterId)
    if (!encounter) return
    setSuccess({ encounter, receipt: queue.find((item) => item.encounterId === encounter.id) })
    setIntentId('')
    setSelected(null)
    setVisitType('GENERAL')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['portal-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['registration-schedules'] }),
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
      queryClient.invalidateQueries({ queryKey: ['outpatient-registrations'] }),
    ])
  }, [api.encounters, api.scheduling, queryClient, today])

  useEffect(() => {
    if (intent.data?.status === 'COMPLETED' && intent.data.encounterId) void finishRegistration(intent.data)
  }, [finishRegistration, intent.data])

  const displayedSchedules = linkedSchedule ? [linkedSchedule] : available
  const remainingSlots = available.reduce((total, item) => total + item.availableCount, 0)
  const pageError = linkedResident.error || linkedAppointment.error || residentProfile.error || schedules.error
    || visitTypes.error || paymentMethods.error || intent.error || paymentOrders.error
    || intentSettlement.error || createIntent.error || createPaymentOrder.error || retryCompletion.error || cancelIntent.error
  const currentIntent = intent.data
  const currentSettlement = intentSettlement.data
  const settlementOptions = currentIntent?.settlementId ? [{ id: currentIntent.settlementId,
    code: currentIntent.itemName ? `${currentIntent.itemName}挂号结算` : '挂号费结算',
    outstandingAmount: currentSettlement?.outstandingAmount ?? currentIntent.feeAmount,
    currencyCode: currentIntent.currencyCode,
    insuranceReady: currentSettlement ? insuranceSettlementReady(currentSettlement) : false,
    insurancePreparationAllowed: false,
    insuranceAmount: currentSettlement?.insuranceAmount,
    personalAccountAmount: currentSettlement?.tenders.filter((value) => value.tenderType === 'PERSONAL_ACCOUNT')
      .reduce((sum, value) => sum + value.amount, 0),
    otherFundAmount: currentSettlement?.otherAmount }] : []

  return <>
    <PageHeader eyebrow="门诊医疗 · 窗口业务" title="门诊挂号"
      description="检索居民、选择今日排班并确认挂号；成功后自动生成候诊号并进入接诊队列。"
      actions={<><Button variant="secondary" onClick={() => onNavigate('/outpatient/registration-query')}>挂号查询</Button>
        <Button variant="secondary" onClick={() => onNavigate('/outpatient/appointments')}>预约管理</Button>
        <Button variant="secondary" onClick={() => onNavigate('/outpatient/scheduling')}>排班与号源</Button>
        <Button variant="secondary" onClick={() => void schedules.refetch()}>
          <Icon name="refresh" />刷新</Button></>} />

    {pageError && <Alert className="ui-page-feedback">{errorMessage(pageError)}</Alert>}
    {success && <Alert className="ui-page-feedback" tone="success">
      挂号成功：{success.receipt ? `挂号单 ${success.receipt.registrationNo}，候诊号 ${success.receipt.ticketNo}`
        : `就诊号 ${success.encounter.encounterNo}`}
    </Alert>}
    <section className="registration-workspace">
      <Panel className="registration-intake-panel">
        <PanelHead title="挂号办理" meta={`${clinicalContext.organization.name} · ${clinicalContext.department.name}`} />
        <form className="registration-intake-form" onSubmit={(event) => event.preventDefault()}>
          <section className="registration-intake-search">
            <header><strong>患者检索</strong><span>身份证、卡号等唯一标识查询后自动回填</span></header>
            <PatientIdentitySearch className="registration-patient-search" queryKey="outpatient-registration"
              search={api.residents.search} selected={selected} disabled={Boolean(intentId)} compact
              showInitialEmpty={false} showSelectedSummary={false} hideResultsWhenSelected
              onSelect={(resident) => { setSelected(resident); setSuccess(null) }} onClear={() => setSelected(null)}
              emptyCopy="通过姓名、身份证、卡号或外部识别方式定位患者后办理挂号。" />
            {linkedResidentId && linkedResident.isPending && <LoadingState label="正在加载居民…" />}
          </section>

          <div className="registration-intake-fields">
            <header className="registration-form-group-head"><strong>患者基本信息</strong>
              <span className="registration-form-group-actions"><span>{selected ? '已确认' : '待选择'}</span>
                {selected && <Button size="sm" variant="text" disabled={Boolean(intentId)}
                  onClick={() => setSelected(null)}>重新选择</Button>}</span></header>
            {selected ? <>
              <div className="registration-patient-identity">
              <span className={`resident-avatar ${selected.gender.toLowerCase()}`}>{selected.fullName.slice(-1)}</span>
              <div><strong>{selected.fullName}</strong><span>{genderLabel(selected.gender)} · {age(selected.birthDate)} 岁</span></div>
              </div>
              <div className="registration-flat-field"><span>身份证标识</span><strong>{selected.maskedNationalId || '未登记'}</strong></div>
              <div className="registration-flat-field"><span>健康档案号</span><strong>{selected.healthRecordNo}</strong></div>
              <div className="registration-flat-field"><span>联系电话</span><strong>{selected.phone || '未登记'}</strong></div>
            </> : <div className="registration-form-empty"><Icon name="residents" /><span>请先检索并确认患者</span></div>}

            <header className="registration-form-group-head"><strong>挂号信息</strong><span>{today}</span></header>
            <div className="registration-order-fields">
              <div className="registration-selection-field"><FormField label="就诊类型" required>
                <Select value={visitType} options={visitTypeOptions} disabled={Boolean(intentId)}
                  onChange={(value) => setVisitType(value as typeof visitType)} />
              </FormField></div>
              <div className="registration-selection-field"><FormField label="费用类别" required>
                <Select value={coverageSelection} options={coverageOptions} disabled={Boolean(intentId) || residentProfile.isPending}
                  onChange={(value) => { setCoverageSelection(value); setCoverageTouched(true) }} />
              </FormField></div>
              <div className="registration-flat-field"><span>接诊科室</span><strong>{clinicalContext.department.name}</strong></div>
              <div className="registration-flat-field"><span>挂号来源</span>
                <strong>{linkedAppointment.data ? '预约到院' : '窗口挂号'}</strong></div>
              <div className="registration-flat-field"><span>挂号日期</span><strong>{today}</strong></div>
            </div>
          </div>
        </form>
        {linkedAppointment.data && <Alert tone="info">正在办理预约 {linkedAppointment.data.appointmentNo} 到院挂号；该预约已占用号源，不会重复扣号。</Alert>}
      </Panel>

      <Panel className="registration-schedule-panel">
        <PanelHead title="今日号源" meta={`${displayedSchedules.length} 个班次 · 剩余 ${remainingSlots} 个号源`} />
        {schedules.isPending ? <LoadingState label="正在加载今日号源…" /> : <div className="registration-schedule-grid">
          {displayedSchedules.map((item) => <button key={item.id} type="button"
            className={`registration-schedule-card ${scheduleId === item.id ? 'is-selected' : ''}`}
            aria-pressed={scheduleId === item.id} disabled={Boolean(intentId) || Boolean(linkedAppointmentId)}
            onClick={() => setScheduleId(item.id)}>
            <span className="registration-schedule-card__top"><b>{item.sdDayPartText}</b><small>{item.availableCount > 5 ? '号源充足' : '号源紧张'}</small></span>
            <strong>{clock(item.startAt)}–{clock(item.endAt)}</strong>
            <span>{item.practitionerName}</span><span>{item.serviceName}</span>
            <footer><span>剩余 <b>{item.availableCount}</b> / {item.totalCount}</span>
              {scheduleId === item.id && <span><Icon name="check" />已选择</span>}</footer>
          </button>)}
          {canUseDirect && <button type="button" className={`registration-schedule-card is-direct ${scheduleId === 'DIRECT' ? 'is-selected' : ''}`}
            aria-pressed={scheduleId === 'DIRECT'} disabled={Boolean(intentId)} onClick={() => setScheduleId('DIRECT')}>
            <span className="registration-schedule-card__top"><b>临时接诊</b><small>不占号源</small></span>
            <strong>即时办理</strong><span>{clinicalContext.department.name}</span>
            <span>{visitType === 'EMERGENCY' ? '急诊绿色通道' : '当日无适用班次时使用'}</span>
            <footer><span>无需排班号源</span>{scheduleId === 'DIRECT' && <span><Icon name="check" />已选择</span>}</footer>
          </button>}
        </div>}
        {!schedules.isPending && displayedSchedules.length === 0 && !canUseDirect
          && <EmptyState icon="clinical" title="暂无可用号源" copy="请刷新号源，或前往排班管理确认当日出诊安排。" />}
        {!intentId && !currentIntent && <footer className="registration-order-actions"><span>{!selected
          ? '请先确认患者，再选择下方号源。' : selectedSchedule
            ? `已选 ${selectedSchedule.sdDayPartText} ${clock(selectedSchedule.startAt)} · ${selectedSchedule.practitionerName} · ${selectedSchedule.serviceName}`
            : scheduleId === 'DIRECT' ? '已选择临时接诊，不占用排班号源。' : '请选择一个可用号源。'}</span>
          <Button busy={createIntent.isPending} busyLabel="正在核价并锁号" disabled={!selected || !scheduleId}
            onClick={() => createIntent.mutate()}><Icon name="add" />确认挂号</Button></footer>}
        {intentId && intent.isPending && <LoadingState label="正在加载挂号结算信息…" />}
        {currentIntent && currentIntent.status !== 'COMPLETED' && <div className="registration-payment-step">
          <Alert tone={currentIntent.status === 'COMPLETION_FAILED' ? 'error' : 'info'}>
            {currentIntent.status === 'COMPLETION_FAILED'
              ? `费用已处理，但挂号落地失败：${currentIntent.lastErrorMessage ?? '请重试业务完成'}`
              : currentIntent.feeAmount > 0
                ? `号源已暂占，应收挂号费 ${new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currentIntent.currencyCode }).format(currentIntent.feeAmount)}`
                : '该挂号无需收费，正在生成挂号单与候诊号。'}
          </Alert>
          {currentIntent.status === 'COMPLETION_FAILED' && <Button variant="secondary"
            busy={retryCompletion.isPending} onClick={() => retryCompletion.mutate()}>重试完成挂号</Button>}
          {currentIntent.status === 'PAYMENT_PENDING' && !currentIntent.paymentOrderId && <Button variant="text"
            busy={cancelIntent.isPending} onClick={() => cancelIntent.mutate()}>取消本次挂号并释放号源</Button>}
          {currentIntent.feeAmount > 0 && ['PAYMENT_PENDING', 'PAID'].includes(currentIntent.status)
            && <SettlementPaymentPanel settlements={settlementOptions}
              methods={(paymentMethods.data ?? []).map((item) => ({ code: item.code, name: item.name }))}
              orders={paymentOrders.data ?? []} busy={createPaymentOrder.isPending} sceneLabel="挂号费收款"
              settlementModeCode={currentIntent.settlementMode}
              onSubmit={(command) => createPaymentOrder.mutateAsync(command)} />}
        </div>}
      </Panel>
    </section>

  </>
}

function isActiveMedicalCoverage(value: ResidentCoverageInput, today: string): value is ActiveMedicalCoverage {
  if (!value.id || ['SELF_PAY', 'COMMERCIAL', 'OTHER'].includes(value.sdCoverageType)) return false
  return value.validFrom <= today && (!value.validTo || value.validTo >= today)
}

function medicalCoverageLabel(code: string) {
  return ({ EMPLOYEE_BASIC: '职工基本医疗保险', RESIDENT_BASIC: '城乡居民基本医疗保险',
    BASIC: '基本医疗保险' } as Record<string, string>)[code] ?? '医疗保险'
}

function insuranceSettlementReady(settlement: Settlement) {
  const latestInsuranceEvent = [...settlement.events]
    .filter((value) => value.commandCode.startsWith('INSURANCE-'))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0]
  if (latestInsuranceEvent) return latestInsuranceEvent.eventType !== 'REVERSE_COMPLETE'
  return settlement.insuranceAmount > 0 || settlement.tenders.some((value) => Boolean(value.claimResponseId))
}
