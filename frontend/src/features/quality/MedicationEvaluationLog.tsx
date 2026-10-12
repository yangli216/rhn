import { useState } from 'react'
import { observationScope } from '../../shared/api/observationScope'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, DataTable, DateRangePicker, Dialog, FormField, LoadingState, Pagination, Select, TableShell } from '../../shared/ui'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'
import { decisionModes, labelOf, medicationEvaluationDecisions, observationDates, observationRange, observationTime } from '../../shared/presentation/decisionObservation'
import './medication-evaluation-log.css'

const severityLabels: Record<string, { label: string; tone: string }> = {
  CRITICAL: { label: '极高风险', tone: 'critical' },
  HIGH: { label: '高风险', tone: 'high' },
  MODERATE: { label: '中度风险', tone: 'moderate' },
  LOW: { label: '低风险', tone: 'low' },
  INFO: { label: '提示信息', tone: 'info' },
}

function parseSnapshot(raw: unknown): Record<string, unknown> {
  if (!raw) return {}
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>
    } catch {}
  }
  return {}
}

function getMedicationName(item: any, index: number): string {
  const snap = parseSnapshot(item.medicationSnapshot)
  const name = snap.name || snap.NA_MED || snap.medicationName || item.medicationName || item.name
  if (name && typeof name === 'string') return name
  return `药品明细 #${item.medicationId ?? item.medicationRequestId ?? index + 1}`
}

function getMedicationSpec(item: any): string {
  const snap = parseSnapshot(item.medicationSnapshot)
  const spec = snap.specification || snap.spec || snap.SPEC || item.specification
  return typeof spec === 'string' ? spec : ''
}

export function MedicationEvaluationLog({ api }: { api: RhnApi }) {
  const scopeKey = observationScope(api)
  const [dates, setDates] = useState(() => observationRange())
  const [mode, setMode] = useState(''), [decision, setDecision] = useState(''), [prescriptionId, setPrescriptionId] = useState('')
  const [filter, setFilter] = useState(() => ({ ...observationDates(dates.from, dates.to), mode: '', decision: '', prescriptionId: '', page: 0 }))
  const [selected, setSelected] = useState<string>()
  const query = useQuery({ queryKey: ['medication-evaluation-records', scopeKey, filter], queryFn: () => api.medicationWorkbench.evaluationRecords(filter), retry: false })
  const data = query.isError ? undefined : query.data
  return <div className="medication-evaluation-log"><WorkspacePane label="真实处方审查结果" scroll="content" header={<>
    <div className="medication-evaluation-log__filters ui-query-filters">
      <FormField label="审查模式" className="medication-evaluation-log__filter-field--mode">
        <Select aria-label="审查模式" value={mode} onChange={setMode} options={[{ value: 'SHADOW', label: '旁路观察' }, { value: 'ENFORCED', label: '正式审查' }]} placeholder="全部模式" />
      </FormField>
      <FormField label="评价结论" className="medication-evaluation-log__filter-field--decision">
        <Select aria-label="评价结论" value={decision} onChange={setDecision} options={Object.entries(medicationEvaluationDecisions).map(([value, label]) => ({ value, label }))} placeholder="全部结论" />
      </FormField>
      <FormField label="处方 ID" className="ui-query-filter--keyword">
        <input aria-label="处方 ID" value={prescriptionId} onChange={e => setPrescriptionId(e.target.value)} inputMode="numeric" />
      </FormField>
      <FormField label="审查日期范围" className="medication-evaluation-log__filter-field--date">
        <DateRangePicker value={dates} onChange={setDates} />
      </FormField>
      <div className="ui-query-filters__actions">
        <Button disabled={!dates.from || !dates.to || dates.from > dates.to || query.isFetching || Boolean(prescriptionId && !/^\d+$/.test(prescriptionId))}
          onClick={() => { setFilter({ ...observationDates(dates.from, dates.to), mode, decision, prescriptionId, page: 0 }); setSelected(undefined) }}>查询</Button>
        <Button variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>刷新日志</Button>
      </div>
    </div>{query.error && <Alert tone="error">{errorMessage(query.error)}</Alert>}
  </>}>
    <TableShell scrollLabel="处方审查记录" resetScrollKey={JSON.stringify(filter)} footer={<Pagination page={filter.page}
      totalPages={Math.max(1, data?.totalPages ?? 1)} total={Number(data?.totalElements ?? 0)} pageSize={20}
      onChange={page => setFilter(v => ({ ...v, page }))} label="处方审查分页" />}>
      {query.isPending ? <LoadingState label="正在拉取真实处方审查流水记录…" /> : data && <DataTable aria-label="处方质量审查记录">
        <thead><tr><th>评价 ID／时间</th><th>处方 ID／就诊 ID</th><th>规则集</th><th>模式</th><th>评价结论</th><th>风险项数</th><th>操作</th></tr></thead>
        <tbody>{data.content?.map(ev => <tr key={ev.evaluationId}>
          <td><code>{ev.evaluationId}</code><br />{observationTime(ev.completedAt)}</td><td><span>{ev.prescriptionId}</span><br /><span>{ev.encounterId}</span></td>
          <td>{ev.ruleSetVersion}</td><td>{ev.mode === 'ENFORCED' ? '正式审查' : labelOf(decisionModes, ev.mode)}</td>
          <td>{labelOf(medicationEvaluationDecisions, ev.decision)}</td><td>{ev.findingCount ? `${ev.findingCount} 项风险` : '未记录命中项'}</td>
          <td><Button size="sm" variant="secondary" onClick={() => setSelected(ev.evaluationId)}>查看详情</Button></td>
        </tr>)}{!data.content?.length && <tr><td colSpan={7}>当前范围暂无处方安全评价流水记录。请核对时间范围与筛选条件；适用业务触发后才会产生记录。</td></tr>}</tbody>
      </DataTable>}
    </TableShell>
  </WorkspacePane>
  {selected && <EvaluationDetail key={`${scopeKey}-${selected}`} api={api} id={selected} onClose={() => setSelected(undefined)} />}
  </div>
}

function EvaluationDetail({ api, id, onClose }: { api: RhnApi; id: string; onClose: () => void }) {
  const scopeKey = observationScope(api)
  const query = useQuery({ queryKey: ['medication-evaluation-detail', scopeKey, id], queryFn: () => api.medicationWorkbench.evaluationDetail(id), retry: false, gcTime: 0 })
  const detail = query.isError ? undefined : query.data
  const [copied, setCopied] = useState(false)

  const copyRawJson = () => {
    if (!detail) return
    const raw = JSON.stringify(detail, null, 2)
    void navigator.clipboard?.writeText(raw)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const result = detail?.result as Record<string, any> | undefined
  const findings = Array.isArray(result?.findings) ? result.findings : []
  const failureCodes = Array.isArray(result?.failureCodes) ? result.failureCodes : []
  const ruleExecutions = Array.isArray(result?.ruleExecutions) ? result.ruleExecutions : []

  const input = detail?.input as Record<string, any> | undefined
  const medications = Array.isArray(input?.medications) ? input.medications : (Array.isArray(input?.items) ? input.items : [])

  const decision = detail?.summary?.decision || result?.decision
  const decisionText = labelOf(medicationEvaluationDecisions, decision)

  return <Dialog title="处方审查详情" size="xwide" onClose={onClose}>
    {query.isPending && <LoadingState label="正在读取审查详情…" />}
    {query.error && <Alert tone="error">{errorMessage(query.error)}</Alert>}
    {detail && (
      <div className="medication-evaluation-detail">
        {/* 头部摘要与操作 */}
        <div className="medication-evaluation-detail__head">
          <div className="medication-evaluation-detail__meta">
            <span>评价流水: <strong>{detail.summary?.evaluationId || id}</strong></span>
            <span>处方号: <strong>{detail.summary?.prescriptionId || '—'}</strong></span>
            <span>就诊号: <strong>{detail.summary?.encounterId || '—'}</strong></span>
            <span>时间: {observationTime(detail.summary?.completedAt)}</span>
            <span>模式: {detail.summary?.mode === 'ENFORCED' ? '正式审查' : '旁路观察'}</span>
            <span>规则集: {detail.summary?.ruleSetVersion || '—'}</span>
            <span className={`medication-evaluation-detail__badge medication-evaluation-detail__badge--${decision === 'PASS' ? 'success' : decision === 'WARN' || decision === 'REQUIRE_OVERRIDE' ? 'warning' : decision === 'BLOCK' ? 'error' : 'neutral'}`}>
              {decisionText}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={copyRawJson}>
            {copied ? '已复制 JSON' : '拷贝原始 JSON'}
          </Button>
        </div>

        {/* 异常与缺失信息提示 */}
        {failureCodes.length > 0 && (
          <div className="medication-evaluation-detail__failures">
            异常与未完成项代码：<strong>{failureCodes.join('、')}</strong>
          </div>
        )}

        {/* 命中风险规则详情 */}
        <div className="medication-evaluation-detail__section">
          <h3 className="medication-evaluation-detail__section-title">
            安全审查结论与命中风险 {findings.length > 0 ? `(${findings.length} 项)` : ''}
          </h3>
          {findings.length > 0 ? (
            <div className="medication-evaluation-findings">
              {findings.map((f: any, idx: number) => {
                const sev = f.severity?.toUpperCase() || 'INFO'
                return (
                  <div key={f.findingId || idx} className={`medication-evaluation-finding-card is-${sev.toLowerCase()}`}>
                    <div className="medication-evaluation-finding-card__header">
                      <span className="medication-evaluation-finding-card__severity">
                        {severityLabels[sev]?.label || sev}
                      </span>
                      {f.category && <span className="medication-evaluation-finding-card__category">[{f.category}]</span>}
                      <span className="medication-evaluation-finding-card__title">{f.ruleCode || '规则提示'}</span>
                    </div>
                    {f.message && <div className="medication-evaluation-finding-card__msg">{f.message}</div>}
                    {f.suggestedAction && (
                      <div className="medication-evaluation-finding-card__action">
                        <strong>处置建议：</strong>{f.suggestedAction}
                      </div>
                    )}
                    {Array.isArray(f.evidence) && f.evidence.length > 0 && (
                      <div className="medication-evaluation-finding-card__evidence">
                        循证依据：{f.evidence.map((ev: any) => ev.sourceTitle ? `${ev.sourceTitle}${ev.excerpt ? `: ${ev.excerpt}` : ''}` : ev.excerpt || '').filter(Boolean).join('；')}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="medication-evaluation-detail__empty-findings">
              未记录命中项（本次审查未触发阻断或预警规则）
            </div>
          )}
        </div>

        {/* 处方药品明细 */}
        {medications.length > 0 && (
          <div className="medication-evaluation-detail__section">
            <h3 className="medication-evaluation-detail__section-title">审查处方药品明细 ({medications.length} 项)</h3>
            <DataTable aria-label="处方药品明细">
              <thead>
                <tr>
                  <th>序号</th>
                  <th>药品名称 / 规格</th>
                  <th>单次剂量</th>
                  <th>频次</th>
                  <th>给药途径</th>
                  <th>疗程</th>
                </tr>
              </thead>
              <tbody>
                {medications.map((item: any, idx: number) => (
                  <tr key={item.medicationRequestId || idx}>
                    <td>{idx + 1}</td>
                    <td>
                      <strong>{getMedicationName(item, idx)}</strong>
                      {getMedicationSpec(item) && <div className="item-spec">{getMedicationSpec(item)}</div>}
                    </td>
                    <td>{item.doseValue != null ? `${item.doseValue} ${item.doseUnit || ''}` : '—'}</td>
                    <td>{item.frequencyCode || '—'}</td>
                    <td>{item.routeCode || '—'}</td>
                    <td>{item.durationValue != null ? `${item.durationValue} ${item.durationUnit || '天'}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}

        {/* 规则执行明细（若有） */}
        {ruleExecutions.length > 0 && (
          <div className="medication-evaluation-detail__section">
            <h3 className="medication-evaluation-detail__section-title">规则执行明细 ({ruleExecutions.length} 条规则)</h3>
            <DataTable aria-label="规则执行明细">
              <thead>
                <tr>
                  <th>规则编码</th>
                  <th>版本</th>
                  <th>执行结论</th>
                  <th>异常说明</th>
                </tr>
              </thead>
              <tbody>
                {ruleExecutions.map((rx: any, idx: number) => (
                  <tr key={rx.ruleCode || idx}>
                    <td><code>{rx.ruleCode}</code></td>
                    <td>v{rx.ruleVersion || 1}</td>
                    <td>{rx.outcome || '—'}</td>
                    <td>{rx.failureCode || '无'}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </div>
        )}
      </div>
    )}
  </Dialog>
}

