import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { IEditorData } from '@yangl/canvas-editor'
import type { InpatientEpisode } from '../../shared/api/inpatientApi'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import { clinicalDocumentStatusPresentation, clinicalDocumentVersionLabel } from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, Select, StatusBadge, Tabs } from '../../shared/ui'
import { CanvasMedicalRecordEditor, type CanvasEditorSnapshot } from './CanvasMedicalRecordEditor'
import {
  createInpatientDocumentTemplate,
  inpatientDocumentDefinitions,
  type InpatientDocumentDefinition,
  type InpatientDocumentType,
} from './InpatientMedicalRecordTemplates'
import './inpatient-medical-records.css'

const CONTENT_SCHEMA = 'RHN.CANVAS_EDITOR_DOCUMENT.V1'
let dailyDocumentSequence = 0

interface CanvasDocumentContent {
  editorVersion: string
  templateId: string
  templateVersion: string
  editorData: IEditorData
  plainText: string
  structuredValues: Record<string, unknown>
}

function contentOf(document?: ClinicalDocument): CanvasDocumentContent | undefined {
  if (!document || document.contentSchema !== CONTENT_SCHEMA) return undefined
  const content = document.content as Partial<CanvasDocumentContent>
  if (!content.editorData || !Array.isArray(content.editorData.main)) return undefined
  return content as CanvasDocumentContent
}

function matchesDefinition(document: ClinicalDocument, definition: InpatientDocumentDefinition) {
  return document.documentType === definition.type
}

function mostRecentFirst(left: ClinicalDocument, right: ClinicalDocument) {
  return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
}

function newDailyInstanceKey() {
  dailyDocumentSequence += 1
  return `PROGRESS-${Date.now().toString(36)}-${dailyDocumentSequence.toString(36)}`
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}

export function InpatientMedicalRecordWorkspace({ api, episode, organizationName }: {
  api: RhnApi
  episode: InpatientEpisode
  organizationName: string
}) {
  const queryClient = useQueryClient()
  const [documentType, setDocumentType] = useState<InpatientDocumentType>('INPATIENT_ADMISSION_RECORD')
  const [dailyDocumentId, setDailyDocumentId] = useState<string>()
  const [newDailyDraft, setNewDailyDraft] = useState(false)
  const [snapshot, setSnapshot] = useState<CanvasEditorSnapshot>()
  const [dirty, setDirty] = useState(false)
  const [editorReset, setEditorReset] = useState(0)
  const [amendmentOpen, setAmendmentOpen] = useState(false)
  const [amendmentReason, setAmendmentReason] = useState('')
  const documents = useQuery({
    queryKey: ['inpatient-documents', episode.encounterId],
    queryFn: () => api.clinicalDocuments.byEncounter(episode.encounterId),
  })
  const definition = inpatientDocumentDefinitions.find((item) => item.type === documentType)!
  const documentsForType = (documents.data ?? []).filter((item) => matchesDefinition(item, definition)).sort(mostRecentFirst)
  const document = documentType === 'INPATIENT_DAILY_PROGRESS_NOTE'
    ? newDailyDraft ? undefined : documentsForType.find((item) => item.id === dailyDocumentId) ?? documentsForType[0]
    : documentsForType[0]
  const savedContent = contentOf(document)
  const template = useMemo(() => createInpatientDocumentTemplate(definition, episode, organizationName),
    [definition, episode, organizationName])
  const editorKey = `${episode.id}-${documentType}-${document?.id ?? 'new'}-${document?.currentVersion ?? 0}-${editorReset}`
  const episodeReadOnly = episode.status !== 'ADMITTED'
  const editableDocument = !document || document.status === 'DRAFT' || document.status === 'AMENDMENT_IN_PROGRESS'
  const editorReadOnly = episodeReadOnly || !editableDocument
  const compatible = !document || Boolean(savedContent)

  const resetEditor = () => {
    setSnapshot(undefined)
    setDirty(false)
    setAmendmentOpen(false)
    setAmendmentReason('')
    setEditorReset((value) => value + 1)
  }
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inpatient-documents', episode.encounterId] })
  }
  const save = useMutation({
    mutationFn: async () => {
      if (!snapshot) throw new Error('病历编辑器尚未准备完成')
      const content: CanvasDocumentContent = {
        editorVersion: snapshot.editorVersion,
        templateId: definition.templateId,
        templateVersion: definition.templateVersion,
        editorData: snapshot.editorData,
        plainText: snapshot.plainText,
        structuredValues: snapshot.structuredValues,
      }
      if (document) {
        return api.clinicalDocuments.updateDraft(document.id, {
          expectedCurrentVersion: document.currentVersion,
          contentSchema: CONTENT_SCHEMA,
          content: content as unknown as Record<string, unknown>,
          changeReason: `保存${definition.label}`,
        })
      }
      const isDailyProgress = documentType === 'INPATIENT_DAILY_PROGRESS_NOTE'
      return api.clinicalDocuments.create({
        residentId: episode.residentId,
        encounterId: episode.encounterId,
        organizationId: episode.organizationId,
        departmentId: episode.departmentId,
        documentType,
        instanceKey: isDailyProgress ? newDailyInstanceKey() : undefined,
        title: `${episode.residentName} ${definition.label}${isDailyProgress ? ` ${formatDateTime(new Date().toISOString())}` : ''}`,
        contentSchema: CONTENT_SCHEMA,
        content: content as unknown as Record<string, unknown>,
        changeReason: `创建${definition.label}`,
      })
    },
    onSuccess: async (result) => {
      if (documentType === 'INPATIENT_DAILY_PROGRESS_NOTE') {
        setDailyDocumentId(result.id)
        setNewDailyDraft(false)
      }
      resetEditor()
      await refresh()
    },
  })
  const sign = useMutation({
    mutationFn: () => api.clinicalDocuments.sign(document!.id, document!.currentVersion, 'AUTHOR'),
    onSuccess: async () => { resetEditor(); await refresh() },
  })
  const amend = useMutation({
    mutationFn: () => api.clinicalDocuments.amend(document!.id, {
      expectedCurrentVersion: document!.currentVersion,
      contentSchema: CONTENT_SCHEMA,
      content: savedContent as unknown as Record<string, unknown>,
      changeReason: amendmentReason.trim(),
    }),
    onSuccess: async () => { resetEditor(); await refresh() },
  })

  if (documents.isPending) return <LoadingState label="正在加载住院病历…" />
  if (documents.error) return <Alert>{errorMessage(documents.error)}</Alert>

  const status = document ? clinicalDocumentStatusPresentation(document) : undefined
  const operationError = save.error || sign.error || amend.error
  const recordTabs = inpatientDocumentDefinitions.map((item) => {
    const existing = (documents.data ?? []).filter((value) => matchesDefinition(value, item)).sort(mostRecentFirst)
    const latest = existing[0]
    const meta = item.type === 'INPATIENT_DAILY_PROGRESS_NOTE' && existing.length > 0
      ? `${existing.length}份`
      : latest?.status === 'SIGNED' ? '已签' : latest ? '草稿' : '未创建'
    return {
      value: item.type,
      label: item.label,
      meta,
      disabled: dirty,
      tabId: `inpatient-record-${item.type}-tab`,
      panelId: `inpatient-record-${item.type}-panel`,
    }
  })
  const recordPanelId = `inpatient-record-${documentType}-panel`
  const recordTabId = `inpatient-record-${documentType}-tab`

  return <section className="inpatient-medical-records">
    <header className="inpatient-medical-records__head">
      <div><strong>电子病历</strong><span>文书版本、签署和完整性证据由临床文书底座统一保存</span></div>
      <div>
        {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
        {dirty && <Button variant="text" onClick={resetEditor}>放弃修改</Button>}
        {!episodeReadOnly && editableDocument && compatible && <Button variant="secondary" busy={save.isPending}
          disabled={!snapshot || (!dirty && Boolean(document))} onClick={() => save.mutate()}>保存病历</Button>}
        {!episodeReadOnly && document && editableDocument && compatible && <Button busy={sign.isPending}
          disabled={dirty || !snapshot || snapshot.validationErrors.length > 0} onClick={() => sign.mutate()}>签署</Button>}
        {!episodeReadOnly && document?.status === 'SIGNED' && compatible && <Button variant="secondary"
          onClick={() => setAmendmentOpen((value) => !value)}>发起修订</Button>}
      </div>
    </header>
    {episodeReadOnly && <Alert>该住院患者已出院，病历仅供查看，不能再新增、修改或签署。</Alert>}
    {dirty && <Alert>当前病历有未保存修改；请先保存或放弃，再切换其他病历。</Alert>}
    {!editorReadOnly && snapshot && snapshot.validationErrors.length > 0 && <Alert>
      草稿可以继续保存；签署前请完成：{snapshot.validationErrors.map((item) => item.label ?? item.fieldId).join('、')}。
    </Alert>}
    {operationError && <Alert>{errorMessage(operationError)}</Alert>}
    {amendmentOpen && <form className="inpatient-record-amendment" onSubmit={(event) => {
      event.preventDefault()
      if (amendmentReason.trim()) amend.mutate()
    }}>
      <FormField label="修订原因" required><input aria-label="修订原因" value={amendmentReason} maxLength={500}
        onChange={(event) => setAmendmentReason(event.target.value)} placeholder="说明签署后需要修订的原因" required /></FormField>
      <Button type="submit" busy={amend.isPending} disabled={!amendmentReason.trim()}>创建修订版本</Button>
      <Button variant="text" onClick={() => { setAmendmentOpen(false); setAmendmentReason('') }}>取消</Button>
    </form>}
    <Tabs value={documentType} items={recordTabs} label="住院病历类型" variant="cards"
      className="inpatient-medical-records__tabs" onChange={(value) => {
        setDocumentType(value)
        setNewDailyDraft(false)
        resetEditor()
      }} />
    <div role="tabpanel" id={recordPanelId} aria-labelledby={recordTabId}>
      {documentType === 'INPATIENT_DAILY_PROGRESS_NOTE' && <div className="inpatient-record-picker">
        <FormField label="病程记录"><Select aria-label="选择日常病程" value={newDailyDraft ? 'new' : document?.id ?? ''}
          disabled={dirty} clearable={false} options={[
            ...documentsForType.map((item) => ({
              value: item.id,
              label: `${formatDateTime(item.createdAt)} · ${clinicalDocumentStatusPresentation(item).label}`,
            })),
            { value: 'new', label: '新建日常病程' },
          ]} onChange={(value) => {
          if (value === 'new') {
            setNewDailyDraft(true)
          } else {
            setDailyDocumentId(value)
            setNewDailyDraft(false)
          }
          resetEditor()
        }} /></FormField>
        <Button size="sm" variant="secondary" disabled={dirty || episodeReadOnly} onClick={() => {
          setNewDailyDraft(true)
          resetEditor()
        }}>新建病程</Button>
      </div>}
      {document && document.history.length > 0 && <details className="inpatient-record-versions">
        <summary>版本记录（{document.history.length}）</summary>
        <div>{[...document.history].sort((left, right) => right.version - left.version).map((version) => <article key={version.version}>
          <strong>v{version.version} · {clinicalDocumentVersionLabel(version)}</strong>
          <span>{formatDateTime(version.createdAt)} · {version.changeReason}</span>
          {version.signedAt && <small>签署于 {formatDateTime(version.signedAt)}{version.signatureMeaning ? ` · ${version.signatureMeaning}` : ''}</small>}
        </article>)}</div>
      </details>}
      {document && !savedContent ? <EmptyState icon="clinical" title="病历格式暂不兼容"
        copy="该病历不是当前 Canvas Editor 文档，已保持只读，避免覆盖历史内容。" /> :
        <CanvasMedicalRecordEditor key={editorKey} template={template} initialData={savedContent?.editorData}
          readOnly={editorReadOnly} onSnapshot={(value) => {
            setSnapshot(value)
            if (value.changed) setDirty(true)
          }} />}
    </div>
  </section>
}
