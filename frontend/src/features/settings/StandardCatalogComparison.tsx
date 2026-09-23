import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type StandardCatalogIdentity, type StandardMedicationEntry, type StandardMedicationSpecification } from '../../shared/rhnApi'
import type { CatalogEntryReviewView } from '../../shared/api/standardCatalogEditionApi'
import { Button, FormField, LoadingState, PanelHead, SearchField, Select, StatusBadge } from '../../shared/ui'
import { StandardCatalogPdfPage } from './StandardCatalogPdfPage'
import { WorkspacePane } from '../../shared/ui/templates/PageTemplates'

const sourcePdfHash = '25671de0d85d12e409d79764d48865522e03122d8e9c1b0957a7ad1c8bf97e8e'
const sameIdentity = (a: StandardCatalogIdentity, b: StandardCatalogIdentity) => a.catalogId === b.catalogId && a.catalogVersion === b.catalogVersion && a.contentHash === b.contentHash && a.sourceHash === b.sourceHash
function specificationGroups(specifications: (StandardMedicationSpecification & {entryId: string})[]) {
  const groups = new Map<string, (StandardMedicationSpecification & {entryId: string})[]>()
  specifications.forEach(spec => {
    const qualifier = spec.substanceQualifier?.trim() || ''
    const values = groups.get(qualifier) ?? []
    values.push(spec)
    groups.set(qualifier, values)
  })
  return [...groups.entries()].map(([qualifier, values]) => ({qualifier, specifications: values}))
}
function isReviewFragment(spec: StandardMedicationSpecification) {
  if (spec.identityIssues?.length) return true
  const value = spec.specification.trim()
  const hasRatio = /[:：]/.test(value)
  const hasStrengthUnit = /(mg|g|μg|µg|ug|ml|mL|万单位|单位|片|粒|袋|瓶|支|丸|贴|枚)/i.test(value)
  return hasRatio && !hasStrengthUnit
}
export function StandardCatalogComparison({api, identity, content, editionId = '0', onBusy}: {
  api: RhnApi; identity: StandardCatalogIdentity; content: Record<string, unknown>; editionId?: string; onBusy?: (busy: boolean) => void
}) {
  const client = useQueryClient()
  const [search, setSearch] = useState(''), [selectedId, setSelectedId] = useState(''), [scope, setScope] = useState('ALL')
  const [locationIndex, setLocationIndex] = useState(0), [issue, setIssue] = useState(false), [note, setNote] = useState('')
  const [readyPage, setReadyPage] = useState(0)
  const [url, setUrl] = useState(''), [fileError, setFileError] = useState(''), [message, setMessage] = useState('')
  const source = content.source as Record<string, unknown>
  const supported = source.claimedEdition === '2026' && source.officialAttachmentSha256 === sourcePdfHash
  const document = useQuery({queryKey: ['catalog-review-pdf', sourcePdfHash], queryFn: () => api.masterData.downloadStandardCatalogSourceDocument(), enabled: supported, retry: false})
  const reviewKey = ['catalog-entry-reviews', editionId, identity.contentHash, identity.sourceHash]
  const reviews = useQuery({queryKey: reviewKey, queryFn: () => api.standardCatalogEditions.entryReviews(editionId), retry: false})
  const matching = !!reviews.data && sameIdentity(reviews.data.identity, identity)
  const saved = matching ? reviews.data!.entries : []
  useEffect(() => {
    let active = true, objectUrl = ''
    setUrl(''); setReadyPage(0); setFileError('')
    if (supported && document.data) void (async () => {
      const bytes = await document.data.arrayBuffer()
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('')
      if (!active) return
      if (hash !== sourcePdfHash) {setFileError('原稿校验失败，请重新加载。'); return}
      objectUrl = URL.createObjectURL(document.data); setUrl(objectUrl)
    })().catch(error => {if (active) setFileError(errorMessage(error))})
    return () => {active = false; if (objectUrl) URL.revokeObjectURL(objectUrl)}
  }, [document.data, supported])
  const entries = (Array.isArray(content.entries) ? content.entries : []) as StandardMedicationEntry[]
  const specifications = (Array.isArray(content.specifications) ? content.specifications : []) as (StandardMedicationSpecification & {entryId: string})[]
  const filtered = entries.filter(e => `${e.name} ${e.innName ?? ''} ${e.legacyCode} ${e.pinyinCode ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())
    && (scope === 'ALL' || (saved.find(r => r.entryId === e.id)?.status ?? 'PENDING') === scope))
  const selected = filtered.find(e => e.id === selectedId) ?? filtered[0]
  const index = selected ? filtered.indexOf(selected) : -1
  const record = saved.find(e => e.entryId === selected?.id)
  const locations = selected?.pdfLocations ?? []
  const location = locations[locationIndex] ?? locations[0]
  const select = (id: string) => {setSelectedId(id); setLocationIndex(0); setIssue(false); setNote(''); setMessage('')}
  const mutation = useMutation({mutationFn: async (status: 'CHECKED' | 'ISSUE') => {
    if (!selected || !matching || !url || !location) throw new Error('请先加载当前条目及对应原稿')
    return api.standardCatalogEditions.reviewEntry(editionId, selected.id, {identity, expectedRevision: record?.revision ?? 0, status, note: status === 'ISSUE' ? note.trim() : ''})
  }, onSuccess: event => {
    const next = filtered[index + 1]
    client.setQueryData<CatalogEntryReviewView>(reviewKey, old => old ? {...old, entries: [...old.entries.filter(e => e.entryId !== event.entryId), event]} : old)
    setIssue(false); setNote(''); setLocationIndex(0)
    if (next) setSelectedId(next.id)
    setMessage(`${selected?.name ?? ''}：${event.status === 'CHECKED' ? '已核对' : '已记录问题'}${!next ? '，当前列表已到末条' : ''}`)
  }})
  useEffect(() => {onBusy?.(mutation.isPending); return () => onBusy?.(false)}, [mutation.isPending, onBusy])
  const disabled = mutation.isPending || reviews.isFetching || reviews.isError || !matching || !supported || !url || !location || readyPage !== location.page
  const checked = saved.filter(e => e.status === 'CHECKED').length
  return <div className="catalog-review__comparison">
    <WorkspacePane label="来源原稿" scroll="content" header={<PanelHead title="来源原稿" meta={location ? `第 ${location.page} 页${location.printPage ? ` / 印刷页 ${location.printPage}` : ''}` : '尚无页码定位'} actions={url && location ? <a href={`${url}#page=${location.page}`} target="_blank" rel="noreferrer">新窗口打开</a> : undefined} />}>
      <div className="catalog-review__document">
        {!supported && <p>当前仅支持国家基本药物目录（2026年版）的已登记官方原稿。</p>}
        {supported && document.isFetching && <LoadingState label="正在加载原稿…" />}
        {(document.error || fileError) && <p role="alert">{fileError || errorMessage(document.error)} <Button variant="secondary" onClick={() => void document.refetch()}>重新加载</Button></p>}
        {supported && selected && !location && <p>此条目尚无原稿页码，暂不能快捷核验。</p>}
        {url && location && document.data && <StandardCatalogPdfPage blob={document.data} page={location.page} onReady={setReadyPage} />}
      </div>
    </WorkspacePane>
    <WorkspacePane label="电子目录" resetScrollKey={selected?.id} header={<>
      <PanelHead title="电子目录" meta={`已核对 ${checked} / ${entries.length} · 有问题 ${saved.filter(e => e.status === 'ISSUE').length}`} />
      <div className="catalog-review__filters"><SearchField label="搜索电子目录" value={search} disabled={mutation.isPending} onChange={value => {setSearch(value); select('')}} placeholder="药品名称、拼音或编码" />
        <Select aria-label="核对状态筛选" value={scope} disabled={mutation.isPending} clearable={false} onChange={value => {setScope(value); select('')}} options={[{value: 'ALL', label: '全部条目'}, {value: 'PENDING', label: '待核对'}, {value: 'CHECKED', label: '已核对'}, {value: 'ISSUE', label: '有问题'}]} /></div>
      <Select aria-label="选择核对条目" value={selected?.id ?? ''} disabled={mutation.isPending} clearable={false} onChange={select} options={filtered.map(e => ({value: e.id, label: `${e.name} · ${e.legacyCode}`}))} />
    </>} footer={<div className="catalog-review__decision">
      <div className="catalog-review__actions"><Button variant="secondary" disabled={mutation.isPending || index <= 0} onClick={() => select(filtered[index - 1].id)}>上一条</Button>
        <span>{index + 1} / {filtered.length}</span><Button variant="secondary" disabled={mutation.isPending || index < 0 || index >= filtered.length - 1} onClick={() => select(filtered[index + 1].id)}>下一条</Button>
        <Button variant="secondary" disabled={disabled || !selected} onClick={() => setIssue(!issue)}>有问题</Button>
        <Button disabled={disabled || !selected || issue} onClick={() => mutation.mutate('CHECKED')}>核对无误，下一条</Button></div>
      {message && <span role="status">{message}</span>}
      {mutation.error && <p role="alert">{errorMessage(mutation.error)} <Button variant="secondary" onClick={() => void reviews.refetch()}>刷新核对结果</Button></p>}
    </div>}>
      {reviews.isPending && <LoadingState label="正在读取核对进度…" />}
      {reviews.error && <p role="alert">{errorMessage(reviews.error)} <Button onClick={() => void reviews.refetch()}>重试</Button></p>}
      {reviews.data && !matching && <p role="alert">目录版本已变化，请关闭后重新打开。</p>}
      {!selected && <p>没有符合条件的条目。</p>}
      {selected && <article className="catalog-review__entry">
        <div className="catalog-review__entry-heading"><h3>{selected.name}</h3><StatusBadge tone={record?.status === 'CHECKED' ? 'success' : 'warning'}>{record?.status === 'CHECKED' ? '已核对' : record?.status === 'ISSUE' ? '有问题' : '待核对'}</StatusBadge></div>
        <p>{selected.innName}</p>
        <h4>电子规格</h4>
        {(() => {
          const groups = specificationGroups(specifications.filter(spec => spec.entryId === selected.id && !isReviewFragment(spec)))
          const reviewFragments = specifications.filter(spec => spec.entryId === selected.id && isReviewFragment(spec))
          const hasQualifier = groups.some(group => group.qualifier)
          return <div className="catalog-review__spec-groups">
            {hasQualifier && <p className="catalog-review__spec-hint">盐型属于药品身份限定；建立本院可开立药品时会进入药品名称，不能只按规格数值合并。</p>}
            {groups.map(group => <section key={group.qualifier || 'UNQUALIFIED'} className="catalog-review__spec-group">
              {hasQualifier && <h5>{group.qualifier || '未限定盐型'}</h5>}
              <ul>{group.specifications.map(spec => <li key={spec.id}>{spec.doseFormName || spec.doseForm} · {spec.specification}</li>)}</ul>
            </section>)}
            {reviewFragments.length > 0 && <section className="catalog-review__spec-group catalog-review__spec-group--warning">
              <h5>待核对片段（不可直接建档）</h5>
              <p className="catalog-review__spec-hint">以下内容只有比例或成分片段，保留用于追溯原文，不能作为本院可开立药品的完整规格。请结合原文补充具体含量后再建档。</p>
              <ul>{reviewFragments.map(spec => <li key={spec.id}><strong>{spec.doseFormName || spec.doseForm}</strong> · {spec.specification}</li>)}</ul>
            </section>}
          </div>
        })()}
        <details><summary>查看转录原文</summary><p>{selected.sourceSpecification || '原稿未列规格'}</p>{selected.sourceNote && <p>{selected.sourceNote}</p>}</details>
        {locations.length > 1 && <div className="catalog-review__actions">{locations.map((loc, i) => <Button key={i} size="sm" variant="secondary" aria-pressed={locationIndex === i} onClick={() => setLocationIndex(i)}>出处 {i + 1} · 第 {loc.page} 页</Button>)}</div>}
        {record && <p>{record.actor} · {new Date(record.recordedAt).toLocaleString()}{record.note && ` · ${record.note}`}</p>}
        {issue && <div><FormField label="问题说明" required><input autoFocus maxLength={1000} value={note} disabled={mutation.isPending} onChange={e => setNote(e.target.value)} placeholder="例如：原稿为 0.5g，电子规格录为 5g" /></FormField>
          <Button disabled={disabled || !note.trim()} onClick={() => mutation.mutate('ISSUE')}>记录问题，下一条</Button></div>}
      </article>}
    </WorkspacePane>
  </div>
}
