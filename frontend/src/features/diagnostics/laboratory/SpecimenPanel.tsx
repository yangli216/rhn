import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import type { DiagnosticExecutionTask, DiagnosticSpecimen } from '../../../shared/api/diagnosticsApi'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { formatTime } from '../../../shared/format'
import { Alert, Button, DataTable, Dialog, FormField, LoadingState, Select, StatusBadge, tableCellClass } from '../../../shared/ui'
import { DiagnosticPrintAction } from '../../../shared/clinical/DiagnosticPrintAction'
import { SpecimenThermalLabelModal } from './SpecimenThermalLabelModal'
import {
  SPECIMEN_REJECTION_REASONS,
  findSpecimenTubeByCode,
  recommendSpecimenTubeByItemName,
} from '../../../shared/clinical/specimenTubeStandards'

const labels = { READY: '待采集', COLLECTED: '待接收', RECEIVED: '已接收', REJECTED: '已拒收' }

export async function loadDiagnosticSpecimens(api: RhnApi, task: DiagnosticExecutionTask) {
  const result = await api.diagnostics.specimens(task.id)
  if (!Array.isArray(result) || result.some((item) => !item || !item.id || !item.specimenNo || !Array.isArray(item.taskIds)
    || !item.taskIds.includes(task.id) || !['READY', 'COLLECTED', 'RECEIVED', 'REJECTED'].includes(item.status)))
    throw new Error('标本数据不完整或与当前申请不一致，请重新读取。')
  return result
}

export function SpecimenPanel({ api, task, candidates, onRefresh, refreshing, canExecute = true }: {
  api: RhnApi; task: DiagnosticExecutionTask; candidates: DiagnosticExecutionTask[]; onRefresh: () => Promise<void>; refreshing: boolean
  canExecute?: boolean
}) {
  const [selected, setSelected] = useState([task.id])
  const [reason, setReason] = useState('')
  const [rejecting, setRejecting] = useState<DiagnosticSpecimen | null>(null)
  const [printingThermal, setPrintingThermal] = useState<DiagnosticSpecimen | null>(null)
  const [command, setCommand] = useState(crypto.randomUUID())
  const specimens = useQuery({ queryKey: ['diagnostic-specimens', task.id, task.organizationId, task.departmentId],
    queryFn: () => loadDiagnosticSpecimens(api, task) })
  const refresh = async () => { await specimens.refetch(); await onRefresh() }
  const generate = useMutation({ mutationFn: () => api.diagnostics.generateSpecimens(
    eligible.filter((item) => selected.includes(item.id)).map((item) => ({ taskId: item.id, expectedRevision: item.revision })), command),
  onSuccess: async () => { setCommand(crypto.randomUUID()); await refresh() } })
  const action = useMutation({ mutationFn: ({ specimen, operation }: { specimen: DiagnosticSpecimen; operation: string }) => {
    if (operation === 'collect') return api.diagnostics.collectSpecimen(specimen.id, specimen.revision)
    if (operation === 'receive') return api.diagnostics.receiveSpecimen(specimen.id, specimen.revision)
    if (operation === 'reject') return api.diagnostics.rejectSpecimen(specimen.id, specimen.revision, reason.trim())
    return api.diagnostics.recollectSpecimen(specimen.id, specimen.revision, `RECOLLECT-${specimen.id}-${specimen.revision}`)
  }, onSuccess: async () => { setRejecting(null); setReason(''); await refresh() } })
  const busy = refreshing || generate.isPending || action.isPending || specimens.isFetching || !canExecute
  const eligible = candidates.filter((item) => item.requestType === 'LABORATORY' && item.status === 'READY'
    && item.residentId === task.residentId && item.encounterId === task.encounterId
    && item.organizationId === task.organizationId && item.departmentId === task.departmentId)
  const run = (specimen: DiagnosticSpecimen, operation: string) => action.mutate({ specimen, operation })
  return <section aria-label="实际标本" className="diagnostic-specimens"><h3>标本采集与接收</h3>
    {(specimens.error || generate.error || (!rejecting && action.error)) && <Alert>{errorMessage(specimens.error || generate.error || action.error)}</Alert>}
    {specimens.isPending ? <LoadingState label="正在读取标本…" /> : specimens.isError
      ? <Button onClick={() => void specimens.refetch()}>重新读取标本</Button> : <>
        {task.status === 'READY' && specimens.data?.length === 0 && <div>
          <p>选择本页中同一患者、同次就诊的待采集申请，按国家标准（YY/T 0314-2007）采血管色标分管。</p>
          <DataTable compact aria-label="待生成标本申请"><thead><tr><th className={tableCellClass('control')}>选择</th>
            <th className={tableCellClass('text')}>申请项目</th>
            <th className={tableCellClass('text')}>推荐采血管/耗材</th>
            <th className={tableCellClass('text')}>申请单号</th></tr></thead>
            <tbody>{eligible.map((item) => {
              const tube = recommendSpecimenTubeByItemName(item.itemName)
              return <tr key={item.id}><td className={tableCellClass('control')}><input type="checkbox"
                aria-label={`生成标本：${item.itemName} ${item.requestNo}`} checked={selected.includes(item.id)} disabled={busy}
                onChange={(event) => { setCommand(crypto.randomUUID()); setSelected((previous) => event.target.checked ? [...previous, item.id] : previous.filter((id) => id !== item.id)) }} /></td>
                <td className={tableCellClass('text')}>{item.itemName}</td>
                <td className={tableCellClass('text')}>
                  <span className="diagnostic-tube-badge">
                    <span className={`diagnostic-tube-dot diagnostic-tube-dot--${tube.capColorKey}`} aria-hidden="true" />
                    <span>{tube.tubeName}</span>
                    <small>({tube.additive})</small>
                  </span>
                </td>
                <td className={tableCellClass('text')}>{item.requestNo}</td></tr>
            })}</tbody></DataTable>
          <div className="diagnostic-specimen-generate"><span>已选 {eligible.filter((item) => selected.includes(item.id)).length} 项</span>
            <Button disabled={busy || !eligible.some((item) => selected.includes(item.id))} busy={generate.isPending} onClick={() => generate.mutate()}>生成标本条码</Button></div>
        </div>}
        {!!specimens.data?.length && <DataTable compact aria-label="标本列表" className="diagnostic-specimen-table"><thead><tr>
          <th className={tableCellClass('text')}>标本 / 容器</th><th className={tableCellClass('text')}>采集 / 接收时间</th>
          <th className={tableCellClass('status')}>状态</th><th className={tableCellClass('actions')}>操作</th></tr></thead>
          <tbody>{specimens.data.map((item) => {
            const tube = findSpecimenTubeByCode(item.containerCode) ?? recommendSpecimenTubeByItemName(item.specimenName)
            return <tr key={item.id}><td className={tableCellClass('text')}>
              <div className="diagnostic-tube-item">
                <span className={`diagnostic-tube-bar diagnostic-tube-bar--${tube?.capColorKey ?? 'default'}`} aria-hidden="true" />
                <strong>{item.specimenNo}</strong>
                {item.previousSpecimenId && <small>（重采）</small>}
              </div>
              <small>{item.specimenName} · {item.containerName || tube?.tubeName || '未指定容器'} · 关联 {item.taskIds.length} 项</small></td>
              <td className={tableCellClass('text')}><small>采集 {formatTime(item.collectedAt) || '—'}</small>
                <small>接收 {formatTime(item.receivedAt) || '—'}</small></td>
              <td className={tableCellClass('status')}><StatusBadge tone={item.status === 'REJECTED' ? 'danger' : item.status === 'RECEIVED' ? 'success' : 'warning'}>
                {labels[item.status]}</StatusBadge>{item.rejectionReason && <p>{item.rejectionReason}</p>}</td>
              <td className={tableCellClass('actions')}><div className="diagnostic-row-actions">{['READY', 'COLLECTED'].includes(task.status) && <>
                {item.status === 'READY' && <Button size="sm" disabled={busy} onClick={() => run(item, 'collect')}>确认采集</Button>}
                {item.status === 'COLLECTED' && <Button size="sm" disabled={busy} onClick={() => run(item, 'receive')}>接收标本</Button>}
                {['COLLECTED', 'RECEIVED'].includes(item.status) && <Button size="sm" variant="text" disabled={busy}
                  onClick={() => { action.reset(); setReason(''); setRejecting(item) }}>拒收标本</Button>}
                {item.status === 'REJECTED' && !specimens.data.some((other) => other.previousSpecimenId === item.id)
                  && <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(item, 'recollect')}>安排重采</Button>}
              </>}
              {item.status !== 'REJECTED' && !['CANCELLED', 'EXCEPTION'].includes(task.status) && <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setPrintingThermal(item)}>热敏标签</Button>
                <DiagnosticPrintAction key={item.id}
                  api={api} encounterId={task.encounterId} sourceId={item.id} sourceLabel={item.specimenNo}
                  taskCode="DIAGNOSTICS.SPECIMEN.LABEL.PRINT" label compact disabled={busy} />
              </>}
              </div></td></tr>
          })}</tbody></DataTable>
        }
      </>}
    {rejecting && <Dialog title="拒收标本" description={`${task.residentName} · ${rejecting.specimenNo} · ${rejecting.specimenName}`}
      closeOnBackdrop={false} onClose={() => { if (!action.isPending) setRejecting(null) }}
      footer={<><Button variant="secondary" disabled={action.isPending} onClick={() => setRejecting(null)}>取消</Button>
        <Button variant="danger" disabled={busy || !reason.trim()} busy={action.isPending} onClick={() => run(rejecting, 'reject')}>确认拒收</Button></>}>
      <FormField label="快速选择标准原因">
        <Select
          id="diagnostic-specimen-rejection-reason"
          aria-label="快速选择标准原因"
          value=""
          placeholder="-- 选择标准拒收原因快速填入 --"
          disabled={action.isPending}
          options={SPECIMEN_REJECTION_REASONS.map((r) => ({
            value: r.code,
            label: `[${r.categoryLabel}] ${r.name}`,
          }))}
          onChange={(val) => {
            const found = SPECIMEN_REJECTION_REASONS.find((r) => r.code === val)
            if (found) setReason(found.name)
          }}
        />
      </FormField>
      <FormField label="拒收原因" required><input maxLength={500} value={reason} disabled={action.isPending}
        placeholder="如：标本严重溶血，或采血量不足2mL"
        onChange={(event) => setReason(event.target.value)} /></FormField>
      {action.error && <Alert>{errorMessage(action.error)}</Alert>}
    </Dialog>}
    {printingThermal && (
      <SpecimenThermalLabelModal
        api={api}
        task={task}
        specimen={printingThermal}
        onClose={() => setPrintingThermal(null)}
      />
    )}
  </section>
}

