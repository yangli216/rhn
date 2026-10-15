import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ClinicalContext } from '../../shared/clinical/workContext'
import type { SettlementRecord } from '../../shared/api/billingApi'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import {
  Alert, Button, EmptyState, FormField, LoadingState, PageHeader, Pagination, Panel,
  Select, StatusBadge, tableCellClass,
  useSystemEnum,
} from '../../shared/ui'
import { DateRangePicker } from '../../shared/ui/DateRangePicker'
import { formatDate, getTodayRange, type DateRange } from '../../shared/utils/dateRange'
import { Icon } from '../../shared/ui/Icon'
import { money } from './BillingShared'
import './billing-query-workspace.css'

export function BillingQueryWorkspace({ api, clinicalContext }: {
  api: RhnApi
  clinicalContext: ClinicalContext
}) {
  const queryClient = useQueryClient()
  const scenes = useSystemEnum(api.dictionaries, 'BIL_SETTLEMENT_SCENE')
  const settlementTypes = useSystemEnum(api.dictionaries, 'BIL_SETTLEMENT_TYPE')
  const sceneOptions = [{ value: 'ALL', label: '全部业务场景' }, ...scenes.options]
  const typeOptions = [{ value: 'ALL', label: '全部结算类型' }, ...settlementTypes.options]
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [dateRange, setDateRange] = useState<DateRange>(getTodayRange)
  const [cashier, setCashier] = useState('')
  const [submittedCashier, setSubmittedCashier] = useState('')
  const [scene, setScene] = useState('ALL')
  const [settlementType, setSettlementType] = useState('ALL')
  const [selectedId, setSelectedId] = useState('')
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const records = useQuery({
    queryKey: ['billing-settlement-records', clinicalContext.organization.id, clinicalContext.department.id, dateRange.from, dateRange.to, submittedCashier],
    queryFn: async () => {
      const data = await api.billing.settlementRecords(500, { ...dateRange, cashier: submittedCashier })
      if (!Array.isArray(data) || data.some((record) => !record || !record.id || !record.createdAt
        || ![record.netAmount, record.patientAmount, record.insuranceAmount].every(Number.isFinite))) {
        throw new Error('收费记录返回不完整，无法确认查询结果')
      }
      return data
    },
  })

  const filteredRecords = useMemo(() => {
    const normalized = submittedKeyword.trim().toLowerCase()
    return (records.data ?? []).filter((record) => {
      const occurredDate = formatDate(new Date(record.finalizedAt ?? record.createdAt))
      if (dateRange.from && occurredDate < dateRange.from) return false
      if (dateRange.to && occurredDate > dateRange.to) return false
      if (scene !== 'ALL' && record.settlementScene !== scene) return false
      if (settlementType !== 'ALL' && record.settlementType !== settlementType) return false
      if (!normalized) return true
      return [record.settlementNo, record.id, record.residentName, record.healthRecordNo,
        record.encounterNo, record.residentId, record.encounterId]
        .some((value) => String(value ?? '').toLowerCase().includes(normalized))
    })
  }, [dateRange.from, dateRange.to, records.data, scene, settlementType, submittedKeyword])

  // 财务指标统计
  const summary = useMemo(() => {
    let totalAmount = 0
    let patientAmount = 0
    let insuranceAmount = 0
    let reversalCount = 0
    let reversalAmount = 0

    for (const r of filteredRecords) {
      totalAmount += r.netAmount
      patientAmount += r.patientAmount
      insuranceAmount += r.insuranceAmount
      if (r.settlementType === 'REVERSAL') {
        reversalCount += 1
        reversalAmount += Math.abs(r.netAmount)
      }
    }
    return {
      count: filteredRecords.length,
      totalAmount,
      patientAmount,
      insuranceAmount,
      reversalCount,
      reversalAmount,
    }
  }, [filteredRecords])

  // 分页数据
  const totalPages = Math.ceil(filteredRecords.length / pageSize)
  const pagedRecords = useMemo(() => {
    const start = pageIndex * pageSize
    return filteredRecords.slice(start, start + pageSize)
  }, [filteredRecords, pageIndex, pageSize])

  // 过滤条件变动重置分页
  useEffect(() => {
    setPageIndex(0)
  }, [dateRange.from, dateRange.to, scene, settlementType, submittedKeyword])

  // 抽屉与当前选中记录
  useEffect(() => {
    if (!filteredRecords.length) {
      if (selectedId) setSelectedId('')
      if (isDrawerOpen) setIsDrawerOpen(false)
      return
    }
    if (selectedId && !filteredRecords.some((record) => record.id === selectedId)) {
      setSelectedId('')
      setIsDrawerOpen(false)
    }
  }, [filteredRecords, isDrawerOpen, selectedId])

  // 监听 Escape 键快捷关闭抽屉
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDrawerOpen])

  const selected = filteredRecords.find((record) => record.id === selectedId)

  const settlement = useQuery({
    queryKey: ['billing-settlement', selected?.id, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => {
      const data = await api.billing.settlement(selected!.id)
      if (!data || data.id !== selected!.id || !Array.isArray(data.lines) || !Array.isArray(data.tenders)) {
        throw new Error('结算明细返回不完整或与当前结算单不一致')
      }
      return data
    },
    enabled: Boolean(selected?.id && isDrawerOpen),
  })
  const statement = useQuery({
    queryKey: ['billing-statement', selected?.encounterId, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => {
      const data = await api.billing.statement(selected!.encounterId!)
      if (!data || data.encounterId !== selected!.encounterId || data.accountId !== selected!.patientAccountId
        || !Array.isArray(data.charges)) throw new Error('费用账单返回不完整或与当前就诊不一致')
      return data
    },
    enabled: Boolean(selected?.encounterId && isDrawerOpen),
  })
  const receipts = useQuery({
    queryKey: ['billing-settlement-receipts', selected?.id, clinicalContext.organization.id, clinicalContext.department.id],
    queryFn: async () => {
      const data = await api.billing.settlementReceipts(selected!.id)
      if (!Array.isArray(data)) throw new Error('电子票据查询返回无效，无法确认是否存在票据')
      return data
    },
    enabled: Boolean(selected?.id && isDrawerOpen),
  })
  const chargeById = useMemo(() => new Map((statement.data?.charges ?? [])
    .map((charge) => [charge.id, charge])), [statement.data?.charges])

  const error = records.error || settlement.error || statement.error || receipts.error
  const hasFilters = Boolean(submittedKeyword || keyword || cashier || submittedCashier || dateRange.from !== getTodayRange().from || dateRange.to !== getTodayRange().to || scene !== 'ALL' || settlementType !== 'ALL')

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['billing-settlement-records'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-settlement'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-statement'] }),
    queryClient.invalidateQueries({ queryKey: ['billing-settlement-receipts'] }),
  ])

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault()
    setSubmittedKeyword(keyword.trim())
    setSubmittedCashier(cashier.trim())
    setPageIndex(0)
  }

  const resetFilters = () => {
    setKeyword('')
    setSubmittedKeyword('')
    setDateRange(getTodayRange())
    setCashier('')
    setSubmittedCashier('')
    setScene('ALL')
    setSettlementType('ALL')
    setPageIndex(0)
  }

  const handleOpenDetail = (recordId: string) => {
    setSelectedId(recordId)
    setIsDrawerOpen(true)
  }

  const handleCopyNo = async (e: React.MouseEvent, settlementNo: string) => {
    e.stopPropagation()
    try {
      await navigator.clipboard?.writeText(settlementNo)
      setCopiedId(settlementNo)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // 兼容不支持环境
    }
  }

  return <div className="billing-query-page">
    <PageHeader
      eyebrow="收费管理"
      title="收费查询"
      description="支持门诊、挂号、药房等业务场景全口径收费对账，核对结算流水、支付分摊与电子票据凭证。"
      actions={
        <Button variant="secondary" onClick={() => void refresh()}>
          <Icon name="refresh" />刷新
        </Button>
      }
    />
    {error && <Alert>{errorMessage(error)}</Alert>}

    {/* 检索区：关键词有限伸缩，其他条件保持内容宽度，操作紧随条件 */}
    <form className="billing-query-filters ui-query-filters" onSubmit={handleSearch} aria-label="收费查询条件">
      <FormField label="姓名/门诊号" className="billing-filter-field--keyword ui-query-filter--keyword">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="姓名 / 门诊号 / 档案号 / 结算单号"
        />
      </FormField>

      <FormField required label="结算日期范围" className="billing-filter-field--date">
        <DateRangePicker value={dateRange} onChange={range => setDateRange({ from: range.from || dateRange.from, to: range.to || dateRange.to })} />
      </FormField>

      <FormField label="业务场景" className="billing-filter-field--scene">
        <Select value={scene} options={sceneOptions} onChange={setScene} />
      </FormField>
      <FormField label="结算类型" className="billing-filter-field--type">
        <Select value={settlementType} options={typeOptions} onChange={setSettlementType} />
      </FormField>

      <FormField label="收费员" className="billing-filter-field--cashier">
        <input value={cashier} onChange={e => setCashier(e.target.value)} placeholder="姓名 / 账号 / 人员 ID" />
      </FormField>
      <div className="ui-query-filters__actions">
        <Button type="submit" variant="secondary" busy={records.isFetching}>
          <Icon name="search" />查询
        </Button>
        {hasFilters && (
          <Button variant="secondary" onClick={resetFilters}>
            重置
          </Button>
        )}
      </div>
    </form>

    {records.data && records.data.length >= 500 && <Alert>当前范围记录较多，仅展示最近 500 条；请缩小日期或按收费员查询后核对金额。</Alert>}
    {/* 主体卡片：全宽财务流水台账表格 */}
    <Panel className="billing-query-main-panel" aria-label="已结算收费记录">
      {records.isPending ? (
        <LoadingState label="正在加载已结算收费记录…" />
      ) : records.isError ? (
        <EmptyState icon="billing" title="收费记录加载失败" copy="本次查询未成功，不能据此判断没有收费记录。"
          action={<Button onClick={() => void records.refetch()}>重新加载收费记录</Button>} />
      ) : !filteredRecords.length ? (
        <EmptyState
          icon="billing"
          title="暂无匹配记录"
          copy={hasFilters ? '请调整查询条件后重试。' : '当前机构暂无已完成的收费结算。'}
        />
      ) : (
        <>
          <div className="billing-query-table-scroll">
            <table className="billing-query-grid-table">
              <colgroup><col className="billing-query-col--number" /><col className="billing-query-col--time" /><col className="billing-query-col--patient" /><col className="billing-query-col--encounter" /><col className="billing-query-col--cashier" /><col className="billing-query-col--type" /><col className="billing-query-col--amount" /><col className="billing-query-col--amount" /><col className="billing-query-col--amount" /><col className="billing-query-col--actions" /></colgroup>
              <thead>
                <tr>
                  <th>结算单号 / 场景</th>
                  <th>结算时间 / 终端</th>
                  <th>患者姓名 / 档案号</th>
                  <th>门诊号 / 科室</th>
                  <th>收费员</th>
                  <th>结算类型</th>
                  <th className={tableCellClass('numeric')}>结算金额</th>
                  <th className={tableCellClass('numeric')}>医保支付</th>
                  <th className={tableCellClass('numeric')}>个人支付</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pagedRecords.map((record) => {
                  const isSelected = record.id === selectedId && isDrawerOpen
                  return (
                    <tr
                      key={record.id}
                      className={isSelected ? 'is-row-selected' : ''}
                      onClick={() => handleOpenDetail(record.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleOpenDetail(record.id)
                        }
                      }}
                      role="button"
                      aria-label={`结算记录 ${record.settlementNo}`}
                    >
                      <td>
                        <div className="billing-grid-settlement-no">
                          <strong>{record.settlementNo}</strong>
                          <div className="billing-grid-tags">
                            <span className="billing-scene-tag">
                              {record.settlementSceneText ?? record.settlementScene}
                            </span>
                            <button
                              type="button"
                              className="billing-copy-btn"
                              title={copiedId === record.settlementNo ? '已复制' : '复制结算单号'}
                              onClick={(e) => void handleCopyNo(e, record.settlementNo)}
                              aria-label={`复制单号 ${record.settlementNo}`}
                            >
                              <Icon name={copiedId === record.settlementNo ? 'check' : 'copy'} />
                            </button>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="billing-grid-time">
                          {formatDateTime(record.finalizedAt ?? record.createdAt)}
                        </span>
                        <small className="billing-grid-terminal">
                          {record.terminalScene ? record.terminalSceneText ?? record.terminalScene : '来源未记录'}{record.terminalCode ? ` · ${record.terminalCode}` : ''}
                        </small>
                      </td>
                      <td>
                        <div className="billing-grid-patient">
                          <strong>{record.residentName}</strong>
                          <span>{record.healthRecordNo}</span>
                        </div>
                      </td>
                      <td>
                        <div className="billing-grid-encounter">
                          <span>{record.encounterNo ?? '--'}</span>
                          <small>
                            {record.departmentName ?? (record.departmentId ? `科室 ${record.departmentId}` : '--')}
                          </small>
                        </div>
                      </td>
                      <td>{record.cashierName ?? record.cashierUsername ?? (record.finalizedBy ? `人员 ${record.finalizedBy}` : '未记录收费员')}</td>
                      <td>
                        <StatusBadge tone={record.settlementType === 'REVERSAL' ? 'warning' : 'success'}>
                          {record.settlementTypeText ?? record.settlementType}
                        </StatusBadge>
                      </td>
                      <td className={tableCellClass('numeric')}>
                        <span className="billing-money billing-money-total">
                          {money(record.netAmount, record.currencyCode)}
                        </span>
                      </td>
                      <td className={tableCellClass('numeric')}>
                        <span className="billing-money billing-money-insurance">
                          {money(record.insuranceAmount, record.currencyCode)}
                        </span>
                      </td>
                      <td className={tableCellClass('numeric')}>
                        <strong className="billing-money billing-money-patient">
                          {money(record.patientAmount, record.currencyCode)}
                        </strong>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenDetail(record.id)
                          }}
                        >
                          查看明细
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* 表格底部栏：左侧财务核算统计指标，右侧分页控制器 */}
          <footer className="billing-table-footer">
            <div className="billing-table-footer__summary" role="region" aria-label="财务核算指标">
              <span className="billing-footer-item">结算总笔数 <strong>{summary.count}</strong> 笔</span>
              <span className="billing-footer-item is-primary">实收总额 <strong>{money(summary.totalAmount)}</strong></span>
              <span className="billing-footer-item">自付 <strong>{money(summary.patientAmount)}</strong></span>
              <span className="billing-footer-item">医保 <strong>{money(summary.insuranceAmount)}</strong></span>
              {summary.reversalCount > 0 && (
                <span className="billing-footer-item is-reversal">
                  冲正 <strong>{summary.reversalCount}</strong> 笔 ({money(summary.reversalAmount)})
                </span>
              )}
            </div>
            <div className="billing-table-footer__pagination">
              <Pagination
                page={pageIndex}
                totalPages={totalPages}
                total={filteredRecords.length}
                pageSize={pageSize}
                onChange={setPageIndex}
                onPageSizeChange={(size) => {
                  setPageSize(size)
                  setPageIndex(0)
                }}
                pageSizeOptions={[10, 20, 50]}
                label="收费查询列表分页"
              />
            </div>
          </footer>
        </>
      )}
    </Panel>

    {/* 侧滑详情抽屉 Slide-over Detail Drawer */}
    {isDrawerOpen && selected && (
      <>
        <div
          className="billing-drawer-backdrop"
          onClick={() => setIsDrawerOpen(false)}
          aria-hidden="true"
        />
        <aside
          className="billing-detail-drawer"
          role="region"
          aria-label="收费记录详情"
          aria-modal="true"
        >
          <header className="billing-drawer-header">
            <div className="billing-drawer-title-group">
              <div className="billing-drawer-eyebrows">
                <span className="billing-scene-badge">
                  {selected.settlementSceneText ?? selected.settlementScene}
                </span>
                <StatusBadge tone={selected.settlementType === 'REVERSAL' ? 'warning' : 'success'}>
                  {selected.settlementTypeText ?? selected.settlementType}
                </StatusBadge>
              </div>
              <h2>{selected.settlementNo}</h2>
              <p>
                收费员：{selected.cashierName ?? selected.cashierUsername ?? (selected.finalizedBy ? `人员 ${selected.finalizedBy}` : '未记录')} · {formatDateTime(selected.finalizedAt ?? selected.createdAt)} · {selected.terminalScene ? selected.terminalSceneText ?? selected.terminalScene : '来源未记录'}{selected.terminalCode ? ` · ${selected.terminalCode}` : ''}
              </p>
            </div>
            <button
              type="button"
              className="billing-drawer-close-btn"
              onClick={() => setIsDrawerOpen(false)}
              aria-label="关闭收费记录详情"
            >
              <Icon name="close" />
            </button>
          </header>

          <div className="billing-drawer-body">
            {settlement.isPending || (Boolean(selected.encounterId) && statement.isPending) || receipts.isPending ? (
              <LoadingState label="正在加载收费记录详情…" />
            ) : settlement.isError || statement.isError || receipts.isError ? (
              <EmptyState icon="billing" title="收费详情加载失败" copy="结算、项目或票据资料未能完整加载，请重试后核对。"
                action={<Button onClick={() => void refresh()}>重新加载收费详情</Button>} />
            ) : (
              <SettlementRecordDetail
                record={selected}
                settlement={settlement.data}
                chargeById={chargeById}
                receipts={receipts.data ?? []}
              />
            )}
          </div>
        </aside>
      </>
    )}
  </div>
}

function SettlementRecordDetail({ record, settlement, chargeById, receipts }: {
  record: SettlementRecord
  settlement?: Awaited<ReturnType<RhnApi['billing']['settlement']>>
  chargeById: Map<string, Awaited<ReturnType<RhnApi['billing']['statement']>>['charges'][number]>
  receipts: Awaited<ReturnType<RhnApi['billing']['settlementReceipts']>>
}) {
  return <>
    <div className="billing-query-identity">
      <strong>{record.residentName}</strong>
      <span>档案号 {record.healthRecordNo}</span>
      <span>门诊号 {record.encounterNo ?? record.encounterId ?? '--'}</span>
      <span>{record.departmentName ?? (record.departmentId ? `科室 ${record.departmentId}` : '--')}</span>
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
          <th>项目名称</th><th>项目编码</th>
          <th className={tableCellClass('numeric')}>数量</th>
          <th className={tableCellClass('numeric')}>单价</th>
          <th className={tableCellClass('numeric')}>结算金额</th>
        </tr></thead><tbody>{settlement.lines.map((line) => {
          const charge = chargeById.get(line.chargeItemId)
          return <tr key={line.id}><td><strong>{charge?.itemName ?? `收费项目 ${line.chargeItemId}`}</strong>
            {charge?.packageSpec && <small>{charge.packageSpec}</small>}</td>
            <td><code>{charge?.itemCode ?? '--'}</code></td>
            <td className={tableCellClass('numeric')}>{line.settledQuantity} {charge?.unitName ?? charge?.unitCode ?? ''}</td>
            <td className={tableCellClass('numeric')}>{charge?.unitPrice == null ? '未记录' : money(charge.unitPrice, record.currencyCode)}</td>
            <td className={tableCellClass('numeric')}><strong>{money(line.netAmount, record.currencyCode)}</strong></td>
          </tr>
        })}</tbody></table></div>}
    </section>
    <div className="billing-query-lower">
      <section className="billing-query-section">
        <header><h3>支付分摊</h3><span>{settlement?.tenders.length ?? 0} 笔</span></header>
        <div className="billing-query-compact-list">{settlement?.tenders.map((tender) => <div key={tender.id}>
          <span><strong>{tender.tenderTypeText ?? tender.tenderType}</strong>
            <small>{tender.payerName ?? '未记录付款方'}</small></span>
          <b>{money(tender.amount, tender.currencyCode)}</b>
        </div>)}{!settlement?.tenders.length && <p>未记录支付分摊。</p>}</div>
      </section>
      <section className="billing-query-section">
        <header><h3>电子票据</h3><span>{receipts.length} 张</span></header>
        <div className="billing-query-compact-list">{receipts.map((receipt) => <div key={receipt.id}>
          <span><strong>{receipt.fiscalNumber ?? receipt.receiptNo}</strong>
            <small>{receipt.statusText ?? receipt.status}</small></span>
          <StatusBadge tone={receipt.status === 'ISSUED' ? 'success'
            : receipt.status === 'FAILED' ? 'danger' : 'neutral'}>{receipt.statusText ?? receipt.status}</StatusBadge>
        </div>)}{!receipts.length && <p>当前结算单暂无电子票据。</p>}</div>
      </section>
    </div>
  </>
}

function formatDateTime(value?: string) {
  if (!value) return '--'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}
