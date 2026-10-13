import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import type { PrintReceipt } from '../api/printingApi'
import { errorMessage, type RhnApi } from '../rhnApi'
import { Alert, Button, FormField } from '../ui'

export function DiagnosticPrintAction({ api, encounterId, sourceId, taskCode, label = false, disabled = false }: {
  api: RhnApi; encounterId: string; sourceId: string; taskCode: string; label?: boolean; disabled?: boolean
}) {
  const [reason, setReason] = useState('')
  const command = useRef(crypto.randomUUID())
  const downloadRetry = useRef<PrintReceipt | null>(null)
  const sourceType = label ? 'DiagnosticSpecimen' : 'DiagnosticReport'
  const output = useMutation({ mutationFn: async () => {
    if (!downloadRetry.current) {
      const records = await api.printing.recordsBySource(encounterId, sourceType, sourceId)
      if (!Array.isArray(records) || records.some((record) => record.sourceId !== sourceId || record.sourceType !== sourceType
        || record.encounterId !== encounterId)) throw new Error('打印记录与当前业务来源不一致，请重新读取')
      const previous = records.find((record) => record.taskCode === taskCode && record.jobs.length > 0)
      if (label && previous && !reason.trim()) throw new Error('此标本已生成标签，请填写补打原因')
      downloadRetry.current = previous
        ? await api.printing.reprint(previous.jobs[0].jobId, 1, reason.trim() || undefined, command.current)
        : await api.printing.submitTask({ taskCode, source: { sourceType, sourceId, encounterId },
          purpose: label ? 'CLINICAL_USE' : 'PATIENT_COPY', copies: 1, idempotencyKey: command.current })
    }
    await api.printing.download(downloadRetry.current)
    downloadRetry.current = null
  }, onSuccess: () => { setReason(''); command.current = crypto.randomUUID() } })
  return <div>
    {label && <FormField label="标签补打原因"><input maxLength={500} value={reason} disabled={disabled || output.isPending}
      onChange={(event) => { setReason(event.target.value); command.current = crypto.randomUUID() }} /></FormField>}
    <Button size="sm" variant="secondary" busy={output.isPending} disabled={disabled || output.isPending}
      onClick={() => output.mutate()}>{label ? '下载标本标签 PDF' : '下载正式报告 PDF'}</Button>
    {output.error && <Alert>{errorMessage(output.error)}</Alert>}
    {output.isSuccess && <p>PDF 已生成并下载；请按实际打印设备完成打印。</p>}
  </div>
}
