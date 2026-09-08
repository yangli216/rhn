import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../app/AppShell'
import type { SettlementRecord } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Panel, SearchField,
  Select, StatusBadge } from '../../shared/ui'
import { Icon } from '../../shared/ui/Icon'
import { formatTime } from '../../shared/format'
import { money } from './BillingShared'
import './billing-query-workspace.css'

const sceneOptions = [
  { value: 'ALL', label: '全部业务场景' },
  { value: 'OUTPATIENT', label: '门诊收费' },
  { value: 'REGISTRATION', label: '挂号收费' },
  { value: 'PHARMACY', label: '药房收费' },
  { value: 'INPATIENT', label: '住院收费' },
  { value: 'HOME_BED', label: '家庭病床' },
]

const typeOptions = [
  { value: 'ALL', label: '全部结算类型' },
  { value: 'NORMAL', label: '正常结算' },
  { value: 'REVERSAL', label: '冲正结算' },
  { value: 'SUPPLEMENT', label: '补充结算' },
]

const sceneText: Record<string, string> = {
  OUTPATIENT: '门诊收费', REGISTRATION: '挂号收费', PHARMACY: '药房收费',
  INPATIENT: '住院收费', HOME_BED: '家庭病床',
}

const typeText: Record<string, string> = {
  NORMAL: '正常结算', REVERSAL: '冲正结算', SUPPLEMENT: '补充结算',
}

const tenderText: Record<string, string> = {
  CASH: '现金', BANK_CARD: '银行卡', DIGITAL: '移动支付', PERSONAL_ACCOUNT: '医保个人账户',
  COMMERCIAL_INSURANCE: '商业保险',
}

const receiptStatusText: Record<string, string> = {
  REQUESTED: '开具中', ISSUED: '已开具', FAILED: '开具失败', VOIDED: '已作废', RED_FLUSHED: '已冲红',
}

export function BillingQueryWorkspace({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const [keyword, setKeyword] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [scene, setScene] = useState('ALL')
  const [settlementType, setSettlementType] = useState('ALL')
  const [selectedId, setSelectedId] = useState('')

  const records = useQuery({
    queryKey: ['billing-settlement-records'],
    queryFn: () => api.billing.settlementRecords(200),
  })
  const filteredRecords = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    return (records.data ?? []).filter((record) => {
      const occurredDate = (record.finalizedAt ?? record.createdAt).slice(0, 10)
      if (dateFrom && occurredDate < dateFrom) return false
      if (dateTo && occurredDate > dateTo) return false
      if (scene !== 'ALL' && record.settlementScene !== scene) return false
      if (settlementType !== 'ALL' && record.settlementType !== settlementType) return false
      if (!normalized) return true
      return [record.settlementNo, record.id, record.residentName, record.healthRecordNo,
        record.encounterNo, record.residentId, record.encounterId]
        .some((value) => String(value ?? '').toLowerCase().includes(normalized))
    })
  }, [dateFrom, dateTo, keyword, records.data, scene, settlementType])

  useEffect(() => {
    if (!filteredRecords.length) {
      if (selectedId) setSelectedId('')
      return
    }
    if (!filteredRecords.some((record) => record.id === selectedId)) setSelectedId(filteredRecords[0].id)
  }, [filteredRecords, selectedId])

  const selected = filteredRecords.find((record) => record.id === selectedId)
  const settlement = useQuery({
    queryKey: ['billing-settlement', selected?.id],
    queryFn: () => api.billing.settlement(selected!.id),
    enabled: Boolean(selected?.id),
  })
  const statement = useQuery({
    queryKey: ['billing-statement', selected?.encounterId],
    queryFn: () => api.billing.statement(selected!.encounterId!),
    enabled: Boolean(selected?.encounterId),
  })
  const receipts = useQuery({
    queryKey: ['billing-settlement-receipts', selected?.id],
    queryFn: () => api.billing.settlementReceipts(selected!.id),
    enabled: Boolean(selected?.id),
  })
  const chargeById = useMemo(() => new Map((statement.data?.charges ?? [])
    .map((charge) => [charge.id, charge])), [statement.data?.charges])
  const totalAmount = filteredRecords.reduce((sum, record) => sum + record.netAmount, 0)
  const error = records.error || settlement.error || statement.error || receipts.error
  const hasFilters = Boolean(keyword || dateFrom || dateTo || scene !== 'ALL' || settlementType !== 'ALL')

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['billing-settlement-records'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-settlement'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-statement'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-settlement-receipts'] }),
  ])

  const resetFilters = () => {
    setKeyword(''); setDateFrom(''); setDateTo(''); setScene('ALL'); setSettlementType('ALL')
  }

  return <div className="billing-query-page">
    <PageHeader eyebrow="收费管理" title="收费查询" description="查询已完成结算的收费记录，核对费用、支付分摊与电子票据。"
      actions={<Button variant="secondary" onClick={() => void refresh()}><Icon name="refresh" />刷新</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="billing-query-filters" aria-label="收费查询条件">
      <SearchField value={keyword} onChange={setKeyword} label="收费记录"
        placeholder="姓名 / 门诊号 / 档案号 / 结算单号" />
      <FormField label="结算日期起"><input type="date" value={dateFrom}
        onChange={(event) => setDateFrom(event.target.value)} /></FormField>
      <FormField label="结算日期止"><input type="date" value={dateTo}
        onChange={(event) => setDateTo(event.target.value)} /></FormField>
      <FormField label="业务场景"><Select value={scene} options={sceneOptions} onChange={setScene} /></FormField>
      <FormField label="结算类型"><Select value={settlementType} options={typeOptions}
        onChange={setSettlementType} /></FormField>
      <div className="billing-query-filters__summary">
        <span>{clinicalContext.organization.name}</span><strong>{filteredRecords.length} 笔 · {money(totalAmount)}</strong>
      </div>
      {hasFilters && <Button size="sm" variant="secondary" onClick={resetFilters}>重置</Button>}
    </div>

    <div className="billing-query-scroll">
      {records.isPending ? <LoadingState label="正在加载已结算收费记录…" />
        : <div className="billing-query-workspace">
          <Panel className="billing-query-list" aria-label="已结算收费记录">
            <header className="billing-section-head"><div className="billing-section-head__title">
              <h2>已结算记录</h2><span>最近 {records.data?.length ?? 0} 笔</span></div></header>
            {!filteredRecords.length ? <EmptyState icon="billing" title="暂无匹配记录"
              copy={hasFilters ? '请调整查询条件后重试。' : '当前机构暂无已完成的收费结算。'} />
              : <div className="billing-query-list__items">{filteredRecords.map((record) => {
                return <button key={record.id} type="button" className={record.id === selectedId ? 'is-active' : ''}
                  onClick={() => setSelectedId(record.id)} aria-label={`结算记录 ${record.settlementNo}`}>
                  <div><strong>{record.residentName}</strong>
                    <b>{money(record.netAmount, record.currencyCode)}</b></div>
                  <span>{record.settlementNo}</span>
                  <small>{sceneText[record.settlementScene] ?? record.settlementScene} · {formatTime(record.finalizedAt ?? record.createdAt)}</small>
                </button>
              })}</div>}
          </Panel>

          <Panel className="billing-query-detail" aria-label="收费记录详情">
            {!selected ? <EmptyState icon="billing" title="请选择收费记录" copy="左侧选择后查看结算、支付与票据信息。" />
              : settlement.isPending || (Boolean(selected.encounterId) && statement.isPending) || receipts.isPending
                ? <LoadingState label="正在加载收费记录详情…" />
                : <SettlementRecordDetail record={selected} settlement={settlement.data}
                  chargeById={chargeById} receipts={receipts.data ?? []} />}
          </Panel>
        </div>}
    </div>
  </div>
}

function SettlementRecordDetail({ record, settlement, chargeById, receipts }: {
  record: SettlementRecord
  settlement?: Awaited<ReturnType<RhnApi['billing']['settlement']>>
  chargeById: Map<string, Awaited<ReturnType<RhnApi['billing']['statement']>>['charges'][number]>
  receipts: Awaited<ReturnType<RhnApi['billing']['settlementReceipts']>>
}) {
  return <>
    <header className="billing-query-detail__head">
      <div><span className="ui-eyebrow">{sceneText[record.settlementScene] ?? record.settlementScene}</span>
        <h2>{record.settlementNo}</h2>
        <p>{formatDateTime(record.finalizedAt ?? record.createdAt)} · {record.terminalCode ?? '未记录终端'}</p></div>
      <StatusBadge tone={record.settlementType === 'REVERSAL' ? 'warning' : 'success'}>
        {typeText[record.settlementType] ?? record.settlementType}
      </StatusBadge>
    </header>
    <div className="billing-query-identity">
      <strong>{record.residentName}</strong>
      <span>档案号 {record.healthRecordNo}</span>
      <span>门诊号 {record.encounterNo ?? record.encounterId ?? '--'}</span>
      <span>{record.departmentName ?? `科室 ${record.departmentId}`}</span>
    </div>
    <dl className="billing-query-metrics">
      <div><dt>结算金额</dt><dd>{money(record.netAmount, record.currencyCode)}</dd></div>
      <div><dt>个人支付</dt><dd>{money(record.patientAmount, record.currencyCode)}</dd></div>
      <div><dt>医保支付</dt><dd>{money(record.insuranceAmount, record.currencyCode)}</dd></div>
      <div><dt>其他支付</dt><dd>{money(record.otherAmount, record.currencyCode)}</dd></div>
      <div><dt>优惠 / 舍入</dt><dd>{money(record.discountAmount + record.roundingAmount, record.currencyCode)}</dd></div>
    </dl>
    <section className="billing-query-section">
      <header><h3>收费项目</h3><span>{settlement?.lines.length ?? 0} 项</span></header>
      {!settlement?.lines.length ? <p className="billing-query-section__empty">未查询到收费项目明细。</p>
        : <div className="billing-query-table-wrap"><table className="billing-query-table"><thead><tr>
          <th>项目名称</th><th>项目编码</th><th>数量</th><th>单价</th><th>结算金额</th>
        </tr></thead><tbody>{settlement.lines.map((line) => {
          const charge = chargeById.get(line.chargeItemId)
          return <tr key={line.id}><td><strong>{charge?.itemName ?? `收费项目 ${line.chargeItemId}`}</strong>
            {charge?.packageSpec && <small>{charge.packageSpec}</small>}</td>
            <td><code>{charge?.itemCode ?? '--'}</code></td>
            <td>{line.settledQuantity} {charge?.unitName ?? charge?.unitCode ?? ''}</td>
            <td>{money(charge?.unitPrice, record.currencyCode)}</td><td><strong>{money(line.netAmount, record.currencyCode)}</strong></td>
          </tr>
        })}</tbody></table></div>}
    </section>
    <div className="billing-query-lower">
      <section className="billing-query-section">
        <header><h3>支付分摊</h3><span>{settlement?.tenders.length ?? 0} 笔</span></header>
        <div className="billing-query-compact-list">{settlement?.tenders.map((tender) => <div key={tender.id}>
          <span><strong>{tenderText[tender.tenderType] ?? tender.tenderType}</strong>
            <small>{tender.payerName ?? '收费窗口'}</small></span>
          <b>{money(tender.amount, tender.currencyCode)}</b>
        </div>)}{!settlement?.tenders.length && <p>未记录支付分摊。</p>}</div>
      </section>
      <section className="billing-query-section">
        <header><h3>电子票据</h3><span>{receipts.length} 张</span></header>
        <div className="billing-query-compact-list">{receipts.map((receipt) => <div key={receipt.id}>
          <span><strong>{receipt.fiscalNumber ?? receipt.receiptNo}</strong>
            <small>{receiptStatusText[receipt.status] ?? receipt.status}</small></span>
          <StatusBadge tone={receipt.status === 'ISSUED' ? 'success'
            : receipt.status === 'FAILED' ? 'danger' : 'neutral'}>{receiptStatusText[receipt.status] ?? receipt.status}</StatusBadge>
        </div>)}{!receipts.length && <p>当前结算单暂无电子票据。</p>}</div>
      </section>
    </div>
  </>
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
