import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type StandardMedicationDetail, type StandardMedicationSpecification } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, LoadingState, Pagination, SearchField, Select } from '../../shared/ui'
import './standard-medication-catalog.css'
import { StandardCatalogEditionsDialog } from './StandardCatalogEditionsDialog'
import { StandardCatalogSourceReviewDialog } from './StandardCatalogSourceReviewDialog'
import { MedicationStandardImpactDialog } from './MedicationStandardImpactDialog'
import { StandardCatalogPdfDialog } from './StandardCatalogPdfDialog'

const reasons: Record<string, string> = {
  STANDARD_SPECIFICATION_INCOMPLETE: '标准规格不完整，不能作为具体药品身份',
  STANDARD_SOURCE_FORM_BLOCK_REQUIRES_REVIEW: '原文剂型段落未正确分开，须核对规格归属',
  STANDARD_COMPOSITION_FRAGMENT_REQUIRES_REVIEW: '成分说明被拆成规格片段，须恢复完整规格',

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
  const [inputQuery, setInputQuery] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [type, setType] = useState('')
  const [state, setState] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [selected, setSelected] = useState('')
  const [editionsOpen, setEditionsOpen] = useState(false)
  const [entryReviewOpen, setEntryReviewOpen] = useState(false)
  const [impactOpen, setImpactOpen] = useState(false)
  const [pdfOpen, setPdfOpen] = useState(false)
  const [initialPdfLocation, setInitialPdfLocation] = useState<string | undefined>()

  const summary = useQuery({ queryKey: ['medication-standard-summary'], queryFn: api.masterData.standardMedicationSummary })
  // The source review is catalog-wide, while the transcription check is per
  // entry. Load both so the table does not make a checked entry look like it
  // was never reviewed just because the source approval is still pending.
  const entryReviews = useQuery({
    queryKey: ['catalog-entry-reviews', 'runtime'],
    queryFn: () => api.standardCatalogEditions.entryReviews('0'),
    enabled: typeof api.standardCatalogEditions?.entryReviews === 'function',
    retry: false,
  })
  const list = useQuery({
    queryKey: ['medication-standard-list', appliedQuery, type, state, page, size],
    queryFn: () => api.masterData.standardMedications(appliedQuery, type, state, page, size),
  })
  const detail = useQuery({
    queryKey: ['medication-standard-detail', selected],
    queryFn: () => api.masterData.standardMedicationDetail(selected),
    enabled: Boolean(selected),
  })

  useEffect(() => {
    setPage(0)
    setSelected('')
  }, [appliedQuery, type, state, size])

  const handleSearch = () => {
    setAppliedQuery(inputQuery.trim())
    setPage(0)
    setSelected('')
  }

  const handleReset = () => {
    setInputQuery('')
    setAppliedQuery('')
    setType('')
    setState('')
    setPage(0)
    setSelected('')
  }

  const error = summary.error || list.error || detail.error
  const stats = summary.data?.statistics
  return <section className="standard-medication" aria-label="标准药品参考目录">
    {editionsOpen && <StandardCatalogEditionsDialog api={api} onClose={() => setEditionsOpen(false)} />}
    {entryReviewOpen && <StandardCatalogSourceReviewDialog api={api} onClose={() => {
      setEntryReviewOpen(false)
      void entryReviews.refetch()
      void summary.refetch()
      void list.refetch()
    }} />}
    {impactOpen && summary.data && <MedicationStandardImpactDialog api={api} catalogId={summary.data.catalogId} entry={detail.data} onClose={() => setImpactOpen(false)} />}
    <div className="standard-medication__header">
      <div className="standard-medication__title-group">
        <div className="standard-medication__title-row">
          <h2>标准药品参考目录</h2>
          <span className="standard-medication__version-tag">版本 {summary.data?.catalogVersion ?? '—'}</span>
        </div>
        <p className="standard-medication__subtitle">按品种、剂型与规格整理，支持追溯原文与核对差异</p>
      </div>
      <div className="standard-medication__stats-bar">
        {[
          ['目录条目', stats?.entries],
          ['独立剂型规格', stats?.specifications],
          ['范围条目', stats?.scopeEntries],
          ['待核验项', stats?.issues],
        ].map(([label, value]) => (
          <div key={label} className="standard-medication__stat-pill">
            <span className="stat-label">{label}</span>
            <strong className="stat-value">{value ?? '—'}</strong>
          </div>
        ))}
      </div>
    </div>

    <div className="standard-medication__toolbar-row">
      <form
        className="standard-medication__toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          handleSearch()
        }}
      >
        <SearchField
          label="搜索标准药品"
          value={inputQuery}
          onChange={setInputQuery}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleSearch()
            }
          }}
          placeholder="通用名、英文名、拼音、分类、规格或旧编码（回车或点击查询）"
        />
        <Select
          value={type}
          onChange={(val) => {
            setType(val)
            setPage(0)
          }}
          placeholder="全部类型"
          options={[
            { value: 'WESTERN', label: '化学药品和生物制品' },
            { value: 'CHINESE_PATENT', label: '中成药' },
          ]}
        />
        <Select
          value={state}
          onChange={(val) => {
            setState(val)
            setPage(0)
          }}
          placeholder="全部条目"
          options={[
            { value: 'STRUCTURED', label: '已有独立规格' },
            { value: 'REVIEW', label: '有待核验项' },
            { value: 'SCOPE', label: '范围条目' },
          ]}
        />
        <div className="standard-medication__toolbar-actions">
          <Button variant="primary" type="submit" aria-label="查询标准药品">查询</Button>
          <Button variant="secondary" type="button" onClick={handleReset} aria-label="重置查询">重置</Button>
        </div>
      </form>
      <p className="standard-medication__notice" role="note">
        来源：{summary.data?.source.title ?? '用户提供目录'}。
        已通过目录准入核对；具体规格及临床知识仍须分别核对。{summary.data?.source.publicationNumber && <>官方发布信息：{summary.data.source.publicationNumber}，{summary.data.source.effectiveFrom} 施行。<a href={summary.data.source.officialUrl} target="_blank" rel="noreferrer">查看官方通知</a>。</>}
        选择具体规格后可建立本院药品、配置厂家产品与价格。
        <Button variant="secondary" size="sm" disabled={setupDisabled} onClick={() => setEditionsOpen(true)}>目录版次与差异</Button>
        <Button variant="secondary" size="sm" onClick={() => setEntryReviewOpen(true)}>逐条核对目录</Button>
        <Button variant="secondary" size="sm" disabled={!summary.data?.catalogId} onClick={() => setImpactOpen(true)}>标准变更影响清单</Button>
        <Button variant="secondary" size="sm" onClick={() => { setInitialPdfLocation(undefined); setPdfOpen(true) }}>官方原件 PDF</Button>
      </p>
    </div>

    {error && <Alert>{errorMessage(error)}</Alert>}

    <div className="standard-medication__workspace">
      <div className="standard-medication__list">
        {list.isPending ? <LoadingState /> : <>
          <div className="standard-medication__table-scroll"><table className="master-data-table">
            <thead>
              <tr>
                <th>药品 / 旧目录编码</th>
                <th>目录分类</th>
                <th className="ui-table-cell--numeric">规格</th>
                <th className="ui-table-cell--status">条目核对</th>
              </tr>
            </thead>
            <tbody>{list.data?.content.map(entry => (
              <tr
                key={entry.id}
                className={`standard-medication__row ${selected === entry.id ? 'is-selected' : ''}`}
                onClick={() => setSelected(entry.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(entry.id)
                  }
                }}
              >
                <td><strong>{entry.name}</strong><small>{entry.legacyCode}</small></td>
                <td>{entry.categories[0]?.sub || entry.categories[0]?.major}<small>{entry.entryType === 'SCOPE' ? '范围条目 · 不可直接开立' : entry.innName || '中成药'}</small></td>
                <td className="ui-table-cell--numeric">{entry.specificationCount}</td>
                <td className="ui-table-cell--status">{(() => {
                  const review = entryReviews.data?.entries.find(item => item.entryId === entry.id)
                  if (review?.status === 'CHECKED') return '已核对'
                  if (review?.status === 'ISSUE') return '有问题'
                  return entry.issueCount ? `${entry.issueCount} 项待处理` : '待核对'
                })()}</td>
              </tr>
            ))}</tbody>
          </table></div>
          {!list.data?.content.length && <EmptyState icon="pharmacy" title="没有匹配的目录条目" copy="请调整名称、分类或核验筛选条件。" />}
          <Pagination page={page} totalPages={Math.max(1,list.data?.totalPages ?? 1)} total={list.data?.totalElements ?? 0}
            pageSize={size} onPageSizeChange={setSize} onChange={setPage} label="标准药品目录分页" />
        </>}
      </div>
      <aside className="standard-medication__detail" aria-label="标准药品详情">
        {!selected ? <EmptyState icon="pharmacy" title="选择药品查看依据" copy="点击左侧任意行查看独立规格、物质限定、强度结构与原文位置。" />
          : detail.isPending ? <LoadingState /> : detail.data && <>
            <div className="standard-medication__detail-summary">
              <div className="standard-medication__detail-header">
                <h3>{detail.data.name}</h3>
                <span className="standard-medication__muted">{detail.data.innName || detail.data.legacyCode}</span>
              </div>
              <div className="standard-medication__meta-grid">
                <div className="meta-item"><span className="meta-label">标准品种 ID</span><span className="meta-value">{detail.data.id}</span></div>
                <div className="meta-item meta-item--wide">
                  <span className="meta-label">原文位置</span>
                  <div className="meta-value standard-medication__source-locs">
                    <span className="source-loc-text">{detail.data.sourceLocations.join('；')}</span>
                    {detail.data.pdfLocations && detail.data.pdfLocations.length > 0 ? (
                      detail.data.pdfLocations.map((loc) => (
                        <Button
                          key={loc.location}
                          variant="secondary"
                          size="sm"
                          className="standard-medication__pdf-jump-btn"
                          onClick={() => {
                            setInitialPdfLocation(loc.location)
                            setPdfOpen(true)
                          }}
                          aria-label={`查看原件 ${loc.location} 第 ${loc.page} 页`}
                        >
                          📄 查看原件 (第 {loc.page} 页 / P.{loc.printPage})
                        </Button>
                      ))
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="standard-medication__pdf-jump-btn"
                        onClick={() => {
                          setInitialPdfLocation(undefined)
                          setPdfOpen(true)
                        }}
                        aria-label="查看官方原件"
                      >
                        📄 查看官方原件
                      </Button>
                    )}
                  </div>
                </div>
                <div className="meta-item meta-item--wide"><span className="meta-label">目录标记</span><span className="meta-value">{detail.data.specialistGuidance ? '需相应处方资质或专科医师指导（原文 △）' : '原文未标注专科指导'}</span></div>
              </div>
            </div>

            <div className="standard-medication__section-header">
              <h4>独立剂型规格 · {detail.data.specifications.length} 条</h4>
            </div>
            <div className="standard-medication__spec-table-wrap">
              <table className="standard-medication__spec-table">
                <thead>
                  <tr>
                    <th style={{ width: '28%' }}>剂型形态</th>
                    <th style={{ width: '28%' }}>规格说明</th>
                    <th style={{ width: '24%' }}>强度语义</th>
                    {onSetup && detail.data.entryType !== 'SCOPE' && (
                      <th style={{ width: '20%', textAlign: 'right' }}>操作</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {detail.data.specifications.map(spec => (
                    <tr key={spec.id} className="standard-medication__spec-tr">
                      <td>
                        <span className="standard-medication__dose-tag">
                          {spec.substanceQualifier && <small className="substance">{spec.substanceQualifier} · </small>}
                          {spec.doseFormName}
                        </span>
                      </td>
                      <td className="standard-medication__spec-val">
                        <strong>{spec.specification}</strong>{spec.identityIssues?.map(issue => <small key={issue}>{reasons[issue] ?? '标准身份待核对'}</small>)}
                      </td>
                      <td className="standard-medication__spec-strength">
                        <span>{strengthText(spec)}</span>
                      </td>
                      {onSetup && detail.data.entryType !== 'SCOPE' && (
                        <td style={{ textAlign: 'right' }}>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={setupDisabled || !!spec.identityIssues?.length}
                            aria-label={`建立本院药品 ${spec.doseFormName} ${spec.specification}`}
                            onClick={() => onSetup(detail.data!, spec)}
                          >
                            建立本院药品
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {detail.data.issues.length > 0 && <div className="standard-medication__issues-wrap">
              <h4>待核验事项</h4>
              {detail.data.issues.map((issue,i) =>
                <div className="standard-medication__issue" key={i}><strong>{reasons[issue.reason] ?? issue.reason}</strong><p>{issue.sourceText || detail.data.sourceNote}</p></div>)}
            </div>}
            <details className="standard-medication__provenance"><summary>查看来源原文与版本</summary><p className="standard-medication__source">{detail.data.sourceSpecification || '原文以范围注释列示'}</p>
              <p>{detail.data.sourceNote}</p><small>来源文件校验值：{detail.data.source.sha256}</small></details>
          </>}
      </aside>
    </div>
    {pdfOpen && <StandardCatalogPdfDialog api={api} entry={detail.data} initialLocation={initialPdfLocation} onClose={() => setPdfOpen(false)} />}
  </section>
}
