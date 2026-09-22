import { useEffect, useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeRuleCandidate, KnowledgePublicationBasis, KnowledgePublicationAuthorization } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Pagination } from '../../shared/ui'
import { feedbackVerdicts } from './MedicationKnowledgeFeedbackDialog'
import './medication-knowledge-publication.css'
const actions: Record<string, string> = { WARN: '提醒核对', REQUIRE_OVERRIDE: '须填写继续开立理由', BLOCK: '阻止提交' }
const outcomes: Record<string, string> = { MATCH: '命中', NO_MATCH: '未命中', NOT_APPLICABLE: '不适用', UNAVAILABLE: '不可评价' }
export function MedicationKnowledgePublicationDialog({ api, candidate, onClose }: { api: RhnApi; candidate: KnowledgeRuleCandidate; onClose: () => void }) {
  const instance = useId(), [operation, setOperation] = useState<'PROMOTE' | 'ROLLBACK'>('PROMOTE'), [sourceId, setSourceId] = useState('')
  const [assessment, setAssessment] = useState(''), [rollbackPlan, setRollbackPlan] = useState(''), [reason, setReason] = useState(''), [end, setEnd] = useState('')
  const [checks, setChecks] = useState([false, false, false]), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [material, setMaterial] = useState<KnowledgePublicationAuthorization>()
  const deployments = useQuery({ queryKey: ['knowledge-publication-deployments', instance, candidate.id], queryFn: () => api.medicationKnowledgeDrafts.deploymentPreview(candidate.id), retry: false, refetchOnWindowFocus: false })
  const releases = deployments.isError ? [] : deployments.data?.deployments ?? []
  const source = releases.find(d => d.id === sourceId && (operation === 'PROMOTE' ? d.mode === 'SHADOW' && d.versionId === candidate.id : d.mode === 'ENFORCED'))
  const preview = useQuery({ queryKey: ['knowledge-publication-preview', instance, source?.versionId, source?.id, operation], queryFn: () => api.medicationKnowledgeDrafts.publicationPreview(source!.versionId, source!.id, operation), enabled: !!source && !deployments.isError, retry: false, refetchOnWindowFocus: false })
  const value = preview.isError || !source || deployments.isError ? undefined : preview.data
  const token = `${value?.revision}:${value?.basis.fingerprint}`
  useEffect(() => { setChecks([false, false, false]); setAssessment(''); setRollbackPlan(''); setReason(''); setEnd('') }, [token, operation, sourceId])
  const refresh = async () => { setChecks([false, false, false]); await deployments.refetch(); if (source) await preview.refetch() }
  const publish = async () => {
    if (!value || !source) return
    setBusy(true); setError(''); setNotice('')
    try {
      await api.medicationKnowledgeDrafts.publicationCommand(source.versionId, { expectedRevision: value.revision, operation, sourceDeploymentId: source.id, throughRunId: value.basis.throughRunId, expectedFingerprint: value.basis.fingerprint, effectiveTo: end ? new Date(end).toISOString() : undefined, assessment: assessment.trim(), rollbackPlan: rollbackPlan.trim(), reason: reason.trim(), observationsConfirmed: checks[0], actionsConfirmed: checks[1], rollbackConfirmed: checks[2] })
      setSourceId(''); setNotice(operation === 'PROMOTE' ? '已独立启用当前科室正式规则，来源旁路已暂停。' : '已创建回退发布，替换当前科室原正式版本。')
    } catch (e) { setError(errorMessage(e)); setChecks([false, false, false]) }
    finally { await refresh(); setBusy(false) }
  }
  const pause = async (id: string, version: string) => {
    if (!deployments.data) return
    setBusy(true); setError(''); setMaterial(undefined)
    try {
      await api.medicationKnowledgeDrafts.deploymentCommand(version, { expectedRevision: deployments.data.revision, operation: 'PAUSE', mode: 'ENFORCED', deploymentId: id, reason: reason.trim() })
      setNotice('已暂停该正式发布。旧版本不会自动恢复，历史材料保留。')
    } catch (e) { setError(errorMessage(e)) }
    finally { await refresh(); setBusy(false) }
  }
  const showMaterial = async (id: string, version: string) => {
    setBusy(true); setError(''); setMaterial(undefined)
    try { setMaterial(await api.medicationKnowledgeDrafts.publicationMaterial(version, id)) } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <Dialog title="知识规则 · 正式启用与回退" size="xwide" enterNavigation={false} onClose={busy ? () => {} : onClose}>
    <div className="knowledge-publication"><Alert tone="warning">正式启用会影响当前科室的处方提交。请核对批准动作、旁路验收与回退安排；审核通过或旁路运行不会自动转为正式。</Alert>
      {error && <Alert tone="error">{error}</Alert>}{notice && <Alert>{notice}</Alert>}{deployments.error && <Alert tone="error">{errorMessage(deployments.error)}</Alert>}{preview.error && <Alert tone="error">{errorMessage(preview.error)}</Alert>}
      <Button variant="secondary" disabled={busy || deployments.isFetching || preview.isFetching} onClick={() => void refresh()}>刷新发布材料</Button>
      <div className="knowledge-publication__layout"><aside><h4>{candidate.knowledge.body.title} · 当前科室</h4>
        <fieldset disabled={busy || deployments.isFetching || deployments.isError}>
          <FormField label="发布操作"><select aria-label="发布操作" value={operation} onChange={e => { setOperation(e.target.value as 'PROMOTE' | 'ROLLBACK'); setSourceId(''); setMaterial(undefined) }}><option value="PROMOTE">旁路转正式</option><option value="ROLLBACK">回退到曾正式发布的版本</option></select></FormField>
          <FormField label="核对来源发布"><select aria-label="核对来源发布" value={sourceId} onChange={e => { setSourceId(e.target.value); setMaterial(undefined) }}><option value="">请选择具体发布记录</option>{releases.filter(d => operation === 'PROMOTE' ? d.mode === 'SHADOW' && d.versionId === candidate.id : d.mode === 'ENFORCED').map(d => <option key={d.id} value={d.id}>v{d.version} · {d.mode === 'SHADOW' ? '旁路' : '正式'} · {d.id} · {d.status}</option>)}</select></FormField>
          <FormField label="操作原因（启用、暂停或回退）"><textarea aria-label="操作原因（启用、暂停或回退）" rows={3} maxLength={2000} value={reason} onChange={e => { setReason(e.target.value); setChecks([false, false, false]) }} /></FormField>
        </fieldset>
        <h4>本规则全部正式发布记录</h4>{!releases.some(d => d.mode === 'ENFORCED') && <p>尚无正式发布。</p>}
        {[...releases].filter(d => d.mode === 'ENFORCED').reverse().map(d => <article key={d.id}><strong>v{d.version} · {d.status === 'PAUSED' ? '已暂停' : d.status === 'SUPERSEDED' ? '已替换' : d.effectiveTo && new Date(d.effectiveTo).getTime() <= Date.now() ? '已结束' : '正式生效'}</strong><small>{d.id} · {new Date(d.effectiveFrom).toLocaleString()}</small><p>命中：{actions[d.action]}</p><p>{d.reason}</p><div className="knowledge-publication__actions"><Button variant="secondary" size="sm" disabled={busy} onClick={() => void showMaterial(d.id, d.versionId)}>查看固定上线材料</Button>{d.status === 'ACTIVE' && <Button variant="secondary" size="sm" disabled={busy || deployments.isFetching || !reason.trim()} onClick={() => void pause(d.id, d.versionId)}>暂停此正式发布</Button>}</div></article>)}
      </aside><section>
        {preview.isFetching && source && <p>正在核对固定批准、标准、观察及最新研判…</p>}
        {!source && !material && <p>选择旁路发布以准备正式启用，或选择曾正式运行的发布以准备回退。所有操作均生成独立记录。</p>}
        {value && <><h4>本次拟发布材料 · 候选 v{value.basis.approval.basis.candidate.version}</h4><p>机构 {value.organizationId} · 科室 {value.departmentId}</p><PublicationBasis value={value.basis} />
          {value.notices.map(text => <p key={text}>{text}</p>)}{value.gaps.length > 0 && <Alert tone="warning"><strong>尚不能发布</strong><ul>{value.gaps.map(text => <li key={text}>{text}</li>)}</ul></Alert>}
          <fieldset disabled={busy || preview.isFetching || deployments.isFetching || value.gaps.length > 0}>
            <FormField label="旁路验收与上线评估"><textarea aria-label="旁路验收与上线评估" rows={4} maxLength={4000} value={assessment} onChange={e => { setAssessment(e.target.value); setChecks([false, false, false]) }} placeholder="说明样本覆盖、未命中/不可评价情况、风险和本次上线理由；条数达标不等于效果已验证。" /></FormField>
            <FormField label="回退与应急安排"><textarea aria-label="回退与应急安排" rows={3} maxLength={4000} value={rollbackPlan} onChange={e => { setRollbackPlan(e.target.value); setChecks([false, false, false]) }} placeholder="写明出现异常时由谁暂停、是否有可回退版本以及临床补充处理安排。" /></FormField>
            <FormField label="正式发布结束时间（可选）"><input aria-label="正式发布结束时间（可选）" type="datetime-local" value={end} onChange={e => { setEnd(e.target.value); setChecks([false, false, false]) }} /></FormField>
            {['已核对本批观察和人工研判，完成样本充分性及风险评估', '已确认命中和不可评价两类策略及其对处方提交的影响', '已明确暂停、回退和应急安排，确认本次独立发布'].map((label, index) => <label className="knowledge-publication__check" key={label}><input type="checkbox" checked={checks[index]} onChange={e => setChecks(checks.map((v, i) => i === index ? e.target.checked : v))} />{label}</label>)}
            <Button disabled={!assessment.trim() || !rollbackPlan.trim() || !reason.trim() || !checks.every(Boolean)} onClick={() => void publish()}>{operation === 'PROMOTE' ? '确认正式启用当前科室' : '确认创建回退发布'}</Button>
          </fieldset>
        </>}
        {material && <article><h4>固定上线材料 · 发布 {material.deploymentId}</h4><p>{material.actor} · {new Date(material.time).toLocaleString()}</p><p>上线评估：{material.assessment}</p><p>回退安排：{material.rollbackPlan}</p><p>原因：{material.reason}</p><PublicationBasis value={material.basis} /></article>}
      </section></div>
    </div>
  </Dialog>
}
function PublicationBasis({ value }: { value: KnowledgePublicationBasis }) {
  const [page, setPage] = useState(0)
  useEffect(() => { setPage(0) }, [value.fingerprint])
  return <><p>已批准策略：命中时{actions[value.approval.action ?? '']}；不可评价时{actions[value.approval.unavailableAction ?? '']}。执行故障或审计无法保存时将阻止提交。</p>
    <p>来源旁路 {value.shadowDeploymentId} · 截至观察 {value.throughRunId} · 共 {value.observations.length} 次评价</p><div className="knowledge-publication__actions">{Object.entries(outcomes).map(([key, name]) => <span key={key}>{name} {value.outcomes[key] ?? 0}</span>)}</div>
    <details><summary>逐条核对本批研判与依据</summary>{value.observations.slice(page * 20, page * 20 + 20).map(o => <article key={o.runId}><strong>观察 {o.runId} · {outcomes[o.outcome]}</strong><p>{o.feedback?.operation === 'RECORD' ? feedbackVerdicts[o.feedback.verdict ?? ''] : '待研判或已撤回'} · {o.feedback?.actor}</p><p>{o.feedback?.assessment}</p><p>依据：{o.feedback?.evidence || '未提供有效意见'}</p></article>)}<Pagination page={page} totalPages={Math.max(1, Math.ceil(value.observations.length / 20))} total={value.observations.length} pageSize={20} onChange={setPage} label="上线材料观察分页" /></details>
    <small>材料指纹：{value.fingerprint}</small></>
}
