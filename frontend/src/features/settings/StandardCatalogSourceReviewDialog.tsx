import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type StandardCatalogEvidence, type StandardCatalogReviewAction } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, LoadingState, Pagination, StatusBadge } from '../../shared/ui'
import './standard-catalog-source-review.css'

export const sourceReviewStatus: Record<string, string> = { UNVERIFIED: '待提交核验', SUBMITTED: '待复核', VERIFIED: '来源已核验', REJECTED: '材料已退回', REVOKED: '核验已撤销' }
const actionLabels: Record<StandardCatalogReviewAction, string> = { SUBMIT: '提交来源材料', VERIFY: '复核通过', REJECT: '退回材料', REVOKE: '撤销核验' }
const emptyEvidence: StandardCatalogEvidence = {title: '', publisher: '', edition: '', location: '', verificationNotes: ''}

export function StandardCatalogSourceReviewDialog({api, onClose, editionId}: {api: RhnApi; onClose: () => void; editionId?: string}) {
  const client = useQueryClient()
  const [page, setPage] = useState(0)
  const [evidence, setEvidence] = useState(emptyEvidence)
  const [reason, setReason] = useState('')
  const [feedback, setFeedback] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<string>()
  const query = useQuery({queryKey: ['standard-catalog-source-review', editionId ?? 'runtime', page], queryFn: () => editionId ? api.standardCatalogEditions.detail(editionId, page).then(value => value.review) : api.masterData.standardCatalogSourceReview(page)})
  const current = query.isError ? undefined : query.data
  const seenEdition = useRef('')
  const edition = current ? JSON.stringify(current.identity) : ''
  useEffect(() => {
    if (!edition) return
    if (seenEdition.current && seenEdition.current !== edition) {
      setEvidence(emptyEvidence); setReason(''); setSelectedEvent(undefined)
      setFeedback('目录或来源文件已变化，旧版未提交材料已清空，请重新核对。')
    }
    seenEdition.current = edition
  }, [edition])
  const mutation = useMutation({mutationFn: (action: StandardCatalogReviewAction) => {
    if (!current) throw new Error('请先读取当前来源版本')
    const input = {identity: current.identity, expectedRevision: current.revision,
      action, reason, ...(action === 'SUBMIT' ? {evidence} : {})}
    return editionId ? api.standardCatalogEditions.review(editionId, input).then(value => value.review) : api.masterData.changeStandardCatalogSourceReview(input)
  }, onSuccess: async (_, action) => {
    setFeedback(`${actionLabels[action]}成功`); setReason(''); setSelectedEvent(undefined); setPage(0)
    await Promise.all(['standard-catalog-editions', 'standard-catalog-source-review', 'medication-standard-summary', 'medication-standard-detail',
      'medication-standard-readiness', 'master-data-medications'].map(key => client.invalidateQueries({queryKey: [key]})))
  }})
  const selected = current?.history.find(event => event.id === selectedEvent) ?? current?.latest
  const viewingHistory = !!selected && selected.id !== current?.latest?.id
  const canSubmit = current?.allowedActions.includes('SUBMIT')
  const complete = reason.trim().length > 0 && (!canSubmit || Object.values(evidence).every(value => value.trim().length > 0))
  return <Dialog title="标准目录来源核验" size="xwide" onClose={onClose} enterNavigation={false}
    description="核对所提供目录的来源、版本和证据。核验结论仅适用于当前目录及来源文件，不代替临床知识审核。">
    {query.isPending ? <LoadingState label="正在读取来源核验记录…" /> : current && <>
      <div className="catalog-review__identity"><StatusBadge tone={current.status === 'VERIFIED' ? 'info' : 'warning'}>{sourceReviewStatus[current.status] ?? current.status}</StatusBadge>
        <span>目录 {current.identity.catalogId} · {current.identity.catalogVersion}</span><span>核验序号 {current.revision}</span>
        <details><summary>当前文件与目录指纹</summary><p>目录：{current.identity.contentHash}</p><p>来源文件：{current.identity.sourceHash}</p></details></div>
      <Alert tone="info">材料由另一位具备基础数据管理权限的人员复核。目录或来源文件变化后须重新核验；通过不表示目录中的每一条规格已完成核对。</Alert>
      <div className="catalog-review__workspace">
        <section aria-label="来源核验操作"><h3>{canSubmit ? '提交核验材料' : '处理当前核验'}</h3>
          {canSubmit ? <div className="catalog-review__form">
            {([
              ['title', '来源名称', 240], ['publisher', '发布机构', 160], ['edition', '来源版本或发布日期', 120],
              ['location', '证据位置', 1000], ['verificationNotes', '核验说明', 2000],
            ] as const).map(([key, label, maxLength]) => <FormField key={key} label={label} required>
              <textarea value={evidence[key]} maxLength={maxLength} rows={key === 'verificationNotes' ? 4 : 2}
                placeholder={key === 'location' ? '可核对的文档编号、页码、档案位置或官方链接' : undefined}
                onChange={event => setEvidence({...evidence, [key]: event.target.value})} />
            </FormField>)}
          </div> : <p>请核对右侧当前材料与原文。复核操作保留原提交材料，退回后由提交人重新提交。</p>}
          {current.allowedActions.length > 0 ? <>
            <FormField label="操作理由" required><textarea rows={3} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /></FormField>
            <div className="catalog-review__actions">{current.allowedActions.map(action => <Button key={action}
              variant={action === 'REJECT' || action === 'REVOKE' ? 'secondary' : 'primary'}
              disabled={!complete || mutation.isPending || query.isFetching || !!query.error || viewingHistory} onClick={() => {setFeedback(''); mutation.mutate(action)}}>
              {actionLabels[action]}</Button>)}</div>
          </> : <Alert tone="info">当前账号没有可执行的操作。待复核材料需由提交人以外的管理人员处理。</Alert>}
          <Button variant="secondary" disabled={query.isFetching} onClick={() => {void query.refetch()}}>刷新核验状态</Button>
          {viewingHistory && <Alert tone="info">正在查看历史材料，不能对当前核验执行操作。
            <Button variant="secondary" onClick={() => setSelectedEvent(undefined)}>返回当前材料</Button></Alert>}
        </section>
        <section aria-label="核验材料与历史"><h3>材料与操作历史</h3>
          {selected && <article className="catalog-review__evidence">
            <h4>{selected.id === current.latest?.id ? '当前核验材料' : '历史核验材料'}</h4>
            <dl>{Object.entries({来源: selected.evidence.title, 发布机构: selected.evidence.publisher, 版本: selected.evidence.edition,
              证据位置: selected.evidence.location, 核验说明: selected.evidence.verificationNotes, 提交人: selected.submitter,
              操作人: selected.actor, 操作理由: selected.reason}).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
            <details><summary>该记录对应的目录与文件</summary><p>核验记录编号：{selected.id}</p><p>{selected.identity.catalogId} · {selected.identity.catalogVersion}</p>
              <p>目录：{selected.identity.contentHash}</p><p>来源文件：{selected.identity.sourceHash}</p></details>
          </article>}
          {!current.history.length && <p>尚无核验记录。填写来源材料后提交复核。</p>}
          <div className="catalog-review__history">{current.history.map(event => <button type="button" key={event.id}
            className={selected?.id === event.id ? 'is-selected' : ''} onClick={() => setSelectedEvent(event.id)}>
            <strong>{sourceReviewStatus[event.status] ?? event.status}</strong><span>{event.actor} · {new Date(event.recordedAt).toLocaleString()}</span>
            <small>目录 {event.identity.catalogVersion} · 核验序号 {event.revision}</small>
          </button>)}</div>
          <Pagination page={page} total={current.totalEvents} totalPages={Math.max(1, Math.ceil(current.totalEvents / current.historyPageSize))}
            onChange={value => {setPage(value); setSelectedEvent(undefined)}} label="来源核验历史分页" />
        </section>
      </div>
    </>}
    {feedback && <Alert tone="success">{feedback}</Alert>}
    {(query.error || mutation.error) && <Alert>{errorMessage(query.error || mutation.error)}</Alert>}
  </Dialog>
}
