import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask, DiagnosticSpecimen } from '../../../shared/api/diagnosticsApi'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, FormField, LoadingState } from '../../../shared/ui'
import { DiagnosticPrintAction } from '../../../shared/clinical/DiagnosticPrintAction'

const labels = { READY: '待采集', COLLECTED: '已采集，待接收', RECEIVED: '已接收', REJECTED: '已拒收' }

export function SpecimenPanel({ api, task, candidates, onRefresh, refreshing, canExecute = true }: {
  api: RhnApi; task: DiagnosticExecutionTask; candidates: DiagnosticExecutionTask[]; onRefresh: () => Promise<void>; refreshing: boolean
  canExecute?: boolean
}) {
  const [selected, setSelected] = useState([task.id])
  const [reason, setReason] = useState('')
  const [command, setCommand] = useState(crypto.randomUUID())
  const specimens = useQuery({ queryKey: ['diagnostic-specimens', task.id, task.organizationId, task.departmentId],
    queryFn: async () => {
      const result = await api.diagnostics.specimens(task.id)
      if (!Array.isArray(result) || result.some((item) => !item || !item.id || !item.specimenNo || !Array.isArray(item.taskIds)
        || !item.taskIds.includes(task.id) || !['READY', 'COLLECTED', 'RECEIVED', 'REJECTED'].includes(item.status))) {
        throw new Error('标本数据不完整或与当前申请不一致，请重新读取。')
      }
      return result
    } })
  const refresh = async () => { await specimens.refetch(); await onRefresh() }
  const generate = useMutation({ mutationFn: () => api.diagnostics.generateSpecimens(
    candidates.filter((item) => selected.includes(item.id)).map((item) => ({ taskId: item.id, expectedRevision: item.revision })), command),
  onSuccess: async () => { setCommand(crypto.randomUUID()); await refresh() } })
  const action = useMutation({ mutationFn: ({ specimen, operation }: { specimen: DiagnosticSpecimen; operation: string }) => {
    if (operation === 'collect') return api.diagnostics.collectSpecimen(specimen.id, specimen.revision)
    if (operation === 'receive') return api.diagnostics.receiveSpecimen(specimen.id, specimen.revision)
    if (operation === 'reject') return api.diagnostics.rejectSpecimen(specimen.id, specimen.revision, reason.trim())
    return api.diagnostics.recollectSpecimen(specimen.id, specimen.revision, `RECOLLECT-${specimen.id}-${specimen.revision}`)
  }, onSuccess: refresh })
  const busy = refreshing || generate.isPending || action.isPending || specimens.isFetching || !canExecute
  const eligible = candidates.filter((item) => item.requestType === 'LABORATORY' && item.status === 'READY'
    && item.residentId === task.residentId && item.encounterId === task.encounterId)
  const run = (specimen: DiagnosticSpecimen, operation: string) => action.mutate({ specimen, operation })
  return <section aria-label="实际标本"><h3>实际标本</h3>
    {(specimens.error || generate.error || action.error) && <Alert>{errorMessage(specimens.error || generate.error || action.error)}</Alert>}
    {specimens.isPending ? <LoadingState label="正在读取标本…" /> : specimens.isError
      ? <Button onClick={() => void specimens.refetch()}>重新读取标本</Button> : <>
        {task.status === 'READY' && specimens.data?.length === 0 && <div>
          <p>按项目主数据分管；同一患者同次就诊的申请可共同生成标本。</p>
          {eligible.map((item) => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} disabled={busy}
            onChange={(event) => { setCommand(crypto.randomUUID()); setSelected((previous) => event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id)) }} />{item.requestNo} · {item.itemName}</label>)}
          <Button disabled={busy || selected.length === 0} busy={generate.isPending} onClick={() => generate.mutate()}>生成标本条码</Button>
        </div>}
        {!!specimens.data?.length && <><DataTable aria-label="标本列表"><thead><tr><th>标本号</th><th>标本 / 容器</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>{specimens.data.map((item) => <tr key={item.id}><td>{item.specimenNo}{item.previousSpecimenId && <small>（重采）</small>}</td>
            <td>{item.specimenName} · {item.containerName || '未指定容器'}</td><td>{labels[item.status]}{item.rejectionReason && <p>{item.rejectionReason}</p>}</td>
            <td>{['READY', 'COLLECTED'].includes(task.status) && <>
              {item.status === 'READY' && <Button size="sm" disabled={busy} onClick={() => run(item, 'collect')}>确认采集</Button>}
              {item.status === 'COLLECTED' && <Button size="sm" disabled={busy} onClick={() => run(item, 'receive')}>接收标本</Button>}
              {['COLLECTED', 'RECEIVED'].includes(item.status) && <Button size="sm" variant="secondary" disabled={busy || !reason.trim()}
                onClick={() => run(item, 'reject')}>拒收标本</Button>}
              {item.status === 'REJECTED' && !specimens.data.some((other) => other.previousSpecimenId === item.id)
                && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(item, 'recollect')}>安排重采</Button>}
            </>}
            {item.status !== 'REJECTED' && !['CANCELLED', 'EXCEPTION'].includes(task.status) && <DiagnosticPrintAction key={item.id}
              api={api} encounterId={task.encounterId} sourceId={item.id} taskCode="DIAGNOSTICS.SPECIMEN.LABEL.PRINT" label disabled={busy} />}
            </td></tr>)}</tbody></DataTable>
          {['READY', 'COLLECTED'].includes(task.status) && <FormField label="拒收原因"><input value={reason} disabled={busy}
            onChange={(event) => setReason(event.target.value)} /></FormField>}
        </>}
      </>}
  </section>
}
