import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Button, Dialog, EmptyState, LoadingState, PanelHead, Pagination, RelationshipGraph, SearchField, Select, StatusBadge, Tabs } from '../../shared/ui'
import { MasterDetailPage } from '../../shared/ui/templates/PageTemplates'
import { schemaRelationPresentation, schemaReviewPresentation } from '../../shared/presentation'
import { AnnotationEditor } from './AnnotationEditor'
import { AiContextPanel } from './AiContextPanel'
import { ChecksPanel } from './ChecksPanel'
import { DocumentationPanel } from './DocumentationPanel'
import { SemanticPanel, ProposalReview } from './SemanticPanel'
import { StructurePanel } from './StructurePanel'
import { messageOf, request, WorkbenchError, type Catalog, type Job } from './api'

type Tab = 'structure' | 'relations' | 'semantic' | 'collaboration' | 'checks' | 'standards' | 'ai'
const tabs: { value: Tab; label: string }[] = [{ value: 'structure', label: '字段与约束' }, { value: 'relations', label: '表关系' },
  { value: 'semantic', label: '业务语义' }, { value: 'collaboration', label: '人机共建' }, { value: 'checks', label: '结构检查' }, { value: 'standards', label: '设计规范' }, { value: 'ai', label: 'AI 上下文' }]
const tabFromUrl = (value: string | null): Tab => tabs.some(tab => tab.value === value) ? value as Tab : 'structure'

export function SchemaWorkbench() {
  const [catalog, setCatalog] = useState<Catalog | null>(null), [loading, setLoading] = useState(true)
  const [error, setError] = useState(''), [forbidden, setForbidden] = useState(false), [notice, setNotice] = useState('')
  const initialParams = new URLSearchParams(window.location.search)
  const [selected, setSelected] = useState(initialParams.get('table') ?? '')
  const [tab, setTab] = useState<Tab>(tabFromUrl(initialParams.get('tab'))), [domain, setDomain] = useState('all'), [query, setQuery] = useState(''), [page, setPage] = useState(0)
  const [relationKind, setRelationKind] = useState('all'), [dirty, setDirty] = useState(false), [pendingTable, setPendingTable] = useState('')
  const [job, setJob] = useState<Job | null>(null), [refreshMode, setRefreshMode] = useState('all')
  const load = useCallback(async () => {
    setError(''); setForbidden(false)
    try {
      const data = await request<Catalog>('catalog'); setCatalog(data); setJob(data.job)
      const entity = new URLSearchParams(window.location.search).get('entity')
      setSelected(current => data.tables.some(t => t.physical === current) ? current
        : data.semantic.nodes.find(n => n.id === entity)?.table || data.tables.find(t => t.physical === 'RHN_VIS_ENC')?.physical || data.tables[0]?.physical || '')
    } catch (e) { setError(messageOf(e)); setForbidden(e instanceof WorkbenchError && e.status === 403) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const url = new URL(window.location.href)
    if (selected) url.searchParams.set('table', selected)
    else url.searchParams.delete('table')
    url.searchParams.set('tab', tab)
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
  }, [selected, tab])
  useEffect(() => {
    if (!dirty) return
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', prevent)
    return () => window.removeEventListener('beforeunload', prevent)
  }, [dirty])
  useEffect(() => {
    if (job?.status !== 'running') return
    let active = true
    const timer = setInterval(async () => {
      try {
        const next = await request<Job>('job')
        if (!active) return
        setJob(next)
        if (next.status !== 'running') { clearInterval(timer); await load(); setNotice(next.message) }
      } catch (e) { if (active) { clearInterval(timer); setError(messageOf(e)); setJob(current => current ? { ...current, status: 'failed' } : null) } }
    }, 1500)
    return () => { active = false; clearInterval(timer) }
  }, [job?.status, load])
  async function refresh() {
    if (job?.status === 'running') return
    setError(''); setNotice('')
    try { setJob(await request<Job>('refresh', 'POST', { mode: refreshMode })) } catch (e) { setError(messageOf(e)) }
  }
  function selectTable(name: string) {
    if (!catalog?.tables.some(t => t.physical === name)) { setNotice('该表尚未登记在当前目录中，请查看结构差异或语义映射。'); return }
    if (name === selected) return
    if (dirty) { setPendingTable(name); return }
    setSelected(name)
  }
  const table = catalog?.tables.find(t => t.physical === selected)
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return (catalog?.tables ?? []).filter(t => (domain === 'all' || t.domain === domain)
      && (!term || `${t.physical} ${t.logical} ${t.legacy} ${t.comment} ${t.columns.map(c => `${c.physical} ${c.logical} ${c.comment}`).join(' ')}`.toLowerCase().includes(term)))
  }, [catalog, domain, query])
  const pageSize = 20, currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / pageSize) - 1))
  const related = (catalog?.relations ?? []).filter(r => relationKind === 'all' || r.kind === relationKind)
  const tableRelations = related.filter(r => r.sourceTable === selected || r.targetTable === selected)
  const status = schemaReviewPresentation(table?.annotation.reviewState ?? 'draft')
  const shortName = (comment: string) => comment.split(/[，；,;]/)[0]
  const saved = () => { void load(); setNotice('已保存到项目资料，后续可进入 Git 评审。') }
  return <main className="schema-workbench">
    <MasterDetailPage title="表结构与业务语义工作台" eyebrow="开发工具" description="查看存储结构、关联业务语义，共同维护数据库知识与设计规范。"
      actions={<><a href="/analytics?view=ontology">统计语义工作台</a><Button busy={job?.status === 'running'} busyLabel="正在采集" disabled={dirty} onClick={() => void refresh()}>刷新结构</Button></>}
      feedback={<>{error && <Alert duration={null} onDismiss={() => setError('')}>{error}</Alert>}{notice && <Alert tone="info" onDismiss={() => setNotice('')}>{notice}</Alert>}
        <div className="schema-summary"><span><strong>{catalog?.tables.length ?? '—'}</strong> 张表</span><span><strong>{catalog?.tables.reduce((n, t) => n + t.columns.length, 0) ?? '—'}</strong> 个字段</span>
          <span><strong>{catalog?.relations.filter(r => r.kind === 'foreign-key').length ?? '—'}</strong> 条外键</span><span><strong>{catalog?.semantic.nodes.length ?? '—'}</strong> 个统计实体</span>
          <span>{catalog?.stale ? '源文件已变化，请刷新结构' : catalog?.expected ? '结构来源已同步' : '尚未采集迁移结构'}</span>
          <span>{job?.status === 'running' ? job.message : dirty ? '有未保存的业务说明' : catalog?.oracle ? `Oracle 快照：${catalog.oracle.capturedAt.replace('T', ' ').slice(0, 19)} UTC` : 'Oracle 尚无快照'}</span>
          <Select aria-label="刷新结构来源" value={refreshMode} onChange={setRefreshMode} disabled={job?.status === 'running'} clearable={false}
            options={[{ value: 'all', label: '迁移结构 + Oracle' }, { value: 'expected', label: '仅迁移验证结构' }, { value: 'oracle', label: '仅 Oracle 快照' }]} />
        </div></>}
      navigationLabel="数据库表目录" navigationResetScrollKey={`${domain}:${query}:${currentPage}`}
      navigationHeader={<>
        <PanelHead title="业务域与表目录" meta={`${filtered.length} 张`} />
        <Select aria-label="数据库业务域" value={domain} onChange={value => { setDomain(value); setPage(0) }} clearable={false}
          options={[{ value: 'all', label: '全部业务域' }, ...(catalog?.domains ?? []).map(d => ({ value: d.code, label: `${d.code} · ${d.name}`, trailingText: String(d.count) }))]} />
        <SearchField label="搜索表与字段" value={query} onChange={value => { setQuery(value); setPage(0) }} placeholder="中文、物理名、逻辑名或字段" />
      </>}
      navigationFooter={<Pagination label="表目录分页" total={filtered.length} page={currentPage} totalPages={Math.ceil(filtered.length / pageSize)} onChange={setPage} />}
      navigation={<>
        <div className="schema-directory">{filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(t => <Button key={t.physical} variant="text" title={t.comment} aria-pressed={selected === t.physical} onClick={() => selectTable(t.physical)}>
          <span className="schema-directory__text"><strong>{shortName(t.comment)}</strong><small>{t.physical}</small><small>{t.logical}</small></span>
        </Button>)}</div>
        {!loading && !filtered.length && <p>没有匹配的表，请调整搜索条件。</p>}
      </>}
      detailLabel="数据库表详情" detailScroll={['structure', 'checks', 'standards'].includes(tab) ? 'content' : 'pane'} detailResetScrollKey={`${selected}:${tab}`}
      detailHeader={table && !loading && !forbidden ? <>
        <PanelHead title={shortName(table.comment)} meta={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>} />
        <div className="schema-identity"><code>{table.physical}</code><span>{table.logical}</span></div>
        <p className="schema-table-description">{table.comment}</p>
        <Tabs label="数据库工作台视图" value={tab} onChange={setTab} items={tabs} />
      </> : undefined}>
      {loading ? <LoadingState label="正在读取数据库协作目录…" /> : forbidden || !catalog ? <EmptyState icon={forbidden ? 'lock' : 'database'} title={forbidden ? '当前连接无权访问开发工作台' : '目录读取失败'} copy={error || '请重新加载'} action={<Button variant="secondary" onClick={() => void load()}>重新加载目录</Button>} />
        : !table ? <EmptyState icon="database" title="尚无表目录" copy="请核对项目物理映射文件。" /> : <>
          {tab === 'structure' && <StructurePanel table={table} hasOracle={Boolean(catalog.oracle)} />}
          {tab === 'relations' && <><PanelHead title="当前表的直接关联" meta={`${tableRelations.length} 条`} />
            <div className="schema-toolbar"><Select aria-label="关系类型筛选" value={relationKind} onChange={setRelationKind} clearable={false} options={[
              { value: 'all', label: '全部关系' }, { value: 'foreign-key', label: '数据库外键' }, { value: 'logical', label: '业务逻辑关联' }, { value: 'candidate', label: '待核对候选' },
            ]} /><Button variant="secondary" onClick={() => setTab('collaboration')}>补充业务关系</Button></div>
            <RelationshipGraph nodes={catalog.tables.map(t => ({ id: t.physical, label: t.comment.split('；')[0], detail: t.physical }))}
              edges={related.map(r => ({ id: r.id, source: r.sourceTable, target: r.targetTable, label: `${schemaRelationPresentation(r.kind).label} · ${r.cardinality}`,
                detail: r.sourceColumns.map((c, i) => `${c} = ${r.targetColumns[i]}`).join(' AND '), tentative: r.kind === 'candidate' || r.reviewState === 'draft' }))} selected={selected} onSelect={selectTable} />
            <details><summary>查看关系依据</summary>{tableRelations.map(r => <p key={r.id}><strong>{r.id}</strong><br />{r.description} {r.evidence} · {schemaReviewPresentation(r.reviewState).label}</p>)}</details>
          </>}
          {tab === 'semantic' && <SemanticPanel key={selected} catalog={catalog} table={table} onSelect={selectTable} />}
          <section hidden={tab !== 'collaboration'}><AnnotationEditor key={`${selected}:${table.annotation.revision}`} table={table} tables={catalog.tables} onDirty={setDirty} onSaved={saved} />
            <ProposalReview proposals={catalog.proposals} onSaved={saved} /></section>
          {tab === 'checks' && <ChecksPanel catalog={catalog} selected={selected} onSelect={selectTable} />}
          {tab === 'standards' && <DocumentationPanel documents={catalog.documents} />}
          {tab === 'ai' && <AiContextPanel key={selected} table={table} />}
        </>}
    </MasterDetailPage>
    {pendingTable && <Dialog title="当前业务说明尚未保存" description="切换表会丢弃当前表尚未保存的编辑。" onClose={() => setPendingTable('')} closeOnBackdrop={false}
      footer={<><Button variant="secondary" onClick={() => setPendingTable('')}>继续编辑</Button><Button onClick={() => { setDirty(false); setSelected(pendingTable); setPendingTable('') }}>放弃编辑并切换</Button></>}><p>也可以先关闭此提示，保存业务说明后再切换。</p></Dialog>}
  </main>
}
