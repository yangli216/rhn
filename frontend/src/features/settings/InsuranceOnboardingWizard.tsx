import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { InsuranceCoverageQuery } from '../../shared/api/masterDataApi'
import { coverageRateLabel, coverageStatusTones, readinessStatusTones } from '../../shared/presentation/insuranceOnboarding'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, Button, DataTable, EmptyState, FormField, LoadingState, Pagination, SearchField, Select, StatusBadge, TableShell, tableCellClass,
} from '../../shared/ui'
import { MasterDetailPage } from '../../shared/ui/templates/PageTemplates'
import { InsuranceProbePanel } from './InsuranceProbePanel'
import './insurance-onboarding.css'

const COVERAGE = 'coverage'
const PROBE = 'probe'
const PAGE_SIZE = 20

const categoryOptions = [{ value: '', label: '全部类别' }, { value: 'DRUG', label: '药品' }, { value: 'SERVICE', label: '诊疗' }, { value: 'SUPPLY', label: '耗材' }]
const statusOptions = [{ value: '', label: '全部状态' }, { value: 'MAPPED', label: '已对照' }, { value: 'UNMAPPED', label: '未映射' },
  { value: 'AMBIGUOUS', label: '歧义' }, { value: 'EXPIRED', label: '已过期' }]

export function InsuranceOnboardingWizard(props: { api: RhnApi; contextKey: string; canProbe?: boolean; onNavigate: (path: string) => void }) {
  return <InsuranceOnboardingWorkspace key={props.contextKey} {...props} />
}

function InsuranceOnboardingWorkspace({ api, canProbe = false, onNavigate }: { api: RhnApi; contextKey: string; canProbe?: boolean; onNavigate: (path: string) => void }) {
  const [selected, setSelected] = useState('')
  const readiness = useQuery({ queryKey: ['insurance-readiness'], queryFn: () => api.billing.insuranceReadiness(),
    gcTime: 0, retry: false, refetchOnWindowFocus: false })
  const report = readiness.data
  const current = selected === COVERAGE || (selected === PROBE && canProbe) ? selected : report?.sections.find(section => section.code === selected)?.code ?? report?.sections[0]?.code ?? COVERAGE
  const section = report?.sections.find(value => value.code === current)

  return <MasterDetailPage title="医保接入向导" description="上线前核对医保网关配置、机构与医师注册资料及标准目录对照。体检与覆盖率只读，不会调用医保平台；接口联通探测会发出真实报文，需要单独授权。"
    feedback={readiness.isError ? <Alert duration={null}>{errorMessage(readiness.error)}
      <Button variant="secondary" onClick={() => { void readiness.refetch() }}>重新体检</Button></Alert> : undefined}
    navigationLabel="接入检查项"
    navigationHeader={<div className="insurance-onboarding__overall">
      {report
        ? <><StatusBadge tone={readinessStatusTones[report.overall]}>{`总体${report.overallText}`}</StatusBadge>
          <span>{`通过 ${report.summary.pass} · 警告 ${report.summary.warn} · 阻断 ${report.summary.block}`}</span></>
        : <span>{readiness.isPending ? '正在体检…' : '体检未完成'}</span>}
      <Button variant="secondary" size="sm" disabled={readiness.isFetching} onClick={() => { void readiness.refetch() }}>重新体检</Button>
    </div>}
    navigation={<div className="insurance-onboarding__navigation">
      {report?.sections.map(value => {
        const worstCheck = value.checks.find(check => check.status === 'BLOCK') ?? value.checks.find(check => check.status === 'WARN') ?? value.checks[0]
        const worst = worstCheck?.status ?? 'PASS'
        return <Button key={value.code} variant="secondary" aria-pressed={current === value.code} onClick={() => setSelected(value.code)}>
          {value.title}<StatusBadge tone={readinessStatusTones[worst]}>{worstCheck?.statusText}</StatusBadge></Button>
      })}
      <Button variant="secondary" aria-pressed={current === COVERAGE} onClick={() => setSelected(COVERAGE)}>标准目录对照覆盖率</Button>
      {canProbe && <Button variant="secondary" aria-pressed={current === PROBE} onClick={() => setSelected(PROBE)}>接口联通探测</Button>}
    </div>}
    detailLabel="检查结果" detailScroll={current === COVERAGE ? 'content' : 'pane'} detailResetScrollKey={current}
    detailHeader={<h2>{current === COVERAGE ? '标准目录对照覆盖率' : current === PROBE ? '接口联通探测' : section?.title ?? '检查结果'}</h2>}>
    {current === PROBE ? <InsuranceProbePanel api={api} />
      : current === COVERAGE
      ? <CoverageView api={api} systemCodes={report?.insuranceSystemCodes ?? []} onNavigate={onNavigate} />
      : readiness.isPending ? <LoadingState label="正在检查接入配置…" />
        : report && <>
          <p className="insurance-onboarding__mode">{`当前医保客户端：${report.clientModeText}`}</p>
          <DataTable aria-label={`${section?.title ?? ''}检查结果`} compact>
            <thead><tr><th className={tableCellClass('status')}>结果</th><th>检查项</th><th>说明</th><th>修复提示</th></tr></thead>
            <tbody>{section?.checks.map(check => <tr key={check.code}>
              <td className={tableCellClass('status')}><StatusBadge tone={readinessStatusTones[check.status]}>{check.statusText}</StatusBadge></td>
              <td>{check.title}</td><td>{check.detail}</td><td>{check.fix ?? '—'}</td>
            </tr>)}</tbody>
          </DataTable>
        </>}
  </MasterDetailPage>
}

function CoverageView({ api, systemCodes, onNavigate }: { api: RhnApi; systemCodes: string[]; onNavigate: (path: string) => void }) {
  const [filter, setFilter] = useState<InsuranceCoverageQuery>({})
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [exportError, setExportError] = useState<string>()
  const [exporting, setExporting] = useState(false)
  const coverage = useQuery({ queryKey: ['insurance-coverage', filter, page], queryFn: () => api.masterData.insuranceCoverage(filter, page, PAGE_SIZE),
    gcTime: 0, retry: false, refetchOnWindowFocus: false, placeholderData: previous => previous })
  const apply = (next: InsuranceCoverageQuery) => { setFilter(next); setPage(0) }
  const systemOptions = [{ value: '', label: '全部医保目录体系' }, ...systemCodes.map(value => ({ value, label: value }))]
  const data = coverage.data
  const exportCsv = async () => {
    setExporting(true); setExportError(undefined)
    try {
      const blob = await api.masterData.insuranceCoverageExport(filter)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = 'insurance-coverage.csv'
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
    } catch (error) { setExportError(errorMessage(error)) } finally { setExporting(false) }
  }
  return <div className="insurance-onboarding__coverage">
    <div className="insurance-onboarding__summary" role="list" aria-label="覆盖率汇总">
      {data?.summary.map(item => <dl key={item.category} role="listitem">
        <dt>{item.categoryText}</dt>
        <dd className="insurance-onboarding__rate">{coverageRateLabel(item.coverageRate)}</dd>
        <dd>{`共 ${item.total} 项 · 已对照 ${item.mapped} · 未映射 ${item.unmapped} · 歧义 ${item.ambiguous} · 过期 ${item.expired}`}</dd>
      </dl>)}
    </div>
    <div className="ui-query-filters">
      <SearchField label="搜索项目" value={keyword} placeholder="项目编码或名称"
        onChange={value => { setKeyword(value); apply({ ...filter, query: value }) }} />
      <FormField label="医保目录体系"><Select value={filter.systemCode ?? ''} options={systemOptions}
        onChange={value => apply({ ...filter, systemCode: value })} /></FormField>
      <FormField label="类别"><Select value={filter.category ?? ''} options={categoryOptions} onChange={value => apply({ ...filter, category: value })} /></FormField>
      <FormField label="对照状态"><Select value={filter.status ?? ''} options={statusOptions} onChange={value => apply({ ...filter, status: value })} /></FormField>
      <div className="ui-query-filters__actions">
        <Button variant="secondary" disabled={exporting} onClick={() => { void exportCsv() }}>{exporting ? '正在导出…' : '导出当前筛选'}</Button>
        <Button onClick={() => onNavigate('/settings/standard-mappings')}>前往标准映射管理</Button>
      </div>
    </div>
    {exportError && <Alert duration={null}>{exportError}</Alert>}
    {coverage.isError && <Alert duration={null}>{errorMessage(coverage.error)}
      <Button variant="secondary" onClick={() => { void coverage.refetch() }}>重新加载</Button></Alert>}
    {!data && coverage.isPending ? <LoadingState label="正在统计对照覆盖率…" />
      : data && (data.items.length === 0
        ? <EmptyState icon="search" title="没有符合条件的项目" copy="调整筛选条件，或确认已维护在用的可收费目录。" />
        : <TableShell scrollLabel="目录对照明细" resetScrollKey={`${page}:${JSON.stringify(filter)}`}
          footer={<Pagination page={data.page} totalPages={Math.max(1, Math.ceil(data.total / data.size))} total={data.total}
            label="目录对照分页" onChange={setPage} />}>
          <DataTable aria-label="目录对照明细" compact>
            <thead><tr><th>类别</th><th>项目编码</th><th>项目名称</th><th className={tableCellClass('status')}>对照状态</th><th>说明</th><th>医保目录编码</th></tr></thead>
            <tbody>{data.items.map(item => <tr key={item.catalogItemId}>
              <td>{item.categoryText}</td><td>{item.code}</td><td>{item.name}</td>
              <td className={tableCellClass('status')}><StatusBadge tone={coverageStatusTones[item.status]}>{item.statusText}</StatusBadge></td>
              <td>{item.detail}</td><td>{item.termCodes.length ? item.termCodes.join('、') : '—'}</td>
            </tr>)}</tbody>
          </DataTable>
        </TableShell>)}
  </div>
}
