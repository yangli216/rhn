import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type { ClinicalDocument } from "../../../shared/api/clinicalDocumentsApi";
import type { Prescription, ServiceRequest } from "../../../shared/api/encountersApi";
import type { PrintPurpose, PrintReceipt, PrintRecord } from "../../../shared/api/printingApi";
import type { Encounter, Resident } from "../../../shared/model";
import { formatTime } from "../../../shared/format";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, Dialog, EmptyState, FormField, Icon, LoadingState, Select, StatusBadge } from "../../../shared/ui"

export const printPurposeOptions: Array<{ value: PrintPurpose; label: string }> = [
  { value: 'PATIENT_COPY', label: '患者副本' },
  { value: 'CLINICAL_USE', label: '临床使用' },
  { value: 'ARCHIVE_COPY', label: '归档副本' },
]

export function printPurposeLabel(value: PrintPurpose) {
  return printPurposeOptions.find((item) => item.value === value)?.label ?? value
}

export function prescriptionCategoryLabel(value: string) {
  return ({ WESTERN: '西药处方', CHINESE_PATENT: '中成药处方', HERBAL: '草药处方' } as Record<string, string>)[value]
    ?? '门诊处方'
}

export function serviceApplicationLabel(value: ServiceRequest['serviceType']) {
  return ({ LABORATORY: '检验', EXAMINATION: '检查', TREATMENT: '治疗', OTHER: '诊疗' } as const)[value]
}

export function ControlledPrintDialog({ api, title, description, sourceLabel, generate, onGenerated, onClose }: {
  api: RhnApi
  title: string
  description: string
  sourceLabel: string
  generate: (purpose: PrintPurpose, copies: number) => Promise<PrintReceipt>
  onGenerated?: () => void
  onClose: () => void
}) {
  const [purpose, setPurpose] = useState<PrintPurpose>('PATIENT_COPY')
  const [copies, setCopies] = useState(1)
  const [receipt, setReceipt] = useState<PrintReceipt | null>(null)
  const [feedbackError, setFeedbackError] = useState('')
  const [isPrinting, setIsPrinting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  const triggerDirectPrint = async (value: PrintReceipt) => {
    if (value.delivery?.channel === 'LOCAL_BRIDGE') return
    if (!value.downloadUrl) return
    try {
      setIsPrinting(true)
      setFeedbackError('')
      await api.printing.printPdf(value.downloadUrl)
    } catch (err) {
      setFeedbackError(`已生成受控文件，但调起系统打印机失败：${errorMessage(err)}。您可尝试手动点击【调起打印机】或【下载 PDF】。`)
    } finally {
      setIsPrinting(false)
    }
  }

  const triggerDownload = async (value: PrintReceipt) => {
    if (value.delivery?.channel === 'LOCAL_BRIDGE') return
    try {
      setIsDownloading(true)
      setFeedbackError('')
      await api.printing.download(value)
    } catch (err) {
      setFeedbackError(`文件已生成，但下载失败：${errorMessage(err)}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const createJob = useMutation({
    mutationFn: () => generate(purpose, copies),
    onSuccess: async (value) => {
      setReceipt(value)
      onGenerated?.()
      await triggerDirectPrint(value)
    },
  })
  const reprintJob = useMutation({
    mutationFn: () => api.printing.reprint(receipt!.jobId, copies),
    onSuccess: async (value) => {
      setReceipt(value)
      onGenerated?.()
      await triggerDirectPrint(value)
    },
  })
  const busy = createJob.isPending || reprintJob.isPending
  const error = createJob.error || reprintJob.error

  return <Dialog title={title} eyebrow="受控打印" description={description} closeOnBackdrop={false}
    onClose={() => !busy && onClose()} footer={<>
      <Button variant="secondary" disabled={busy} onClick={onClose}>{receipt ? '完成' : '取消'}</Button>
      {receipt ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          {receipt.delivery?.channel !== 'LOCAL_BRIDGE' && (
            <>
              <Button variant="secondary" busy={isDownloading} onClick={() => void triggerDownload(receipt)}>
                <Icon name="download" />下载 PDF
              </Button>
              <Button variant="primary" busy={isPrinting} onClick={() => void triggerDirectPrint(receipt)}>
                <Icon name="print" />调起打印机
              </Button>
            </>
          )}
          <Button variant="text" busy={reprintJob.isPending} onClick={() => reprintJob.mutate()}>
            登记重打
          </Button>
        </div>
      ) : (
        <Button variant="primary" busy={createJob.isPending} onClick={() => createJob.mutate()}>
          <Icon name="print" />受控生成并打印
        </Button>
      )}
    </>}>
    <div className="print-confirmation doctor-print-confirmation">
      {(error || feedbackError) && <Alert>{feedbackError || errorMessage(error)}</Alert>}
      <dl>
        <div><dt>打印对象</dt><dd>{sourceLabel}</dd></div>
        <div><dt>打印规则</dt><dd>正式 PDF · 完整性摘要 · 操作留痕</dd></div>
      </dl>
      <div className="ui-form-grid doctor-print-options">
        <FormField label="打印用途"><Select value={purpose} disabled={busy || Boolean(receipt)} clearable={false}
          onChange={(value) => setPurpose(value as PrintPurpose)} options={printPurposeOptions} /></FormField>
        <FormField label="份数"><input type="number" min="1" max="10" value={copies} disabled={busy}
          onChange={(event) => setCopies(Math.min(10, Math.max(1, Number(event.target.value) || 1)))} /></FormField>
      </div>
      {receipt && <section className="doctor-print-receipt" aria-label="打印生成结果">
        <header><StatusBadge tone="success">{receipt.delivery?.channel === 'LOCAL_BRIDGE' ? '已进入打印队列'
          : receipt.requestType === 'REPRINT' ? '重打已登记' : '文件已生成'}</StatusBadge>
          <strong>{receipt.fileName}</strong></header>
        <dl>
          <div><dt>用途与份数</dt><dd>{printPurposeLabel(purpose)} · {receipt.copies} 份</dd></div>
          <div><dt>模板版本</dt><dd>{receipt.templateCode} · V{receipt.templateVersion}</dd></div>
          <div className="doctor-print-digest"><dt>SHA-256</dt><dd><code>{receipt.contentDigest}</code></dd></div>
          <div><dt>任务编号</dt><dd>{receipt.jobId}</dd></div>
          <div><dt>目标设备</dt><dd>{receipt.delivery?.deviceName} · {receipt.delivery?.channel === 'LOCAL_BRIDGE' ? '已入队' : '已就绪'}</dd></div>
        </dl>
        <p>{receipt.delivery?.channel === 'LOCAL_BRIDGE'
          ? '本地打印桥将领取任务并回传设备结果；当前入队不代表已经出纸。'
          : '系统已尝试调起打印机预览；若未弹出，可点击下方【调起打印机】或【下载 PDF】。'}</p>
      </section>}
    </div>
  </Dialog>
}

export function HistoricalReprintDialog({ api, record, title, onReprinted, onClose }: {
  api: RhnApi; record: PrintRecord; title?: string; onReprinted: () => void; onClose: () => void
}) {
  const [copies, setCopies] = useState(1)
  const [receipt, setReceipt] = useState<PrintReceipt | null>(null)
  const [downloadError, setDownloadError] = useState('')
  const [isPrinting, setIsPrinting] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const sourceJob = record.jobs[0]
  const dialogTitle = title || (record.sourceType === 'Prescription' ? '补打门诊处方'
    : record.sourceType === 'ServiceRequest' ? '补打门诊申请单' : '补打门诊病历')

  const triggerDirectPrint = async (downloadUrl?: string | null) => {
    if (!downloadUrl) return
    try {
      setIsPrinting(true)
      setDownloadError('')
      await api.printing.printPdf(downloadUrl)
    } catch (err) {
      setDownloadError(`已登记补打，但调起系统打印机失败：${errorMessage(err)}`)
    } finally {
      setIsPrinting(false)
    }
  }

  const triggerDownload = async (file: { downloadUrl: string; fileName: string }) => {
    try {
      setIsDownloading(true)
      setDownloadError('')
      await api.printing.download(file)
    } catch (err) {
      setDownloadError(`补打已登记，但文件下载失败：${errorMessage(err)}`)
    } finally {
      setIsDownloading(false)
    }
  }

  const reprint = useMutation({
    mutationFn: () => {
      if (!sourceJob) throw new Error('当前正式输出缺少原始打印任务，无法登记补打')
      return api.printing.reprint(sourceJob.jobId, copies)
    },
    onSuccess: async (value) => {
      setReceipt(value)
      onReprinted()
      if (value.delivery?.channel === 'LOCAL_BRIDGE') return
      await triggerDirectPrint(value.downloadUrl)
    },
  })
  return <Dialog title={dialogTitle} eyebrow="受控打印 · 复用不可变输出"
    description="补打不会重新渲染病历，将复用原 PDF 并新增一条打印任务留痕。" closeOnBackdrop={false}
    onClose={() => !reprint.isPending && onClose()} footer={<>
      <Button variant="secondary" disabled={reprint.isPending} onClick={onClose}>{receipt ? '完成' : '取消'}</Button>
      {receipt ? (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <Button variant="secondary" busy={isDownloading} onClick={() => void triggerDownload(receipt)}>
            <Icon name="download" />下载 PDF
          </Button>
          <Button variant="primary" busy={isPrinting} onClick={() => void triggerDirectPrint(receipt.downloadUrl)}>
            <Icon name="print" />调起打印机
          </Button>
        </div>
      ) : (
        <Button busy={reprint.isPending} disabled={!sourceJob} onClick={() => reprint.mutate()}>
          <Icon name="print" />登记补打并打印
        </Button>
      )}
    </>}>
    <div className="print-confirmation doctor-print-confirmation">
      {(reprint.error || downloadError) && <Alert>{downloadError || errorMessage(reprint.error)}</Alert>}
      <dl>
        <div><dt>正式输出</dt><dd>{record.fileName}</dd></div>
        <div><dt>文书版本</dt><dd>V{record.sourceVersion} · {printPurposeLabel(record.purpose)}</dd></div>
        <div><dt>模板版本</dt><dd>{record.templateCode} · V{record.templateVersion}</dd></div>
        <div><dt>既往任务</dt><dd>{record.jobs.length} 次</dd></div>
      </dl>
      <FormField label="补打份数"><input type="number" min="1" max="10" value={copies}
        disabled={reprint.isPending || Boolean(receipt)}
        onChange={(event) => setCopies(Math.min(10, Math.max(1, Number(event.target.value) || 1)))} /></FormField>
      <p className="doctor-history-document-digest"><span>{record.contentDigestAlgorithm}</span>
        <code>{record.contentDigest}</code></p>
      {receipt && <Alert>补打任务 {receipt.jobId} 已登记，共 {receipt.copies} 份；
        {receipt.delivery?.channel === 'LOCAL_BRIDGE' ? `已进入 ${receipt.delivery.deviceName} 队列。` : '已发起打印/下载流程。'}
        输出摘要保持不变。</Alert>}
    </div>
  </Dialog>
}

export function money(value: number, currencyCode = 'CNY') {
  return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currencyCode,
    minimumFractionDigits: 2 }).format(value)
}

export interface BatchPrintItem {
  id: string
  kind: 'clinicalDocument' | 'prescription' | 'serviceRequest'
  title: string
  meta: string
  isReady: boolean
  raw: ClinicalDocument | Prescription | ServiceRequest
}

export function BatchPrintDialog({
  encounter,
  api,
  onClose,
  onPrinted,
}: {
  encounter: Encounter
  api: RhnApi
  onClose: () => void
  onPrinted?: () => void
}) {
  const [purpose, setPurpose] = useState<PrintPurpose>('PATIENT_COPY')
  const [copies, setCopies] = useState(1)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')
  const [results, setResults] = useState<Array<{ item: BatchPrintItem; receipt?: PrintReceipt; error?: string }>>([])
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false)

  const documents = useQuery({
    queryKey: ['doctor-document', encounter.id],
    queryFn: () => api.clinicalDocuments.byEncounter(encounter.id),
  })
  const prescriptions = useQuery({
    queryKey: ['doctor-prescriptions', encounter.id],
    queryFn: () => api.encounters.prescriptions(encounter.id),
  })
  const services = useQuery({
    queryKey: ['doctor-services', encounter.id],
    queryFn: () => api.encounters.serviceRequests(encounter.id),
  })

  const note = documents.data?.find((d) => d.documentType === 'OUTPATIENT_NOTE')
  const noteSigned = note?.status === 'SIGNED'

  const items: BatchPrintItem[] = useMemo(() => {
    const list: BatchPrintItem[] = []
    if (note) {
      list.push({
        id: `note-${note.id}`,
        kind: 'clinicalDocument',
        title: '门诊病历',
        meta: noteSigned ? `已签署 · V${note.currentVersion}` : `草稿 V${note.currentVersion}（需先签署）`,
        isReady: Boolean(noteSigned),
        raw: note,
      })
    }
    for (const rx of prescriptions.data ?? []) {
      const activeCount = rx.medicationRequests.filter((m) => m.status === 'ACTIVE').length
      list.push({
        id: `rx-${rx.id}`,
        kind: 'prescription',
        title: `${prescriptionCategoryLabel(rx.categoryCode)} (${rx.prescriptionNo})`,
        meta: rx.status === 'ACTIVE' ? `${activeCount} 项药品 · 已生效` : `${rx.medicationRequests.length} 项药品 · 待审核开立`,
        isReady: rx.status === 'ACTIVE',
        raw: rx,
      })
    }
    for (const svc of services.data ?? []) {
      list.push({
        id: `svc-${svc.id}`,
        kind: 'serviceRequest',
        title: `${serviceApplicationLabel(svc.serviceType)}申请单 · ${svc.itemName}`,
        meta: `${svc.requestNo} · ${svc.status === 'ACTIVE' ? '已生效' : svc.status}`,
        isReady: svc.status === 'ACTIVE',
        raw: svc,
      })
    }
    return list
  }, [note, noteSigned, prescriptions.data, services.data])

  useEffect(() => {
    if (!hasInitializedSelection && (documents.isSuccess || prescriptions.isSuccess || services.isSuccess)) {
      const readyIds = items.filter((item) => item.isReady).map((item) => item.id)
      if (readyIds.length > 0) {
        setSelectedIds(readyIds)
        setHasInitializedSelection(true)
      }
    }
  }, [hasInitializedSelection, documents.isSuccess, prescriptions.isSuccess, services.isSuccess, items])

  const readyItems = items.filter((item) => item.isReady)
  const allReadySelected = readyItems.length > 0 && readyItems.every((item) => selectedIds.includes(item.id))

  const toggleSelectAll = () => {
    if (allReadySelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(readyItems.map((item) => item.id))
    }
  }

  const toggleItem = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  const handleBatchPrint = async () => {
    const selectedItems = items.filter((item) => selectedIds.includes(item.id) && item.isReady)
    if (selectedItems.length === 0) return

    setIsExecuting(true)
    setFeedbackError('')
    const batchResults: Array<{ item: BatchPrintItem; receipt?: PrintReceipt; error?: string }> = []

    for (const item of selectedItems) {
      try {
        let receipt: PrintReceipt
        if (item.kind === 'clinicalDocument') {
          receipt = await api.printing.clinicalDocument((item.raw as ClinicalDocument).id, purpose, copies)
        } else if (item.kind === 'prescription') {
          receipt = await api.printing.prescription(encounter.id, (item.raw as Prescription).id, purpose, copies)
        } else {
          receipt = await api.printing.serviceRequest(encounter.id, (item.raw as ServiceRequest).id, purpose, copies)
        }
        batchResults.push({ item, receipt })

        if (receipt.delivery?.channel !== 'LOCAL_BRIDGE' && receipt.downloadUrl) {
          try {
            await api.printing.printPdf(receipt.downloadUrl)
          } catch (e) {
            console.warn('Direct print warning for', item.title, e)
          }
        }
      } catch (err) {
        batchResults.push({ item, error: errorMessage(err) })
      }
    }

    setResults(batchResults)
    setIsExecuting(false)
    onPrinted?.()
  }

  const selectedCount = selectedIds.filter((id) => readyItems.some((item) => item.id === id)).length
  const busy = isExecuting || documents.isPending || prescriptions.isPending || services.isPending

  return (
    <Dialog
      title="批量受控打印"
      eyebrow="一键批量出纸"
      description="集中批量生成并受控打印本次就诊已签署病历、已生效处方及检查检验申请单。"
      size="wide"
      closeOnBackdrop={false}
      onClose={() => !isExecuting && onClose()}
      footer={
        <>
          <Button variant="secondary" disabled={isExecuting} onClick={onClose}>
            {results.length > 0 ? '完成' : '取消'}
          </Button>
          {results.length === 0 && (
            <Button
              variant="primary"
              busy={isExecuting}
              disabled={selectedCount === 0 || busy}
              onClick={() => void handleBatchPrint()}
            >
              <Icon name="print" />
              一键批量打印 ({selectedCount} 项)
            </Button>
          )}
        </>
      }
    >
      <div className="doctor-batch-print-dialog">
        {feedbackError && <Alert>{feedbackError}</Alert>}

        {results.length === 0 ? (
          <>
            <div className="doctor-batch-print-toolbar">
              <div className="doctor-batch-select-actions">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={readyItems.length === 0 || busy}
                  onClick={toggleSelectAll}
                >
                  {allReadySelected ? '取消全选' : '全选就绪项'}
                </Button>
                <span className="doctor-batch-count-hint">
                  已选 <strong>{selectedCount}</strong> / {readyItems.length} 项可打印单据
                </span>
              </div>
              <div className="doctor-batch-options">
                <div className="doctor-batch-option-item">
                  <label htmlFor="batch-print-purpose">用途：</label>
                  <Select
                    id="batch-print-purpose"
                    value={purpose}
                    disabled={busy}
                    onChange={(val) => setPurpose(val as PrintPurpose)}
                    options={printPurposeOptions.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                  />
                </div>
                <div className="doctor-batch-option-item">
                  <label htmlFor="batch-print-copies">份数：</label>
                  <input
                    id="batch-print-copies"
                    type="number"
                    min={1}
                    max={5}
                    value={copies}
                    disabled={busy}
                    onChange={(e) => setCopies(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
              </div>
            </div>

            {busy && items.length === 0 ? (
              <LoadingState label="正在加载可打印单据…" />
            ) : items.length === 0 ? (
              <EmptyState
                icon="clinical"
                title="暂无可打印单据"
                copy="病历录入或开立医嘱后，此处将展示可输出的单据。"
              />
            ) : (
              <div className="doctor-batch-item-list" role="list" aria-label="待打印单据列表">
                {items.map((item) => {
                  const isChecked = selectedIds.includes(item.id)
                  return (
                    <article
                      key={item.id}
                      className={`doctor-batch-item ${isChecked ? 'is-checked' : ''} ${!item.isReady ? 'is-disabled' : ''}`}
                      onClick={() => {
                        if (item.isReady && !busy) toggleItem(item.id)
                      }}
                      role="listitem"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!item.isReady || busy}
                        onChange={() => {
                          if (item.isReady && !busy) toggleItem(item.id)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`选择${item.title}`}
                      />
                      <div className="doctor-batch-item-info">
                        <strong>{item.title}</strong>
                        <small className={!item.isReady ? 'doctor-batch-item-reason' : ''}>
                          {item.meta}
                        </small>
                      </div>
                      <StatusBadge tone={item.isReady ? 'success' : 'warning'}>
                        {item.isReady ? '就绪' : '待处理'}
                      </StatusBadge>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="doctor-batch-receipts-summary" aria-label="批量受控打印执行结果">
            <div className="doctor-batch-receipts-header">
              <strong>批量受控打印完成（共 {results.length} 项）</strong>
              <small>已为选中的就绪单据生成防篡改正式 PDF 并调起打印，记录已留痕归档。</small>
            </div>
            <div className="doctor-batch-receipt-list">
              {results.map(({ item, receipt, error }, index) => (
                <div key={`${item.id}-${index}`} className="doctor-batch-receipt-item">
                  <div className="doctor-batch-receipt-meta">
                    <strong>{item.title}</strong>
                    {receipt ? (
                      <small>
                        {receipt.fileName} · SHA-256: <code>{receipt.contentDigest.slice(0, 12)}…</code> · 任务: {receipt.jobId}
                      </small>
                    ) : (
                      <small className="doctor-batch-item-reason">生成失败: {error}</small>
                    )}
                  </div>
                  <div className="doctor-batch-receipt-actions">
                    {receipt && (
                      <>
                        <Button
                          size="sm"
                          variant="text"
                          onClick={() => {
                            if (receipt.downloadUrl) void api.printing.printPdf(receipt.downloadUrl)
                          }}
                        >
                          <Icon name="print" />调起打印
                        </Button>
                        <Button
                          size="sm"
                          variant="text"
                          onClick={() => void api.printing.download(receipt)}
                        >
                          <Icon name="download" />下载
                        </Button>
                      </>
                    )}
                    <StatusBadge tone={receipt ? 'success' : 'danger'}>
                      {receipt ? '成功' : '失败'}
                    </StatusBadge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function EncounterPrintPanel({
  encounter,
  resident,
  api,
  onOpenNotePrint,
  onOpenPrescriptionPrint,
  onOpenServicePrint,
}: {
  encounter: Encounter
  resident?: Resident | null
  api: RhnApi
  onOpenNotePrint?: () => void
  onOpenPrescriptionPrint?: (rx: Prescription) => void
  onOpenServicePrint?: (svc: ServiceRequest) => void
}) {
  const queryClient = useQueryClient()
  const documents = useQuery({
    queryKey: ['doctor-document', encounter.id],
    queryFn: () => api.clinicalDocuments.byEncounter(encounter.id),
  })
  const prescriptions = useQuery({
    queryKey: ['doctor-prescriptions', encounter.id],
    queryFn: () => api.encounters.prescriptions(encounter.id),
  })
  const services = useQuery({
    queryKey: ['doctor-services', encounter.id],
    queryFn: () => api.encounters.serviceRequests(encounter.id),
  })
  const printRecords = useQuery({
    queryKey: ['doctor-print-records', encounter.id],
    queryFn: () => api.printing.recordsByEncounter(encounter.id),
  })

  const [activePrescription, setActivePrescription] = useState<Prescription | null>(null)
  const [activeService, setActiveService] = useState<ServiceRequest | null>(null)
  const [activeNotePrint, setActiveNotePrint] = useState(false)
  const [reprintRecord, setReprintRecord] = useState<PrintRecord | null>(null)

  const downloadRecord = useMutation({
    mutationFn: (record: PrintRecord) => api.printing.download(record),
  })

  const note = documents.data?.find((d) => d.documentType === 'OUTPATIENT_NOTE')
  const noteSigned = note?.status === 'SIGNED'

  const activeRxList = (prescriptions.data ?? []).filter((rx) => rx.status === 'ACTIVE')
  const draftRxList = (prescriptions.data ?? []).filter((rx) => rx.status === 'DRAFT')
  const activeSvcList = (services.data ?? []).filter((svc) => svc.status === 'ACTIVE')

  const refreshRecords = () => {
    void queryClient.invalidateQueries({ queryKey: ['doctor-print-records', encounter.id] })
  }

  interface EncounterPrintItem {
    id: string
    kind: 'note' | 'rx' | 'svc'
    title: string
    meta: string
    isReady: boolean
    statusTone: 'success' | 'warning' | 'neutral'
    statusLabel: string
    onSinglePrint: () => void
    singlePrintTitle: string
    singleButtonText: string
    raw: ClinicalDocument | Prescription | ServiceRequest | undefined
  }

  const items = useMemo<EncounterPrintItem[]>(() => {
    const list: EncounterPrintItem[] = [
      {
        id: `note-${note?.id ?? 'none'}`,
        kind: 'note',
        title: '门诊病历',
        meta: note
          ? (noteSigned
              ? `已签署 · V${note.currentVersion}`
              : `草稿 V${note.currentVersion}`)
          : '尚未录入门诊病历',
        isReady: Boolean(noteSigned),
        statusTone: !note ? 'neutral' : noteSigned ? 'success' : 'warning',
        statusLabel: !note ? '未录入' : noteSigned ? '可打印' : '需签署',
        onSinglePrint: () => {
          if (onOpenNotePrint) onOpenNotePrint()
          else setActiveNotePrint(true)
        },
        singlePrintTitle: !note ? '门诊病历尚未录入' : noteSigned ? '打印已签署门诊病历' : '门诊病历签署后方可打印',
        singleButtonText: '打印',
        raw: note,
      },
    ]

    for (const rx of activeRxList) {
      const activeCount = rx.medicationRequests.filter((m) => m.status === 'ACTIVE').length
      list.push({
        id: `rx-${rx.id}`,
        kind: 'rx',
        title: prescriptionCategoryLabel(rx.categoryCode),
        meta: `${activeCount} 种药品 · 处方号 ${rx.prescriptionNo}`,
        isReady: true,
        statusTone: 'success',
        statusLabel: '已生效',
        onSinglePrint: () => {
          if (onOpenPrescriptionPrint) onOpenPrescriptionPrint(rx)
          else setActivePrescription(rx)
        },
        singlePrintTitle: '打印处方',
        singleButtonText: '打印',
        raw: rx,
      })
    }

    for (const rx of draftRxList) {
      list.push({
        id: `rx-${rx.id}`,
        kind: 'rx',
        title: prescriptionCategoryLabel(rx.categoryCode),
        meta: `${rx.medicationRequests.length} 种药品 · 待审核开立`,
        isReady: false,
        statusTone: 'warning',
        statusLabel: '草稿',
        onSinglePrint: () => {},
        singlePrintTitle: '请先在医嘱工作区完成审核开立生效',
        singleButtonText: '待开立',
        raw: rx,
      })
    }

    for (const svc of activeSvcList) {
      list.push({
        id: `svc-${svc.id}`,
        kind: 'svc',
        title: `${serviceApplicationLabel(svc.serviceType)}申请单 · ${svc.itemName}`,
        meta: `单号 ${svc.requestNo}`,
        isReady: true,
        statusTone: 'success',
        statusLabel: '已生效',
        onSinglePrint: () => {
          if (onOpenServicePrint) onOpenServicePrint(svc)
          else setActiveService(svc)
        },
        singlePrintTitle: '打印申请单',
        singleButtonText: '打印',
        raw: svc,
      })
    }

    return list
  }, [note, noteSigned, activeRxList, draftRxList, activeSvcList, onOpenNotePrint, onOpenPrescriptionPrint, onOpenServicePrint])

  const readyItems = items.filter((item) => item.isReady)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [hasInitializedSelection, setHasInitializedSelection] = useState(false)
  const [purpose, setPurpose] = useState<PrintPurpose>('PATIENT_COPY')
  const [copies, setCopies] = useState(1)
  const [isBatchPrinting, setIsBatchPrinting] = useState(false)
  const [batchFeedback, setBatchFeedback] = useState<{ tone: 'success' | 'error'; message: string } | null>(null)

  useEffect(() => {
    if (!hasInitializedSelection && (documents.isSuccess || prescriptions.isSuccess || services.isSuccess)) {
      const readyIds = readyItems.map((item) => item.id)
      if (readyIds.length > 0) {
        setSelectedIds(readyIds)
        setHasInitializedSelection(true)
      }
    }
  }, [hasInitializedSelection, documents.isSuccess, prescriptions.isSuccess, services.isSuccess, readyItems])

  const allReadySelected = readyItems.length > 0 && readyItems.every((item) => selectedIds.includes(item.id))
  const selectedCount = selectedIds.filter((id) => readyItems.some((item) => item.id === id)).length

  const toggleSelectAll = () => {
    if (allReadySelected) {
      setSelectedIds([])
    } else {
      setSelectedIds(readyItems.map((item) => item.id))
    }
  }

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]))
  }

  const handleBatchPrint = async () => {
    const selectedReadyItems = readyItems.filter((item) => selectedIds.includes(item.id))
    if (selectedReadyItems.length === 0) return

    setIsBatchPrinting(true)
    setBatchFeedback(null)

    let successCount = 0
    const errors: string[] = []

    for (const item of selectedReadyItems) {
      try {
        let receipt: PrintReceipt
        if (item.kind === 'note' && item.raw) {
          receipt = await api.printing.clinicalDocument((item.raw as ClinicalDocument).id, purpose, copies)
        } else if (item.kind === 'rx' && item.raw) {
          receipt = await api.printing.prescription(encounter.id, (item.raw as Prescription).id, purpose, copies)
        } else if (item.raw) {
          receipt = await api.printing.serviceRequest(encounter.id, (item.raw as ServiceRequest).id, purpose, copies)
        } else {
          continue
        }

        if (receipt.delivery?.channel !== 'LOCAL_BRIDGE' && receipt.downloadUrl) {
          try {
            await api.printing.printPdf(receipt.downloadUrl)
          } catch (e) {
            console.warn('Direct print warning for', item.title, e)
          }
        }
        successCount++
      } catch (err) {
        errors.push(`${item.title}: ${errorMessage(err)}`)
      }
    }

    setIsBatchPrinting(false)
    refreshRecords()

    if (errors.length === 0) {
      setBatchFeedback({
        tone: 'success',
        message: `已成功完成 ${successCount} 项文书受控生成并调起打印。`,
      })
    } else {
      setBatchFeedback({
        tone: 'error',
        message: `完成 ${successCount} 项，失败 ${errors.length} 项：${errors.join('；')}`,
      })
    }
  }

  return (
    <div className="doctor-print-center-panel" aria-label="就诊文书与单据输出">
      <div className="doctor-print-center-toolbar">
        <div className="doctor-print-center-meta">
          {resident?.fullName && (
            <span className="doctor-print-patient-name">{resident.fullName}</span>
          )}
          <span className="doctor-print-meta-no" title={`就诊单号：${encounter.encounterNo}`}>
            就诊号 {encounter.encounterNo}
          </span>
          {readyItems.length > 0 && (
            <span className="doctor-print-ready-pill">
              {readyItems.length} 项可打印
            </span>
          )}
        </div>
        <div className="doctor-print-center-actions">
          <Button size="sm" variant="secondary" onClick={refreshRecords} disabled={isBatchPrinting} title="刷新单据与打印记录">
            <Icon name="refresh" />刷新
          </Button>
        </div>
      </div>

      <div className="doctor-print-center-content">
        <section className="doctor-print-section" aria-label="本次就诊可输出单据">
          <header className="doctor-print-section-header">
            <strong>可输出医疗文书与单据</strong>
            <small>仅支持打印已签署的病历和已生效的医嘱单据</small>
          </header>

          {batchFeedback && (
            <Alert tone={batchFeedback.tone} onDismiss={() => setBatchFeedback(null)}>
              {batchFeedback.message}
            </Alert>
          )}

          {readyItems.length > 0 && (
            <div className="doctor-batch-print-toolbar" aria-label="批量打印控制栏">
              <div className="doctor-batch-select-actions">
                <label className="doctor-batch-select-checkbox-label">
                  <input
                    type="checkbox"
                    className="doctor-print-doc-checkbox"
                    checked={allReadySelected}
                    disabled={isBatchPrinting}
                    onChange={toggleSelectAll}
                    aria-label="全选或取消全选可打印单据"
                  />
                  <span>全选</span>
                </label>
                <span className="doctor-batch-count-hint">
                  已选 <strong>{selectedCount}</strong> / {readyItems.length} 项可打印单据
                </span>
              </div>
              <div className="doctor-batch-options">
                <div className="doctor-batch-option-item">
                  <label htmlFor="batch-print-purpose">用途</label>
                  <Select
                    id="batch-print-purpose"
                    value={purpose}
                    disabled={isBatchPrinting}
                    onChange={(val) => setPurpose(val as PrintPurpose)}
                    options={printPurposeOptions.map((item) => ({
                      value: item.value,
                      label: item.label,
                    }))}
                  />
                </div>
                <div className="doctor-batch-option-item">
                  <label htmlFor="batch-print-copies">份数</label>
                  <input
                    id="batch-print-copies"
                    type="number"
                    min={1}
                    max={5}
                    value={copies}
                    disabled={isBatchPrinting}
                    onChange={(e) => setCopies(Math.min(5, Math.max(1, Number(e.target.value) || 1)))}
                  />
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  busy={isBatchPrinting}
                  disabled={selectedCount === 0 || isBatchPrinting}
                  onClick={() => void handleBatchPrint()}
                >
                  <Icon name="print" />一键批量打印 ({selectedCount} 项)
                </Button>
              </div>
            </div>
          )}

          <div className="doctor-print-doc-list" role="list" aria-label="可输出单据列表">
            {items.map((item) => {
              const isChecked = selectedIds.includes(item.id)
              return (
                <article
                  key={item.id}
                  className={`doctor-print-doc-item ${isChecked ? 'is-selected' : ''} ${!item.isReady ? 'is-disabled' : ''}`}
                  onClick={() => {
                    if (item.isReady && !isBatchPrinting) toggleItem(item.id)
                  }}
                  role="listitem"
                >
                  <input
                    type="checkbox"
                    className="doctor-print-doc-checkbox"
                    checked={isChecked}
                    disabled={!item.isReady || isBatchPrinting}
                    onChange={() => {
                      if (item.isReady && !isBatchPrinting) toggleItem(item.id)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`选择${item.title}`}
                  />
                  <div className="doctor-print-doc-meta">
                    <span className="doctor-print-doc-title">{item.title}</span>
                    <small>{item.meta}</small>
                  </div>
                  <StatusBadge tone={item.statusTone}>{item.statusLabel}</StatusBadge>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!item.isReady || isBatchPrinting}
                    title={item.singlePrintTitle}
                    onClick={(e) => {
                      e.stopPropagation()
                      item.onSinglePrint()
                    }}
                  >
                    <Icon name="print" />
                    {item.singleButtonText}
                  </Button>
                </article>
              )
            })}

            {activeRxList.length === 0 && draftRxList.length === 0 && activeSvcList.length === 0 && (
              <div className="doctor-print-empty-hint">
                <Icon name="clinical" />
                <span>暂无处方与申请单开立记录，开立医嘱后可在此输出。</span>
              </div>
            )}
          </div>
        </section>

        <section className="doctor-print-section" aria-label="受控打印记录与审计留痕">
          <header className="doctor-print-section-header">
            <strong>打印记录与补打 ({printRecords.data?.length ?? 0})</strong>
            <small>已打印文书历史记录，支持重新补打与留存下载</small>
          </header>

          {printRecords.isPending ? (
            <LoadingState label="正在加载打印记录…" />
          ) : !printRecords.data?.length ? (
            <EmptyState
              icon="roadmap"
              title="暂无打印记录"
              copy="完成文书或处方打印后，历史记录将展示在此，支持重新补打与下载。"
            />
          ) : (
            <div className="doctor-history-print-list">
              {printRecords.data.map((record) => (
                <article key={record.outputId}>
                  <span>
                    <strong>{record.fileName}</strong>
                    <small>
                      {printPurposeLabel(record.purpose)} · V{record.sourceVersion} · {formatTime(record.generatedAt)}
                    </small>
                  </span>
                  <span>
                    <small>{record.templateName || record.templateCode} · V{record.templateVersion}</small>
                    <small>{record.jobs.length} 次任务</small>
                  </span>
                  <div>
                    <Button
                      size="sm"
                      variant="text"
                      busy={downloadRecord.isPending}
                      onClick={() => downloadRecord.mutate(record)}
                      title="下载 PDF 文件"
                    >
                      <Icon name="download" />下载
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReprintRecord(record)}
                      title="登记补打任务并打印"
                    >
                      <Icon name="print" />补打
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {activeNotePrint && note && (
        <ControlledPrintDialog
          api={api}
          title="打印门诊病历"
          description={`已签署版本 V${note.currentVersion} · 每次生成和重打都会留痕。`}
          sourceLabel={`${note.title} · V${note.currentVersion}`}
          generate={(purpose, copies) => api.printing.clinicalDocument(note.id, purpose, copies)}
          onGenerated={refreshRecords}
          onClose={() => setActiveNotePrint(false)}
        />
      )}

      {activePrescription && (
        <ControlledPrintDialog
          api={api}
          title="打印门诊处方"
          description="仅生效处方可以生成正式 PDF；每次生成和重打都会留痕。"
          sourceLabel={`${prescriptionCategoryLabel(activePrescription.categoryCode)} · ${activePrescription.prescriptionNo}`}
          generate={(purpose, copies) =>
            api.printing.prescription(encounter.id, activePrescription.id, purpose, copies)
          }
          onGenerated={refreshRecords}
          onClose={() => setActivePrescription(null)}
        />
      )}

      {activeService && (
        <ControlledPrintDialog
          api={api}
          title={`打印${serviceApplicationLabel(activeService.serviceType)}申请单`}
          description="仅生效且未撤销的申请可以生成正式 PDF；每次生成和重打都会留痕。"
          sourceLabel={`${activeService.itemName} · ${activeService.requestNo}`}
          generate={(purpose, copies) =>
            api.printing.serviceRequest(encounter.id, activeService.id, purpose, copies)
          }
          onGenerated={refreshRecords}
          onClose={() => setActiveService(null)}
        />
      )}

      {reprintRecord && (
        <HistoricalReprintDialog
          api={api}
          record={reprintRecord}
          onReprinted={refreshRecords}
          onClose={() => setReprintRecord(null)}
        />
      )}
    </div>
  )
}
