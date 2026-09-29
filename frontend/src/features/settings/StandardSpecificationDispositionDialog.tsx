import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { errorMessage, type RhnApi, type StandardCatalogIdentity, type StandardMedicationDetail,
  type StandardMedicationSpecification, type StandardSpecificationDispositionEvent } from '../../shared/rhnApi'
import { Alert, Button, Dialog, FormField, Select, StatusBadge } from '../../shared/ui'

const labels: Record<StandardSpecificationDispositionEvent['status'], string> = {
  SUPPLEMENT_REQUIRED: '待补充具体规格',
  NOT_ADOPTED: '本院不采用',
}

export function StandardSpecificationDispositionDialog({api, identity, entry, specification, current, onClose, onViewOriginal}: {
  api: RhnApi
  identity: StandardCatalogIdentity
  entry: StandardMedicationDetail
  specification: StandardMedicationSpecification
  current?: StandardSpecificationDispositionEvent
  onClose: () => void
  onViewOriginal: () => void
}) {
  const client = useQueryClient()
  const [status, setStatus] = useState<StandardSpecificationDispositionEvent['status']>(current?.status ?? 'SUPPLEMENT_REQUIRED')
  const [note, setNote] = useState(current?.note ?? '')
  const mutation = useMutation({
    mutationFn: () => api.masterData.changeStandardSpecificationDisposition(specification.id, {
      identity, expectedRevision: current?.revision ?? 0, status, note: note.trim(),
    }),
    onSuccess: async () => {
      await client.invalidateQueries({queryKey: ['standard-specification-dispositions']})
      onClose()
    },
  })

  return <Dialog title="处理不完整规格" eyebrow={`${entry.name} · ${specification.doseFormName}`} size="wide"
    description="该内容是目录收载条件或原文片段，不是可直接建立药品主档的完整规格。"
    onClose={mutation.isPending ? () => {} : onClose}
    footer={<>
      <Button variant="secondary" disabled={mutation.isPending} onClick={onViewOriginal}>查看原件</Button>
      <Button variant="secondary" disabled={mutation.isPending} onClick={onClose}>取消</Button>
      <Button disabled={mutation.isPending || !note.trim()} onClick={() => mutation.mutate()}>保存处置</Button>
    </>}>
    {mutation.error && <Alert>{errorMessage(mutation.error)}</Alert>}
    <div className="standard-spec-disposition__summary">
      <div><span>目录内容</span><strong>{specification.specification}</strong></div>
      <div><span>当前状态</span>{current ? <StatusBadge tone={current.status === 'NOT_ADOPTED' ? 'neutral' : 'warning'}>{labels[current.status]}</StatusBadge> : <StatusBadge tone="warning">尚未处置</StatusBadge>}</div>
    </div>
    <FormField label="处置结果" required>
      <Select value={status} clearable={false} onChange={value => setStatus(value as StandardSpecificationDispositionEvent['status'])}
        options={Object.entries(labels).map(([value, label]) => ({value, label}))} />
    </FormField>
    <FormField label={status === 'SUPPLEMENT_REQUIRED' ? '所需材料或后续说明' : '不采用依据'} required
      hint={status === 'SUPPLEMENT_REQUIRED' ? '取得批准说明书或厂家资料后，补充每个成分的准确含量和制剂单位，再建立标准规格。' : undefined}>
      <textarea rows={4} maxLength={1000} value={note} onChange={event => setNote(event.target.value)}
        placeholder={status === 'SUPPLEMENT_REQUIRED' ? '例如：等待本院实际采购产品说明书及批准文号，补充每片各成分含量。' : '例如：本院无对应采购产品，不建立药品主档。'} />
    </FormField>
    {current && <small>{current.actor} · {new Date(current.recordedAt).toLocaleString()} · 第 {current.revision} 版处置</small>}
  </Dialog>
}
