import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type StandardMedicationDetail, type StandardMedicationSpecification } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState, Pagination, SearchField, Select } from '../../shared/ui'
import './standard-medication-catalog.css'

const reasons: Record<string, string> = {
  SCOPE_NOT_ORDERABLE: '目录范围条目，需按原文注释补充具体药品',
  FORM_OR_SPEC_REQUIRES_REVIEW: '剂型或规格需人工核对',
  TEXT_REQUIRES_REVIEW: '复杂规格需核对成分和强度',
  MULTI_COMPONENT: '多成分数值已保留，成分对应关系待核对',
  PERCENT_UNSPECIFIED_BASIS: '百分比浓度的计量基准待核对',
}
function strengthText(spec: StandardMedicationSpecification) {
  const s = spec.strength
  if (s.kind === 'CONCENTRATION' && s.numerator && s.denominator)
    return `${s.numerator.value} ${s.numerator.unit} / ${s.denominator.value} ${s.denominator.unit}`
  if (s.kind === 'AMOUNT_PER_PRESENTATION' && s.numerator) return `${s.numerator.value} ${s.numerator.unit}`
  if (s.kind === 'MULTI_COMPONENT') return s.components.map(c => `${c.value} ${c.unit}`).join(' + ')
  if (s.kind === 'PRESENTATION_VOLUME' && s.denominator) return `${s.denominator.value} ${s.denominator.unit}（体积）`
  if (s.kind === 'TRADITIONAL_PRESENTATION') return '中成药制剂规格，保留原文'
  return '强度语义待核验'
}
export function StandardMedicationCatalogPanel({ api, onSetup, setupDisabled }: { api: RhnApi;
  onSetup?: (entry: StandardMedicationDetail, spec: StandardMedicationSpecification) => void; setupDisabled?: boolean }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [selected, setSelected] = useState('')
  const summary = useQuery({ queryKey: ['medication-standard-summary'], queryFn: api.masterData.standardMedicationSummary })
  const list = useQuery({ queryKey: ['medication-standard-list', query, type, state, page, size],
    queryFn: () => api.masterData.standardMedications(query, type, state, page, size) })
  const detail = useQuery({ queryKey: ['medication-standard-detail', selected],
    queryFn: () => api.masterData.standardMedicationDetail(selected), enabled: Boolean(selected) })
  useEffect(() => { setPage(0); setSelected('') }, [query, type, state, size])
  const error = summary.error || list.error || detail.error
  const stats = summary.data?.statistics
  return <section className="standard-medication" aria-label="标准药品参考目录">
    <div className="standard-medication__intro">
      <div><h2>标准药品参考目录</h2><p>按品种、剂型与规格整理，支持追溯原文与核对差异。</p></div>
      <span>目录版本 {summary.data?.catalogVersion ?? '—'}</span>
    </div>
    <div className="standard-medication__stats">
      {[['目录条目', stats?.entries], ['独立剂型规格', stats?.specifications], ['范围条目', stats?.scopeEntries], ['待核验项', stats?.issues]].map(([label, value]) =>
        <div key={label}><span>{label}</span><strong>{value ?? '—'}</strong></div>)}
    </div>
    <p className="standard-medication__notice" role="note">来源：{summary.data?.source.title ?? '用户提供目录'}。官方发布信息待核实。选择具体规格后可建立本院药品、配置厂家产品与价格；用法和管理属性可在调试中维护。</p>
    {error && <Alert>{errorMessage(error)}</Alert>}
    <div className="standard-medication__toolbar">
      <SearchField label="搜索标准药品" value={query} onChange={setQuery} placeholder="通用名、英文名、拼音、分类、规格或旧编码" />
      <Select value={type} onChange={setType} placeholder="全部类型" options={[
        {value:'WESTERN',label:'化学药品和生物制品'}, {value:'CHINESE_PATENT',label:'中成药'},
      ]} />
      <Select value={state} onChange={setState} placeholder="全部条目" options={[
        {value:'STRUCTURED',label:'已有独立规格'}, {value:'REVIEW',label:'有待核验项'}, {value:'SCOPE',label:'范围条目'},
      ]} />
    </div>
    <div className="standard-medication__workspace">
      <div className="standard-medication__list">
        {list.isPending ? <LoadingState /> : <>
          <div className="standard-medication__table-scroll"><table className="master-data-table">
            <thead><tr><th>药品 / 旧目录编码</th><th>目录分类</th><th>规格</th><th>核验</th><th>详情</th></tr></thead>
            <tbody>{list.data?.content.map(entry => <tr key={entry.id} className={selected === entry.id ? 'is-selected' : ''}>
              <td><strong>{entry.name}</strong><small>{entry.legacyCode}</small></td>
              <td>{entry.categories[0]?.sub || entry.categories[0]?.major}<small>{entry.entryType === 'SCOPE' ? '范围条目 · 不可直接开立' : entry.innName || '中成药'}</small></td>
              <td>{entry.specificationCount}</td><td>{entry.issueCount ? `${entry.issueCount} 项` : '来源待核验'}</td>
              <td><Button variant="text" onClick={() => setSelected(entry.id)} aria-label={`查看${entry.name}标准规格`}>查看</Button></td>
            </tr>)}</tbody>
          </table></div>
          {!list.data?.content.length && <EmptyState icon="pharmacy" title="没有匹配的目录条目" copy="请调整名称、分类或核验筛选条件。" />}
          <Pagination page={page} totalPages={Math.max(1,list.data?.totalPages ?? 1)} total={list.data?.totalElements ?? 0}
            pageSize={size} onPageSizeChange={setSize} onChange={setPage} label="标准药品目录分页" />
        </>}
      </div>
      <aside className="standard-medication__detail" aria-label="标准药品详情">
        {!selected ? <EmptyState icon="pharmacy" title="选择药品查看依据" copy="查看独立规格、物质限定、强度结构与原文位置。" />
          : detail.isPending ? <LoadingState /> : detail.data && <>
            <h3>{detail.data.name}</h3><p className="standard-medication__muted">{detail.data.innName || detail.data.legacyCode}</p>
            <dl><dt>标准品种 ID</dt><dd>{detail.data.id}</dd><dt>原文位置</dt><dd>{detail.data.sourceLocations.join('；')}</dd>
              <dt>目录标记</dt><dd>{detail.data.specialistGuidance ? '需相应处方资质或专科医师指导（原文 △）' : '原文未标注专科指导'}</dd></dl>
            <h4>独立剂型规格 · {detail.data.specifications.length} 条</h4>
            {detail.data.specifications.map(spec => <div className="standard-medication__spec" key={spec.id}>
              <strong>{spec.substanceQualifier && `（${spec.substanceQualifier}）`}{spec.doseFormName}</strong>
              <p>{spec.specification}</p><small>{strengthText(spec)}</small>
              {onSetup && detail.data.entryType !== 'SCOPE' && <div className="standard-medication__spec-action">
                <Button variant="secondary" disabled={setupDisabled}
                  aria-label={`建立本院药品 ${spec.doseFormName} ${spec.specification}`}
                  onClick={() => onSetup(detail.data!, spec)}>建立本院药品</Button>
              </div>}
            </div>)}
            {detail.data.issues.length > 0 && <><h4>待核验事项</h4>{detail.data.issues.map((issue,i) =>
              <div className="standard-medication__issue" key={i}><strong>{reasons[issue.reason] ?? issue.reason}</strong><p>{issue.sourceText || detail.data.sourceNote}</p></div>)}</>}
            <details><summary>查看来源原文与版本</summary><p className="standard-medication__source">{detail.data.sourceSpecification || '原文以范围注释列示'}</p>
              <p>{detail.data.sourceNote}</p><small>来源文件校验值：{detail.data.source.sha256}</small></details>
          </>}
      </aside>
    </div>
  </section>
}
