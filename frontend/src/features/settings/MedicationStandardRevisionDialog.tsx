import { useEffect, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { StandardRevisionPreview, StandardRevisionImpact } from '../../shared/api/medicationStandardRevisionApi'
import type { StandardImpactScope } from '../../shared/api/medicationStandardImpactApi'
import { Alert, Button, Dialog, FormField, Pagination } from '../../shared/ui'
import { MedicationStandardImpactDialog } from './MedicationStandardImpactDialog'
import './medication-standard-revision.css'

const states: Record<string, string> = { SUBMITTED: '待独立复核', APPLIED: '已应用', REJECTED: '已退回', CANCELLED: '已撤回' }
export function MedicationStandardRevisionDialog({ api, medicationId, onClose }: { api: RhnApi; medicationId: string; onClose: () => void }) {
  const cache = useQueryClient(), [page, setPage] = useState(0)
  const key = ['medication-standard-revision', medicationId, page]
  const query = useQuery({ queryKey: key, queryFn: () => api.medicationStandardRevision.preview(medicationId, page), placeholderData: keepPreviousData })
  const [selected, setSelected] = useState(''), [reason, setReason] = useState(''), [impactNotes, setImpactNotes] = useState(''), [confirmed, setConfirmed] = useState(false)
  const [impactConfirmed, setImpactConfirmed] = useState(false)
  const [reviewReason, setReviewReason] = useState(''), [identityChecked, setIdentityChecked] = useState(false), [impactChecked, setImpactChecked] = useState(false)
  const [impactScope, setImpactScope] = useState<StandardImpactScope>(), [notice, setNotice] = useState('')
  const value = query.data, proposal = value?.latest?.proposal
  const token = value ? JSON.stringify([value.latest?.id, value.binding.medication.revision, value.binding.identity, value.sourceFingerprint, value.eligibleSpecificationIds, value.currentImpact?.fingerprint]) : ''
  useEffect(() => { setSelected(''); setReason(''); setImpactNotes(''); setConfirmed(false); setReviewReason(''); setIdentityChecked(false); setImpactChecked(false); setNotice(''); setImpactConfirmed(false) }, [token])
  const impactQuery = useQuery({ queryKey: ['medication-standard-revision-impact', medicationId, selected, token], queryFn: () => api.medicationStandardRevision.impact(medicationId, selected), enabled: !!selected && !!value?.allowedActions.includes('SUBMIT') && !query.error && !query.isFetching })
  useEffect(() => { setImpactConfirmed(false) }, [selected, impactQuery.data?.fingerprint, impactQuery.error])
  const accept = async (data: StandardRevisionPreview) => {
    setPage(0); cache.setQueryData(['medication-standard-revision', medicationId, 0], data)
    await Promise.all(['medication-standard-binding', 'medication-standard-readiness', 'medication-standard-impact', 'master-data-medications']
      .map(prefix => cache.invalidateQueries({ queryKey: [prefix] })))
    setNotice(`修订记录：${states[data.latest?.status ?? ''] ?? '已更新'}。`)
  }
  const submit = useMutation({ mutationFn: () => {
    if (!value || !impactQuery.data || !impactConfirmed) throw new Error('请刷新核对')
    return api.medicationStandardRevision.submit(medicationId, { expectedMedicationRevision: value.binding.medication.revision, expectedEventId: value.latest?.id ?? null, expectedSourceFingerprint: value.sourceFingerprint, identity: value.binding.identity, specificationId: selected, reason, impactNotes, confirmedIdentity: confirmed, expectedImpactFingerprint: impactQuery.data.fingerprint })
  }, onSuccess: accept, onError: () => { setImpactConfirmed(false); setIdentityChecked(false); setImpactChecked(false) } })
  const review = useMutation({ mutationFn: (action: string) => {
    if (!value?.latest) throw new Error('请刷新核对')
    return api.medicationStandardRevision.review(medicationId, { expectedEventId: value.latest.id, action, reason: reviewReason, confirmedIdentity: identityChecked, confirmedImpact: impactChecked })
  }, onSuccess: accept, onError: () => { setImpactConfirmed(false); setIdentityChecked(false); setImpactChecked(false) } })
  const busy = submit.isPending || review.isPending, disabled = busy || query.isFetching || !!query.error
  const target = value?.binding.candidates.find(c => c.specification.id === selected)?.specification
  const inspect = (catalogId: string, entryId: string, specificationId: string) => setImpactScope({ catalogId, entryId, specificationId })
  return <Dialog title="标准关联修订与复核" size="xwide" onClose={onClose} enterNavigation={false}>
    <p>先提交目标和依据，再由另一位管理人员复核。应用会更新此药品后续使用的标准关联，历史快照保留；药品及产品业务字段不在此修改。</p>
    {query.isPending && <p>正在核对已有关系与修订记录…</p>}
    {(query.error || submit.error || review.error) && <Alert tone="error">{errorMessage(query.error || submit.error || review.error)}</Alert>}
    {notice && <Alert>{notice}</Alert>}
    {value && <><div className="standard-revision__head"><strong>{value.binding.medication.name} · {value.binding.medication.code}</strong><span>{value.latest ? states[value.latest.status] : '尚无修订记录'}</span><Button variant="secondary" disabled={busy || query.isFetching} onClick={() => { void query.refetch() }}>刷新修订状态</Button></div>
      <div className="standard-revision__columns">
        <section><h3>现有标准关联</h3>{value.currentLinks.map(link => <article key={link.id}><strong>{link.specificationId}</strong><small>{link.catalogId} · {link.catalogVersion}</small><small>内容指纹：{link.contentHash}</small><Button size="sm" variant="secondary" onClick={() => inspect(link.catalogId, link.entryId, link.specificationId)}>查看原关联影响</Button></article>)}
          {!value.currentLinks.length && <Alert>尚未关联标准，请返回首次关联入口。</Alert>}
          <h3>提交修订</h3>
          {!value.allowedActions.includes('SUBMIT') ? <p>{value.latest?.status === 'SUBMITTED' ? '当前有待复核修订，请先处理右侧记录。' : '当前没有满足身份校验且不同于原关联的目标；需先核对药品资料、目录覆盖或目标占用。'}</p> : <fieldset disabled={disabled}>
            {value.binding.candidates.map(c => <label className="standard-revision__choice" key={c.specification.id}><input type="radio" name="revision-target" aria-label={`修订目标 ${c.specification.id}`} checked={selected === c.specification.id} disabled={!value.eligibleSpecificationIds.includes(c.specification.id)} onChange={() => { setSelected(c.specification.id); setConfirmed(false); setImpactConfirmed(false) }} /><span>{c.specification.name} · {c.specification.doseFormName || c.specification.doseForm} · {c.specification.specification}<small>{c.specification.id}{!value.eligibleSpecificationIds.includes(c.specification.id) ? ' · 身份、占用或无变化条件不满足' : ''}</small></span></label>)}
            {target && <article><p>{target.sourceBlock || '请核对标准参考目录原文'}</p><Button variant="secondary" size="sm" onClick={() => inspect(value.binding.identity.catalogId, target.entryId, target.id)}>查看目标影响</Button></article>}
            {selected && <div>
              {impactQuery.isFetching && <p>正在读取原关联与目标的完整影响清单…</p>}
              {impactQuery.error && <Alert tone="error">{errorMessage(impactQuery.error)}；重新读取成功前不能提交。</Alert>}
              {impactQuery.data && !impactQuery.error && <ImpactSnapshotView value={impactQuery.data} title="本次修订将冻结的影响清单" />}
              <Button variant="secondary" size="sm" disabled={impactQuery.isFetching} onClick={() => { setImpactConfirmed(false); void impactQuery.refetch() }}>刷新影响清单</Button>
              <label className="standard-revision__check"><input type="checkbox" aria-label="确认冻结影响清单" checked={impactConfirmed} disabled={!impactQuery.data || !!impactQuery.error || impactQuery.isFetching} onChange={e => setImpactConfirmed(e.target.checked)} />已核对清单及未覆盖范围，并在下方记录处理结论</label>
            </div>}
            <FormField label="修订依据"><textarea aria-label="修订依据" rows={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></FormField>
            <FormField label="影响核对说明"><textarea aria-label="影响核对说明" rows={3} maxLength={4000} value={impactNotes} onChange={e => setImpactNotes(e.target.value)} placeholder="记录已核对的知识、规则、产品及需另行处理的业务影响；无查询结果不代表无影响。" /></FormField>
            <label className="standard-revision__check"><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />已核对目标与此药品身份一致，修订范围和依据明确</label>
            <Button variant="primary" disabled={!selected || !reason.trim() || !impactNotes.trim() || !confirmed || !impactConfirmed || !impactQuery.data || !!impactQuery.error || impactQuery.isFetching} onClick={() => submit.mutate()}>提交修订，等待复核</Button>
          </fieldset>}
        </section>
        <section><h3>当前修订与独立复核</h3>{proposal ? <><p>提交人：{proposal.submitter} · {new Date(proposal.submittedAt).toLocaleString()}</p><article><strong>目标：{proposal.target.name} · {proposal.target.specification}</strong><small>{proposal.identity.catalogVersion} · {proposal.specificationId}</small><p>{proposal.reason}</p><h4>提交时的影响核对说明</h4><p className="standard-revision__text">{proposal.impactNotes}</p><Button size="sm" variant="secondary" onClick={() => inspect(proposal.identity.catalogId, proposal.target.entryId, proposal.specificationId)}>复查目标影响</Button></article>
          {proposal.impact ? <ImpactSnapshotView value={proposal.impact} title="提交时冻结的影响清单" /> : <Alert tone="warning">此历史修订没有冻结影响清单。待复核记录需撤回或退回后重新提交。</Alert>}
          {value.currentImpact && proposal.impact && value.currentImpact.fingerprint !== proposal.impact.fingerprint && <>
            <ImpactChanges before={proposal.impact} after={value.currentImpact} />
            <ImpactSnapshotView value={value.currentImpact} title="重新核查的当前影响清单" />
          </>}
          <details><summary>提交时的旧关联与目标原文</summary><p>药品版本：{proposal.medicationRevision}</p>{proposal.previousLinks.map(link => <p key={link.id}>{link.catalogVersion} · {link.specificationId} · {link.contentHash}</p>)}<p className="standard-revision__text">{proposal.target.sourceBlock}</p></details>
          {!!value.staleIssues.length && <Alert tone="warning">{value.staleIssues.join('；')}</Alert>}
          {value.latest?.status === 'SUBMITTED' && <fieldset disabled={disabled}>
            <FormField label="处理理由"><textarea aria-label="处理理由" rows={3} maxLength={2000} value={reviewReason} onChange={e => setReviewReason(e.target.value)} /></FormField>
            {value.allowedActions.includes('APPLY') && <><label className="standard-revision__check"><input type="checkbox" aria-label="复核标准身份" checked={identityChecked} onChange={e => setIdentityChecked(e.target.checked)} />已独立核对药品身份、旧关联及目标来源版本</label><label className="standard-revision__check"><input type="checkbox" aria-label="复核影响与历史保留" checked={impactChecked} onChange={e => setImpactChecked(e.target.checked)} />已复核影响及待处理事项，确认当前清单与提交时一致，后续采用新关联、保留历史快照</label></>}
            <div className="standard-revision__actions">{value.allowedActions.includes('CANCEL') && <Button variant="secondary" disabled={!reviewReason.trim()} onClick={() => review.mutate('CANCEL')}>撤回修订</Button>}{value.allowedActions.includes('REJECT') && <Button variant="secondary" disabled={!reviewReason.trim()} onClick={() => review.mutate('REJECT')}>退回修订</Button>}{value.allowedActions.includes('APPLY') && <Button variant="primary" disabled={!reviewReason.trim() || !identityChecked || !impactChecked} onClick={() => review.mutate('APPLY')}>复核通过并应用</Button>}</div>
            {value.allowedActions.includes('CANCEL') && <small>提交人不能自行复核应用，请由另一位有管理权限的人员处理。</small>}
          </fieldset>}</> : <p>提交后在此核对冻结的原关系、目标和依据。</p>}
          <h3>不可变修订记录</h3>{value.history.map(event => <details key={event.id}><summary>{states[event.status]} · {event.actor} · {new Date(event.recordedAt).toLocaleString()}</summary><p>{event.reason}</p><p>提交人：{event.proposal.submitter}；目标：{event.proposal.specificationId}</p><p className="standard-revision__text">{event.proposal.impactNotes}</p>{event.proposal.impact && <ImpactSnapshotView value={event.proposal.impact} title="该次修订冻结的影响清单" />}<details><summary>完整审计快照</summary><pre>{JSON.stringify(event, null, 2)}</pre></details></details>)}
          <Pagination page={page} totalPages={Math.max(1, Math.ceil(value.totalEvents / 20))} total={value.totalEvents} pageSize={20} onChange={setPage} label="标准修订历史分页" />
        </section>
      </div></>}
    {impactScope && <MedicationStandardImpactDialog api={api} catalogId={impactScope.catalogId} fixedScope={impactScope} onClose={() => setImpactScope(undefined)} />}
  </Dialog>
}

const impactKinds: Record<string, string> = { MEDICATION: '药品', PRODUCT: '产品', KNOWLEDGE: '知识版本', RULE_VERSION: '规则版本', DEPLOYMENT: '部署' }
function ImpactSnapshotView({ value, title }: { value: StandardRevisionImpact; title: string }) {
  return <details className="standard-revision__impact"><summary>{title} · {value.areas.length} 个标准范围</summary>
    <small>核查时间：{new Date(value.inspectedAt).toLocaleString()} · 按标准范围分别列出，同一对象可能出现多次。</small>
    <small>清单指纹：{value.fingerprint}</small>
    {value.areas.map((area, index) => <section key={index}><h4>{area.scope.catalogId} · {area.scope.specificationId}</h4>
      <p>{area.coverage.join('；')}</p><p>{area.dependencies.length} 条依赖，其中 {area.dependencies.filter(row => row.matchType === 'POTENTIAL').length} 条潜在影响。</p>
      <ImpactRows rows={area.dependencies} />
      <details><summary>未覆盖范围与核查边界</summary>{area.limitations.map(note => <p key={note}>{note}</p>)}</details>
    </section>)}
  </details>
}
function ImpactRows({ rows }: { rows: StandardRevisionImpact['areas'][number]['dependencies'] }) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [rows])
  return <><div className="standard-revision__impact-table"><table><thead><tr><th>对象与版本</th><th>状态</th><th>依赖依据</th></tr></thead><tbody>
    {rows.slice(page * 20, page * 20 + 20).map(row => <tr key={`${row.kind}:${row.id}:${row.version}`}><td>{impactKinds[row.kind] ?? row.kind} · {row.name}<small>{row.id} · {row.version ?? '—'}{row.historical ? ' · 历史' : ''}</small></td><td>{row.status}{row.mode && <small>{row.mode} · 机构 {row.organizationId} / 科室 {row.departmentId}</small>}</td><td>{row.matchType === 'POTENTIAL' ? '潜在影响，需人工复核' : '已保存引用'}<details><summary>查看引用</summary>{row.traces.map((trace, i) => <p key={i}>{trace.location} · {trace.catalogVersion ?? '动态范围'} · {trace.specificationId}：{trace.reason}</p>)}</details></td></tr>)}
    {!rows.length && <tr><td colSpan={3}>本范围未找到已存依赖；不代表不存在影响。</td></tr>}
  </tbody></table></div><Pagination page={page} totalPages={Math.max(1, Math.ceil(rows.length / 20))} total={rows.length} pageSize={20} onChange={setPage} label="冻结影响清单分页" /></>
}
function ImpactChanges({ before, after }: { before: StandardRevisionImpact; after: StandardRevisionImpact }) {
  const index = (value: StandardRevisionImpact) => new Map(value.areas.flatMap(area => area.dependencies.map(row => [`${JSON.stringify(area.scope)}:${row.kind}:${row.id}:${row.version}`, row] as const)))
  const oldRows = index(before), newRows = index(after)
  const added = [...newRows.keys()].filter(key => !oldRows.has(key)).length
  const removed = [...oldRows.keys()].filter(key => !newRows.has(key)).length
  const changed = [...newRows.entries()].filter(([key, row]) => oldRows.has(key) && JSON.stringify(row) !== JSON.stringify(oldRows.get(key))).length
  return <Alert tone="warning">相对提交时的清单：新增 {added} 条、移除 {removed} 条、内容或状态变化 {changed} 条（按标准范围分别计数）。若条目没有变化，需核对扫描版本或覆盖说明变化。请重新提交核对结论。</Alert>
}
