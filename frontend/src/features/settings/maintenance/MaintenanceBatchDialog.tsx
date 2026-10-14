import { useQuery } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { errorMessage, type MaintenanceBatch, type MaintenanceCandidate, type MaintenanceScopeRequest, type RhnApi } from '../../../shared/rhnApi'
import { safeRandomUUID } from '../../../shared/utils/uuid'
import { Alert, Button, DataTable, Dialog, EmptyState, FormField, LoadingState, SearchField } from '../../../shared/ui'

export function MaintenanceBatchDialog({ api, scope, scopeKey, onClose, onRegistered }: {
  api: RhnApi; scope: MaintenanceScopeRequest; scopeKey: string; onClose: () => void; onRegistered: (batch: MaintenanceBatch) => void
}) {
  const [query, setQuery] = useState('')
  const [name, setName] = useState('')
  const [evidence, setEvidence] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [selected, setSelected] = useState<MaintenanceCandidate[]>([])
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const request = useRef({ key: '', command: '' })
  const candidates = useQuery({ queryKey: ['maintenance-candidates', scopeKey, scope, query],
    queryFn: () => api.maintenance.candidates(scope, query) })
  async function register() {
    if (busy || !confirmed || !selected.length || !name.trim() || !evidence.trim()) return
    const body = { scope, name, evidence, datasetCode: 'CLINICAL_TEST', roots: selected.map(item => ({ module: item.module,
      resourceType: item.resourceType, resourceId: item.resourceId, organizationId: item.organizationId })), noRealEffectsConfirmed: confirmed }
    const key = JSON.stringify(body)
    if (request.current.key !== key) request.current = { key, command: safeRandomUUID() }
    setBusy(true); setFailure('')
    try { onRegistered(await api.maintenance.registerBatch({ ...body, requestCode: request.current.command })) }
    catch (error) { setFailure(errorMessage(error)) } finally { setBusy(false) }
  }
  return <Dialog title="登记测试来源批次" size="wide" onClose={() => { if (!busy) onClose() }} closeOnBackdrop={false}
    description="只登记经过核对的测试就诊。来源标记不可转移到其他批次；存在真实交付或外部业务时服务端会阻断。"
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>返回清理范围</Button>
      <Button busy={busy} disabled={!confirmed || !selected.length || !name.trim() || !evidence.trim()} onClick={() => void register()}>登记测试批次</Button></>}>
    <div className="maintenance-fields">
      <FormField label="批次名称" required><input value={name} maxLength={200} onChange={event => setName(event.target.value)} disabled={busy} /></FormField>
      <FormField label="测试来源核对依据" required><textarea value={evidence} maxLength={1000} onChange={event => setEvidence(event.target.value)} disabled={busy} /></FormField>
    </div>
    <SearchField label="搜索门诊就诊号" value={query} onChange={setQuery} disabled={busy} />
    {(failure || candidates.isError) && <Alert placement="inline">{failure || errorMessage(candidates.error)}</Alert>}
    <p>已选择 {selected.length} 个就诊；查询最多展示最近 200 条，请用就诊号缩小范围。</p>
    {candidates.isPending ? <LoadingState label="加载候选就诊" /> : candidates.isError ? null : !candidates.data?.length
      ? <EmptyState icon="settings" title="没有符合条件的门诊就诊" copy="请核对目标机构或使用完整就诊号查询。此处仅支持登记门诊测试业务。" /> : <DataTable aria-label="测试来源候选就诊">
      <thead><tr><th>就诊号</th><th>来源状态</th><th>选择</th></tr></thead><tbody>{candidates.data?.map(item => {
        const checked = selected.some(value => value.resourceId === item.resourceId)
        return <tr key={item.resourceId}><td>{item.businessNo}</td><td>{item.testBatchId ? `已登记批次 ${item.testBatchId}` : '待核对来源'}</td>
          <td><Button variant="secondary" size="sm" disabled={busy || !!item.testBatchId} onClick={() => setSelected(values =>
            checked ? values.filter(value => value.resourceId !== item.resourceId) : [...values, item])}>{checked ? '取消选择' : '选择就诊'}</Button></td></tr>
      })}</tbody></DataTable>}
    <label className="maintenance-check"><input type="checkbox" checked={confirmed} disabled={busy}
      onChange={event => setConfirmed(event.target.checked)} />我已核对所选业务为测试数据，且未发生真实资金收付或药品交付</label>
  </Dialog>
}
