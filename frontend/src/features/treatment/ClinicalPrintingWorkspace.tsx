import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ClinicalPrintBatch, ClinicalPrintCandidate, ClinicalPrintDocumentType, RhnApi,
} from '../../shared/rhnApi'
import { errorMessage } from '../../shared/rhnApi'
import { formatTime } from '../../shared/format'
import {
  Alert, Button, EmptyState, FormField, Icon, IconButton, LoadingState, PageHeader, Panel,
  Select, StatusBadge, Tooltip,
} from '../../shared/ui'

const DOCUMENT_TYPES: Array<{ value: ClinicalPrintDocumentType; label: string; short: string }> = [
  { value: 'ORAL_MEDICATION_CARD', label: '口服药卡', short: '口' },
  { value: 'INFUSION_LABEL', label: '输液瓶签', short: '签' },
  { value: 'INFUSION_PATROL_CARD', label: '输液巡视卡', short: '巡' },
]

export function ClinicalPrintingWorkspace({ api }: { api: RhnApi }) {
  const queryClient = useQueryClient()
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const [documentType, setDocumentType] = useState<ClinicalPrintDocumentType>('INFUSION_LABEL')
  const [keyword, setKeyword] = useState('')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [mediaProfileId, setMediaProfileId] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [startSlot, setStartSlot] = useState(1)
  const [reprintReason, setReprintReason] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [activeBatch, setActiveBatch] = useState<ClinicalPrintBatch>()

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(keyword.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [keyword])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const preparation = useQuery({
    queryKey: ['clinical-print-candidates', documentType, search, mediaProfileId],
    queryFn: () => api.printing.clinicalPrintCandidates(documentType, search, mediaProfileId || undefined),
  })
  const history = useQuery({
    queryKey: ['clinical-print-batches'],
    queryFn: () => api.printing.clinicalPrintBatches(),
  })

  useEffect(() => {
    setSelectedIds([]); setMediaProfileId(''); setDeviceId(''); setStartSlot(1)
    setReprintReason(''); setActiveBatch(undefined); setPreviewUrl('')
  }, [documentType])
  useEffect(() => {
    if (preparation.data && !deviceId) setDeviceId(preparation.data.defaultDeviceId ?? '')
  }, [deviceId, mediaProfileId, preparation.data])

  const candidateById = useMemo(() => new Map(
    (preparation.data?.candidates ?? []).map((value) => [value.sourceId, value])), [preparation.data])
  const selected = selectedIds.map((id) => candidateById.get(id)).filter(Boolean) as ClinicalPrintCandidate[]
  const repeated = selected.filter((value) => value.printedBefore).length
  const printable = (preparation.data?.candidates ?? []).filter((value) => value.eligible && !value.printedBefore)
  const excluded = (preparation.data?.candidates ?? []).filter((value) => !value.eligible)
  const media = preparation.data?.media
  const activeMediaProfileId = mediaProfileId || media?.id || ''
  const sheetGrid = media?.mediaKind === 'SHEET' && Boolean(media.heightMm)
  const sheetCapacity = Math.max(1, (media?.columns ?? 1) * (media?.rows ?? 1))
  const estimatedPages = selected.length
    ? sheetGrid ? Math.ceil((startSlot - 1 + selected.length) / sheetCapacity) : selected.length
    : 0

  async function loadPreview(batch: ClinicalPrintBatch) {
    if (!batch.downloadUrl) return
    const blob = await api.printing.clinicalPrintOutput(batch.downloadUrl)
    const next = URL.createObjectURL(blob)
    setPreviewUrl((current) => { if (current) URL.revokeObjectURL(current); return next })
    setActiveBatch(batch)
  }

  const generate = useMutation({
    mutationFn: async () => {
      const created = await api.printing.createClinicalPrintBatch({
        documentType, sourceIds: selectedIds, mediaProfileId: activeMediaProfileId || null, deviceId: deviceId || null,
        idempotencyKey: `WEB-${crypto.randomUUID()}`, layoutStrategy: sheetGrid ? 'SHEET_GRID' : 'ONE_CARD_PER_PAGE',
        startSlot: sheetGrid ? startSlot : 1,
        reprintReason: reprintReason.trim() || undefined,
      })
      const dispatched = await api.printing.dispatchClinicalPrintBatch(created.id, deviceId || null)
      await loadPreview(dispatched)
      return dispatched
    },
    onSuccess: async () => {
      setSelectedIds([]); setReprintReason('')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['clinical-print-candidates'] }),
        queryClient.invalidateQueries({ queryKey: ['clinical-print-batches'] }),
      ])
    },
  })
  const previewHistory = useMutation({ mutationFn: loadPreview })
  const retryDelivery = useMutation({
    mutationFn: async (batch: ClinicalPrintBatch) => {
      const dispatched = await api.printing.dispatchClinicalPrintBatch(batch.id, batch.deviceId)
      await loadPreview(dispatched)
      return dispatched
    },
    onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['clinical-print-batches'] }),
  })
  const error = preparation.error || history.error || generate.error || previewHistory.error || retryDelivery.error

  function toggle(candidate: ClinicalPrintCandidate) {
    if (!candidate.eligible) return
    setSelectedIds((current) => current.includes(candidate.sourceId)
      ? current.filter((id) => id !== candidate.sourceId) : [...current, candidate.sourceId])
  }
  function selectReady() { setSelectedIds(printable.map((value) => value.sourceId)) }

  return <div className="clinical-print-page">
    <PageHeader compact eyebrow="门诊诊疗 · 执行单据" title="临床打印"
      actions={<Button variant="secondary" size="sm" onClick={() => {
        void preparation.refetch(); void history.refetch()
      }}><Icon name="refresh" />刷新</Button>} />
    {error && <Alert>{errorMessage(error)}</Alert>}

    <div className="clinical-print-toolbar">
      <div className="clinical-print-document-tabs" role="tablist" aria-label="卡片类型">
        {DOCUMENT_TYPES.map((item) => <button key={item.value} type="button" role="tab"
          aria-selected={documentType === item.value} className={documentType === item.value ? 'is-active' : ''}
          onClick={() => setDocumentType(item.value)}><span>{item.short}</span>{item.label}</button>)}
      </div>
      <label className="clinical-print-search"><Icon name="search" />
        <input aria-label="搜索打印任务" value={keyword} placeholder="患者 / 档案号 / 药品 / 任务号"
          onChange={(event) => setKeyword(event.target.value)} /></label>
      <div className="clinical-print-toolbar-counts">
        <span>可打 <strong>{printable.length}</strong></span><span>未放行 <strong>{excluded.length}</strong></span>
      </div>
    </div>

    <div className="clinical-print-workspace">
      <Panel className="clinical-print-candidates">
        <header className="clinical-print-panel-head"><div><h2>执行队列</h2><span>{preparation.data?.candidates.length ?? 0} 项</span></div>
          <Button size="sm" variant="text" disabled={!printable.length} onClick={selectReady}>全选可打</Button></header>
        {preparation.isPending && <LoadingState label="正在核对执行任务…" />}
        {!preparation.isPending && !preparation.data?.candidates.length && <EmptyState icon="print"
          title="暂无卡片任务" copy="当前科室没有匹配的用药执行任务。" />}
        <div className="clinical-print-candidate-list">
          {preparation.data?.candidates.map((candidate) => <CandidateRow key={candidate.sourceId}
            candidate={candidate} checked={selectedIds.includes(candidate.sourceId)} onToggle={() => toggle(candidate)} />)}
        </div>
      </Panel>

      <Panel className="clinical-print-reconcile">
        <header className="clinical-print-panel-head"><div><h2>打印对账</h2><span>已选 {selected.length} 张</span></div>
          {selected.length > 0 && <Button size="sm" variant="text" onClick={() => setSelectedIds([])}>清空</Button>}</header>
        {!selected.length ? <EmptyState icon="card" title="尚未选择卡片" copy="从左侧勾选已放行的执行任务。" /> : <>
          <div className="clinical-print-reconcile-summary">
            <div><span>纳入</span><strong>{selected.length}</strong></div>
            <div><span>补打</span><strong>{repeated}</strong></div>
            <div><span>预计页数</span><strong>{estimatedPages}</strong></div>
          </div>
          <div className="clinical-print-selection-list">{selected.map((value, index) => <article key={value.sourceId}>
            <span className="clinical-print-sequence">{index + 1}</span><div><strong>{value.residentName}</strong>
              <p>{value.medicationSummary}</p><small>{value.taskNo} · {value.routeSummary}</small></div>
            {value.printedBefore && <Tooltip content="该任务今天已按当前模板版本打印，继续提交将作为补打记录。">
              <span className="clinical-print-repeat">补</span></Tooltip>}
            <IconButton icon="close" label={`移除 ${value.residentName}`} onClick={() => toggle(value)} />
          </article>)}</div>
          {repeated > 0 && <FormField label="补打原因" required><textarea rows={2} value={reprintReason}
            placeholder="如：标签污染、卡片遗失" onChange={(event) => setReprintReason(event.target.value)} /></FormField>}
        </>}
      </Panel>

      <Panel className="clinical-print-output">
        <header className="clinical-print-panel-head"><div><h2>输出设置</h2><span>{preparation.data?.media.mediaName ?? '-'}</span></div></header>
        {preparation.data && <div className="clinical-print-settings">
          <dl><div><dt>模板</dt><dd>{preparation.data.template.templateName}</dd></div>
            <div><dt>版本</dt><dd>V{preparation.data.template.version}</dd></div>
            <div><dt>介质</dt><dd>{preparation.data.media.widthMm} × {preparation.data.media.heightMm ?? '连续'} mm</dd></div>
            <div><dt>分辨率</dt><dd>{preparation.data.media.dpi} dpi</dd></div></dl>
          <FormField label="纸张与组版"><Select aria-label="输出纸张与组版" value={activeMediaProfileId}
            clearable={false} searchable={false} onChange={(value) => {
              setMediaProfileId(value); setDeviceId(''); setStartSlot(1)
            }} options={preparation.data.mediaProfiles.map((value) => ({ value: value.id, label: value.mediaName,
              secondaryText: `${value.widthMm} × ${value.heightMm ?? '连续'} mm`,
              trailingText: value.columns * value.rows > 1 ? `${value.columns * value.rows} 联` : undefined }))} /></FormField>
          {sheetGrid && sheetCapacity > 1 && <div className="clinical-print-sheet-options">
            <FormField label="首张起始格"><Select aria-label="首张起始格" value={String(startSlot)}
              clearable={false} searchable={false} onChange={(value) => setStartSlot(Number(value))}
              options={Array.from({ length: sheetCapacity }, (_, index) => ({ value: String(index + 1),
                label: `第 ${index + 1} 格` }))} /></FormField>
            <span>{media.columns} 列 × {media.rows} 行，共 {sheetCapacity} 格</span>
          </div>}
          <FormField label="目标设备"><Select aria-label="目标打印设备" value={deviceId}
            clearable={false} searchable={false} onChange={setDeviceId}
            options={preparation.data.devices.map((value) => ({ value: value.id ?? '', label: value.deviceName,
              secondaryText: value.channel === 'LOCAL_BRIDGE' ? value.queueName ?? '本地打印桥' : 'PDF 预览',
              trailingText: value.defaultDevice ? '默认' : undefined }))} /></FormField>
          <div className="clinical-print-output-action">
            <Button busy={generate.isPending} busyLabel="正在组版" disabled={!selected.length || repeated > 0 && !reprintReason.trim()}
              onClick={() => generate.mutate()}><Icon name="print" />生成并投递</Button>
            <span>{selected.length ? sheetGrid
              ? `${selected.length} 张 · ${estimatedPages} 页 · 第 ${startSlot} 格起`
              : `${selected.length} 张卡片 · 一卡一页` : '等待选择'}</span>
          </div>
        </div>}

        {activeBatch && previewUrl && <section className="clinical-print-preview">
          <header><div><strong>{activeBatch.documentName}</strong><span>{batchStatus(activeBatch.status)}</span></div>
            <div className="clinical-print-preview-actions">
              {activeBatch.status === 'FAILED' && <Button size="sm" variant="secondary"
                busy={retryDelivery.isPending} onClick={() => retryDelivery.mutate(activeBatch)}>
                <Icon name="refresh" />重新投递</Button>}
              <Tooltip content="调用浏览器打印对话框"><IconButton icon="print" label="打印当前 PDF"
                onClick={() => iframeRef.current?.contentWindow?.print()} /></Tooltip>
            </div></header>
          {activeBatch.delivery?.errorMessage && <Alert tone="error">
            {activeBatch.delivery.errorCode ? `${activeBatch.delivery.errorCode}：` : ''}{activeBatch.delivery.errorMessage}
          </Alert>}
          <iframe ref={iframeRef} title="打印 PDF 预览" src={previewUrl} />
        </section>}

        <section className="clinical-print-history"><header><h3>最近批次</h3><span>{history.data?.length ?? 0}</span></header>
          <div>{history.data?.slice(0, 6).map((batch) => <button type="button" key={batch.id}
            className={activeBatch?.id === batch.id ? 'is-active' : ''} onClick={() => previewHistory.mutate(batch)}>
            <span><strong>{batch.documentName}</strong><small>{formatTime(batch.createdAt)} · {batch.includedCount} 张</small></span>
            <StatusBadge tone={batchTone(batch.status)}>{batchStatus(batch.status)}</StatusBadge>
          </button>)}</div></section>
      </Panel>
    </div>
  </div>
}

function CandidateRow({ candidate, checked, onToggle }: {
  candidate: ClinicalPrintCandidate; checked: boolean; onToggle: () => void
}) {
  return <label className={`clinical-print-candidate ${checked ? 'is-selected' : ''} ${!candidate.eligible ? 'is-disabled' : ''}`}>
    <input type="checkbox" checked={checked} disabled={!candidate.eligible} onChange={onToggle} />
    <span className="clinical-print-patient-mark">{candidate.residentName.slice(0, 1)}</span>
    <span className="clinical-print-candidate-main"><span><strong>{candidate.residentName}</strong>
      {candidate.printedBefore && <Tooltip content="当前任务今天已经打印过"><i>补</i></Tooltip>}</span>
      <b>{candidate.medicationSummary}</b><small>{candidate.healthRecordNo} · {candidate.routeSummary} · {formatTime(candidate.createdAt)}</small>
      {!candidate.eligible && <em><Icon name="warning" />{candidate.exclusionReason}</em>}</span>
  </label>
}

function batchStatus(status: ClinicalPrintBatch['status']) {
  return ({ GENERATED: '已生成', PARTIAL: '部分生成', QUEUED: '已入队', SENT: '已发起',
    DEVICE_CONFIRMED: '设备已确认', FAILED: '失败', CANCELLED: '已取消', BUILDING: '组版中' } as const)[status]
}

function batchTone(status: ClinicalPrintBatch['status']) {
  if (status === 'DEVICE_CONFIRMED') return 'success' as const
  if (status === 'FAILED' || status === 'CANCELLED') return 'danger' as const
  if (status === 'QUEUED' || status === 'PARTIAL') return 'warning' as const
  return 'info' as const
}
