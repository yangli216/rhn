import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import type { ClinicalContext } from '../../app/AppShell'
import type { RegistrationBillingIntent } from '../../shared/api/billingApi'
import { systemEnumItemName, systemEnumItems } from '../../shared/api/dictionaryApi'
import { SCHEDULING_SYSTEM_ENUM, type ReceptionQueueItem, type ServiceSchedule } from '../../shared/api/schedulingApi'
import { age, genderLabel } from '../../shared/format'
import type { Encounter, Resident } from '../../shared/model'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { SettlementPaymentPanel, type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import {
  Alert, Button, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, PanelHead, Select, StatusBadge,
} from '../../shared/ui'

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

function clock(value: string) {
  return new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
    .format(new Date(value))
}

function queueTone(status: ReceptionQueueItem['status']) {
  if (status === 'WAITING') return 'warning' as const
  if (status === 'IN_SERVICE') return 'info' as const
  if (status === 'COMPLETED') return 'success' as const
  return 'neutral' as const
}

function availableSchedules(schedules: ServiceSchedule[]) {
  return schedules.filter((item) => item.sdStatus === 'PUBLISHED' && item.availableCount > 0)
}

interface RegistrationSuccess {
  encounter: Encounter
  receipt?: ReceptionQueueItem
}

export function OutpatientRegistrationWorkspace({ api, clinicalContext, onNavigate }: {
  api: RhnApi
  clinicalContext: ClinicalContext
  onNavigate: (path: string) => void
}) {
  const [searchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const today = useMemo(businessDate, [])
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [selected, setSelected] = useState<Resident | null>(null)
  const [scheduleId, setScheduleId] = useState('')
  const [visitType, setVisitType] = useState<'GENERAL' | 'FOLLOW_UP' | 'EMERGENCY'>('GENERAL')
  const [success, setSuccess] = useState<RegistrationSuccess | null>(null)
  const [intentId, setIntentId] = useState('')
  const linkedResidentId = searchParams.get('residentId')

  const linkedResident = useQuery({
    queryKey: ['registration-resident-deep-link', linkedResidentId],
    queryFn: () => api.residents.get(linkedResidentId!),
    enabled: Boolean(linkedResidentId),
  })
  const residents = useQuery({
    queryKey: ['registration-resident-search', submittedQuery],
    queryFn: () => api.residents.search(submittedQuery),
    enabled: submittedQuery.length >= 2,
  })
  const schedules = useQuery({
    queryKey: ['registration-schedules', clinicalContext.department.id, today],
    queryFn: () => api.scheduling.schedules(today, today),
  })
  const registrations = useQuery({
    queryKey: ['outpatient-registrations', clinicalContext.department.id, today],
    queryFn: () => api.scheduling.receptionQueue(today),
  })
  const visitTypes = useQuery({
    queryKey: ['system-enum', SCHEDULING_SYSTEM_ENUM.visitType],
    queryFn: () => api.dictionaries.systemEnum(SCHEDULING_SYSTEM_ENUM.visitType),
  })
  const receptionStatuses = useQuery({
    queryKey: ['system-enum', SCHEDULING_SYSTEM_ENUM.receptionStatus],
    queryFn: () => api.dictionaries.systemEnum(SCHEDULING_SYSTEM_ENUM.receptionStatus),
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
  const paymentOrders = useQuery({
    queryKey: ['registration-payment-orders', intent.data?.patientAccountId],
    queryFn: () => api.billing.paymentOrders(intent.data!.patientAccountId!),
    enabled: Boolean(intent.data?.patientAccountId),
    refetchInterval: (query) => (query.state.data ?? []).some((value) =>
      ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)) ? 2500 : false,
  })

  const available = useMemo(() => availableSchedules(schedules.data ?? []), [schedules.data])
  const canUseDirect = available.length === 0 || visitType === 'EMERGENCY'
  const selectedSchedule = available.find((item) => item.id === scheduleId)
  const registrationItems = registrations.data ?? []
  const visitTypeOptions = systemEnumItems(visitTypes.data ? [visitTypes.data] : undefined,
    SCHEDULING_SYSTEM_ENUM.visitType).map((item) => ({ value: item.code, label: item.name }))
  const visitTypeText = (value: ReceptionQueueItem['visitType']) => systemEnumItemName(
    visitTypes.data ? [visitTypes.data] : undefined, SCHEDULING_SYSTEM_ENUM.visitType, value)

  useEffect(() => {
    if (linkedResident.data) setSelected(linkedResident.data)
  }, [linkedResident.data])

  useEffect(() => {
    if (scheduleId && ((scheduleId === 'DIRECT' && canUseDirect)
      || available.some((item) => item.id === scheduleId))) return
    setScheduleId(available[0]?.id ?? 'DIRECT')
  }, [available, canUseDirect, scheduleId])

  useEffect(() => {
    setScheduleId('')
    setSelected(null)
    setSuccess(null)
    setIntentId('')
  }, [clinicalContext.department.id])

  const createIntent = useMutation({
    mutationFn: () => api.billing.createRegistrationIntent({
      residentId: selected!.id,
      scheduleId: scheduleId === 'DIRECT' ? undefined : scheduleId,
      organizationId: clinicalContext.organization.id,
      departmentId: clinicalContext.department.id,
      idempotencyCode: `REG-INTENT-${crypto.randomUUID()}`,
      registrationSource: scheduleId === 'DIRECT' ? (visitType === 'EMERGENCY' ? 'EMERGENCY' : 'DIRECT') : 'WINDOW',
      visitType,
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
    const [refreshed, encounters] = await Promise.all([
      registrations.refetch(), api.encounters.byResident(value.residentId),
    ])
    const encounter = encounters.find((item) => item.id === value.encounterId)
    if (!encounter) return
    setSuccess({ encounter, receipt: refreshed.data?.find((item) => item.encounterId === encounter.id) })
    setIntentId('')
    setSelected(null)
    setQuery('')
    setSubmittedQuery('')
    setVisitType('GENERAL')
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] }),
      queryClient.invalidateQueries({ queryKey: ['portal-summary'] }),
      queryClient.invalidateQueries({ queryKey: ['registration-schedules'] }),
    ])
  }, [api.encounters, queryClient, registrations])

  useEffect(() => {
    if (intent.data?.status === 'COMPLETED' && intent.data.encounterId) void finishRegistration(intent.data)
  }, [finishRegistration, intent.data])

  function search(event: FormEvent) {
    event.preventDefault()
    const normalized = query.trim()
    if (normalized.length >= 2) {
      setSubmittedQuery(normalized)
      setSuccess(null)
    }
  }

  const scheduleOptions = [
    ...available.map((item) => ({
      value: item.id,
      label: `${item.sdDayPartText} · ${item.practitionerName} · ${item.serviceName}（余 ${item.availableCount}）`,
    })),
    ...(canUseDirect ? [{ value: 'DIRECT', label: '临时接诊（不占用排班号源）' }] : []),
  ]
  const remainingSlots = available.reduce((total, item) => total + item.availableCount, 0)
  const waiting = registrationItems.filter((item) => item.status === 'WAITING').length
  const inService = registrationItems.filter((item) => item.status === 'IN_SERVICE').length
  const completed = registrationItems.filter((item) => item.status === 'COMPLETED').length
  const pageError = linkedResident.error || residents.error || schedules.error || registrations.error
    || visitTypes.error || receptionStatuses.error || paymentMethods.error || intent.error || paymentOrders.error
    || createIntent.error || createPaymentOrder.error || retryCompletion.error || cancelIntent.error
  const currentIntent = intent.data
  const settlementOptions = currentIntent?.settlementId ? [{ id: currentIntent.settlementId,
    code: currentIntent.itemName ? `${currentIntent.itemName}挂号结算` : '挂号费结算',
    outstandingAmount: currentIntent.feeAmount, currencyCode: currentIntent.currencyCode }] : []

  return <>
    <PageHeader eyebrow="门诊医疗 · 窗口业务" title="门诊挂号"
      description="检索居民、选择今日排班并确认挂号；成功后自动生成候诊号并进入接诊队列。"
      actions={<><Button variant="secondary" onClick={() => onNavigate('/outpatient/scheduling')}>排班与号源</Button>
        <Button variant="secondary" onClick={() => void Promise.all([schedules.refetch(), registrations.refetch()])}>
          <Icon name="refresh" />刷新</Button></>} />

    {pageError && <Alert className="ui-page-feedback">{errorMessage(pageError)}</Alert>}
    {success && <Alert className="ui-page-feedback" tone="success">
      挂号成功：{success.receipt ? `挂号单 ${success.receipt.registrationNo}，候诊号 ${success.receipt.ticketNo}`
        : `就诊号 ${success.encounter.encounterNo}`}
    </Alert>}

    <section className="registration-metrics" aria-label="今日挂号摘要">
      <div><span>今日挂号</span><strong>{registrationItems.length}</strong><small>{today}</small></div>
      <div><span>候诊中</span><strong>{waiting}</strong><small>等待医生接诊</small></div>
      <div><span>接诊中 / 已诊毕</span><strong>{inService} / {completed}</strong><small>当前科室</small></div>
      <div><span>可用号源</span><strong>{remainingSlots}</strong><small>{available.length} 个可挂班次</small></div>
    </section>

    <section className="registration-workspace">
      <Panel className="registration-resident-panel">
        <PanelHead title="选择居民" meta={selected ? '已选择' : '先检索'} />
        <form className="registration-search" onSubmit={search}>
          <Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)}
            placeholder="姓名、身份证或卡号" aria-label="检索挂号居民" />
          <Button type="submit" size="sm" busy={residents.isFetching}>查询</Button>
        </form>
        {query.trim().length > 0 && query.trim().length < 2 && <Alert>至少输入 2 个字符</Alert>}
        {linkedResidentId && linkedResident.isPending && <LoadingState label="正在加载居民…" />}
        {residents.isFetching ? <LoadingState label="正在检索居民…" /> : !residents.data?.length
          ? <EmptyState icon="residents" title="查找居民" copy="通过姓名、证件或卡号定位居民后办理挂号。" />
          : <div className="registration-resident-list">{residents.data.map((resident) => <button type="button"
            key={resident.id} className={selected?.id === resident.id ? 'is-selected' : ''}
            disabled={Boolean(intentId)} onClick={() => { setSelected(resident); setSuccess(null) }}>
            <span className={`resident-avatar ${resident.gender.toLowerCase()}`}>{resident.fullName.slice(-1)}</span>
            <span><strong>{resident.fullName}</strong><small>{genderLabel(resident.gender)} · {age(resident.birthDate)} 岁</small>
              <small>{resident.maskedNationalId || resident.healthRecordNo}</small></span><Icon name="chevron-right" />
          </button>)}</div>}
      </Panel>

      <Panel className="registration-order-panel">
        <PanelHead title="挂号信息" meta={`${clinicalContext.organization.name} · ${clinicalContext.department.name}`} />
        {!selected ? <EmptyState icon="clinical" title="请选择居民" copy="选择左侧居民后即可确认就诊类型和今日排班。" /> : <>
          <div className="registration-resident-summary">
            <span className={`resident-avatar ${selected.gender.toLowerCase()}`}>{selected.fullName.slice(-1)}</span>
            <div><strong>{selected.fullName}</strong><p>{genderLabel(selected.gender)} · {age(selected.birthDate)} 岁 · {selected.maskedNationalId || '无身份证标识'}</p></div>
            <div><span>健康档案号</span><strong>{selected.healthRecordNo}</strong></div>
          </div>
          <div className="registration-order-form">
            <FormField label="就诊类型" required><Select value={visitType} options={visitTypeOptions}
              onChange={(value) => setVisitType(value as typeof visitType)} /></FormField>
            <FormField label="今日排班" required><Select value={scheduleId} options={scheduleOptions}
              onChange={setScheduleId} showValue /></FormField>
          </div>
          {schedules.isPending ? <LoadingState label="正在加载今日排班…" /> : selectedSchedule
            ? <div className="registration-schedule-summary"><div><span>{selectedSchedule.sdDayPartText}</span>
              <strong>{clock(selectedSchedule.startAt)}–{clock(selectedSchedule.endAt)}</strong></div>
              <div><span>出诊医生</span><strong>{selectedSchedule.practitionerName}</strong></div>
              <div><span>门诊服务</span><strong>{selectedSchedule.serviceName}</strong></div>
              <div><span>剩余号源</span><strong>{selectedSchedule.availableCount} / {selectedSchedule.totalCount}</strong></div></div>
            : <Alert tone="info">当前使用临时接诊，不占用排班号源。仅在当天没有适用排班时使用。</Alert>}
          {!currentIntent && <footer className="registration-order-actions"><span>确认后将先锁定号源并核算挂号费；支付成功后进入候诊队列。</span>
            <Button busy={createIntent.isPending} busyLabel="正在核价并锁号" disabled={!scheduleId}
              onClick={() => createIntent.mutate()}><Icon name="add" />确认挂号</Button></footer>}
          {intent.isPending && <LoadingState label="正在加载挂号结算信息…" />}
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
                onSubmit={(command) => createPaymentOrder.mutateAsync(command)} />}
          </div>}
        </>}
      </Panel>
    </section>

    <Panel className="registration-today-panel">
      <PanelHead title="今日挂号记录" meta={`${registrationItems.length} 人`} />
      {registrations.isPending ? <LoadingState label="正在加载今日挂号…" /> : registrationItems.length === 0
        ? <EmptyState icon="clinical" title="今日暂无挂号" copy="完成第一笔挂号后将在这里显示候诊顺序。" />
        : <div className="registration-today-list">
          <div className="registration-today-list__head"><span>候诊号</span><span>居民</span><span>门诊服务</span>
            <span>挂号信息</span><span>状态</span><span /></div>
          {registrationItems.map((item) => {
            return <article key={item.registrationId}>
              <strong className="registration-ticket">{item.ticketNo}</strong>
              <div><strong>{item.residentName}</strong><small>{genderLabel(item.gender)} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small></div>
              <div><strong>{item.practitionerName || '临时接诊'}</strong><small>{item.serviceName || visitTypeText(item.visitType)}{item.locationName ? ` · ${item.locationName}` : ''}</small></div>
              <div><strong>{item.registrationNo}</strong><small>{clock(item.registeredAt)} · {visitTypeText(item.visitType)}</small></div>
              <StatusBadge tone={queueTone(item.status)}>{systemEnumItemName(
                receptionStatuses.data ? [receptionStatuses.data] : undefined,
                SCHEDULING_SYSTEM_ENUM.receptionStatus, item.status)}</StatusBadge>
              <Button size="sm" variant="text" onClick={() => onNavigate(`/outpatient/reception?residentId=${item.residentId}`)}>去接诊</Button>
            </article>
          })}
        </div>}
    </Panel>
  </>
}
