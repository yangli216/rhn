import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatTime } from '../../shared/format'
import type {
  InpatientEpisode,
  InpatientOrder,
  InpatientOrderCategory,
  InpatientOrderDraftInput,
  InpatientOrderDurationType,
  InpatientMedicationClosure,
  InpatientOrderTask,
} from '../../shared/api/inpatientApi'
import type { MedicationKnowledge, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { WardDelivery, WardDeliveryLine } from '../../shared/api/pharmacyApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import {
  inpatientOrderCategoryLabel,
  inpatientOrderDurationLabel,
  inpatientOrderStatusPresentation,
  inpatientOrderTaskStatusPresentation,
  wardDeliveryStatusPresentation,
} from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { resolveDispensableProduct } from '../outpatient/PrescriptionListEditor'
import {
  Alert,
  Button,
  ClinicalResourceSearch,
  EmptyState,
  FormField,
  LoadingState,
  Panel,
  Select,
  StatusBadge,
  Tabs,
  type ClinicalResourceOption,
} from '../../shared/ui'
import { WardMedicationReturnPanel } from './WardMedicationReturnPanel'
import './inpatient-orders.css'

export type InpatientOrderWorkbench = 'DOCTOR' | 'NURSE'
export type InpatientNurseArea = 'EXECUTION' | 'MEDICATION'
type TaskFilter = 'PLANNED' | 'ALL'
type BatchExecutionResult = {
  succeeded: string[]
  failed: Array<{ taskId: string; itemName: string; message: string }>
}

export function InpatientOrderWorkspace({ api, episode, fixedWorkbench, nurseArea }: {
  api: RhnApi
  episode: InpatientEpisode
  fixedWorkbench?: InpatientOrderWorkbench
  nurseArea?: InpatientNurseArea
}) {
  const queryClient = useQueryClient()
  const [workbench, setWorkbench] = useState<InpatientOrderWorkbench>(fixedWorkbench ?? 'DOCTOR')
  const readOnly = episode.status !== 'ADMITTED'
  useEffect(() => setWorkbench(fixedWorkbench ?? 'DOCTOR'), [episode.id, fixedWorkbench])
  const ordersQuery = useQuery({
    queryKey: ['inpatient-orders', episode.id],
    queryFn: () => api.inpatient.doctorOrderWorklist(episode.id, 'ALL'),
  })
  const tasksQuery = useQuery({
    queryKey: ['inpatient-order-tasks', episode.id],
    queryFn: () => api.inpatient.nurseOrderWorklist(episode.id, 'ALL'),
  })
  const wardDeliveriesQuery = useQuery({
    queryKey: ['ward-deliveries', episode.encounterId],
    queryFn: () => api.pharmacy.wardDeliveries({ encounterId: episode.encounterId, status: 'ALL' }),
  })
  const allergiesQuery = useQuery({
    queryKey: ['inpatient-allergies', episode.residentId],
    queryFn: () => api.residents.allergies(episode.residentId),
  })
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['inpatient-orders', episode.id] }),
      queryClient.invalidateQueries({ queryKey: ['inpatient-order-tasks', episode.id] }),
      queryClient.invalidateQueries({ queryKey: ['ward-deliveries', episode.encounterId] }),
    ])
  }
  const create = useMutation({ mutationFn: (input: InpatientOrderDraftInput) => api.inpatient.createOrderDraft(input), onSuccess: refresh })
  const sign = useMutation({ mutationFn: ({ order, allergyReviewConfirmed, allergyOverrideReason }: {
    order: InpatientOrder; allergyReviewConfirmed?: boolean; allergyOverrideReason?: string
  }) => api.inpatient.signOrder(order.id, order.revision, `ORDER-SIGN-${crypto.randomUUID()}`,
    allergyReviewConfirmed, allergyOverrideReason), onSuccess: refresh })
  const verify = useMutation({ mutationFn: (value: InpatientOrder) => api.inpatient.verifyOrder(
    value.id, value.revision, `ORDER-VERIFY-${crypto.randomUUID()}`), onSuccess: refresh })
  const plan = useMutation({ mutationFn: ({ order, times }: { order: InpatientOrder; times: string[] }) => api.inpatient.planOrder(
    order.id, order.revision, times, `ORDER-PLAN-${crypto.randomUUID()}`), onSuccess: refresh })
  const stop = useMutation({ mutationFn: ({ order, reason }: { order: InpatientOrder; reason: string }) => api.inpatient.stopOrder(
    order.id, order.revision, reason, `ORDER-STOP-${crypto.randomUUID()}`), onSuccess: refresh })
  const execute = useMutation({ mutationFn: ({ task, note }: { task: InpatientOrderTask; note?: string }) => api.inpatient.executeOrderTask(
    task.id, task.revision, 'COMPLETED', note, `ORDER-TASK-EXECUTE-${crypto.randomUUID()}`), onSuccess: refresh })
  const executeMany = useMutation({
    mutationFn: async ({ tasks: selectedTasks, note }: { tasks: InpatientOrderTask[]; note?: string }) => {
      const result: BatchExecutionResult = { succeeded: [], failed: [] }
      for (const task of selectedTasks) {
        try {
          await api.inpatient.executeOrderTask(task.id, task.revision, 'COMPLETED', note,
            `ORDER-TASK-BATCH-${task.id}-${crypto.randomUUID()}`)
          result.succeeded.push(task.id)
        } catch (error) {
          result.failed.push({ taskId: task.id, itemName: task.itemName, message: errorMessage(error) })
        }
      }
      return result
    },
    onSettled: refresh,
  })
  const skip = useMutation({ mutationFn: ({ task, reason, note }: { task: InpatientOrderTask; reason: string; note?: string }) =>
    api.inpatient.skipOrderTask(task.id, task.revision, reason, note, `ORDER-TASK-SKIP-${crypto.randomUUID()}`), onSuccess: refresh })
  const orders = ordersQuery.data?.orders ?? []
  const tasks = tasksQuery.data?.tasks ?? []
  const wardDeliveries = wardDeliveriesQuery.data ?? []
  const pendingVerification = orders.filter((value) => value.status === 'SIGNED')
  const pendingTasks = tasks.filter((value) => value.status === 'PLANNED')
  const error = ordersQuery.error || tasksQuery.error || wardDeliveriesQuery.error || allergiesQuery.error
    || create.error || sign.error || verify.error || plan.error
    || stop.error || execute.error || skip.error
  const busy = create.isPending || sign.isPending || verify.isPending || plan.isPending || stop.isPending
    || execute.isPending || executeMany.isPending || skip.isPending

  const heading = fixedWorkbench === 'NURSE' && nurseArea === 'EXECUTION' ? '医嘱核对与执行'
    : fixedWorkbench === 'NURSE' && nurseArea === 'MEDICATION' ? '病区药品交接与退回' : '医嘱与执行'
  const eyebrow = fixedWorkbench === 'NURSE' && nurseArea === 'MEDICATION' ? '住院护理 · 病区药品闭环' : '住院诊疗 · 简易闭环'

  return <Panel className="inpatient-orders" aria-labelledby="inpatient-orders-heading">
    <header className="inpatient-orders__head">
      <div><span>{eyebrow}</span><h2 id="inpatient-orders-heading">{heading}</h2>
        <p>{episode.residentName} · {episode.episodeNo} · {episode.bedNo ?? '已离院'}</p></div>
      <div><StatusBadge tone={readOnly ? 'neutral' : 'success'}>{readOnly ? '出院只读' : '在院可操作'}</StatusBadge>
        {!fixedWorkbench && <Tabs value={workbench} onChange={setWorkbench} label="住院医嘱工作面" variant="line"
          className="inpatient-order-workbench-tabs" items={[
            { value: 'DOCTOR', label: '医生医嘱', meta: orders.length },
            { value: 'NURSE', label: '护士执行', meta: pendingVerification.length + pendingTasks.length },
          ]} />}
      </div>
    </header>
    {error && <Alert className="inpatient-orders__alert">{errorMessage(error)}</Alert>}
    {(ordersQuery.isPending || tasksQuery.isPending || wardDeliveriesQuery.isPending) ? <LoadingState label="正在加载住院医嘱…" /> : workbench === 'DOCTOR'
      ? <DoctorOrderWorkbench api={api} episode={episode} orders={orders} readOnly={readOnly} busy={busy}
          deliveries={wardDeliveries} allergies={allergiesQuery.data ?? []}
          allergyLoading={allergiesQuery.isPending} allergyError={allergiesQuery.error}
          onCreate={(input) => create.mutateAsync(input)}
          onSign={(order, allergyReviewConfirmed, allergyOverrideReason) => sign.mutateAsync({
            order, allergyReviewConfirmed, allergyOverrideReason,
          })}
          onPlan={(order, times) => plan.mutateAsync({ order, times })}
          onStop={(order, reason) => stop.mutateAsync({ order, reason })} />
      : <NurseOrderWorkbench api={api} episode={episode} orders={pendingVerification} tasks={tasks}
          deliveries={wardDeliveries} readOnly={readOnly} busy={busy} area={nurseArea ?? 'ALL'}
          onVerify={(order) => verify.mutateAsync(order)}
          onExecute={(task, note) => execute.mutateAsync({ task, note })}
          onExecuteMany={(selectedTasks, note) => executeMany.mutateAsync({ tasks: selectedTasks, note })}
          onSkip={(task, reason, note) => skip.mutateAsync({ task, reason, note })} />}
  </Panel>
}

function DoctorOrderWorkbench({ api, episode, orders, deliveries, allergies, allergyLoading, allergyError,
  readOnly, busy, onCreate, onSign, onPlan, onStop }: {
  api: RhnApi
  episode: InpatientEpisode
  orders: InpatientOrder[]
  deliveries: WardDelivery[]
  allergies: AllergyIntolerance[]
  allergyLoading: boolean
  allergyError: unknown
  readOnly: boolean
  busy: boolean
  onCreate: (input: InpatientOrderDraftInput) => Promise<unknown>
  onSign: (order: InpatientOrder, allergyReviewConfirmed?: boolean,
    allergyOverrideReason?: string) => Promise<unknown>
  onPlan: (order: InpatientOrder, times: string[]) => Promise<unknown>
  onStop: (order: InpatientOrder, reason: string) => Promise<unknown>
}) {
  const [composerOpen, setComposerOpen] = useState(false)
  return <div className="inpatient-doctor-orders" role="tabpanel">
    {!readOnly && <header className="inpatient-order-section-head"><div><strong>患者医嘱</strong><span>草稿签署后由护士核对，再生成确定时点任务</span></div>
      <Button size="sm" onClick={() => setComposerOpen((value) => !value)}>{composerOpen ? '收起开立' : '开立医嘱'}</Button></header>}
    {composerOpen && !readOnly && <OrderComposer api={api} episode={episode} busy={busy} onCreate={async (input) => {
      await onCreate(input); setComposerOpen(false)
    }} />}
    {readOnly && <Alert tone="info" className="inpatient-orders__readonly">患者已出院，医嘱和执行事实仅供查看。</Alert>}
    {orders.length === 0 ? <EmptyState icon="clinical" title="暂无住院医嘱" copy={readOnly ? '本次住院没有医嘱记录。' : '点击“开立医嘱”添加药品、诊疗或护理医嘱。'} /> :
      <div className="inpatient-order-list">{orders.map((order) => <DoctorOrderRow key={order.id} order={order}
        deliveries={deliveries} allergies={allergies} allergyLoading={allergyLoading} allergyError={allergyError}
        readOnly={readOnly} busy={busy} onSign={onSign} onPlan={onPlan} onStop={onStop} />)}</div>}
  </div>
}

export function OrderComposer({ api, episode, busy, onCreate }: {
  api: RhnApi
  episode: InpatientEpisode
  busy?: boolean
  onCreate: (input: InpatientOrderDraftInput) => Promise<unknown>
}) {
  const [category, setCategory] = useState<InpatientOrderCategory>('MEDICATION')
  const [durationType, setDurationType] = useState<InpatientOrderDurationType>('TEMPORARY')
  const [medication, setMedication] = useState<ClinicalResourceOption<MedicationKnowledge>>()
  const [service, setService] = useState<ClinicalResourceOption<ServiceCatalogItem>>()
  const [nursingName, setNursingName] = useState('')
  const [dosage, setDosage] = useState('')
  const [dosageUnit, setDosageUnit] = useState('')
  const [route, setRoute] = useState('')
  const [frequency, setFrequency] = useState('')
  const [instructions, setInstructions] = useState('')
  const [validation, setValidation] = useState('')
  const routes = useQuery({
    queryKey: ['inpatient-medication-routes'],
    queryFn: () => api.masterData.activeMedicationRoutes('INPATIENT'),
    staleTime: 5 * 60 * 1000,
  })
  const routeOptions = (routes.data ?? []).map((value) => ({
    value: value.code, label: value.name, secondaryText: value.code,
    searchKeywords: [value.code, value.name],
  }))
  const changeCategory = (value: InpatientOrderCategory) => {
    setCategory(value); setMedication(undefined); setService(undefined); setNursingName(''); setValidation('')
  }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    let catalogItemId: string | undefined
    let itemCode: string | undefined
    let itemName: string | undefined
    if (category === 'MEDICATION') {
      const knowledge = medication?.raw
      const product = knowledge && resolveDispensableProduct(knowledge, episode.organizationId)
      if (!knowledge || !product) { setValidation('请选择已启用且可开立的药品产品。'); return }
      if (!dosage || Number(dosage) <= 0 || !dosageUnit.trim()) { setValidation('药品医嘱需要填写有效剂量和剂量单位。'); return }
      if (!route) { setValidation('请选择给药途径。'); return }
      catalogItemId = product.product.id; itemCode = knowledge.code; itemName = knowledge.name
    } else if (category === 'SERVICE') {
      if (!service?.raw) { setValidation('请选择诊疗项目。'); return }
      catalogItemId = service.raw.id; itemCode = service.raw.code; itemName = service.raw.name
    } else {
      itemName = nursingName.trim()
      itemCode = 'NURSING'
      if (!itemName) { setValidation('请填写护理医嘱内容。'); return }
    }
    setValidation('')
    try {
      await onCreate({
        episodeId: episode.id, orderCategory: category, durationType, catalogItemId, itemCode, itemName,
        dosageAmount: dosage ? Number(dosage) : undefined, dosageUnit: dosageUnit.trim() || undefined,
        routeCode: route.trim() || undefined, frequencyCode: frequency.trim() || undefined,
        instructions: instructions.trim() || undefined, commandCode: `ORDER-CREATE-${crypto.randomUUID()}`,
      })
    } catch { /* Mutation state renders the server error in the workspace alert. */ }
  }
  return <form className="inpatient-order-composer" onSubmit={submit}>
    {(validation || routes.error) && <Alert>{validation || '给药途径数据加载失败'}</Alert>}
    <div className="inpatient-order-composer__core">
      <FormField label="医嘱类别" required><Select aria-label="医嘱类别" value={category} clearable={false} searchable={false}
        options={[
          { value: 'MEDICATION', label: '药品' },
          { value: 'SERVICE', label: '诊疗' },
          { value: 'NURSING', label: '护理' },
        ]} onChange={(value) => changeCategory(value as InpatientOrderCategory)} /></FormField>
      <FormField label="时效" required><Select aria-label="医嘱时效" value={durationType} clearable={false} searchable={false}
        options={[
          { value: 'TEMPORARY', label: '临时医嘱' },
          { value: 'LONG_TERM', label: '长期医嘱' },
        ]} onChange={(value) => setDurationType(value as InpatientOrderDurationType)} /></FormField>
      <FormField className="is-resource" label={`${inpatientOrderCategoryLabel(category)}内容`} required>{category === 'MEDICATION'
        ? <ClinicalResourceSearch<MedicationKnowledge> api={api} resource="medication" organizationId={episode.organizationId}
          value={medication} onChange={(value) => {
            setMedication(value); const item = value?.raw; setDosage(item?.defaultDose ? String(item.defaultDose) : '')
            setDosageUnit(item?.defaultDoseUnit ?? item?.preparationUnit ?? ''); setRoute(item?.defaultRoute ?? '')
            setFrequency(item?.defaultFrequency ?? ''); setValidation('')
          }} aria-label="搜索住院药品" placeholder="搜索药品" />
        : category === 'SERVICE' ? <ClinicalResourceSearch<ServiceCatalogItem> api={api} resource="service"
          organizationId={episode.organizationId} value={service} onChange={(value) => { setService(value); setValidation('') }}
          aria-label="搜索住院诊疗项目" placeholder="搜索诊疗项目" />
        : <input aria-label="护理医嘱内容" value={nursingName} maxLength={300} placeholder="如：一级护理、卧床休息"
            onChange={(event) => setNursingName(event.target.value)} />}</FormField>
    </div>
    {category === 'MEDICATION' && <div className="inpatient-order-composer__usage">
      <FormField label="剂量" required><input aria-label="住院医嘱剂量" type="number" min="0.01" step="0.01" value={dosage}
        onChange={(event) => setDosage(event.target.value)} /></FormField>
      <FormField label="单位" required><input aria-label="住院医嘱剂量单位" value={dosageUnit} maxLength={64}
        onChange={(event) => setDosageUnit(event.target.value)} /></FormField>
      <FormField label="给药途径" required><Select aria-label="住院医嘱给药途径" value={route}
        onChange={setRoute} showValue loading={routes.isPending} placeholder="请选择给药途径"
        options={routeOptions} /></FormField>
      <FormField label="频次"><input aria-label="住院医嘱频次" value={frequency} maxLength={64} placeholder="如 QD、BID"
        onChange={(event) => setFrequency(event.target.value)} /></FormField>
    </div>}
    <div className="inpatient-order-composer__footer">
      <FormField className="is-instructions" label="执行说明"><input aria-label="住院医嘱执行说明" value={instructions}
        maxLength={2000} placeholder="可选：部位、注意事项或执行要求"
        onChange={(event) => setInstructions(event.target.value)} /></FormField>
      <Button type="submit" size="sm" busy={busy}>保存草稿</Button>
    </div>
  </form>
}

function DoctorOrderRow({ order, deliveries, allergies, allergyLoading, allergyError,
  readOnly, busy, onSign, onPlan, onStop }: {
  order: InpatientOrder
  deliveries: WardDelivery[]
  allergies: AllergyIntolerance[]
  allergyLoading: boolean
  allergyError: unknown
  readOnly: boolean
  busy: boolean
  onSign: (order: InpatientOrder, allergyReviewConfirmed?: boolean,
    allergyOverrideReason?: string) => Promise<unknown>
  onPlan: (order: InpatientOrder, times: string[]) => Promise<unknown>
  onStop: (order: InpatientOrder, reason: string) => Promise<unknown>
}) {
  const [planOpen, setPlanOpen] = useState(false)
  const [plannedAt, setPlannedAt] = useState(defaultPlannedAt())
  const [signOpen, setSignOpen] = useState(false)
  const [allergyReviewed, setAllergyReviewed] = useState(false)
  const [allergyOverrideReason, setAllergyOverrideReason] = useState('')
  const [stopOpen, setStopOpen] = useState(false)
  const [stopReason, setStopReason] = useState('病情变化，停止执行')
  const medicationClosure = medicationClosureForOrder(order, deliveries)
  const drugAllergies = allergies.filter((value) => value.assertionType === 'ALLERGY' && value.categoryCode === 'DRUG')
  const allergyRecorded = drugAllergies.length > 0 || allergies.some((value) =>
    value.assertionType === 'NO_KNOWN_ALLERGY' || value.assertionType === 'NO_KNOWN_DRUG_ALLERGY')
  const matchedAllergies = drugAllergies.filter((value) => value.substanceCode?.toLowerCase() === order.itemCode.toLowerCase())
  const allergyReviewRequired = order.orderCategory === 'MEDICATION' && (!allergyRecorded || drugAllergies.length > 0)
  const orderStatus = inpatientOrderStatusPresentation(order.status)
  return <article className="inpatient-order-row">
    <div className="inpatient-order-row__identity"><span>{inpatientOrderDurationLabel(order.durationType)} · {inpatientOrderCategoryLabel(order.orderCategory)}</span>
      <strong>{order.itemName}</strong><small>{order.orderNo} · {order.itemCode}</small></div>
    <div className="inpatient-order-row__directions"><strong>{orderDirections(order)}</strong>
      <span>{order.instructions || '按医嘱执行'}</span></div>
    <div className="inpatient-order-row__state"><StatusBadge tone={orderStatus.tone}>{orderStatus.label}</StatusBadge>
      <small>{order.tasks.length} 个执行时点</small></div>
    {!readOnly && <div className="inpatient-order-row__actions">
      {order.status === 'DRAFT' && order.orderCategory !== 'MEDICATION' && <Button size="sm"
        onClick={() => void onSign(order).catch(() => undefined)} busy={busy}>签署</Button>}
      {order.status === 'DRAFT' && order.orderCategory === 'MEDICATION' && <Button size="sm"
        onClick={() => setSignOpen((value) => !value)} busy={busy}>{signOpen ? '收起核对' : '核对并签署'}</Button>}
      {order.status === 'SIGNED' && <span>等待护士核对</span>}
      {order.status === 'ACTIVE' && <Button size="sm" variant="secondary" onClick={() => setPlanOpen((value) => !value)}>安排时点</Button>}
      {order.status === 'ACTIVE' && order.durationType === 'LONG_TERM' && <Button size="sm" variant="text"
        onClick={() => setStopOpen((value) => !value)}>停嘱</Button>}
    </div>}
    {signOpen && order.status === 'DRAFT' && order.orderCategory === 'MEDICATION'
      && <form className="inpatient-order-allergy-review" onSubmit={async (event) => {
        event.preventDefault()
        if (allergyReviewRequired && !allergyReviewed) return
        if (matchedAllergies.length > 0 && !allergyOverrideReason.trim()) return
        try {
          await onSign(order, allergyReviewRequired ? true : undefined,
            allergyOverrideReason.trim() || undefined)
          setSignOpen(false)
        } catch { /* surfaced above */ }
      }}>
        <div><strong>药物过敏核对</strong>
          {allergyLoading ? <span>正在读取患者过敏信息…</span>
            : allergyError ? <span className="is-danger">过敏信息读取失败，暂不能签署药品医嘱</span>
              : drugAllergies.length > 0 ? <span>有效药物过敏：{drugAllergies.map((value) =>
                value.substanceDisplay || value.substanceCode || '未命名过敏原').join('、')}</span>
                : allergyRecorded ? <span>已记录无已知药物过敏</span>
                  : <span>患者药物过敏状态尚未确认</span>}</div>
        {allergyReviewRequired && <label className="is-confirm"><input type="checkbox" checked={allergyReviewed}
          onChange={(event) => setAllergyReviewed(event.target.checked)} />我已核对患者药物过敏信息及本次用药</label>}
        {matchedAllergies.length > 0 && <label><span>继续签署理由</span><input value={allergyOverrideReason}
          aria-label={`继续签署理由 ${order.itemName}`} maxLength={800} placeholder="说明临床获益、替代方案评估及监护措施"
          onChange={(event) => setAllergyOverrideReason(event.target.value)} required /></label>}
        <Button type="submit" size="sm" busy={busy} disabled={allergyLoading || Boolean(allergyError)
          || (allergyReviewRequired && !allergyReviewed)
          || (matchedAllergies.length > 0 && !allergyOverrideReason.trim())}>确认签署</Button>
      </form>}
    {planOpen && order.status === 'ACTIVE' && <form className="inpatient-order-inline-action" onSubmit={async (event) => {
      event.preventDefault(); try { await onPlan(order, [new Date(plannedAt).toISOString()]); setPlanOpen(false) } catch { /* surfaced above */ }
    }}><label><span>确定执行时点</span><input aria-label={`确定执行时点 ${order.itemName}`} type="datetime-local" value={plannedAt}
      onChange={(event) => setPlannedAt(event.target.value)} required /></label><Button type="submit" size="sm" busy={busy}>生成任务</Button></form>}
    {stopOpen && order.status === 'ACTIVE' && order.durationType === 'LONG_TERM' && <form className="inpatient-order-inline-action"
      onSubmit={async (event) => { event.preventDefault(); if (!stopReason.trim()) return
        try { await onStop(order, stopReason.trim()); setStopOpen(false) } catch { /* surfaced above */ } }}>
      {medicationClosure && <MedicationClosureSummary order={order} closure={medicationClosure} prospective />}
      <label><span>停嘱原因</span><input aria-label={`停嘱原因 ${order.itemName}`} value={stopReason} maxLength={1000}
        onChange={(event) => setStopReason(event.target.value)} required /></label><Button type="submit" size="sm" variant="danger" busy={busy}>确认停嘱</Button></form>}
    {order.status === 'STOPPED' && medicationClosure
      && <MedicationClosureSummary order={order} closure={medicationClosure} />}
  </article>
}

function MedicationClosureSummary({ order, closure, prospective = false }: {
  order: InpatientOrder
  closure: InpatientMedicationClosure
  prospective?: boolean
}) {
  const presentation = medicationClosurePresentation(closure, prospective)
  const quantitySummary = medicationClosureQuantitySummary(closure)
  return <section className={`inpatient-medication-closure is-${presentation.tone}`} aria-label={`药品去向 ${order.itemName}`}>
    <div><span>药品去向</span><strong>{presentation.title}</strong></div>
    <StatusBadge tone={presentation.tone}>{presentation.badge}</StatusBadge>
    <small>{quantitySummary || presentation.description}</small>
  </section>
}

function medicationClosureForOrder(order: InpatientOrder, deliveries: WardDelivery[]) {
  if (order.orderCategory !== 'MEDICATION') return undefined
  if (order.medicationClosure) return order.medicationClosure

  const fulfillment = order.tasks.find((task) => task.dispenseId)
    ?? order.tasks.find((task) => task.pharmacyFulfillmentRequired)
  const delivery = fulfillment?.dispenseId
    ? deliveries.find((value) => value.lines.some((line) => line.dispenseId === fulfillment.dispenseId)) : undefined
  const consumptions = new Map(order.tasks.flatMap((task) => task.medicationConsumptions)
    .map((value) => [value.id, value] as const))
  const dispensedQuantity = fulfillment?.netDispensedQuantity ?? 0
  const consumedQuantity = [...consumptions.values()].reduce((total, value) => total + value.consumedQuantity, 0)
  const returnableQuantity = Math.max(0, dispensedQuantity - consumedQuantity)
  if (dispensedQuantity <= 0) return {
    status: order.status === 'STOPPED' ? 'CANCELLED' : 'NOT_INTAKE', action: 'AUTO_CANCELLED',
    dispensedQuantity: 0, consumedQuantity: 0, returnedQuantity: 0, returnableQuantity: 0,
    unitCode: fulfillment?.unitCode ?? order.unitCode,
  } satisfies InpatientMedicationClosure
  if (returnableQuantity <= 0) return {
    status: 'STOPPED', action: 'NONE', dispensedQuantity, consumedQuantity, returnedQuantity: 0,
    returnableQuantity: 0, unitCode: fulfillment?.unitCode ?? order.unitCode,
    deliveryId: delivery?.id, deliveryStatus: delivery?.status,
  } satisfies InpatientMedicationClosure
  const action = delivery?.status === 'IN_TRANSIT' || delivery?.status === 'DISCREPANCY' ? 'WAIT_RECEIPT'
    : delivery?.status === 'RECEIVED' || delivery?.status === 'RESOLVED' ? 'WARD_RETURN' : 'PHARMACY_RETURN'
  return {
    status: 'RETURN_REQUIRED', action, dispensedQuantity, consumedQuantity, returnedQuantity: 0,
    returnableQuantity, unitCode: fulfillment?.unitCode ?? order.unitCode,
    deliveryId: delivery?.id, deliveryStatus: delivery?.status,
  } satisfies InpatientMedicationClosure
}

function medicationClosurePresentation(closure: InpatientMedicationClosure, prospective: boolean) {
  const action = closure.action ?? 'NONE'
  if (action === 'AUTO_CANCELLED' || closure.status === 'NOT_INTAKE' || closure.status === 'CANCELLED') return prospective
    ? { title: '未接方，停嘱后自动取消', badge: '自动取消', tone: 'info' as const, description: '没有已发药品，无需病区处置。' }
    : { title: '未接方已自动取消', badge: '已取消', tone: 'neutral' as const, description: '没有已发药品，无需病区处置。' }
  if (action === 'PHARMACY_RETURN') return {
    title: prospective ? '已发未送，停嘱后由药房退回' : '已发未送，待药房退回',
    badge: '药房待退', tone: 'warning' as const, description: '药品仍在药房，不应再送往病区。',
  }
  if (action === 'WAIT_RECEIPT') return {
    title: prospective ? '药品在途，停嘱后待病区签收' : '药品在途，待病区签收',
    badge: '在途待收', tone: 'warning' as const, description: '完成实物交接后再按余量退回。',
  }
  if (action === 'WARD_RETURN') return {
    title: `病区余药 ${formatClosureQuantity(closure.returnableQuantity, closure.unitCode)}，${prospective ? '停嘱后' : ''}待退`,
    badge: '病区待退', tone: 'warning' as const, description: '请由病区与药房完成余药交接。',
  }
  return {
    title: prospective ? '已发药品无剩余，停嘱后完成清算' : '药品已清算',
    badge: '已清算', tone: 'success' as const, description: '没有需要继续处置的药品余量。',
  }
}

function medicationClosureQuantitySummary(closure: InpatientMedicationClosure) {
  if (closure.dispensedQuantity === undefined && closure.returnableQuantity === undefined) return ''
  const unit = closure.unitCode ? ` ${closure.unitCode}` : ''
  const values = [
    closure.dispensedQuantity === undefined ? undefined : `已发 ${formatQuantity(closure.dispensedQuantity)}`,
    closure.consumedQuantity === undefined ? undefined : `已用 ${formatQuantity(closure.consumedQuantity)}`,
    closure.returnedQuantity === undefined ? undefined : `已退 ${formatQuantity(closure.returnedQuantity)}`,
    closure.returnableQuantity === undefined ? undefined : `可退 ${formatQuantity(closure.returnableQuantity)}`,
  ].filter(Boolean)
  return `${values.join(' · ')}${unit}`
}

function formatClosureQuantity(value?: number, unitCode?: string) {
  return `${formatQuantity(value ?? 0)}${unitCode ? ` ${unitCode}` : ''}`
}

function NurseOrderWorkbench({ api, episode, orders, tasks, deliveries, readOnly, busy, area,
  onVerify, onExecute, onExecuteMany, onSkip }: {
  api: RhnApi
  episode: InpatientEpisode
  orders: InpatientOrder[]
  tasks: InpatientOrderTask[]
  deliveries: WardDelivery[]
  readOnly: boolean
  busy: boolean
  area: InpatientNurseArea | 'ALL'
  onVerify: (order: InpatientOrder) => Promise<unknown>
  onExecute: (task: InpatientOrderTask, note?: string) => Promise<unknown>
  onExecuteMany: (tasks: InpatientOrderTask[], note?: string) => Promise<BatchExecutionResult>
  onSkip: (task: InpatientOrderTask, reason: string, note?: string) => Promise<unknown>
}) {
  const [filter, setFilter] = useState<TaskFilter>(readOnly ? 'ALL' : 'PLANNED')
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set())
  const [batchNote, setBatchNote] = useState('')
  const [batchFeedback, setBatchFeedback] = useState('')
  useEffect(() => setFilter(readOnly ? 'ALL' : 'PLANNED'), [readOnly])
  const visibleTasks = useMemo(() => filter === 'ALL' ? tasks : tasks.filter((task) => task.status === 'PLANNED'), [filter, tasks])
  const taskGroups = useMemo(() => groupTasksByScheduledMinute(visibleTasks), [visibleTasks])
  const deliveriesByDispense = useMemo(() => new Map(deliveries.flatMap((delivery) =>
    delivery.lines.map((line) => [line.dispenseId, delivery] as const))), [deliveries])
  const visibleExecutableTasks = visibleTasks.filter((task) => canBatchExecute(task, deliveriesByDispense))
  const allVisibleSelected = visibleExecutableTasks.length > 0
    && visibleExecutableTasks.every((task) => selectedTaskIds.has(task.id))
  useEffect(() => {
    const executableIds = new Set(tasks.filter((task) => canBatchExecute(task, deliveriesByDispense)).map((task) => task.id))
    setSelectedTaskIds((current) => {
      const next = new Set([...current].filter((id) => executableIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [deliveriesByDispense, tasks])
  const runBatch = async () => {
    const selectedTasks = tasks.filter((task) => selectedTaskIds.has(task.id) && canBatchExecute(task, deliveriesByDispense))
    if (selectedTasks.length === 0) return
    const result = await onExecuteMany(selectedTasks, batchNote.trim() || undefined)
    setSelectedTaskIds(new Set(result.failed.map((value) => value.taskId)))
    setBatchFeedback(result.failed.length === 0
      ? `已完成 ${result.succeeded.length} 项执行。`
      : `已完成 ${result.succeeded.length} 项，${result.failed.length} 项未执行：${result.failed.map((value) => `${value.itemName}（${value.message}）`).join('；')}`)
  }
  const showExecution = area === 'EXECUTION' || area === 'ALL'
  const showMedication = area === 'MEDICATION' || area === 'ALL'
  return <div className={`inpatient-nurse-orders ${orders.length === 0 || !showExecution ? 'has-no-verification' : ''}`} role="tabpanel">
    {showMedication && <div className="inpatient-medication-workspace">
      <WardDeliveryReceiptPanel api={api} episode={episode} deliveries={deliveries} readOnly={readOnly} />
      <WardMedicationReturnPanel api={api} episode={episode} readOnly={readOnly} />
    </div>}
    {showExecution && orders.length > 0 && <section className="inpatient-verification-list"><header className="inpatient-order-section-head"><div>
      <strong>待核对医嘱</strong><span>{orders.length} 项签署医嘱</span></div></header>
      {orders.map((order) => <article key={order.id}><div><strong>{order.itemName}</strong><span>{inpatientOrderDurationLabel(order.durationType)} · {orderDirections(order)}</span></div>
        <small>{order.orderNo} · {order.instructions || '按医嘱执行'}</small>
        {!readOnly && <Button size="sm" onClick={() => void onVerify(order).catch(() => undefined)} busy={busy}>核对通过</Button>}</article>)}</section>}
    {showExecution && <section className="inpatient-task-section"><header className="inpatient-order-section-head"><div><strong>执行任务</strong>
      <span>仅按已确定时点执行，无需配置复杂排班</span></div><nav aria-label="执行任务范围">
        <button type="button" className={filter === 'PLANNED' ? 'is-active' : ''} onClick={() => setFilter('PLANNED')}>待执行</button>
        <button type="button" className={filter === 'ALL' ? 'is-active' : ''} onClick={() => setFilter('ALL')}>全部</button></nav></header>
      {!readOnly && visibleTasks.length > 0 && <div className="inpatient-task-batch-bar">
        <label><input type="checkbox" aria-label="选择当前可执行任务" checked={allVisibleSelected}
          disabled={visibleExecutableTasks.length === 0 || busy} onChange={(event) => {
            setBatchFeedback('')
            setSelectedTaskIds((current) => {
              const next = new Set(current)
              visibleExecutableTasks.forEach((task) => event.target.checked ? next.add(task.id) : next.delete(task.id))
              return next
            })
          }} />选择当前可执行 <strong>{visibleExecutableTasks.length}</strong> 项</label>
        <input aria-label="批量执行备注" value={batchNote} maxLength={1000} placeholder="批量执行备注（可选）"
          onChange={(event) => setBatchNote(event.target.value)} />
        <span>已选 {selectedTaskIds.size} 项</span>
        <Button size="sm" disabled={selectedTaskIds.size === 0} busy={busy}
          onClick={() => void runBatch().catch(() => undefined)}>执行所选</Button>
      </div>}
      {batchFeedback && <Alert tone={batchFeedback.includes('未执行') ? 'warning' : 'success'}
        className="inpatient-task-batch-feedback">{batchFeedback}</Alert>}
      {visibleTasks.length === 0 ? <EmptyState icon="clinical" title="当前没有执行任务"
        copy={orders.length ? '核对医嘱后，由医生按确定时点生成任务。' : '已核对医嘱生成任务后会显示在这里。'} /> :
        <div className="inpatient-task-list">{taskGroups.map((group) => <section className="inpatient-task-group" key={group.key}
          aria-label={`${group.label}执行任务`}><header><strong>{group.label}</strong><span>{group.tasks.filter((task) => task.status === 'PLANNED').length} 项待执行 · 共 {group.tasks.length} 项</span></header>
          {group.tasks.map((task) => <NurseTaskRow key={task.id} task={task} delivery={task.dispenseId ? deliveriesByDispense.get(task.dispenseId) : undefined}
            selected={selectedTaskIds.has(task.id)}
            readOnly={readOnly} busy={busy} onSelectedChange={(selected) => {
              setBatchFeedback('')
              setSelectedTaskIds((current) => { const next = new Set(current); selected ? next.add(task.id) : next.delete(task.id); return next })
            }} onExecute={onExecute} onSkip={onSkip} />)}</section>)}</div>}
    </section>}
  </div>
}

function WardDeliveryReceiptPanel({ api, episode, deliveries, readOnly }: {
  api: RhnApi
  episode: InpatientEpisode
  deliveries: WardDelivery[]
  readOnly: boolean
}) {
  const sorted = deliveries.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const active = sorted.filter((value) => !['RECEIVED', 'RESOLVED'].includes(value.status))
  const history = sorted.filter((value) => ['RECEIVED', 'RESOLVED'].includes(value.status))
  const awaitingReceipt = sorted.filter((value) => value.status === 'IN_TRANSIT').length
  const discrepancies = sorted.filter((value) => value.status === 'DISCREPANCY').length
  return <section className="inpatient-ward-deliveries" aria-label="病区药品交接">
    <header className="inpatient-order-section-head"><div><strong>病区药品交接</strong>
      <span>{awaitingReceipt > 0 ? `${awaitingReceipt} 批待签收` : '当前没有待签收批次'}{discrepancies > 0 ? ` · ${discrepancies} 批差异处理中` : ''}</span></div></header>
    {active.length === 0 ? <EmptyState icon="pharmacy" title="当前没有待处理药品交接"
      copy={history.length > 0 ? '已完成批次收纳在下方历史记录中。' : '药房送出批次后会显示在这里。'} />
      : <div className="inpatient-ward-delivery-list">{active.map((delivery) => <WardDeliveryReceiptCard
        key={`${delivery.id}-${delivery.revision}`} api={api} episode={episode} delivery={delivery} readOnly={readOnly} />)}</div>}
    {history.length > 0 && <details className="inpatient-ward-delivery-history"><summary>已完成交接记录（{history.length}）</summary>
      <div className="inpatient-ward-delivery-list">{history.map((delivery) => <WardDeliveryReceiptCard
        key={`${delivery.id}-${delivery.revision}`} api={api} episode={episode} delivery={delivery} readOnly={readOnly} />)}</div>
    </details>}
  </section>
}

function WardDeliveryReceiptCard({ api, episode, delivery, readOnly }: {
  api: RhnApi
  episode: InpatientEpisode
  delivery: WardDelivery
  readOnly: boolean
}) {
  const queryClient = useQueryClient()
  const [differenceOpen, setDifferenceOpen] = useState(false)
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, string>>(() => Object.fromEntries(
    delivery.lines.map((line) => [line.id, String(line.expectedQuantity)]),
  ))
  const [discrepancyCode, setDiscrepancyCode] = useState<'SHORTAGE' | 'DAMAGED' | 'WRONG_ITEM' | 'OTHER'>('SHORTAGE')
  const [note, setNote] = useState('')
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['ward-deliveries', episode.encounterId] }),
      queryClient.invalidateQueries({ queryKey: ['inpatient-order-tasks', episode.id] }),
    ])
  }
  const receive = useMutation({
    mutationFn: (exact: boolean) => api.pharmacy.receiveWardDelivery(delivery.id, {
      expectedRevision: delivery.revision,
      commandCode: `WARD-RECEIVE-${delivery.id}-${exact ? 'MATCHED' : 'DIFFERENCE'}`,
      note: exact ? '病区逐项核对无误' : note.trim(),
      lines: delivery.lines.map((line) => {
        const receivedQuantity = exact ? line.expectedQuantity : Number(receivedQuantities[line.id])
        const hasPhysicalDifference = !exact && (receivedQuantity !== line.expectedQuantity || discrepancyCode !== 'SHORTAGE')
        return {
          lineId: line.id,
          receivedQuantity,
          ...(hasPhysicalDifference ? { discrepancyCode, discrepancyNote: note.trim() } : {}),
        }
      }),
    }),
    onSuccess: refresh,
  })
  const quantityValues = delivery.lines.map((line) => Number(receivedQuantities[line.id]))
  const quantitiesValid = quantityValues.every((value, index) => Number.isFinite(value)
    && value >= 0 && value <= delivery.lines[index].expectedQuantity)
  const hasDifference = quantityValues.some((value, index) => value !== delivery.lines[index].expectedQuantity)
    || discrepancyCode !== 'SHORTAGE'
  const differenceValid = quantitiesValid && hasDifference && Boolean(note.trim())
  const statusTone = delivery.status === 'RECEIVED' || delivery.status === 'RESOLVED' ? 'success'
    : delivery.status === 'DISCREPANCY' ? 'danger' : 'warning'
  return <article className={`inpatient-ward-delivery is-${delivery.status.toLowerCase()}`}>
    <div className="inpatient-ward-delivery__summary"><div><strong>{delivery.deliveryNo}</strong>
      <span>{delivery.stockSiteName} → {delivery.nursingUnitName}</span></div>
      <StatusBadge tone={statusTone}>{wardDeliveryStatusPresentation(delivery.status).label}</StatusBadge></div>
    <div className="inpatient-ward-delivery__lines">{delivery.lines.map((line) => <WardDeliveryLineSummary key={line.id} line={line} />)}</div>
    {delivery.status === 'PENDING_DISPATCH' && <small className="inpatient-ward-delivery__hint">药房已建批，等待确认送出。</small>}
    {delivery.status === 'IN_TRANSIT' && !readOnly && <div className="inpatient-ward-delivery__actions">
      <Button size="sm" busy={receive.isPending} onClick={() => void receive.mutateAsync(true).catch(() => undefined)}>数量无误，确认签收</Button>
      <Button size="sm" variant="secondary" disabled={receive.isPending} onClick={() => setDifferenceOpen((value) => !value)}>
        {differenceOpen ? '取消登记差异' : '登记差异'}</Button></div>}
    {differenceOpen && delivery.status === 'IN_TRANSIT' && !readOnly && <form className="inpatient-ward-delivery__difference"
      onSubmit={(event) => { event.preventDefault(); if (differenceValid) void receive.mutateAsync(false).catch(() => undefined) }}>
      {delivery.lines.map((line) => <label key={line.id}><span>{line.medicationName} 实收</span><input
        aria-label={`${line.medicationName}实收数量`} type="number" min="0" max={line.expectedQuantity} step="0.00000001"
        value={receivedQuantities[line.id]} onChange={(event) => setReceivedQuantities((current) => ({ ...current, [line.id]: event.target.value }))} /></label>)}
      <label><span>差异类型</span><Select aria-label="差异类型" value={discrepancyCode} clearable={false} searchable={false}
        options={[{ value: 'SHORTAGE', label: '数量短少' }, { value: 'DAMAGED', label: '包装破损' },
          { value: 'WRONG_ITEM', label: '品项不符' }, { value: 'OTHER', label: '其他' }]}
        onChange={(value) => setDiscrepancyCode(value as typeof discrepancyCode)} /></label>
      <label className="is-note"><span>差异说明</span><input aria-label="差异说明" value={note} maxLength={1000}
        placeholder="必填，说明实际情况" onChange={(event) => setNote(event.target.value)} /></label>
      <Button type="submit" size="sm" variant="danger" disabled={!differenceValid} busy={receive.isPending}>确认差异签收</Button>
    </form>}
    {receive.error && <Alert className="inpatient-ward-delivery__error">{errorMessage(receive.error)}</Alert>}
    {(delivery.status === 'RECEIVED' || delivery.status === 'DISCREPANCY' || delivery.status === 'RESOLVED')
      && <small className="inpatient-ward-delivery__hint">{delivery.receivedAt ? `${formatTime(delivery.receivedAt)} 签收` : ''}
        {delivery.receiptNote ? ` · ${delivery.receiptNote}` : ''}{delivery.resolutionNote ? ` · ${delivery.resolutionNote}` : ''}</small>}
  </article>
}

function WardDeliveryLineSummary({ line }: { line: WardDeliveryLine }) {
  return <div><strong>{line.residentName} · {line.medicationName}</strong>
    <span>应收 {formatQuantity(line.expectedQuantity)} {line.unitCode}
      {line.status !== 'PENDING' ? ` · 实收 ${formatQuantity(line.receivedQuantity)} ${line.unitCode}` : ''}</span>
    {line.discrepancyNote && <small>{line.discrepancyNote}</small>}</div>
}

function NurseTaskRow({ task, delivery, selected, readOnly, busy, onSelectedChange, onExecute, onSkip }: {
  task: InpatientOrderTask
  delivery?: WardDelivery
  selected: boolean
  readOnly: boolean
  busy: boolean
  onSelectedChange: (selected: boolean) => void
  onExecute: (task: InpatientOrderTask, note?: string) => Promise<unknown>
  onSkip: (task: InpatientOrderTask, reason: string, note?: string) => Promise<unknown>
}) {
  const [note, setNote] = useState('')
  const [skipReason, setSkipReason] = useState('PATIENT_REFUSED')
  const waitingForPharmacy = task.pharmacyFulfillmentRequired && !task.pharmacyFulfilled
  const waitingForWard = Boolean(delivery && delivery.status !== 'RECEIVED' && delivery.status !== 'RESOLVED')
  const taskStatus = inpatientOrderTaskStatusPresentation(task.status)
  return <article className="inpatient-task-row" aria-label={`${task.itemName} 第 ${task.occurrenceNo} 次执行任务`}>
    <div className="inpatient-task-row__select">{!readOnly && task.status === 'PLANNED' && !waitingForPharmacy && !waitingForWard
      && <input type="checkbox" aria-label={`选择执行 ${task.itemName} 第 ${task.occurrenceNo} 次`}
        checked={selected} disabled={busy} onChange={(event) => onSelectedChange(event.target.checked)} />}</div>
    <time dateTime={task.scheduledAt}><strong>{formatTime(task.scheduledAt)}</strong><small>计划执行</small></time>
    <div className="inpatient-task-row__identity"><strong>{task.itemName}</strong>
      <span>{inpatientOrderDurationLabel(task.durationType)} · {inpatientOrderCategoryLabel(task.orderCategory)} · {orderDirections(task)}</span>
      <small>{task.orderNo} · 第 {task.occurrenceNo} 次{task.instructions ? ` · ${task.instructions}` : ''}</small></div>
    <MedicationFulfillmentSummary task={task} delivery={delivery} />
    <StatusBadge tone={taskStatus.tone}>{taskStatus.label}</StatusBadge>
    {task.status === 'PLANNED' && !readOnly ? <div className="inpatient-task-row__actions"><input aria-label={`执行备注 ${task.itemName}`}
      value={note} maxLength={1000} placeholder="执行备注（可选）" onChange={(event) => setNote(event.target.value)} />
      <Button size="sm" disabled={waitingForPharmacy || waitingForWard}
        title={waitingForPharmacy ? '药房完成发药后才可执行本次给药' : waitingForWard ? '病区完成药品签收后才可执行本次给药' : undefined}
        onClick={() => void onExecute(task, note.trim() || undefined).catch(() => undefined)} busy={busy}>
        {waitingForPharmacy ? '待发药' : waitingForWard ? '待签收' : '执行'}
      </Button>
      <Select aria-label={`跳过原因 ${task.itemName}`} value={skipReason} clearable={false} searchable={false}
        options={[{ value: 'PATIENT_REFUSED', label: '患者拒绝' }, { value: 'CLINICAL_CHANGE', label: '病情变化' },
          { value: 'NOT_AVAILABLE', label: '条件不具备' }, { value: 'OTHER', label: '其他' }]}
        onChange={setSkipReason} />
      <Button size="sm" variant="secondary" onClick={() => void onSkip(task, skipReason, note.trim() || undefined).catch(() => undefined)} busy={busy}>跳过</Button>
      {(waitingForPharmacy || waitingForWard) && <small className="inpatient-task-row__blocked">
        {waitingForPharmacy ? '发药完成后方可执行' : '病区签收后方可执行'}；如本次不执行，可选择原因后跳过。</small>}
    </div> : <TaskCompletionSummary task={task} />}
  </article>
}

function MedicationFulfillmentSummary({ task, delivery }: { task: InpatientOrderTask; delivery?: WardDelivery }) {
  if (!task.pharmacyFulfillmentRequired) {
    return <div className="inpatient-task-row__fulfillment is-not-required"><span>履约</span><strong>无需药房发药</strong></div>
  }
  const label = pharmacyFulfillmentText(task)
  const deliveryLabel = delivery ? wardDeliveryStatusPresentation(delivery.status).label : undefined
  return <div className={`inpatient-task-row__fulfillment ${task.pharmacyFulfilled ? 'is-fulfilled' : 'is-pending'}`}>
    <span title="按整条医嘱汇总，非单次剂次发药明细">医嘱发药（汇总）</span><strong>{label}</strong>
    {deliveryLabel && <small>病区交接：{deliveryLabel}</small>}
    {task.netDispensedQuantity !== undefined && task.netDispensedQuantity > 0
      && <small>净发药量 {formatQuantity(task.netDispensedQuantity)}</small>}
    {task.dispenseId && <small title={`关联发药记录 ${task.dispenseId}`}>发药记录 {task.dispenseId}</small>}
  </div>
}

function TaskCompletionSummary({ task }: { task: InpatientOrderTask }) {
  const occurredAt = task.status === 'CANCELLED' ? task.cancelledAt : task.completedAt
  const description = task.executionNote || task.cancelReason || task.outcomeCode || '—'
  return <div className="inpatient-task-row__result"><strong>{description}</strong>
    <small>{occurredAt ? formatTime(occurredAt) : '时间未记录'}
      {task.completedBy ? ` · 执行人 ${task.completedBy}` : ''}</small>
    {task.medicationConsumptions.length > 0 && <small>{medicationConsumptionText(task)}</small>}</div>
}

function canBatchExecute(task: InpatientOrderTask, deliveriesByDispense?: Map<string, WardDelivery>) {
  const delivery = task.dispenseId ? deliveriesByDispense?.get(task.dispenseId) : undefined
  const deliveryReady = !delivery || delivery.status === 'RECEIVED' || delivery.status === 'RESOLVED'
  return task.status === 'PLANNED' && (!task.pharmacyFulfillmentRequired || task.pharmacyFulfilled) && deliveryReady
}

function groupTasksByScheduledMinute(tasks: InpatientOrderTask[]) {
  const groups = new Map<number, InpatientOrderTask[]>()
  tasks.slice().sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt)).forEach((task) => {
    const key = Math.floor(new Date(task.scheduledAt).getTime() / 60_000)
    groups.set(key, [...(groups.get(key) ?? []), task])
  })
  return [...groups.entries()].map(([key, values]) => ({
    key,
    label: new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
      .format(new Date(key * 60_000)),
    tasks: values,
  }))
}

function medicationConsumptionText(task: InpatientOrderTask) {
  const consumptions = task.medicationConsumptions
  const baseUnit = consumptions[0]?.baseUnitCode ?? '单位'
  const quantity = consumptions.reduce((total, value) => total + value.consumedBaseQuantity, 0)
  return `已核销 ${formatQuantity(quantity)} ${baseUnit} · ${consumptions.length} 条发药明细`
}

function pharmacyFulfillmentText(task: InpatientOrderTask) {
  if (task.pharmacyFulfilled) return '已发药'
  const labels: Record<string, string> = {
    NOT_INTAKE: '待药房接收', PENDING: '待配药', READY: '已备药', PICKING: '配药中',
    PARTIAL: '部分发药', PARTIALLY_DISPENSED: '部分发药', CANCELLED: '已取消',
  }
  return labels[task.pharmacyFulfillmentStatus ?? ''] ?? '待发药'
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value)
}

function orderDirections(value: Pick<InpatientOrder, 'dosageAmount' | 'dosageUnit' | 'routeCode' | 'frequencyCode'>) {
  return [[value.dosageAmount, value.dosageUnit].filter((item) => item !== undefined && item !== '').join(' '),
    value.routeCode, value.frequencyCode].filter(Boolean).join(' · ') || '按医嘱执行'
}

function defaultPlannedAt() {
  const date = new Date(Date.now() + 60 * 60_000)
  date.setMinutes(Math.ceil(date.getMinutes() / 5) * 5, 0, 0)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export default InpatientOrderWorkspace
