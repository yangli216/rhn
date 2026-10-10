import { displayUnitName } from "../medicationDisplay";
import type { PharmacyReviewResult } from "../../../shared/api/pharmacyApi";
import { formatTime } from "../../../shared/format";
import { errorMessage } from "../../../shared/rhnApi";
import { Alert, Button, EmptyState, FormField, Icon, LoadingState, PageHeader, Panel, Select, StatusBadge } from "../../../shared/ui";
import { WardDailySupplyPanel } from "../WardDailySupplyPanel";
import { WardMedicationReturnInbox } from "../WardMedicationReturnInbox";
import { PharmacyKnowledgeImprovement } from "../PharmacyKnowledgeImprovement";
import { PharmacyMedicationSafety } from "../PharmacyMedicationSafety";
import { usePharmacyWorkspace } from './usePharmacyWorkspace'
import { WardDeliveryQueue } from './WardDeliveryQueue'
import { statusTone, taskStatusText, formatQuantityWithUnit, requestPackageUnit, formatRequestQuantity, formatPackageConversion, assignmentOption, reviewText } from './pharmacyShared'

export function PharmacyOperationsPanel({ model }: { model: ReturnType<typeof usePharmacyWorkspace> }) {
 const { mode, prescriptionReviewMode, copy, refresh, selected, error, sites, selectedSite, api, organizationId, stockItems, practitioners, eligibleAssignments, practitionerId, assignmentId, setPractitionerId, setAssignmentId, eligibleSites, inbox, displayInbox, visibleInbox, requestId, setRequestId, task, configuredReviewMode, canReview, reviewResult, setReviewResult, reasonCode, setReasonCode, description, setDescription, review, returnLineId, setReturnLineId, returnableLines, selectedReturnLine, returnQuantity, setReturnQuantity, returnDisposition, setReturnDisposition, returnReason, setReturnReason, returnMedication, trace } = model

    const reviewModeLabel = mode === 'review' && prescriptionReviewMode.data?.enabled
      ? prescriptionReviewMode.data.mode === 'PRE_DISPENSE' ? '事前审方' : '事后审方'
      : ''
    return <>
      <PageHeader eyebrow={copy.eyebrow} title={copy.title} description={copy.description}
        actions={<>{reviewModeLabel && <StatusBadge tone="info">{reviewModeLabel}</StatusBadge>}
          <Button variant="secondary" onClick={() => void refresh(selected?.taskId)}><Icon name="refresh" />刷新队列</Button></>} />
      {error && <Alert>{errorMessage(error)}</Alert>}
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
          copy="病区配送仅对住院或混合服务范围的药房开放，请在顶部栏切换到相应药房后继续。" /></Panel>}
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
          <header className="pharmacy-section-head"><div><h2>{copy.queueTitle}</h2><span>{displayInbox.length} / {visibleInbox.length} 条</span></div></header>
          {!displayInbox.length ? <EmptyState icon="pharmacy" title={copy.emptyTitle} copy={copy.emptyCopy} />
            : <div className="pharmacy-queue__list">{displayInbox.map((item) => <Button type="button"
              className={item.request.id === requestId ? 'is-selected' : ''} key={item.request.id}
              onClick={() => setRequestId(item.request.id)} variant="text" size="sm">
              <div className="pharmacy-queue__title"><strong>{item.request.medicationName}</strong>
                <StatusBadge tone={statusTone(item.taskStatus)}>{taskStatusText[item.taskStatus ?? ''] ?? '待接方'}</StatusBadge></div>
              <span>{item.request.itemName} · {formatQuantityWithUnit(item.request.quantity,
                requestPackageUnit(item.request.quantityUnit, item.request.packageUnitName))}</span>
              <small>{item.request.requestNo} · {formatTime(item.request.authoredAt)}</small>
            </Button>)}</div>}
        </Panel>
        <Panel className="pharmacy-detail">
          {!selected ? <EmptyState icon="pharmacy" title="请选择一条处方" copy="左侧选择后可继续处理当前业务。" />
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
                {mode === 'review' && <PharmacyMedicationSafety reviews={task.data.prescriptionSafety} />}
                {mode === 'review' && <section className="pharmacy-action-section pharmacy-action-section--primary">
                  <p>当前审方结论作用于本条药品任务；上方配对提示来自整张处方。</p>
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
                  {task.data.reviews.length > 0 && <div className="pharmacy-safety-findings" aria-label="药师处理结果">
                    {task.data.reviews.map((result) => <article key={result.id}>
                      <strong>{reviewText[result.result]}</strong> · {formatTime(result.reviewedAt)}
                      <p>{result.description || '未填写补充说明'}</p>
                      <PharmacyKnowledgeImprovement api={api} taskId={task.data!.id} reviewId={result.id}
                        findings={(task.data!.prescriptionSafety ?? []).flatMap(r => r.evaluation.findings)
                          .filter(f => !f.medicationRequestIds.length || f.medicationRequestIds.some(id => task.data!.lines.some(line => line.requestId === id)))} />
                    </article>)}
                  </div>}
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
                {mode === 'returns' && !!trace.data?.events.length && <div className="pharmacy-trace-list">
                  {trace.data.events.map((event) => <article key={event.id}>
                    <StatusBadge tone={event.dispenseType === 'RETURN' ? 'warning' : 'success'}>
                      {event.dispenseType}</StatusBadge>
                    <div><strong>{event.dispenseNo}</strong><span>{event.lines.map((line) =>
                      `${line.lotNo} ${formatQuantityWithUnit(line.quantityDispensed,
                        displayUnitName(line.dispenseUnitCode))}`).join('；')}</span></div>
                    <time>{formatTime(event.occurredAt)}</time>
                  </article>)}
                </div>}
              </>)}
            </>}
        </Panel>
      </div>}
    </>

}
