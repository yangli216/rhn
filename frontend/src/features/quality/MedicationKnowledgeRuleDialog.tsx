import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { KnowledgeRuleCandidate, KnowledgeVersion } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField } from '../../shared/ui'
import { MedicationKnowledgeRuleView } from './MedicationKnowledgeRuleView'

export function MedicationKnowledgeRuleDialog({ api, knowledge, onClose }: { api: RhnApi; knowledge: KnowledgeVersion; onClose: () => void }) {
  const instance = useId(), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [created, setCreated] = useState<KnowledgeRuleCandidate>()
  const preview = useQuery({ queryKey: ['knowledge-rule-preview', instance, knowledge.id, knowledge.version], queryFn: () => api.medicationKnowledgeDrafts.previewRuleCandidate(knowledge.id, knowledge.version), retry: false })
  const create = async () => {
    if (!preview.data?.ready || !preview.data.programHash) return
    setBusy(true); setError('')
    try { setCreated(await api.medicationKnowledgeDrafts.createRuleCandidate(knowledge.id, knowledge.version, preview.data.programHash, reason.trim())) }
    catch (e) { setError(errorMessage(e)); void preview.refetch() } finally { setBusy(false) }
  }
  return <Dialog title="从知识生成规则候选" size="xwide" enterNavigation={false} onClose={busy ? () => {} : onClose}>
    <div className="knowledge-rule-view"><p><strong>{knowledge.body.title} · 已保存第 {knowledge.version} 版</strong>。核对以下结构化表达后生成不可变候选版本；同一知识版本重复生成将返回已有候选。</p>
      {preview.isPending && <p>正在核对标准依赖并编译表达…</p>}{preview.error && <Alert tone="error">{errorMessage(preview.error)}</Alert>}{error && <Alert tone="error">{error}</Alert>}
      {!preview.isError && preview.data && <><MedicationKnowledgeRuleView value={preview.data} />{!preview.data.ready && <Alert tone="warning">当前不能生成：{preview.data.issues.map(i => i.message).join('；') || '结构样例未全部通过'}。请回到知识草稿处理后保存新版本。</Alert>}</>}
      {created ? <Alert>规则候选 v{created.version} 已纳入统一规则目录（知识编译来源），尚未审核或发布。候选标识：{created.id}。后续修改请编辑来源知识并生成新候选版本；历史处方回放保留在知识草稿中。</Alert> : <div className="knowledge-rule-view__create"><FormField label="候选生成原因"><input aria-label="候选生成原因" value={reason} maxLength={2000} disabled={busy} onChange={e => setReason(e.target.value)} /></FormField><Button disabled={busy || preview.isFetching || preview.isError || !preview.data?.ready || !reason.trim()} onClick={() => { void create() }}>{busy ? '生成中…' : '生成并纳入规则目录'}</Button></div>}
    </div>
  </Dialog>
}
