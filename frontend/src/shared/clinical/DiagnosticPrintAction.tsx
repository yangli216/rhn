import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { PrintReceipt } from '../api/printingApi'
import { errorMessage, type RhnApi } from '../rhnApi'
import { Alert, Button, Dialog, FormField } from '../ui'

export function DiagnosticPrintAction({ api, encounterId, sourceId, sourceLabel, taskCode, label = false, compact = false, disabled = false }: {
  api: RhnApi; encounterId: string; sourceId: string; sourceLabel?: string; taskCode: string; label?: boolean; compact?: boolean; disabled?: boolean
}) {
  const [reason, setReason] = useState('')
  const [reprinting, setReprinting] = useState(false)
  const command = useRef(crypto.randomUUID())
  const downloadRetry = useRef<PrintReceipt | null>(null)
  const sourceType = label ? 'DiagnosticSpecimen' : 'DiagnosticReport'
  const output = useMutation({ mutationFn: async () => {
    if (!downloadRetry.current) {
      const records = await api.printing.recordsBySource(encounterId, sourceType, sourceId)
      if (!Array.isArray(records) || records.some((record) => record.sourceId !== sourceId || record.sourceType !== sourceType
        || record.encounterId !== encounterId)) throw new Error('打印记录与当前业务来源不一致，请重新读取')
      const previous = records.find((record) => record.taskCode === taskCode && record.jobs.length > 0)
      if (label && previous && !reason.trim()) { setReprinting(true); return false }
      downloadRetry.current = previous
        ? await api.printing.reprint(previous.jobs[0].jobId, 1, reason.trim() || undefined, command.current)
        : await api.printing.submitTask({ taskCode, source: { sourceType, sourceId, encounterId },
          purpose: label ? 'CLINICAL_USE' : 'PATIENT_COPY', copies: 1, idempotencyKey: command.current })
    }
    await api.printing.download(downloadRetry.current)
    downloadRetry.current = null
    return true
  }, onSuccess: (completed) => { if (completed) { setReprinting(false); setReason(''); command.current = crypto.randomUUID() } } })
  const closeReprint = () => {
    if (output.isPending) return
    setReprinting(false); setReason(''); command.current = crypto.randomUUID(); output.reset()
  }
  return <div>
    <Button size="sm" variant="secondary" busy={output.isPending} disabled={disabled || output.isPending}
      title={label ? '下载标本标签 PDF' : undefined}
      onClick={() => output.mutate()}>{label ? compact ? '下载标签' : '下载标本标签 PDF' : '下载正式报告 PDF'}</Button>
    {output.error && !reprinting && <Alert>{errorMessage(output.error)}</Alert>}
    {output.isSuccess && output.data && (compact ? <small role="status">标签 PDF 已下载</small> : <p>PDF 已生成并下载；请按实际打印设备完成打印。</p>)}
    {reprinting && <Dialog title="补打标本标签" description="此标本已生成标签，请填写补打原因"
      closeOnBackdrop={false} onClose={closeReprint}
      footer={<><Button variant="secondary" disabled={output.isPending} onClick={closeReprint}>取消</Button>
        <Button disabled={disabled || output.isPending || !reason.trim()} busy={output.isPending} onClick={() => output.mutate()}>确认补打并下载</Button></>}>
      {sourceLabel && <p>标本 {sourceLabel}</p>}
      <FormField label="标签补打原因" required><input maxLength={500} value={reason} disabled={disabled || output.isPending}
        onChange={(event) => { setReason(event.target.value); command.current = crypto.randomUUID() }} /></FormField>
      {output.error && <Alert>{errorMessage(output.error)}</Alert>}
    </Dialog>}
  </div>
}
