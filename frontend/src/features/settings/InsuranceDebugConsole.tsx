import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Fragment, useEffect, useState } from 'react'
import './insurance-onboarding.css'
import type {
  InsuranceDebugClaim, InsuranceDebugClaimAction, InsuranceDebugExchangeQuery, InsuranceDebugRetention, InsuranceDebugScope, InsuranceDebugSettings,
} from '../../shared/api/billingApi'
import { formatDateTimeParts } from '../../shared/format'
import { debugActionTones, debugClaimTones, debugOutcomeTones, debugRetentionText } from '../../shared/presentation/insuranceOnboarding'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { formatCurrency } from '../../shared/utils/precision'
import {
  Alert, Button, DataTable, DateRangePicker, Dialog, EmptyState, FormField, LoadingState, PageHeader, Pagination, SearchField, Select, StatusBadge, Switch, Tabs,
  tableCellClass,
} from '../../shared/ui'

const PAGE_SIZE = 20
const scopeOptions = [{ value: 'ALL', label: '所有交易' }, { value: 'IMPORTANT', label: '重要交易' }, { value: 'SELECTED', label: '指定交易' }]
const keepOptions = [{ value: '3', label: '保留 3 天' }, { value: '7', label: '保留 7 天' }, { value: '30', label: '保留 30 天' }]
const autoOptions = (raw: boolean) => [{ value: '', label: '不自动关闭' }, { value: '1', label: '1 小时后关闭' }, { value: '8', label: '8 小时后关闭' },
  { value: '24', label: '24 小时后关闭' }, ...(raw ? [] : [{ value: '72', label: '72 小时后关闭' }])]
const outcomeOptions = [{ value: '', label: '全部结果' }, { value: 'OK', label: '成功' }, { value: 'REJECTED', label: '医保拒绝' },
  { value: 'TIMEOUT', label: '超时（结果未知）' }, { value: 'NETWORK', label: '网络失败（结果未知）' }, { value: 'HTTP_STATUS', label: 'HTTP 异常' },
  { value: 'BAD_JSON', label: '回执非 JSON' }, { value: 'INCOMPLETE', label: '回执不完整' }]
const scopeHint: Record<InsuranceDebugScope, string> = {
  ALL: '记录全部医保往返，含人员信息查询等高频交易，请只在排查期间使用。',
  IMPORTANT: '记录结算、撤销、签到等关键交易；范围外的失败或结果不明交易也会留一条摘要。',
  SELECTED: '只记录勾选的交易；范围外的失败或结果不明交易仍会留一条摘要。',
}

const pad = (value: number) => String(value).padStart(2, '0')
const localDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
const dayBoundary = (value: string, nextDay = false) => {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day + (nextDay ? 1 : 0)).toISOString()
}
const dateTime = (value: string) => formatDateTimeParts(value, { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const amount = (value?: number) => value === undefined || value === null ? '—' : formatCurrency(value)

type DebugView = 'claims' | 'exchanges' | 'settings'
type ClaimFilter = { claimId: string; claimNo: string }

export function InsuranceDebugConsole({ api, canConfigure, canViewRaw, canReverse }: {
  api: RhnApi; canConfigure: boolean; canViewRaw: boolean; canReverse: boolean
}) {
  const [view, setView] = useState<DebugView>('claims')
  const [claimFilter, setClaimFilter] = useState<ClaimFilter>()
  const settings = useQuery({ queryKey: ['insurance-debug-settings'], queryFn: () => api.billing.insuranceDebugSettings(),
    gcTime: 0, retry: false, refetchOnWindowFocus: false })
  if (settings.isPending) return <LoadingState label="正在读取调试配置…" />
  if (settings.isError) return <Alert duration={null}>{errorMessage(settings.error)}
    <Button variant="secondary" onClick={() => { void settings.refetch() }}>重新读取</Button></Alert>
  const state = settings.data.effectivelyEnabled
  return <div className="insurance-debug">
    <div className="insurance-debug__bar">
      <Tabs label="调试控制台视图" value={view} onChange={setView}
        items={[{ value: 'claims', label: '异常交易' }, { value: 'exchanges', label: '交易执行记录' }, { value: 'settings', label: '调试开关与范围' }]} />
      <StatusBadge tone={state ? 'success' : 'neutral'}>{state ? '调试已开启' : settings.data.enabled ? '调试已到期关闭' : '调试未开启'}</StatusBadge>
    </div>
    {view === 'claims' && <ClaimAttentionPanel api={api} canReverse={canReverse}
      onShowExchanges={filter => { setClaimFilter(filter); setView('exchanges') }} />}
    {view === 'exchanges' && <ExchangeList api={api} canViewRaw={canViewRaw} claimFilter={claimFilter} onClearClaim={() => setClaimFilter(undefined)} />}
    {view === 'settings' && <SettingsPanel key={settings.data.revision} api={api} settings={settings.data} canConfigure={canConfigure} />}
  </div>
}

function SettingsPanel({ api, settings, canConfigure }: { api: RhnApi; settings: InsuranceDebugSettings; canConfigure: boolean }) {
  const client = useQueryClient()
  const [enabled, setEnabled] = useState(settings.enabled)
  const [scope, setScope] = useState<InsuranceDebugScope>(settings.scope)
  const [selected, setSelected] = useState<string[]>(settings.selectedInfnos)
  const [retention, setRetention] = useState<InsuranceDebugRetention>(settings.retention)
  const [keepDays, setKeepDays] = useState(String(settings.keepDays))
  const [autoHours, setAutoHours] = useState('')
  const [confirmRaw, setConfirmRaw] = useState(false)
  const [message, setMessage] = useState<string>()
  const save = useMutation({ mutationFn: () => api.billing.updateInsuranceDebugSettings({
    enabled, scope, selectedInfnos: scope === 'SELECTED' ? selected : [], retention, keepDays: Number(keepDays),
    autoDisableHours: autoHours ? Number(autoHours) : undefined, confirmRaw,
    expectedRevision: settings.revision,
  }), onSuccess: async () => { setMessage('调试配置已保存'); await client.invalidateQueries({ queryKey: ['insurance-debug-settings'] }) } })
  const raw = retention === 'RAW'
  const retentionOptions = [{ value: 'SUMMARY', label: '仅摘要（不存报文）' }, { value: 'REDACTED', label: '脱敏报文（推荐）' },
    ...(settings.rawAllowed ? [{ value: 'RAW', label: '原始报文（含敏感信息）' }] : [])]
  const missing = scope === 'SELECTED' && selected.length === 0 ? '指定交易范围至少选择一个交易号'
    : enabled && raw && (!confirmRaw || !autoHours) ? '开启原始报文留存须确认风险，并设置 24 小时内自动关闭' : undefined
  const toggle = (code: string) => setSelected(previous => previous.includes(code) ? previous.filter(value => value !== code) : [...previous, code])
  const readOnly = !canConfigure

  return <section className="insurance-debug__settings" aria-label="调试开关与记录范围">
    {message && <Alert tone="success" placement="inline">{message}</Alert>}
    {save.isError && <Alert duration={null}>
      {errorMessage(save.error)}
      <Button variant="secondary" onClick={() => { void client.invalidateQueries({ queryKey: ['insurance-debug-settings'] }) }}>重新读取最新配置</Button>
    </Alert>}
    {readOnly && <Alert tone="info" placement="inline">当前账号没有配置权限，仅可查看。</Alert>}

    <div className="insurance-debug__master-bar">
      <div className="insurance-debug__master-info">
        <div className="insurance-debug__master-main">
          <Switch checked={enabled} disabled={readOnly} onChange={setEnabled} label="开启医保调试记录" />
          <StatusBadge tone={enabled ? 'success' : 'neutral'}>{enabled ? '运行中' : '未开启'}</StatusBadge>
          {settings.effectivelyEnabled && settings.enabledUntil && (
            <span className="insurance-debug__countdown">{`将于 ${dateTime(settings.enabledUntil)} 自动关闭`}</span>
          )}
        </div>
        <p className="insurance-debug__master-copy">
          关闭时不记录、不占用系统与网络资源；手工冲正与业务正常结算不受此开关影响。
        </p>
      </div>
      <div className="insurance-debug__master-actions">
        {missing && !readOnly && <Alert tone="info" placement="inline">{missing}</Alert>}
        <Button disabled={readOnly || save.isPending || missing !== undefined}
          onClick={() => { setMessage(undefined); save.mutate() }}>
          {save.isPending ? '保存中…' : '保存设置'}
        </Button>
      </div>
    </div>

    <div className="insurance-debug__grid">
      <div className="insurance-debug__card">
        <div className="insurance-debug__card-header">
          <h3 className="insurance-debug__card-title">记录范围策略</h3>
          <span className="insurance-debug__card-sub">选择需要记录往返明细的医保交易</span>
        </div>
        <FormField label="记录范围">
          <Select value={scope} options={scopeOptions} disabled={readOnly} onChange={value => setScope(value as InsuranceDebugScope)}
            clearable={false} searchable={false} />
        </FormField>
        <div className="insurance-debug__scope-tip">
          {scopeHint[scope]}
        </div>
        {scope === 'SELECTED' && (
          <FormField label={`指定交易类型（已选 ${selected.length} 项）`}>
            <div className="insurance-debug__infnos">
              {settings.knownInfnos.map(option => (
                <label key={option.code} className="insurance-debug__infno-item">
                  <input type="checkbox" disabled={readOnly} checked={selected.includes(option.code)} onChange={() => toggle(option.code)} />
                  <span>{` ${option.code} ${option.name}`}</span>
                </label>
              ))}
            </div>
          </FormField>
        )}
      </div>

      <div className="insurance-debug__card">
        <div className="insurance-debug__card-header">
          <h3 className="insurance-debug__card-title">报文留存与保留周期</h3>
          <span className="insurance-debug__card-sub">控制存储体量与数据安全合规</span>
        </div>
        <div className="insurance-debug__card-form">
          <FormField label="报文留存级别">
            <Select value={retention} options={retentionOptions} disabled={readOnly}
              onChange={value => {
                const next = value as InsuranceDebugRetention
                setRetention(next)
                setConfirmRaw(false)
                if (next === 'RAW' && !autoHours) setAutoHours('8')
              }} clearable={false} searchable={false} />
          </FormField>
          <FormField label="记录保留期">
            <Select value={keepDays} options={keepOptions} disabled={readOnly} onChange={setKeepDays}
              clearable={false} searchable={false} />
          </FormField>
          <FormField label="自动关闭时间" required={raw} error={raw && !autoHours ? '开启原始报文留存必须设置 24 小时内自动关闭' : undefined}>
            <Select value={autoHours} options={autoOptions(raw)} disabled={readOnly} onChange={setAutoHours}
              clearable={false} searchable={false} />
          </FormField>
        </div>
        {raw && (
          <div className="insurance-debug__raw-guard">
            <Alert tone="warning" placement="inline">
              原始报文包含证件号、电子凭证等敏感信息，仅限持有原始报文权限的人查看，且必须设置 24 小时内自动关闭。
            </Alert>
            <Switch checked={confirmRaw} disabled={readOnly} onChange={setConfirmRaw} label="我已知晓风险，确认留存原始报文" />
          </div>
        )}
      </div>
    </div>
  </section>
}

function ExchangeList({ api, canViewRaw, claimFilter, onClearClaim }: {
  api: RhnApi; canViewRaw: boolean; claimFilter?: ClaimFilter; onClearClaim: () => void
}) {
  const today = localDate(new Date())
  const [dates, setDates] = useState({ from: today, to: today })
  const [infno, setInfno] = useState('')
  const [outcome, setOutcome] = useState('')
  const [keyword, setKeyword] = useState('')
  const [applied, setApplied] = useState<InsuranceDebugExchangeQuery>(claimFilter ? { claimId: claimFilter.claimId }
    : { from: dayBoundary(today), to: dayBoundary(today, true) })
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string>()
  const [filterError, setFilterError] = useState<string>()
  const exchanges = useQuery({ queryKey: ['insurance-debug-exchanges', applied, page], queryFn: () => api.billing.insuranceDebugExchanges(applied, page, PAGE_SIZE),
    gcTime: 0, retry: false, refetchOnWindowFocus: false, placeholderData: previous => previous })
  const detail = useQuery({ queryKey: ['insurance-debug-exchange', expanded], enabled: expanded !== undefined,
    queryFn: () => api.billing.insuranceDebugExchange(expanded!), gcTime: 0, retry: false, refetchOnWindowFocus: false })
  useEffect(() => setExpanded(undefined), [applied, page])

  const apply = () => {
    if (dates.from && dates.to && dates.from > dates.to) { setFilterError('开始日期不能晚于结束日期。'); return }
    setFilterError(undefined); setPage(0)
    setApplied({ from: dates.from ? dayBoundary(dates.from) : undefined, to: dates.to ? dayBoundary(dates.to, true) : undefined,
      infno: infno || undefined, outcome: outcome || undefined, keyword: keyword.trim() || undefined })
  }
  const reset = () => {
    setDates({ from: today, to: today }); setInfno(''); setOutcome(''); setKeyword(''); setFilterError(undefined); setPage(0)
    setApplied({ from: dayBoundary(today), to: dayBoundary(today, true) })
  }
  const data = exchanges.data
  const infnoOptions = [{ value: '', label: '全部交易' }, ...['9001', '9002', '1101', '2201', '2202', '2203A', '2204', '2205', '2206', '2207', '2208']
    .map(code => ({ value: code, label: code }))]

  return <section className="insurance-debug__section" aria-label="交易执行记录">
    {claimFilter && <Alert tone="info" placement="inline">{`仅显示申请 ${claimFilter.claimNo} 的交易记录。`}
      <Button variant="text" onClick={() => { onClearClaim(); reset() }}>查看全部</Button></Alert>}
    <div className="ui-query-filters">
      <FormField label="关键词" className="ui-query-filter--keyword"><SearchField label="搜索交易记录" placeholder="申请号、关联号、操作人、错误信息或返回码"
        value={keyword} onChange={setKeyword} onSearch={apply} /></FormField>
      <FormField label="交易"><Select value={infno} options={infnoOptions} onChange={setInfno} clearable={false} searchable={false} /></FormField>
      <FormField label="结果"><Select value={outcome} options={outcomeOptions} onChange={setOutcome} clearable={false} searchable={false} /></FormField>
      <FormField label="发起日期" className="ui-query-filter--date"><DateRangePicker value={dates} onChange={setDates}
        startAriaLabel="发起开始日期" endAriaLabel="发起结束日期" /></FormField>
      <div className="ui-query-filters__actions"><Button onClick={apply}>查询</Button>
        <Button variant="secondary" onClick={reset}>重置</Button></div>
    </div>
    {filterError && <Alert placement="inline">{filterError}</Alert>}
    {exchanges.isError && <Alert duration={null}>{errorMessage(exchanges.error)}
      <Button variant="secondary" onClick={() => { void exchanges.refetch() }}>重新加载</Button></Alert>}
    {!data && exchanges.isPending ? <LoadingState label="正在读取交易记录…" />
      : data && (data.content.length === 0
        ? <EmptyState icon="search" title="没有符合条件的交易记录" copy="确认调试开关已开启且记录范围包含目标交易，或调整筛选条件。" />
        : <>
          <DataTable aria-label="交易执行记录" compact>
            <thead><tr>
              <th>发起时间</th><th>交易</th><th>关联申请</th><th className={tableCellClass('status')}>结果</th>
              <th className={tableCellClass('numeric')}>耗时</th><th className={tableCellClass('numeric')}>HTTP</th><th>返回码</th>
              <th>操作人</th><th>留存</th><th>说明</th><th className={tableCellClass('actions')}>操作</th>
            </tr></thead>
            <tbody>{data.content.map(row => <Fragment key={row.id}>
              <tr>
                <td>{dateTime(row.startedAt)}</td><td>{`${row.infno} ${row.infnoName}`}</td><td>{row.claimNo ?? '—'}</td>
                <td className={tableCellClass('status')}><StatusBadge tone={debugOutcomeTones[row.outcome] ?? 'neutral'}>{row.outcomeText}</StatusBadge></td>
                <td className={tableCellClass('numeric')}>{`${row.durationMs} ms`}</td><td className={tableCellClass('numeric')}>{row.httpStatus ?? '—'}</td>
                <td>{row.infcode ?? '—'}</td><td>{row.actor ?? '—'}</td><td>{debugRetentionText[row.retention]}</td><td>{row.errMsg ?? '—'}</td>
                <td className={tableCellClass('actions')}><Button variant="text" size="sm" aria-expanded={expanded === row.id} disabled={row.retention === 'SUMMARY'}
                  onClick={() => setExpanded(previous => previous === row.id ? undefined : row.id)}>
                  {expanded === row.id ? '收起报文' : '查看报文'}</Button></td>
              </tr>
              {expanded === row.id && <tr><td colSpan={11}>
                {detail.isPending ? <LoadingState label="正在读取报文…" /> : detail.isError ? <Alert duration={null}>{errorMessage(detail.error)}</Alert>
                  : <div className="insurance-debug__messages">
                    <div><strong>{detail.data.rawVisible ? '请求（原始）' : '请求（已脱敏）'}</strong><pre>{detail.data.request}</pre></div>
                    <div><strong>{detail.data.rawVisible ? '回执（原始）' : '回执（已脱敏）'}</strong><pre>{detail.data.response}</pre></div>
                    {detail.data.correlationId && <p>{`请求关联号：${detail.data.correlationId}`}</p>}
                    {row.retention === 'RAW' && !canViewRaw && <p>该记录按原始报文留存，当前账号无原始报文权限，仅显示脱敏内容。</p>}
                  </div>}
              </td></tr>}
            </Fragment>)}</tbody>
          </DataTable>
          <Pagination page={data.page} totalPages={Math.max(1, data.totalPages)} total={data.totalElements} label="交易记录分页" onChange={setPage} />
        </>)}
  </section>
}

function ClaimAttentionPanel({ api, canReverse, onShowExchanges }: { api: RhnApi; canReverse: boolean; onShowExchanges: (filter: ClaimFilter) => void }) {
  const client = useQueryClient()
  const [notice, setNotice] = useState<{ tone: 'success' | 'warning' | 'info'; text: string }>()
  const [reversing, setReversing] = useState<InsuranceDebugClaim>()
  const claims = useQuery({ queryKey: ['insurance-debug-claims'], queryFn: () => api.billing.insuranceDebugAttention(50),
    gcTime: 0, retry: false, refetchOnWindowFocus: false })
  const show = (result: InsuranceDebugClaimAction) => {
    const tone = debugActionTones[result.outcome]
    setNotice({ tone: tone === 'success' || tone === 'warning' ? tone : 'info', text: `${result.claim.claimNo}：${result.message}` })
  }
  const query = useMutation({ mutationFn: (claimId: string) => api.billing.insuranceDebugQueryClaim(claimId),
    onSuccess: async result => { show(result); await client.invalidateQueries({ queryKey: ['insurance-debug-claims'] }) } })

  return <section className="insurance-debug__section" aria-label="异常交易">
    <div className="insurance-debug__toolbar">
      <span>结果未定（预结算、结算、冲正）或冲正失败的医保申请。先「查询结果」向医保核实，确认已扣费再冲正。</span>
      <Button variant="secondary" size="sm" busy={claims.isFetching} onClick={() => { void claims.refetch() }}>刷新</Button>
    </div>
    {notice && <Alert tone={notice.tone} placement="inline">{notice.text}</Alert>}
    {query.isError && <Alert duration={null}>{errorMessage(query.error)}</Alert>}
    {claims.isError && <Alert duration={null}>{errorMessage(claims.error)}
      <Button variant="secondary" onClick={() => { void claims.refetch() }}>重新加载</Button></Alert>}
    {claims.isPending ? <LoadingState label="正在读取异常交易…" />
      : claims.data && (claims.data.length === 0
        ? <EmptyState icon="search" title="没有需要人工处理的医保申请" copy="结果未定或冲正失败的申请会出现在这里。" />
        : <DataTable aria-label="异常交易" compact>
          <thead><tr>
            <th>申请号</th><th>结算单号</th><th className={tableCellClass('status')}>状态</th><th>需处理原因</th>
            <th className={tableCellClass('numeric')}>总额</th><th className={tableCellClass('numeric')}>统筹</th>
            <th className={tableCellClass('numeric')}>个人账户</th><th className={tableCellClass('numeric')}>现金</th>
            <th>错误信息</th><th className={tableCellClass('actions')}>操作</th>
          </tr></thead>
          <tbody>{claims.data.map(claim => <tr key={claim.claimId}>
            <td>{claim.claimNo}</td><td>{claim.settlementNo ?? '—'}</td>
            <td className={tableCellClass('status')}><StatusBadge tone={debugClaimTones[claim.status] ?? 'warning'}>{claim.statusText}</StatusBadge></td>
            <td>{claim.reason}</td>
            <td className={tableCellClass('numeric')}>{amount(claim.grossAmount)}</td><td className={tableCellClass('numeric')}>{amount(claim.insuranceFundAmount)}</td>
            <td className={tableCellClass('numeric')}>{amount(claim.personalAccountAmount)}</td><td className={tableCellClass('numeric')}>{amount(claim.patientCashAmount)}</td>
            <td>{claim.errorMessage ?? '—'}</td>
            <td className={tableCellClass('actions')}>
              <Button variant="text" size="sm" onClick={() => onShowExchanges({ claimId: claim.claimId, claimNo: claim.claimNo })}>交易记录</Button>
              {canReverse && <Button variant="text" size="sm" disabled={!claim.canQuery || query.isPending}
                onClick={() => { setNotice(undefined); query.mutate(claim.claimId) }}>查询结果</Button>}
              {canReverse && <Button variant="text" size="sm" disabled={!claim.canReverse} onClick={() => { setNotice(undefined); setReversing(claim) }}>冲正</Button>}
            </td>
          </tr>)}</tbody>
        </DataTable>)}
    {reversing && <ReverseDialog api={api} claim={reversing} onClose={() => setReversing(undefined)}
      onDone={async result => { setReversing(undefined); show(result); await client.invalidateQueries({ queryKey: ['insurance-debug-claims'] }) }} />}
  </section>
}

function ReverseDialog({ api, claim, onClose, onDone }: {
  api: RhnApi; claim: InsuranceDebugClaim; onClose: () => void; onDone: (result: InsuranceDebugClaimAction) => void
}) {
  const [reason, setReason] = useState('')
  const [confirmClaimNo, setConfirmClaimNo] = useState('')
  const reverse = useMutation({ mutationFn: () => api.billing.insuranceDebugReverseClaim(claim.claimId, { reason: reason.trim(), confirmClaimNo: confirmClaimNo.trim() }),
    onSuccess: onDone })
  const ready = reason.trim().length >= 2 && confirmClaimNo.trim() === claim.claimNo
  return <Dialog title="手动冲正医保交易" eyebrow={claim.claimNo} onClose={onClose}
    description={`将向医保平台撤销该笔结算，涉及真实资金（总额 ${amount(claim.grossAmount)}）。系统会先查询最新结果：已撤销则不重复冲正，结果仍不明确则不冲正。`}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button variant="danger" busy={reverse.isPending} disabled={!ready} onClick={() => reverse.mutate()}>确认冲正</Button></>}>
    {reverse.isError && <Alert duration={null}>{errorMessage(reverse.error)}</Alert>}
    <dl className="insurance-debug__facts">
      <div><dt>当前状态</dt><dd>{claim.statusText}</dd></div>
      <div><dt>医保统筹</dt><dd>{amount(claim.insuranceFundAmount)}</dd></div>
      <div><dt>个人账户</dt><dd>{amount(claim.personalAccountAmount)}</dd></div>
      <div><dt>患者现金</dt><dd>{amount(claim.patientCashAmount)}</dd></div>
      <div><dt>医保结算号</dt><dd>{claim.externalSettlementNo ?? '—'}</dd></div>
    </dl>
    <FormField label="冲正原因" required><textarea className="ui-field__control" rows={3} maxLength={500} value={reason}
      onChange={event => setReason(event.target.value)} /></FormField>
    <FormField label={`重新输入申请号 ${claim.claimNo} 以确认`} required><input className="ui-field__control" autoComplete="off" value={confirmClaimNo}
      onChange={event => setConfirmClaimNo(event.target.value)} /></FormField>
  </Dialog>
}

export function InsuranceDebugPage(props: { api: RhnApi; canConfigure: boolean; canViewRaw: boolean; canReverse: boolean }) {
  return <section className="ui-page-template insurance-debug-page" aria-label="医保调试控制台">
    <PageHeader title="医保调试控制台" description="生产与联调环境医保网关往返记录、异常交易排查、手动冲正与调试开关维护。" compact />
    <InsuranceDebugConsole {...props} />
  </section>
}

