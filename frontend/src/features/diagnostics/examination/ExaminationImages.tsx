import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DiagnosticExecutionTask, DiagnosticReportDraft } from '../../../shared/api/diagnosticsApi'
import { DiagnosticImagePreview } from '../../../shared/clinical/DiagnosticImagePreview'
import { errorMessage, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, FormField, LoadingState } from '../../../shared/ui'

export function ExaminationImages({ api, task, draft, disabled, onRefresh }: {
  api: RhnApi; task: DiagnosticExecutionTask; draft: DiagnosticReportDraft; disabled: boolean; onRefresh: () => Promise<void>
}) {
  const client = useQueryClient()
  const [file, setFile] = useState<File>()
  const [caption, setCaption] = useState('')
  const [primaryId, setPrimaryId] = useState<string | null>(null)
  const command = useRef(crypto.randomUUID())
  const picker = useRef<HTMLInputElement>(null)
  const images = useQuery({ queryKey: ['diagnostic-images', task.id, task.organizationId, task.departmentId],
    queryFn: () => api.diagnostics.draftImages(task.id) })
  const refresh = async () => { await client.invalidateQueries({ queryKey: ['diagnostic-images', task.id] }); await onRefresh() }
  const upload = useMutation({ mutationFn: async () => {
    if (!file) throw new Error('请先选择关键图像')
    if (file.size > 10 * 1024 * 1024) throw new Error('单张关键图像不能超过 10MB')
    return api.diagnostics.uploadImage(task.id, task.revision, draft.revision, command.current, file, caption)
  }, onSuccess: async () => {
    setFile(undefined); setCaption(''); command.current = crypto.randomUUID()
    if (picker.current) picker.current.value = ''
    await refresh()
  } })
  const remove = useMutation({ mutationFn: (id: string) =>
    api.diagnostics.removeImage(task.id, id, task.revision, draft.revision), onSuccess: refresh })
  const busy = disabled || upload.isPending || remove.isPending || images.isFetching
  const activePrimaryId = primaryId || images.data?.[0]?.id

  return <section aria-label="检查关键图像"><h3>关键图像与阅片 (PACS)</h3>
    <p>先保存报告草稿，再添加 JPG/PNG；最多四张，每张不超过 10MB。支持点击大图高清阅片，标记报告首选主图。</p>
    {(images.error || upload.error || remove.error) && <Alert>{errorMessage(images.error || upload.error || remove.error)}</Alert>}
    {images.isPending ? <LoadingState label="正在读取关键图像…" /> : images.isSuccess && <div className="diagnostic-image-grid">
      {images.data.map((image) => <div key={image.id}><DiagnosticImagePreview image={image}
        isPrimary={image.id === activePrimaryId}
        onSetPrimary={() => setPrimaryId(image.id)}
        load={() => api.diagnostics.draftImageContent(task.id, image.id)} />
        <Button size="sm" variant="secondary" disabled={busy || !draft.content} onClick={() => remove.mutate(image.id)}>移出当前草稿</Button></div>)}
    </div>}
    <div className="diagnostic-form-row"><FormField label="选择关键图像"><input ref={picker} type="file" accept="image/jpeg,image/png"
      disabled={busy || !draft.content} onChange={(event) => { setFile(event.target.files?.[0]); command.current = crypto.randomUUID() }} /></FormField>
      <FormField label="图像说明"><input value={caption} maxLength={500} disabled={busy || !draft.content}
        onChange={(event) => { setCaption(event.target.value); command.current = crypto.randomUUID() }} /></FormField>
      <Button variant="secondary" busy={upload.isPending} disabled={busy || !file || !draft.content || !images.isSuccess || images.data.length >= 4}
        onClick={() => upload.mutate()}>上传图像</Button></div>
  </section>
}
