import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type StandardCatalogEvidence, type StandardCatalogReviewAction } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, LoadingState, Pagination, StatusBadge } from '../../shared/ui'

import './standard-catalog-source-review.css'

export const sourceReviewStatus: Record<string, string> = { UNVERIFIED: '待提交核验', SUBMITTED: '待复核', VERIFIED: '来源已核验', REJECTED: '材料已退回', REVOKED: '核验已撤销' }
const actionLabels: Record<StandardCatalogReviewAction, string> = { SUBMIT: '提交来源材料', VERIFY: '复核通过', REJECT: '退回材料', REVOKE: '撤销核验' }

export function StandardCatalogSourceMaterialsDialog({api, onClose, editionId}: {api: RhnApi; onClose: () => void; editionId?: string}) {
  const client = useQueryClient()
  const [page, setPage] = useState(0)
  const [evidence, setEvidence] = useState<Partial<StandardCatalogEvidence>>({})
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<string>()
  const query = useQuery({queryKey: ['standard-catalog-source-review', editionId ?? 'runtime', page], queryFn: () => editionId ? api.standardCatalogEditions.detail(editionId, page).then(value => value.review) : api.masterData.standardCatalogSourceReview(page)})
  const contentQuery = useQuery({queryKey: ['catalog-review-content', editionId ?? '0'],
    queryFn: () => api.standardCatalogEditions.content(editionId ?? '0'), retry: false})
  const current = query.isError ? undefined : query.data
  const content = contentQuery.isError ? undefined : contentQuery.data
  const source = content?.source as Record<string, unknown> | undefined
  const matched = !!current && !!content && content.catalogId === current.identity.catalogId
    && content.catalogVersion === current.identity.catalogVersion && content.contentHash === current.identity.contentHash
    && source?.sha256 === current.identity.sourceHash
  const sourceText = (key: string) => matched && typeof source?.[key] === 'string' ? source[key] as string : ''
  const filledEvidence: StandardCatalogEvidence = {
    title: sourceText('title'), publisher: sourceText('publisher') || current?.latest?.evidence.publisher || '', edition: sourceText('claimedEdition'),
    location: sourceText('officialUrl') || sourceText('suppliedFile'), verificationNotes: '已对照原稿核对目录来源与版本。', ...evidence,
  }
  const seenEdition = useRef('')
  const edition = current ? JSON.stringify(current.identity) : ''
  useEffect(() => {
    if (!edition) return
    if (seenEdition.current && seenEdition.current !== edition) {
      setEvidence({}); setReason(''); setSelectedEvent(undefined)
      setFeedback('目录或来源文件已变化，旧版未提交材料已清空，请重新核对。')
    }
    seenEdition.current = edition
  }, [edition])
  const mutation = useMutation({mutationFn: (action: StandardCatalogReviewAction) => {
    if (!current) throw new Error('请先读取当前来源版本')
    const input = {identity: current.identity, expectedRevision: current.revision,
      action, reason: reason.trim() || (action === 'SUBMIT' ? '已核对来源材料，提交复核。' : '已对照原稿复核来源与版本，通过核验。'), ...(action === 'SUBMIT' ? {evidence: filledEvidence} : {})}
    return editionId ? api.standardCatalogEditions.review(editionId, input).then(value => value.review) : api.masterData.changeStandardCatalogSourceReview(input)
  }, onSuccess: async (_, action) => {
    setFeedback(`${actionLabels[action]}成功`); setReason(''); setSelectedEvent(undefined); setPage(0)
    await Promise.all(['standard-catalog-editions', 'standard-catalog-source-review', 'medication-standard-summary', 'medication-standard-detail',
      'medication-standard-readiness', 'master-data-medications'].map(key => client.invalidateQueries({queryKey: [key]})))
  }})
  const selected = current?.history.find(event => event.id === selectedEvent) ?? current?.latest
  const viewingHistory = !!selected && selected.id !== current?.latest?.id
  const canSubmit = current?.allowedActions.includes('SUBMIT')
  const complete = !canSubmit || Object.values(filledEvidence).every(value => value.trim().length > 0)
  const actions = <div className="catalog-review__actions">
    <Button variant="secondary" disabled={query.isFetching || mutation.isPending} onClick={() => {void query.refetch(); void contentQuery.refetch()}}>刷新核验状态</Button>
    {current?.allowedActions.map(action => <Button key={action}
      variant={action === 'REJECT' || action === 'REVOKE' ? 'secondary' : 'primary'}
      disabled={!complete || ((action === 'SUBMIT' || action === 'VERIFY') && (!matched || contentQuery.isFetching)) || mutation.isPending || query.isFetching || !!query.error || viewingHistory || ((action === 'REJECT' || action === 'REVOKE') && !reason.trim())}
      onClick={() => {setFeedback(''); mutation.mutate(action)}}>{actionLabels[action]}</Button>)}
  </div>
  return <Dialog title="标准目录来源核验" size="xwide" className="catalog-review-materials" onClose={mutation.isPending ? () => {} : onClose} enterNavigation={false}
    closeOnBackdrop={false} footer={actions} description="对照原稿与电子目录核对来源和版本；不代替临床知识审核。">
    {query.isPending ? <LoadingState label="正在读取来源核验记录…" /> : current && <>
      <div className="catalog-review__identity"><StatusBadge tone={current.status === 'VERIFIED' ? 'info' : 'warning'}>{sourceReviewStatus[current.status] ?? current.status}</StatusBadge>
        <span>目录 {current.identity.catalogId} · {current.identity.catalogVersion}</span><span>核验序号 {current.revision}</span>
        <span>由另一位管理人员复核；通过不代表逐条规格已核对。</span></div>
      <div className="catalog-review__support">
        <section aria-label="来源核验操作">
          {canSubmit && <>
            <p>来源：{filledEvidence.title || '待补充'} · {filledEvidence.edition || '版本待补充'}。已有信息自动带入，仅补充缺失信息。</p>
            <details open={!filledEvidence.title || !filledEvidence.publisher || !filledEvidence.edition || !filledEvidence.location}>
              <summary>来源材料（查看 / 修改）</summary>
              <div className="catalog-review__form">{([
                ['title', '来源名称', 240], ['publisher', '发布机构', 160], ['edition', '来源版本或发布日期', 120], ['location', '证据位置', 1000],
              ] as const).map(([key, label, maxLength]) => <FormField key={key} label={label} required>
                <input value={filledEvidence[key]} maxLength={maxLength} onChange={event => setEvidence({...evidence, [key]: event.target.value})} />
              </FormField>)}</div>
            </details>
          </>}
          <FormField label="补充说明（选填；退回或撤销时必填）"><input maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} placeholder="核对无误可直接提交或通过；发现问题时填写具体差异" /></FormField>
          {!current.allowedActions.length && <p>当前账号没有可执行的操作。待复核材料需由提交人以外的管理人员处理。</p>}
          {viewingHistory && <p>正在查看历史材料，不能对当前核验执行操作。<Button variant="secondary" onClick={() => setSelectedEvent(undefined)}>返回当前材料</Button></p>}
        </section>
        <details className="catalog-review__history-disclosure"><summary>核验材料与操作历史（{current.totalEvents}）</summary>
        <section className="catalog-review__history-panel" aria-label="核验材料与历史">
          {selected && <article className="catalog-review__evidence">
            <h4>{selected.id === current.latest?.id ? '当前核验材料' : '历史核验材料'}</h4>
            <dl>{Object.entries({来源: selected.evidence.title, 发布机构: selected.evidence.publisher, 版本: selected.evidence.edition,
              证据位置: selected.evidence.location, 核验说明: selected.evidence.verificationNotes, 提交人: selected.submitter,
              操作人: selected.actor, 操作理由: selected.reason}).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <details><summary>该记录对应的目录与文件</summary><p>核验记录编号：{selected.id}</p><p>{selected.identity.catalogId} · {selected.identity.catalogVersion}</p>
              <p>目录：{selected.identity.contentHash}</p><p>来源文件：{selected.identity.sourceHash}</p></details>
          </article>}
          {!current.history.length && <p>尚无核验记录。对照原稿核对后提交复核。</p>}
          <div className="catalog-review__history">{current.history.map(event => <Button variant="secondary" key={event.id}
            className={selected?.id === event.id ? 'is-selected' : ''} onClick={() => setSelectedEvent(event.id)}>
            <strong>{sourceReviewStatus[event.status] ?? event.status}</strong><span>{event.actor} · {new Date(event.recordedAt).toLocaleString()}</span>
            <small>目录 {event.identity.catalogVersion} · 核验序号 {event.revision}</small>
          </Button>)}</div>
          <Pagination page={page} total={current.totalEvents} totalPages={Math.max(1, Math.ceil(current.totalEvents / current.historyPageSize))}
            onChange={value => {setPage(value); setSelectedEvent(undefined)}} label="来源核验历史分页" />
        </section>
        </details>
      </div>
    </>}
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {(query.error || mutation.error || contentQuery.error) && <Alert>{errorMessage(query.error || mutation.error || contentQuery.error)}</Alert>}
  </Dialog>
}
