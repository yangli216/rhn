import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../../shared/rhnApi'
import { errorMessage } from '../../../shared/rhnApi'
import type { ReliefRecord, ReliefRecordFilter, ReliefRecordPage, ReliefRecordSummary } from '../../../shared/api/reliefApi'
import { formatTime } from '../../../shared/format'
import {
  Alert, Button, DataTable, EmptyState, FormField, LoadingState, Pagination, Select, StatusBadge, Tabs, tableCellClass,
} from '../../../shared/ui'
import { DateRangePicker } from '../../../shared/ui/DateRangePicker'
import { ListPage } from '../../../shared/ui/templates/PageTemplates'
import { useSystemEnum } from '../../../shared/ui/useSystemEnum'
import { getThisMonthRange } from '../../../shared/utils/dateRange'
import { money } from '../BillingShared'
import { recordsCsv } from './reliefRecordExport'
import './billing-relief.css'

const PAGE_SIZE = 50
const EXPORT_LIMIT = 5000
type View = 'summary' | 'detail'

function initialFilter(): ReliefRecordFilter {
  const range = getThisMonthRange()
  return { from: range.from, to: range.to, settledOnly: true }
}

/**
 * 惠民减免查询：按记录时间、政策、承担主体、时机与人工核定筛选减免和退费冲销记录，
 * 按政策与承担方汇总减免、冲销与净额，导出明细供民政、慈善等承担方对账报销。
 */
export function ReliefRecordQuery({ api }: { api: RhnApi }) {
  const sponsors = useSystemEnum(api.dictionaries, 'BIL_RELIEF_SPONSOR')
  const timings = useSystemEnum(api.dictionaries, 'BIL_RELIEF_TIMING')
  const [draft, setDraft] = useState<ReliefRecordFilter>(initialFilter)
  const [filter, setFilter] = useState<ReliefRecordFilter>(initialFilter)
  const [page, setPage] = useState(0)
  const [view, setView] = useState<View>('summary')
  const [exporting, setExporting] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'warning'; text: string } | null>(null)
  const policies = useQuery({ queryKey: ['relief-policies'], queryFn: () => api.relief.policies() })
  const records = useQuery({
    queryKey: ['relief-records', filter, page],
    queryFn: () => api.relief.records({ ...filter, page, size: PAGE_SIZE }),
    placeholderData: (previous) => previous,
  })
  const data = records.data
  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const exportCsv = async () => {
    setExporting(true); setFeedback(null)
    try {
      const all = await api.relief.records({ ...filter, page: 0, size: EXPORT_LIMIT })
      const url = URL.createObjectURL(new Blob(['﻿', recordsCsv(all.items)], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = `惠民减免明细_${filter.from}_${filter.to}.csv`; link.click()
      URL.revokeObjectURL(url)
      setFeedback(all.total > all.items.length
        ? { tone: 'warning', text: `结果共 ${all.total} 条，已导出前 ${all.items.length} 条；请缩小日期范围分批导出。` }
        : { tone: 'success', text: `已导出 ${all.items.length} 条减免明细` })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorMessage(error) })
    } finally {
      setExporting(false)
    }
  }

  return <div className="relief-page">
    <ListPage title="惠民减免查询" description="按政策与承担方汇总减免、退费冲销与净额，导出明细用于与承担方对账报销。"
      actions={<Button variant="secondary" busy={exporting} disabled={exporting || !total} onClick={() => void exportCsv()}>导出明细</Button>}
      feedback={feedback && <Alert tone={feedback.tone} onDismiss={() => setFeedback(null)}>{feedback.text}</Alert>}
      resetScrollKey={`${JSON.stringify(filter)}:${page}:${view}`}
      filters={<>
        <FormField label="减免日期" className="ui-query-filter--wide">
          <DateRangePicker value={{ from: draft.from, to: draft.to }}
            onChange={(range) => setDraft({ ...draft, from: range.from || draft.from, to: range.to || draft.to })} />
        </FormField>
        <FormField label="患者、结算单号或承担方" className="ui-query-filter--keyword">
          <input value={draft.keyword ?? ''} onChange={(event) => setDraft({ ...draft, keyword: event.target.value })} />
        </FormField>
        <FormField label="政策" className="ui-query-filter--wide">
          <Select value={draft.policyId ?? ''} placeholder="全部政策"
            options={(policies.data ?? []).map((policy) => ({ value: policy.id, label: policy.name }))}
            onChange={(value) => setDraft({ ...draft, policyId: value || undefined })} />
        </FormField>
        <FormField label="承担主体">
          <Select value={draft.sponsor ?? ''} placeholder="全部" options={sponsors.options}
            onChange={(value) => setDraft({ ...draft, sponsor: value || undefined })} />
        </FormField>
        <FormField label="减免时机">
          <Select value={draft.timing ?? ''} placeholder="全部" options={timings.options}
            onChange={(value) => setDraft({ ...draft, timing: value || undefined })} />
        </FormField>
        <FormField label="减免方式">
          <Select value={draft.manualOnly ? 'MANUAL' : ''} placeholder="全部"
            options={[{ value: 'MANUAL', label: '仅人工核定' }]}
            onChange={(value) => setDraft({ ...draft, manualOnly: value === 'MANUAL' })} />
        </FormField>
        <FormField label="结算状态">
          <Select value={draft.settledOnly ? 'SETTLED' : 'ALL'} clearable={false}
            options={[{ value: 'SETTLED', label: '仅已完成结算' }, { value: 'ALL', label: '全部' }]}
            onChange={(value) => setDraft({ ...draft, settledOnly: value === 'SETTLED' })} />
        </FormField>
        <div className="ui-query-filters__actions">
          <Button onClick={() => { setFilter({ ...draft, keyword: draft.keyword?.trim() || undefined }); setPage(0) }}>查询</Button>
          <Button variant="secondary" onClick={() => { const reset = initialFilter(); setDraft(reset); setFilter(reset); setPage(0) }}>重置</Button>
        </div>
      </>}
      footer={view === 'detail' && data && <Pagination label="减免明细分页" page={page} totalPages={totalPages} total={total}
        onChange={setPage} />}>
      {records.isPending ? <LoadingState label="正在查询惠民减免" />
        : records.isError ? <Alert placement="inline" duration={null}>{errorMessage(records.error)}</Alert>
          : !data || !total ? <EmptyState icon="billing" title="没有符合条件的减免记录" copy="调整日期范围或查询条件后重试。" />
            : <div className="relief-records">
              <RecordTotals data={data} />
              <Tabs label="查询结果" value={view} onChange={setView} items={[
                { value: 'summary', label: `按政策汇总（${data.summary.length}）` },
                { value: 'detail', label: `减免明细（${total}）` },
              ]} />
              {view === 'summary' ? <SummaryTable rows={data.summary} /> : <DetailTable rows={data.items} />}
            </div>}
    </ListPage>
  </div>
}

function RecordTotals({ data }: { data: ReliefRecordPage }) {
  return <dl className="relief-records__totals">
    <div><dt>减免金额</dt><dd>{money(data.reliefAmount)}</dd></div>
    <div><dt>退费冲销</dt><dd>{money(data.reversalAmount)}</dd></div>
    <div><dt>减免净额</dt><dd><strong>{money(data.netAmount)}</strong></dd></div>
    <div><dt>享受人数</dt><dd>{data.patientCount ?? 0}</dd></div>
  </dl>
}

function SummaryTable({ rows }: { rows: ReliefRecordSummary[] }) {
  return <DataTable aria-label="按政策汇总">
    <thead><tr>
      <th>政策</th>
      <th>承担主体</th>
      <th>承担方</th>
      <th className={tableCellClass('numeric')}>减免笔数</th>
      <th className={tableCellClass('numeric')}>享受人数</th>
      <th className={tableCellClass('numeric')}>减免金额</th>
      <th className={tableCellClass('numeric')}>冲销笔数</th>
      <th className={tableCellClass('numeric')}>冲销金额</th>
      <th className={tableCellClass('numeric')}>净额</th>
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={`${row.policyId}-${row.payerName ?? ''}`}>
      <td>{row.policyName ?? row.policyCode}</td>
      <td>{row.sponsorText ?? row.sponsor}</td>
      <td>{row.payerName || '—'}</td>
      <td className={tableCellClass('numeric')}>{row.reliefCount}</td>
      <td className={tableCellClass('numeric')}>{row.patientCount}</td>
      <td className={tableCellClass('numeric')}>{money(row.reliefAmount)}</td>
      <td className={tableCellClass('numeric')}>{row.reversalCount}</td>
      <td className={tableCellClass('numeric')}>{money(row.reversalAmount)}</td>
      <td className={tableCellClass('numeric')}><strong>{money(row.netAmount)}</strong></td>
    </tr>)}</tbody>
  </DataTable>
}

function DetailTable({ rows }: { rows: ReliefRecord[] }) {
  return <DataTable aria-label="减免明细">
    <thead><tr>
      <th>减免时间</th>
      <th>结算单号</th>
      <th>患者</th>
      <th>政策</th>
      <th>承担方</th>
      <th className={tableCellClass('numeric')}>计算基数</th>
      <th className={tableCellClass('numeric')}>减免金额</th>
      <th>资格或核定依据</th>
      <th>经办人</th>
      <th className={tableCellClass('status')}>结算状态</th>
    </tr></thead>
    <tbody>{rows.map((row) => <tr key={row.id}>
      <td>{formatTime(row.occurredAt) || '—'}</td>
      <td>
        {row.settlementNo ?? '—'}
        {row.reversal && <span className="relief-records__sub">冲销原结算 {row.originalSettlementNo ?? '—'}</span>}
      </td>
      <td>
        {row.residentName ?? '—'}
        <span className="relief-records__sub">{[row.healthRecordNo, row.genderText].filter(Boolean).join(' · ')}</span>
      </td>
      <td>
        {row.policyName ?? row.policyCode}{row.versionNo ? ` V${row.versionNo}` : ''}
        <span className="relief-records__sub">{row.timingText ?? row.timing}</span>
      </td>
      <td>{row.payerName || row.sponsorText || row.sponsor}</td>
      <td className={tableCellClass('numeric')}>{row.reversal ? '—' : money(row.baseAmount)}</td>
      <td className={tableCellClass('numeric')}>
        {row.reversal && <StatusBadge tone="warning">冲销</StatusBadge>} {money(row.reliefAmount)}
      </td>
      <td>
        {row.manual
          ? <>{row.manualReason}<span className="relief-records__sub">
            人工核定{row.manualEvidence ? ` · ${row.manualEvidence}` : ''}{row.approvedByName ? ` · ${row.approvedByName}` : ''}
          </span></>
          : row.qualificationText || '—'}
      </td>
      <td>{row.operatorName || '—'}</td>
      <td className={tableCellClass('status')}>{row.settlementStatusText ?? row.settlementStatus ?? '—'}</td>
    </tr>)}</tbody>
  </DataTable>
}
