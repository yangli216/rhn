import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { ClinicalContext } from '../../app/AppShell'
import type { PersonnelAssignment } from '../../shared/api/organizationApi'
import type { PharmacyReviewResult } from '../../shared/api/pharmacyApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, Select, StatusBadge } from '../../shared/ui'

const taskStatusText: Record<string, string> = {
  PENDING_REVIEW: '待审方', INTERVENTION: '待干预', READY_TO_PICK: '待拣货', PICKING: '拣货中',
  READY_TO_DISPENSE: '待发药', PARTIALLY_DISPENSED: '部分发药', COMPLETED: '已完成',
  PARTIALLY_RETURNED: '部分退药', RETURNED: '已全部退药', REJECTED: '已驳回', CANCELLED: '已取消',
}

const reviewText: Record<PharmacyReviewResult, string> = {
  PASS: '通过', REJECT: '驳回', INTERVENE: '干预', OVERRIDE: '强制通过',
}

function statusTone(status?: string) {
  if (status === 'READY_TO_PICK' || status === 'COMPLETED') return 'success' as const
  if (status === 'INTERVENTION') return 'warning' as const
  if (status === 'REJECTED' || status === 'CANCELLED') return 'danger' as const
  return 'info' as const
}

export function PharmacyWorkspace({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const queryClient = useQueryClient()
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

  const sites = useQuery({ queryKey: ['pharmacy-sites', organizationId], queryFn: () => api.pharmacy.sites(organizationId) })
  const inbox = useQuery({ queryKey: ['pharmacy-inbox', organizationId], queryFn: () => api.pharmacy.inbox(organizationId) })
  const stockItems = useQuery({
    queryKey: ['pharmacy-stock-items', siteId], queryFn: () => api.pharmacy.stockItems(siteId), enabled: Boolean(siteId),
  })
  const practitioners = useQuery({ queryKey: ['practitioners'], queryFn: api.organization.practitioners })
  const practitioner = useQuery({
    queryKey: ['practitioner-detail', practitionerId], queryFn: () => api.organization.practitioner(practitionerId),
    enabled: Boolean(practitionerId),
  })

  useEffect(() => {
    if (!siteId && sites.data?.length) setSiteId(sites.data[0].id)
    if (siteId && sites.data && !sites.data.some((site) => site.id === siteId)) setSiteId(sites.data[0]?.id ?? '')
  }, [siteId, sites.data])

  useEffect(() => {
    if (!requestId && inbox.data?.length) setRequestId(inbox.data[0].request.id)
    if (requestId && inbox.data && !inbox.data.some((item) => item.request.id === requestId)) {
      setRequestId(inbox.data[0]?.request.id ?? '')
    }
  }, [inbox.data, requestId])

  useEffect(() => {
    setStockItemId('')
  }, [siteId, requestId])

  const selected = inbox.data?.find((item) => item.request.id === requestId)
  const task = useQuery({
    queryKey: ['pharmacy-task', selected?.taskId], queryFn: () => api.pharmacy.task(selected!.taskId!),
    enabled: Boolean(selected?.taskId),
  })
  const selectedLine = task.data?.lines[0]
  const balances = useQuery({
    queryKey: ['pharmacy-inventory-balances', task.data?.stockSiteId, selectedLine?.stockItemId],
    queryFn: () => api.pharmacy.balances(task.data!.stockSiteId, selectedLine!.stockItemId),
    enabled: Boolean(task.data?.stockSiteId && selectedLine?.stockItemId),
  })
  const reservations = useQuery({
    queryKey: ['pharmacy-reservations', selected?.taskId],
    queryFn: () => api.pharmacy.reservations(selected!.taskId!), enabled: Boolean(selected?.taskId),
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
      queryClient.invalidateQueries({ queryKey: ['pharmacy-inventory-balances'] }),
    ])
  }
  const intake = useMutation({
    mutationFn: () => api.pharmacy.intake(requestId, stockItemId, '门诊窗口接方'),
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
      dispenserAssignmentId: assignmentId, description: '窗口实际发药',
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
      description: '患者退药确认', lines: [{ originalDispenseLineId: selectedReturnLine!.line.id,
        quantity: Number(returnQuantity), disposition: returnDisposition }],
    }),
    onSuccess: async () => {
      setReturnQuantity(''); await refresh(selected?.taskId)
    },
  })

  const error = sites.error || inbox.error || stockItems.error || task.error || practitioners.error
    || practitioner.error || balances.error || reservations.error || intake.error || review.error
    || reserve.error || releaseReservation.error || trace.error || completePicking.error
    || dispense.error || returnMedication.error
  const canReview = task.data?.status === 'PENDING_REVIEW' || task.data?.status === 'INTERVENTION'
  const availableQuantity = balances.data?.filter((value) => value.stockStatus === 'AVAILABLE')
    .reduce((total, value) => total + value.quantityAvailable, 0) ?? 0
  const remainingToDispense = selectedLine
    ? selectedLine.plannedQuantity - selectedLine.dispensedQuantity : 0

  return <>
    <PageHeader eyebrow="药事管理 · M3.3" title="门诊药房工作台"
      description="从处方接方到批次预留、配药复核、实际发药和患者退药，全程保留不可变数量账与批次追溯。"
      actions={<Button variant="secondary" onClick={() => void refresh(selected?.taskId)}>刷新队列</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="pharmacy-toolbar">
      <FormField label="当前药房">
        <Select value={siteId} onChange={(value) => setSiteId(value)} placeholder="请选择门诊药房"
          options={(sites.data ?? []).filter((site) => site.active && (site.serviceScope === 'OUTPATIENT'
            || site.serviceScope === 'MIXED')).map((site) => ({ value: site.id, label: site.name, code: site.code }))} />
      </FormField>
      <div className="pharmacy-toolbar__context">
        <span>当前工作上下文</span><strong>{clinicalContext.organization.name} · {clinicalContext.department.name}</strong>
      </div>
      <div className="pharmacy-toolbar__metrics">
        <span>待处理处方</span><strong>{inbox.data?.filter((item) => !item.taskStatus
          || item.taskStatus === 'PENDING_REVIEW' || item.taskStatus === 'INTERVENTION').length ?? 0}</strong>
      </div>
    </div>
    {(sites.isPending || inbox.isPending) && <Panel><LoadingState label="正在加载药房工作队列…" /></Panel>}
    {!sites.isPending && sites.data?.length === 0 && <Panel><EmptyState icon="pharmacy" title="当前机构尚未配置药房站点"
      copy="请先由平台管理员建立 PHARMACY 类型、OUTPATIENT 或 MIXED 服务范围的库存站点。" /></Panel>}
    {!inbox.isPending && sites.data?.length !== 0 && <div className="pharmacy-workspace">
      <Panel className="pharmacy-queue">
        <header className="pharmacy-section-head"><div><h2>处方收件箱</h2><span>{inbox.data?.length ?? 0} 条</span></div></header>
        {!inbox.data?.length ? <EmptyState icon="pharmacy" title="暂无待接收处方" copy="生效且非自备的门诊处方会进入这里。" />
          : <div className="pharmacy-queue__list">{inbox.data.map((item) => <button type="button"
            className={item.request.id === requestId ? 'is-selected' : ''} key={item.request.id}
            onClick={() => setRequestId(item.request.id)}>
            <div className="pharmacy-queue__title"><strong>{item.request.medicationName}</strong>
              <StatusBadge tone={statusTone(item.taskStatus)}>{taskStatusText[item.taskStatus ?? ''] ?? '待接方'}</StatusBadge></div>
            <span>{item.request.itemName} · {item.request.quantity}{item.request.quantityUnit}</span>
            <small>{item.request.requestNo} · {formatTime(item.request.authoredAt)}</small>
          </button>)}</div>}
      </Panel>
      <Panel className="pharmacy-detail">
        {!selected ? <EmptyState icon="pharmacy" title="请选择一条处方" copy="左侧选择后可查看快照、接方并审方。" />
          : <>
            <header className="pharmacy-detail__head"><div><span className="ui-eyebrow">{selected.request.requestNo}</span>
              <h2>{selected.request.medicationName}</h2><p>{selected.request.itemName}</p></div>
              <StatusBadge tone={statusTone(selected.taskStatus)}>{taskStatusText[selected.taskStatus ?? ''] ?? '待接方'}</StatusBadge>
            </header>
            <dl className="pharmacy-facts">
              <div><dt>申请数量</dt><dd>{selected.request.quantity}{selected.request.quantityUnit}</dd></div>
              <div><dt>基础数量</dt><dd>{selected.request.baseQuantity}{selected.request.baseUnit}</dd></div>
              <div><dt>用法</dt><dd>{[selected.request.routeCode, selected.request.frequencyCode].filter(Boolean).join(' · ') || '未填写'}</dd></div>
              <div><dt>处方属性快照</dt><dd>{Object.keys((selected.request.itemAttributeSnapshot.attributes as object | undefined) ?? {}).length} 项</dd></div>
            </dl>
            <div className="pharmacy-snapshot"><strong>不可变快照凭据</strong>
              <code>{selected.request.itemAttributeHash}</code></div>
            {!selected.taskId && <section className="pharmacy-action-section">
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
                  <span>计划 {line.plannedQuantity} · 已发 {line.dispensedQuantity} · 已退 {line.returnedQuantity}
                    {' '}{line.dispenseUnitCode}</span>
                  <StatusBadge tone={line.status === 'READY' ? 'success' : 'neutral'}>{line.status}</StatusBadge>
                </article>)}</div>
              </section>
              <section className="pharmacy-action-section">
                <div className="pharmacy-section-head"><div><h3>批次库存与预留</h3>
                  <span>库存流水是事实源，余额为并发维护的可重建投影</span></div>
                  <div className="pharmacy-inventory-summary"><span>当前可用</span>
                    <strong>{availableQuantity}{selectedLine?.baseQuantityFactor
                      ? ` ${selected.request.baseUnit}` : ''}</strong></div></div>
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
                        <span>{value.quantityReserved}</span><strong>{value.quantityAvailable} {value.baseUnitCode}</strong>
                      </div>)}
                    </div>}
                  {!!reservations.data?.allocations.length && <div className="pharmacy-reservation-list">
                    {reservations.data.allocations.map((value) => <article key={value.id}>
                      <StatusBadge tone={value.status === 'ACTIVE' ? 'success' : value.status === 'RELEASED'
                        ? 'neutral' : 'warning'}>{value.status}</StatusBadge>
                      <div><strong>{value.lotNo} · {value.quantityReserved}{value.baseUnitCode}</strong>
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
              </section>
              <section className="pharmacy-action-section">
                <div className="pharmacy-section-head"><div><h3>配药、发药与退药</h3>
                  <span>实际动作形成批次事实与库存分录，历史事件只追加、不覆盖</span></div></div>
                <div className="pharmacy-execution-operator">
                  <FormField label="执行药师" required><Select value={practitionerId}
                    onChange={(value) => setPractitionerId(value)} placeholder="请选择执行药师" searchable showValue
                    options={(practitioners.data ?? []).filter((value) => value.sdPersonnelStatus === 'ACTIVE')
                      .map((value) => ({ value: value.id, label: value.fullName, code: value.code }))} /></FormField>
                  <FormField label="当前任职" required><Select value={assignmentId}
                    onChange={(value) => setAssignmentId(value)} placeholder="请选择当前科室任职"
                    options={eligibleAssignments.map(assignmentOption)} /></FormField>
                  <div><span>任务进度</span><strong>{selectedLine?.dispensedQuantity ?? 0} / {selectedLine?.plannedQuantity ?? 0}
                    {' '}{selectedLine?.dispenseUnitCode}</strong></div>
                </div>
                {task.data.status === 'PICKING' && <div className="pharmacy-execution-action">
                  <div><strong>完成配药核对</strong><span>确认预留批次、实物数量和包装后进入待发药。</span></div>
                  <Button busy={completePicking.isPending} disabled={!practitionerId || !assignmentId}
                    onClick={() => completePicking.mutate()}>配药复核通过</Button>
                </div>}
                {(task.data.status === 'READY_TO_DISPENSE' || task.data.status === 'PARTIALLY_DISPENSED')
                  && <div className="pharmacy-execution-form">
                    <FormField label={`本次发药数量（剩余 ${remainingToDispense}）`} required><input type="number"
                      min="0.00000001" max={remainingToDispense} step="any" value={dispenseQuantity}
                      onChange={(event) => setDispenseQuantity(event.target.value)} placeholder="支持部分发药" /></FormField>
                    <Button busy={dispense.isPending} disabled={!practitionerId || !assignmentId
                      || Number(dispenseQuantity) <= 0 || Number(dispenseQuantity) > remainingToDispense}
                      onClick={() => dispense.mutate()}>确认实际发药</Button>
                  </div>}
                {(task.data.status === 'COMPLETED' || task.data.status === 'PARTIALLY_RETURNED')
                  && <div className="pharmacy-return-form">
                    <FormField label="原发药批次" required><Select value={returnLineId} onChange={setReturnLineId}
                      placeholder="请选择可退批次" searchable showValue options={returnableLines.map((value) => ({
                        value: value.line.id, label: `${value.line.lotNo} · 可退 ${value.remaining}${value.line.dispenseUnitCode}`,
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
                {!!trace.data?.events.length && <div className="pharmacy-trace-list">
                  {trace.data.events.map((event) => <article key={event.id}>
                    <StatusBadge tone={event.dispenseType === 'RETURN' ? 'warning' : 'success'}>
                      {event.dispenseType}</StatusBadge>
                    <div><strong>{event.dispenseNo}</strong><span>{event.lines.map((line) =>
                      `${line.lotNo} ${line.quantityDispensed}${line.dispenseUnitCode}`).join('；')}</span></div>
                    <time>{formatTime(event.occurredAt)}</time>
                  </article>)}
                </div>}
              </section>
              <section className="pharmacy-action-section">
                <div className="pharmacy-section-head"><div><h3>药师审方</h3><span>审方事实只追加、不覆盖</span></div></div>
                {canReview ? <div className="pharmacy-review-form">
                  <FormField label="审方药师" required><Select value={practitionerId} onChange={(value) => setPractitionerId(value)}
                    placeholder="请选择药师" searchable showValue options={(practitioners.data ?? [])
                      .filter((value) => value.sdPersonnelStatus === 'ACTIVE')
                      .map((value) => ({ value: value.id, label: value.fullName, code: value.code }))} /></FormField>
                  <FormField label="当前任职" required><Select value={assignmentId} onChange={(value) => setAssignmentId(value)}
                    placeholder="请选择当前科室任职" options={eligibleAssignments.map(assignmentOption)} /></FormField>
                  <FormField label="审方结论" required><Select value={reviewResult}
                    onChange={(value) => setReviewResult(value as PharmacyReviewResult)} options={(
                      ['PASS', 'INTERVENE', 'REJECT', 'OVERRIDE'] as PharmacyReviewResult[])
                      .map((value) => ({ value, label: reviewText[value], code: value }))} /></FormField>
                  <FormField label="原因编码" required={reviewResult !== 'PASS'}><input value={reasonCode}
                    onChange={(event) => setReasonCode(event.target.value)} placeholder={reviewResult === 'PASS' ? '通过时可不填' : '例如 DOSE_CONFIRM'} /></FormField>
                  <FormField label="审方说明" required={reviewResult !== 'PASS'} className="pharmacy-review-form__description"><textarea
                    value={description} onChange={(event) => setDescription(event.target.value)} placeholder="记录审方判断或干预说明" /></FormField>
                  <Button className="pharmacy-review-form__submit" disabled={!practitionerId || !assignmentId
                    || reviewResult !== 'PASS' && (!reasonCode.trim() || !description.trim())}
                    busy={review.isPending} onClick={() => review.mutate()}>提交审方结论</Button>
                </div> : <Alert tone="info">当前任务已完成本轮审方，后续进入拣货与发药流程。</Alert>}
                {!!task.data.reviews.length && <div className="pharmacy-review-history">{task.data.reviews.map((value) => <article key={value.id}>
                  <StatusBadge tone={value.result === 'PASS' || value.result === 'OVERRIDE' ? 'success'
                    : value.result === 'INTERVENE' ? 'warning' : 'danger'}>{reviewText[value.result]}</StatusBadge>
                  <div><strong>{value.reviewNo}</strong><span>{value.description || '审方通过'}</span></div>
                  <time>{formatTime(value.reviewedAt)}</time>
                </article>)}</div>}
              </section>
            </>)}
          </>}
      </Panel>
    </div>}
  </>
}

function assignmentOption(value: PersonnelAssignment) {
  return { value: value.id, label: `${value.positionName} · ${value.departmentName}`, code: value.code }
}
