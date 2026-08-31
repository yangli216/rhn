import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import type { PersonnelAssignment, Practitioner } from '../../shared/api/organizationApi'
import type { StockItem, WardSupplyBatch, WardSupplyLine, WardSupplyShiftCode } from '../../shared/api/pharmacyApi'
import { formatTime } from '../../shared/format'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, Panel, Select, StatusBadge } from '../../shared/ui'
import './ward-daily-supply-panel.css'

const shiftOptions = [
  { value: 'DAY', label: '白班（08:00–16:00）' },
  { value: 'EVENING', label: '小夜（16:00–24:00）' },
  { value: 'NIGHT', label: '大夜（00:00–08:00）' },
]

const shiftText: Record<WardSupplyShiftCode, string> = {
  DAY: '白班', EVENING: '小夜', NIGHT: '大夜',
}

const lineStatusText: Record<string, string> = {
  PENDING_INTAKE: '待接方', PREPARING: '备药中', COVERED: '已覆盖', GAP: '有缺口', ISSUED: '已发在途',
  RETURN_PENDING: '待退', EXCEPTION: '异常', CANCELLED: '已取消',
}

export function WardDailySupplyPanel({ api, organizationId, stockSiteId, stockItems,
  practitioners, assignments, practitionerId, assignmentId,
  onPractitionerChange, onAssignmentChange, defaultOpen = false }: {
  api: RhnApi
  organizationId: string
  stockSiteId: string
  stockItems: StockItem[]
  practitioners: Practitioner[]
  assignments: PersonnelAssignment[]
  practitionerId: string
  assignmentId: string
  onPractitionerChange: (value: string) => void
  onAssignmentChange: (value: string) => void
  defaultOpen?: boolean
}) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(defaultOpen)
  const [businessDate, setBusinessDate] = useState(todayValue)
  const [shiftCode, setShiftCode] = useState<WardSupplyShiftCode>(currentShift)
  const [nursingUnitDepartmentId, setNursingUnitDepartmentId] = useState('')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [stockItemSelections, setStockItemSelections] = useState<Record<string, string>>({})

  const departments = useQuery({
    queryKey: ['pharmacy-ward-supply-departments', organizationId],
    queryFn: () => api.organization.departments(organizationId),
    enabled: open,
  })
  const nursingUnits = useMemo(() => (departments.data ?? [])
    .filter((department) => department.sdOrgType === 'NURSING_UNIT' && department.sdOrgStatus === 'ACTIVE'),
  [departments.data])

  useEffect(() => {
    if (!nursingUnitDepartmentId && nursingUnits.length) setNursingUnitDepartmentId(nursingUnits[0].id)
    if (nursingUnitDepartmentId && !nursingUnits.some((unit) => unit.id === nursingUnitDepartmentId)) {
      setNursingUnitDepartmentId(nursingUnits[0]?.id ?? '')
    }
  }, [nursingUnitDepartmentId, nursingUnits])

  const batchesKey = ['pharmacy-ward-supply-batches', stockSiteId, nursingUnitDepartmentId,
    businessDate, shiftCode] as const
  const batches = useQuery({
    queryKey: batchesKey,
    queryFn: () => api.pharmacy.wardSupplyBatches({ stockSiteId, nursingUnitDepartmentId, businessDate, shiftCode }),
    enabled: open && Boolean(stockSiteId && nursingUnitDepartmentId && businessDate),
  })

  useEffect(() => {
    if (!selectedBatchId && batches.data?.length) setSelectedBatchId(batches.data[0].id)
    if (selectedBatchId && batches.data && !batches.data.some((batch) => batch.id === selectedBatchId)) {
      setSelectedBatchId(batches.data[0]?.id ?? '')
    }
  }, [batches.data, selectedBatchId])

  const batchDetailKey = ['pharmacy-ward-supply-batch', selectedBatchId] as const
  const batchDetail = useQuery({
    queryKey: batchDetailKey,
    queryFn: () => api.pharmacy.wardSupplyBatch(selectedBatchId),
    enabled: open && Boolean(selectedBatchId),
  })
  const createBatch = useMutation({
    mutationFn: () => api.pharmacy.createWardSupplyBatch({
      stockSiteId, nursingUnitDepartmentId, businessDate, shiftCode,
      commandCode: `WARD-SUPPLY-${businessDate}-${shiftCode}-${crypto.randomUUID()}`,
    }),
    onSuccess: async (value) => {
      setSelectedBatchId(value.id)
      queryClient.setQueryData(['pharmacy-ward-supply-batch', value.id], value)
      await queryClient.invalidateQueries({ queryKey: batchesKey })
    },
  })
  const intakeLine = useMutation({
    mutationFn: ({ line, stockItemId }: { line: WardSupplyLine; stockItemId: string }) => {
      return api.pharmacy.intakeWardSupplyLine(line.id, {
        stockItemId, description: '滚动供药逐行接方',
      })
    },
    onSuccess: async (value) => {
      queryClient.setQueryData<WardSupplyBatch>(batchDetailKey, (current) => current
        ? { ...current, lines: current.lines.map((line) => line.id === value.id ? value : line) } : current)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: batchesKey }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-ward-supply-batch', selectedBatchId] }),
      ])
    },
  })
  const intakeBatch = useMutation({
    mutationFn: (lines: Array<{ lineId: string; stockItemId: string }>) => api.pharmacy.intakeWardSupplyBatch(
      selectedBatchId, { lines, description: '滚动供药批量接方' },
    ),
    onSuccess: async (value) => {
      queryClient.setQueryData(batchDetailKey, value)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: batchesKey }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-ward-supply-batch', selectedBatchId] }),
      ])
    },
  })
  const reviewAndReserve = useMutation({
    mutationFn: () => api.pharmacy.reviewAndReserveWardSupplyBatch(selectedBatchId, {
      pharmacistPractitionerId: practitionerId,
      reviewerAssignmentId: assignmentId,
      expiryMinutes: 30,
      description: '住院滚动供药批量审方并预留库存',
    }),
    onSuccess: async (value) => {
      queryClient.setQueryData(batchDetailKey, value)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: batchesKey }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-ward-supply-batch', selectedBatchId] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-task'] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-inventory-balances'] }),
      ])
    },
  })
  const completePicking = useMutation({
    mutationFn: (batchId: string) => api.pharmacy.completePickingWardSupplyBatch(batchId, {
      pickerPractitionerId: practitionerId,
      pickerAssignmentId: assignmentId,
      description: '住院滚动供药整批配药复核',
    }),
    onSuccess: async (value) => {
      queryClient.setQueryData(['pharmacy-ward-supply-batch', value.id], value)
    },
    onSettled: async (_value, _error, batchId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pharmacy-ward-supply-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-ward-supply-batch', batchId] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-task'] }),
      ])
    },
  })
  const dispenseDeliver = useMutation({
    mutationFn: (batchId: string) => api.pharmacy.dispenseDeliverWardSupplyBatch(batchId, {
      dispenserPractitionerId: practitionerId,
      dispenserAssignmentId: assignmentId,
      description: '住院滚动供药整批发药并建立配送交接',
    }),
    onSuccess: async (value) => {
      queryClient.setQueryData(['pharmacy-ward-supply-batch', value.batch.id], value.batch)
    },
    onSettled: async (_value, _error, batchId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pharmacy-ward-supply-batches'] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-ward-supply-batch', batchId] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-task'] }),
        queryClient.invalidateQueries({ queryKey: ['pharmacy-inventory-balances'] }),
        queryClient.invalidateQueries({ queryKey: ['ward-deliveries'] }),
      ])
    },
  })

  const batch = batchDetail.data
  const error = departments.error || batches.error || batchDetail.error || createBatch.error
    || intakeLine.error || intakeBatch.error || reviewAndReserve.error || completePicking.error
    || dispenseDeliver.error

  return <Panel className="pharmacy-ward-daily-supply" aria-label="滚动供药">
    <header><div><span>住院单位剂量</span><h2>滚动供药</h2>
      <p>按日期、班次和病区汇总医嘱覆盖，缺口逐行接方。</p></div>
      <Button size="sm" variant="secondary" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        {open ? '收起' : '进入滚动供药'}</Button></header>
    {open && <div className="pharmacy-ward-daily-supply__body">
      {error && <Alert>{errorMessage(error)}</Alert>}
      <div className="pharmacy-ward-daily-supply__filters">
        <FormField label="供药日期"><input type="date" value={businessDate}
          onChange={(event) => { setBusinessDate(event.target.value); setSelectedBatchId('') }} /></FormField>
        <FormField label="供药班次"><Select value={shiftCode} options={shiftOptions}
          onChange={(value) => { setShiftCode(value as WardSupplyShiftCode); setSelectedBatchId('') }} /></FormField>
        <FormField label="护理病区"><Select value={nursingUnitDepartmentId} loading={departments.isPending}
          placeholder="请选择护理病区" emptyText="当前机构未配置护理病区"
          options={nursingUnits.map((unit) => ({ value: unit.id, label: unit.name, secondaryText: unit.code }))}
          onChange={(value) => { setNursingUnitDepartmentId(value); setSelectedBatchId('') }} /></FormField>
        <Button busy={createBatch.isPending} disabled={!stockSiteId || !nursingUnitDepartmentId || !businessDate}
          onClick={() => createBatch.mutate()}>生成供药批次</Button>
      </div>
      {batches.isPending && <LoadingState label="正在汇总当班供药…" />}
      {!batches.isPending && nursingUnitDepartmentId && batches.data?.length === 0
        && <EmptyState icon="pharmacy" title="当前班次尚无供药批次" copy="点击“生成供药批次”，汇总当前有效医嘱并识别覆盖与缺口。" />}
      {!departments.isPending && nursingUnits.length === 0
        && <EmptyState icon="pharmacy" title="暂无护理病区" copy="请先在机构科室中配置 NURSING_UNIT 类型的护理单元。" />}
      {!!batches.data?.length && <>
        {batches.data.length > 1 && <FormField label="供药批次"><Select value={selectedBatchId}
          options={batches.data.map((value) => ({ value: value.id, label: value.batchNo,
            secondaryText: `${value.nursingUnitName} · ${shiftText[value.shiftCode]}` }))}
          onChange={setSelectedBatchId} /></FormField>}
        {batchDetail.isPending ? <LoadingState label="正在加载供药明细…" /> : batch && <BatchDetail batch={batch}
          stockItems={stockItems} stockItemSelections={stockItemSelections} onStockItemChange={(lineId, stockItemId) =>
            setStockItemSelections((current) => ({ ...current, [lineId]: stockItemId }))}
          onIntake={(line, stockItemId) => intakeLine.mutate({ line, stockItemId })}
          onBatchIntake={(lines) => intakeBatch.mutate(lines)}
          onReviewAndReserve={() => reviewAndReserve.mutate()}
          onCompletePicking={() => completePicking.mutate(batch.id)}
          onDispenseDeliver={() => dispenseDeliver.mutate(batch.id)}
          practitioners={practitioners} assignments={assignments}
          practitionerId={practitionerId} assignmentId={assignmentId}
          onPractitionerChange={onPractitionerChange} onAssignmentChange={onAssignmentChange}
          intakePending={intakeLine.isPending || intakeBatch.isPending}
          batchIntakePending={intakeBatch.isPending} reviewAndReservePending={reviewAndReserve.isPending}
          completePickingPending={completePicking.isPending} dispenseDeliverPending={dispenseDeliver.isPending}
          deliveryNumbers={dispenseDeliver.data?.batch.id === batch.id
            ? dispenseDeliver.data.deliveries.map((value) => value.deliveryNo) : []} />}
      </>}
    </div>}
  </Panel>
}

function BatchDetail({ batch, stockItems, stockItemSelections, onStockItemChange, onIntake, onBatchIntake,
  onReviewAndReserve, onCompletePicking, onDispenseDeliver, practitioners, assignments, practitionerId, assignmentId,
  onPractitionerChange, onAssignmentChange, intakePending, batchIntakePending, reviewAndReservePending,
  completePickingPending, dispenseDeliverPending, deliveryNumbers }: {
  batch: WardSupplyBatch
  stockItems: StockItem[]
  stockItemSelections: Record<string, string>
  onStockItemChange: (lineId: string, stockItemId: string) => void
  onIntake: (line: WardSupplyLine, stockItemId: string) => void
  onBatchIntake: (lines: Array<{ lineId: string; stockItemId: string }>) => void
  onReviewAndReserve: () => void
  onCompletePicking: () => void
  onDispenseDeliver: () => void
  practitioners: Practitioner[]
  assignments: PersonnelAssignment[]
  practitionerId: string
  assignmentId: string
  onPractitionerChange: (value: string) => void
  onAssignmentChange: (value: string) => void
  intakePending: boolean
  batchIntakePending: boolean
  reviewAndReservePending: boolean
  completePickingPending: boolean
  dispenseDeliverPending: boolean
  deliveryNumbers: string[]
}) {
  const summary = batch.summary
  const pendingIntakeLines = batch.lines.filter((line) => line.status === 'PENDING_INTAKE')
  const batchIntakeLines = pendingIntakeLines.map((line) => ({
    lineId: line.id,
    stockItemId: selectedStockItemId(line, stockItemCandidates(line, stockItems), stockItemSelections),
  }))
  const unmatchedPendingCount = batchIntakeLines.filter((line) => !line.stockItemId).length
  const batchIntakeDisabled = pendingIntakeLines.length === 0 || unmatchedPendingCount > 0
  const activeLines = batch.lines.filter((line) => line.status !== 'CANCELLED')
  const taskLines = activeLines.filter((line) => Boolean(line.dispenseTaskId))
  const uniqueTaskLines = uniqueLinesByTask(taskLines)
  const duplicateTaskLinkCount = taskLines.length - uniqueTaskLines.length
  const reviewableLines = uniqueTaskLines.filter((line) => line.dispenseTaskStatus === 'PENDING_REVIEW'
    || line.dispenseTaskStatus === 'READY_TO_PICK')
  const reviewExceptions = uniqueTaskLines.filter((line) => line.dispenseTaskStatus === 'INTERVENTION'
    || line.dispenseTaskStatus === 'REJECTED')
  const intakeIncomplete = activeLines.some((line) => !line.dispenseTaskId)
  const reviewAndReserveDisabled = reviewableLines.length === 0 || intakeIncomplete || reviewExceptions.length > 0
    || duplicateTaskLinkCount > 0 || !practitionerId || !assignmentId
  const pickingLines = uniqueTaskLines.filter((line) => line.dispenseTaskStatus === 'PICKING')
  const readyToDispenseLines = uniqueTaskLines.filter((line) => line.dispenseTaskStatus === 'READY_TO_DISPENSE')
  const recoverableIssuedLines = uniqueTaskLines.filter((line) => line.dispenseTaskStatus === 'COMPLETED'
    && line.status === 'ISSUED')
  const fulfillmentExceptions = uniqueTaskLines.filter((line) => !line.dispenseTaskStatus
    || !['PICKING', 'READY_TO_DISPENSE', 'COMPLETED'].includes(line.dispenseTaskStatus))
  const specialMedicationLines = uniqueTaskLines.filter((line) => stockItems.some((item) => item.id === line.stockItemId
    && (item.controlled || item.highAlert)))
  const specialReadyLines = specialMedicationLines.filter((line) => line.dispenseTaskStatus === 'READY_TO_DISPENSE')
  const actorMissing = !practitionerId || !assignmentId
  const completePickingDisabled = pickingLines.length === 0 || intakeIncomplete
    || fulfillmentExceptions.length > 0 || duplicateTaskLinkCount > 0 || actorMissing
  const deliveryRecovery = readyToDispenseLines.length === 0 && recoverableIssuedLines.length > 0
  const dispenseDeliverDisabled = (readyToDispenseLines.length === 0 && recoverableIssuedLines.length === 0)
    || intakeIncomplete || pickingLines.length > 0 || fulfillmentExceptions.length > 0
    || duplicateTaskLinkCount > 0 || specialReadyLines.length > 0 || actorMissing || deliveryNumbers.length > 0
  return <section className="pharmacy-ward-daily-supply__batch" aria-label={`供药批次 ${batch.batchNo}`}>
    <div className="pharmacy-ward-daily-supply__batch-head"><div className="pharmacy-ward-daily-supply__batch-meta"><strong>{batch.batchNo}</strong>
      <span>{batch.nursingUnitName} · {batch.businessDate} · {shiftText[batch.shiftCode]}</span></div>
      <div className="pharmacy-ward-daily-supply__batch-actions">
        <StatusBadge tone={batch.status === 'COMPLETED' ? 'success' : batch.status === 'EXCEPTION' ? 'danger' : 'info'}>
          {batch.status === 'COMPLETED' ? '已完成' : batch.status === 'EXCEPTION' ? '有异常' : '处理中'}</StatusBadge>
        <Button size="sm" busy={batchIntakePending} disabled={batchIntakeDisabled}
          onClick={() => onBatchIntake(batchIntakeLines)}>批量接方{pendingIntakeLines.length > 0
            ? `（${pendingIntakeLines.length}）` : ''}</Button>
      </div></div>
    {uniqueTaskLines.length > 0 && <div className="pharmacy-ward-daily-supply__review">
      <div><strong>批量审方与库存预留</strong><small>{reviewableLines.length > 0
        ? `${reviewableLines.length} 条任务等待常规审方或预留`
        : reviewExceptions.length > 0 ? '存在需逐行处理的审方异常' : '当前批次已完成审方与库存预留'}</small></div>
      <FormField label="审方药师" required><Select value={practitionerId} onChange={onPractitionerChange}
        placeholder="请选择药师" searchable showValue options={practitioners
          .filter((value) => value.sdPersonnelStatus === 'ACTIVE')
          .map((value) => ({ value: value.id, label: value.fullName, secondaryText: value.code }))} /></FormField>
      <FormField label="当前任职" required><Select value={assignmentId} onChange={onAssignmentChange}
        placeholder="请选择当前药房任职" options={assignments.map((value) => ({ value: value.id,
          label: `${value.positionName} · ${value.departmentName}`, secondaryText: value.code }))} /></FormField>
      <Button size="sm" busy={reviewAndReservePending} disabled={reviewAndReserveDisabled}
        onClick={onReviewAndReserve}>审方并预留{reviewableLines.length ? `（${reviewableLines.length}）` : ''}</Button>
    </div>}
    {intakeIncomplete && uniqueTaskLines.length > 0 && <Alert tone="warning">请先完成当前批次全部明细接方，再统一审方和预留库存。</Alert>}
    {reviewExceptions.length > 0 && <Alert tone="warning">当前有 {reviewExceptions.length} 条任务需要药师逐行干预或复核，不能批量通过。</Alert>}
    {duplicateTaskLinkCount > 0 && <Alert tone="warning">当前批次存在 {duplicateTaskLinkCount} 条重复任务关联，
      已按任务去重展示；为避免重复配药或发药，请刷新后转逐行核查。</Alert>}
    {uniqueTaskLines.length > 0 && <div className="pharmacy-ward-daily-supply__fulfillment">
      <div><strong>配药、发药与配送</strong><small>待配药 {pickingLines.length} · 待发药 {readyToDispenseLines.length} ·
        已发 {uniqueTaskLines.filter((line) => line.dispenseTaskStatus === 'COMPLETED').length}</small></div>
      <Button size="sm" variant="secondary" busy={completePickingPending} disabled={completePickingDisabled}
        onClick={onCompletePicking}>确认整批配药{pickingLines.length ? `（${pickingLines.length}）` : ''}</Button>
      <Button size="sm" busy={dispenseDeliverPending} disabled={dispenseDeliverDisabled}
        onClick={onDispenseDeliver}>{deliveryRecovery ? '恢复配送结果' : '整批发药并建配送单'}{
          readyToDispenseLines.length || recoverableIssuedLines.length
            ? `（${readyToDispenseLines.length || recoverableIssuedLines.length}）` : ''}</Button>
    </div>}
    {specialMedicationLines.length > 0 && <Alert tone="warning">当前有 {specialMedicationLines.length} 条受控或高警示药品，
      必须走双人核验的逐行流程，不能纳入普通整批发药。</Alert>}
    {deliveryNumbers.length > 0 && <Alert tone="success">已建立 {deliveryNumbers.length} 张待送出的病区配送单
      （每张最多 100 条）：{deliveryNumbers.join('、')}。
      请在配送交接区完成“确认送出”。</Alert>}
    {unmatchedPendingCount > 0 && <Alert tone="warning">当前有 {unmatchedPendingCount} 条待接方医嘱没有匹配的库存项目，
      暂不能批量接方。请先配置匹配库存项目，或使用逐行入口分别处理。</Alert>}
    <div className="pharmacy-ward-daily-supply__summary" aria-label="供药摘要">
      <SummaryMetric label="医嘱行" value={summary.totalLineCount} />
      <SummaryMetric label="已覆盖" value={summary.coveredLineCount} tone="success" />
      <SummaryMetric label="缺口" value={summary.gapLineCount} tone="warning" />
      <SummaryMetric label="已发" value={summary.issuedLineCount} />
      <SummaryMetric label="待退" value={summary.pendingReturnLineCount} tone="warning" />
      <SummaryMetric label="异常" value={summary.exceptionLineCount} tone="danger" />
    </div>
    {batch.lines.length === 0 ? <EmptyState icon="pharmacy" title="本班次没有需供药医嘱" copy="无需生成发药任务。" />
      : <div className="pharmacy-ward-daily-supply__lines">{batch.lines.map((line) => {
        const candidates = stockItemCandidates(line, stockItems)
        const stockItemId = selectedStockItemId(line, candidates, stockItemSelections)
        const canIntake = line.status === 'PENDING_INTAKE' || line.status === 'GAP' || line.status === 'EXCEPTION'
        const gap = Math.max(0, line.requestedQuantity - line.coveredQuantity)
        return <article key={line.id} className={line.status === 'EXCEPTION' || line.status === 'GAP' ? 'is-exception' : ''}
          aria-label={`${line.residentName} ${line.medicationName}`}>
          <div className="pharmacy-ward-daily-supply__identity"><strong>{line.bedNo ? `${line.bedNo}床 · ` : ''}{line.residentName}</strong>
            <span>{formatTime(line.scheduledAt)} · {line.medicationName}</span></div>
          <div className="pharmacy-ward-daily-supply__quantities"><span>需 {formatQuantity(line.requestedQuantity)}</span>
            <span>覆盖 {formatQuantity(line.coveredQuantity)}</span><span className={gap ? 'is-gap' : ''}>缺口 {formatQuantity(gap)}</span>
            <span>已发 {formatQuantity(line.issuedQuantity)}</span><span>待退 {formatQuantity(line.pendingReturnQuantity)} {line.unitCode}</span></div>
          <StatusBadge tone={lineTone(line.status)}>{lineStatusText[line.status] ?? line.status}</StatusBadge>
          {canIntake ? <div className="pharmacy-ward-daily-supply__intake">
            <Select aria-label={`库存项目 ${line.residentName} ${line.medicationName}`} value={stockItemId}
              placeholder="选择库存项目" emptyText="当前药房未配置匹配库存项目"
              options={candidates.map((item) => ({ value: item.id,
                label: `${item.productName} · ${item.packageSpec ?? item.packageUnitName}`, secondaryText: item.productCode }))}
              onChange={(value) => onStockItemChange(line.id, value)} />
            <Button size="sm" busy={intakePending} disabled={!stockItemId}
              aria-label={`接方 ${line.residentName} ${line.medicationName}`}
              onClick={() => onIntake(line, stockItemId)}>逐行接方</Button>
          </div> : <span className="pharmacy-ward-daily-supply__settled">本行无需接方</span>}
          {line.exceptionMessage && <p>{line.exceptionMessage}</p>}
        </article>
      })}</div>}
  </section>
}

function SummaryMetric({ label, value, tone = '' }: { label: string; value: number; tone?: string }) {
  return <div className={tone ? `is-${tone}` : ''}><span>{label}</span><strong>{value}</strong></div>
}

function stockItemCandidates(line: WardSupplyLine, stockItems: StockItem[]) {
  return stockItems.filter((item) => item.status === 'ACTIVE'
    && (line.catalogItemId ? item.catalogItemId === line.catalogItemId
      : line.medicationId ? item.medicationId === line.medicationId : item.id === line.stockItemId))
}

function selectedStockItemId(line: WardSupplyLine, candidates: StockItem[], selections: Record<string, string>) {
  const selected = selections[line.id] ?? line.stockItemId
  return candidates.some((item) => item.id === selected) ? selected! : candidates[0]?.id ?? ''
}

function uniqueLinesByTask(lines: WardSupplyLine[]) {
  const values = new Map<string, WardSupplyLine>()
  for (const line of lines) {
    if (line.dispenseTaskId && !values.has(line.dispenseTaskId)) values.set(line.dispenseTaskId, line)
  }
  return [...values.values()]
}

function lineTone(status: WardSupplyLine['status']) {
  if (status === 'COVERED' || status === 'ISSUED') return 'success' as const
  if (status === 'GAP' || status === 'RETURN_PENDING') return 'warning' as const
  if (status === 'EXCEPTION') return 'danger' as const
  if (status === 'CANCELLED') return 'neutral' as const
  return 'info' as const
}

function todayValue() {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function currentShift(): WardSupplyShiftCode {
  const hour = new Date().getHours()
  if (hour < 8) return 'NIGHT'
  if (hour < 16) return 'DAY'
  return 'EVENING'
}

function formatQuantity(value: number) {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 8 }).format(value)
}
