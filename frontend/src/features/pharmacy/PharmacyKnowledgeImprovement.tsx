import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { RhnApi } from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import type { MedicationSafetyFinding } from '../../shared/api/encountersApi'
import type { PharmacyIntakeOrigin } from '../../shared/api/medicationKnowledgeDraftApi'
import { Alert, Button, Dialog, FormField, Select } from '../../shared/ui'
import { MedicationFeedbackImprovementDialog } from '../quality/MedicationFeedbackImprovementDialog'

export function PharmacyKnowledgeImprovement({ api, taskId, reviewId, findings }: {
  api: RhnApi; taskId: string; reviewId: string; findings: MedicationSafetyFinding[]
}) {
  const [open, setOpen] = useState(false), [finding, setFinding] = useState('')
  const [origin, setOrigin] = useState<PharmacyIntakeOrigin>()
  const source = useQuery({ queryKey: ['pharmacy-improvement-source', taskId, reviewId, finding],
    queryFn: () => api.medicationKnowledgeDrafts.pharmacyImprovementSource(taskId, reviewId, finding || undefined), enabled: open, retry: false })
  return <>
    <Button variant="secondary" onClick={() => { setFinding(''); setOpen(true) }}>转为 AI 改进需求</Button>
    {open && <Dialog title="选择要改进的用药规则" size="wide" onClose={() => setOpen(false)}>
      <Alert>将已保存的审方意见作为改进线索。需要药品知识管理权限；下一步编辑具体需求后才会调用 AI。</Alert>
      <FormField label="相关规则提示"><Select value={finding} onChange={setFinding} options={[
        { value: '', label: '未关联提示：漏报或新增知识需求' },
        ...findings.map(f => ({ value: f.findingId, label: `${f.category === 'DUPLICATE_THERAPY' ? '重复用药' : f.category === 'DRUG_INTERACTION' ? '相互作用' : '用药风险'}：${f.message}` })),
      ]} /></FormField>
      {source.isPending && <p>正在读取已保存的审方意见…</p>}
      {source.error && <Alert tone="error">{errorMessage(source.error)}</Alert>}
      {source.data && !source.isError && <><p>药师说明：{source.data.pharmacy.review.description || '未填写补充说明'}</p>
        <p>{source.data.knowledgeId ? `将改进知识：${source.data.title}` : '将根据需求建立新的知识草稿；已有内置规则不会被直接修改。'}</p></>}
      <Button disabled={!source.data || source.isError || source.isFetching} onClick={() => { setOrigin(source.data); setOpen(false) }}>编辑改进需求</Button>
    </Dialog>}
    {origin && <MedicationFeedbackImprovementDialog api={api} origin={origin} onClose={() => setOrigin(undefined)} />}
  </>
}
