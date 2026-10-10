import { HistoryPrescriptionReference } from "../ai/HistoryPrescriptionReference";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PrintRecord } from "../../../shared/api/printingApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter } from "../../../shared/model";
import { formatTime } from "../../../shared/format";
import { encounterStatusPresentation } from "../../../shared/presentation";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, EmptyState, Icon, LoadingState, Panel, PanelHead, StatusBadge } from "../../../shared/ui";
import { type HistoryRecordField, type HistoryCopyField, type HistoryCopyDraft, type HistoryCopyRecord } from '../workstation/workstationShared'
import { printPurposeLabel, ControlledPrintDialog, HistoricalReprintDialog } from '../printing/EncounterPrintPanel'

export const defaultHistoryRecordFields: HistoryRecordField[] = [
  'chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam',
]

export interface HistoryCopyItem {
  key: HistoryCopyField
  label: string
  value: string
}

export interface HistoryCopyGroup {
  key: 'record' | 'diagnosis'
  label: string
  description: string
  items: HistoryCopyItem[]
}

export const historyDiagnosisKey = (code: string): HistoryCopyField => `diagnosis:${code}`

export function HistoryPanel({ encounters, currentEncounter, api, copyDisabled = false, onCopy, allergies = [], allergyReady = false }: {
  encounters: Encounter[]; currentEncounter: Encounter; api: RhnApi; copyDisabled?: boolean
  onCopy?: (draft: HistoryCopyDraft) => void
  allergies?: AllergyIntolerance[]
  allergyReady?: boolean
}) {
  const currentEncounterId = currentEncounter.id
  const history = useMemo(() => encounters.filter((item) => item.id !== currentEncounterId), [encounters, currentEncounterId])
  const [selectedId, setSelectedId] = useState<string | null>(history[0]?.id ?? null)
  const [checked, setChecked] = useState<Set<HistoryCopyField>>(() => new Set())
  const [notePrintOpen, setNotePrintOpen] = useState(false)
  const [reprintRecord, setReprintRecord] = useState<PrintRecord | null>(null)
  useEffect(() => {
    if (!selectedId || !history.some((item) => item.id === selectedId)) setSelectedId(history[0]?.id ?? null)
  }, [history, selectedId])
  const selected = history.find((item) => item.id === selectedId)
  const selectedDiagnosisCodes = selected?.diagnoses.map((item) => item.code).join(',') ?? ''
  const initializedHistorySelection = useRef<string | undefined>(undefined)
  useEffect(() => {
    const key = `${selectedId ?? ''}|${selectedDiagnosisCodes}`
    if (initializedHistorySelection.current === key) return
    initializedHistorySelection.current = key
    setChecked(new Set<HistoryCopyField>([
      ...defaultHistoryRecordFields,
      ...(selected?.diagnoses.map((item) => historyDiagnosisKey(item.code)) ?? []),
    ]))
  }, [selectedDiagnosisCodes, selectedId, selected?.diagnoses])
  const documents = useQuery({
    queryKey: ['doctor-history-document', selectedId],
    queryFn: () => api.clinicalDocuments.byEncounter(selectedId!), enabled: Boolean(selectedId),
  })
  const note = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const printRecords = useQuery({
    queryKey: ['doctor-history-print-records', selectedId],
    queryFn: () => api.printing.recordsByEncounter(selectedId!), enabled: Boolean(selectedId),
  })
  const noteVersion = note?.history.find((item) => item.version === note.currentVersion)
  const notePrintRecords = (printRecords.data ?? []).filter((item) => item.sourceType === 'ClinicalDocument'
    && item.sourceId === note?.id)
  const currentPrintRecords = notePrintRecords.filter((item) => item.sourceVersion === note?.currentVersion)
  const latestPrint = currentPrintRecords[0]
  const printJobCount = notePrintRecords.reduce((total, item) => total + item.jobs.length, 0)
  const downloadRecord = useMutation({ mutationFn: (record: PrintRecord) => api.printing.download(record) })
  const allRecordItems: HistoryCopyItem[] = selected ? [
    { key: 'chiefComplaint', label: '主诉', value: selected.chiefComplaint ?? '' },
    { key: 'presentIllness', label: '现病史', value: note?.content.presentIllness ?? '' },
    { key: 'medicalHistory', label: '既往史', value: note?.content.medicalHistory ?? '' },
    { key: 'physicalExam', label: '查体所见', value: note?.content.physicalExam ?? '' },
    { key: 'allergyHistory', label: '过敏史补充', value: note?.content.allergyHistory ?? '' },
    { key: 'medicationHistory', label: '用药史', value: note?.content.medicationHistory ?? '' },
    { key: 'auxiliaryExaminations', label: '辅助检查结果', value: note?.content.auxiliaryExaminations ?? '' },
    { key: 'healthEducation', label: '健康宣教', value: note?.content.healthEducation ?? '' },
    { key: 'followUp', label: '随访复诊', value: note?.content.followUp ?? '' },

  ] : []
  const recordItems = allRecordItems.filter((item) => Boolean(item.value.trim()))
  const diagnosisItems: HistoryCopyItem[] = selected?.diagnoses.map((item) => ({
    key: historyDiagnosisKey(item.code), label: item.type === 'PRIMARY' ? '主要诊断' : '次要诊断',
    value: `${item.display}（${item.code}）`,
  })) ?? []
  const copyGroups: HistoryCopyGroup[] = [
    { key: 'record', label: '病历内容', description: '主诉、病史、查体和诊疗计划', items: recordItems },
    { key: 'diagnosis', label: '诊断信息', description: '按诊断明细选择本次需要沿用的内容', items: diagnosisItems },
  ].filter((group) => group.items.length > 0) as HistoryCopyGroup[]
  const allItems = copyGroups.flatMap((group) => group.items)
  const selectedCount = allItems.filter((item) => checked.has(item.key)).length
  const toggle = (key: HistoryCopyField) => setChecked((current) => {
    const next = new Set(current)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleGroup = (items: HistoryCopyItem[]) => setChecked((current) => {
    const next = new Set(current)
    const allSelected = items.every((item) => next.has(item.key))
    items.forEach((item) => { if (allSelected) next.delete(item.key); else next.add(item.key) })
    return next
  })
  const copyToCurrent = () => {
    if (!selected || !onCopy || selectedCount === 0) return
    const record: HistoryCopyRecord = {}
    if (checked.has('chiefComplaint') && selected.chiefComplaint) record.chiefComplaint = selected.chiefComplaint
    if (checked.has('presentIllness') && note?.content.presentIllness) record.presentIllness = note.content.presentIllness
    if (checked.has('medicalHistory') && note?.content.medicalHistory) record.medicalHistory = note.content.medicalHistory
    if (checked.has('physicalExam') && note?.content.physicalExam) record.physicalExam = note.content.physicalExam
    if (checked.has('allergyHistory') && note?.content.allergyHistory) record.allergyHistory = note.content.allergyHistory
    if (checked.has('medicationHistory') && note?.content.medicationHistory) record.medicationHistory = note.content.medicationHistory
    if (checked.has('auxiliaryExaminations') && note?.content.auxiliaryExaminations) record.auxiliaryExaminations = note.content.auxiliaryExaminations
    if (checked.has('healthEducation') && note?.content.healthEducation) record.healthEducation = note.content.healthEducation
    if (checked.has('followUp') && note?.content.followUp) record.followUp = note.content.followUp

    onCopy({ requestId: Date.now(), sourceEncounterNo: selected.encounterNo, sourceRegisteredAt: selected.registeredAt,
      record, diagnoses: selected.diagnoses.filter((item) => checked.has(historyDiagnosisKey(item.code)))
        .map(({ code, display, type }) => ({ code, display, type })) })
  }

  return <Panel className="doctor-history-panel"><PanelHead title="门诊就诊历史" meta={`既往 ${history.length} 次`} />
    {history.length === 0 ? <EmptyState icon="roadmap" title="暂无历史就诊" copy="完成本次就诊后可在后续复诊中查看和复用。" />
      : <div className="doctor-history-browser">
        <div className="doctor-history-visits" role="list" aria-label="历史就诊列表">{history.map((item) =>
          <Button variant="text" size="sm" type="button" role="listitem" key={item.id} className={item.id === selectedId ? 'is-selected' : ''}
            aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
            <span><strong>{formatTime(item.registeredAt)}</strong><small>{item.encounterNo}</small></span>
            <span><strong>{item.chiefComplaint || '门诊就诊'}</strong>
              <small>{item.diagnoses.map((diagnosis) => diagnosis.display).join('、') || '尚无诊断'}</small></span>
            <Icon name="chevron-right" />
          </Button>)}</div>
        <section className="doctor-history-detail" aria-label="历史就诊详情">
          {selected && <HistoryPrescriptionReference key={selected.id} encounter={selected} targetEncounter={currentEncounter} api={api}
            disabled={copyDisabled || !onCopy} allergies={allergies} allergyReady={allergyReady}
            onStage={(medicationDrafts) => onCopy?.({ requestId: Date.now(), sourceEncounterNo: selected.encounterNo,
              sourceRegisteredAt: selected.registeredAt, record: {}, medicationDrafts })} />}
          {(documents.error || printRecords.error || downloadRecord.error) && <Alert>
            {errorMessage(documents.error || printRecords.error || downloadRecord.error)}</Alert>}
          {documents.isPending ? <LoadingState label="正在加载历史病历…" /> : <>
            <header><div><strong>{selected?.chiefComplaint || '门诊就诊'}</strong>
              <small>{selected ? `${formatTime(selected.registeredAt)} · ${selected.encounterNo}` : ''}</small></div>
              {selected && <StatusBadge tone={encounterStatusPresentation(selected.status).tone}>
                {encounterStatusPresentation(selected.status).label}</StatusBadge>}</header>
            <div className="doctor-history-copy-groups">
              {note && <section className="doctor-history-document-summary" aria-label="历史门诊病历文书">
                <header><span><strong>门诊病历文书</strong><small>签署版本、完整性证据与受控打印记录</small></span>
                  <StatusBadge tone={note.status === 'SIGNED' ? 'success' : 'warning'}>
                    {note.status === 'SIGNED' ? `已签署 · V${note.currentVersion}` : `${note.status} · V${note.currentVersion}`}
                  </StatusBadge></header>
                <dl>
                  <div><dt>签署时间</dt><dd>{noteVersion?.signedAt ? formatTime(noteVersion.signedAt) : '未签署'}</dd></div>
                  <div><dt>签署含义</dt><dd>{noteVersion?.signatureMeaning || '—'}</dd></div>
                  <div><dt>正式输出</dt><dd>{notePrintRecords.length} 份</dd></div>
                  <div><dt>打印任务</dt><dd>{printJobCount} 次</dd></div>
                </dl>
                {noteVersion?.contentDigest && <p className="doctor-history-document-digest">
                  <span>{noteVersion.contentDigestAlgorithm || '摘要'}</span><code>{noteVersion.contentDigest}</code></p>}
                {printRecords.isPending ? <LoadingState label="正在读取打印记录…" />
                  : notePrintRecords.length > 0 && <div className="doctor-history-print-list">
                    {notePrintRecords.map((record) => <article key={record.outputId}>
                      <span><strong>{record.fileName}</strong><small>{printPurposeLabel(record.purpose)} · 文书 V{record.sourceVersion}
                        · {formatTime(record.generatedAt)}</small></span>
                      <span><small>{record.templateCode} · V{record.templateVersion}</small>
                        <small>{record.jobs.length} 次任务</small></span>
                      <div><Button size="sm" variant="text" busy={downloadRecord.isPending}
                        onClick={() => downloadRecord.mutate(record)}>下载</Button>
                        {record.sourceVersion === note.currentVersion && <Button size="sm" variant="secondary"
                          onClick={() => setReprintRecord(record)}>补打</Button>}</div>
                    </article>)}</div>}
                {note.status === 'SIGNED' && !latestPrint && <footer>
                  <span>当前签署版本尚未生成正式 PDF</span>
                  <Button size="sm" onClick={() => setNotePrintOpen(true)}><Icon name="print" />生成并下载</Button>
                </footer>}
              </section>}
              {copyGroups.map((group) => {
              const groupSelectedCount = group.items.filter((item) => checked.has(item.key)).length
              const allSelected = groupSelectedCount === group.items.length
              const partlySelected = groupSelectedCount > 0 && !allSelected
              return <section className="doctor-history-copy-group" key={group.key}>
                <header>{onCopy ? <label>
                  <input type="checkbox" checked={allSelected} disabled={copyDisabled}
                    ref={(node) => { if (node) node.indeterminate = partlySelected }}
                    onChange={() => toggleGroup(group.items)} aria-label={`选择${group.label}`} />
                  <span><strong>{group.label}</strong><small>{group.description}</small></span>
                </label> : <span><strong>{group.label}</strong><small>{group.description}</small></span>}
                  <em>{onCopy ? `已选 ${groupSelectedCount}/${group.items.length}` : `${group.items.length} 项`}</em></header>
                <div className="doctor-history-copy-list">{group.items.map((item) => onCopy
                  ? <label key={item.key} className={checked.has(item.key) ? 'is-checked' : ''}>
                      <input type="checkbox" checked={checked.has(item.key)} disabled={copyDisabled}
                        onChange={() => toggle(item.key)} />
                      <span><strong>{item.label}</strong><small>{item.value}</small></span>
                    </label>
                  : <article key={item.key}><strong>{item.label}</strong><p>{item.value}</p></article>)}</div>
              </section>
            })}</div>
            {allItems.length === 0 && <EmptyState icon="clinical" title="本次就诊暂无可展示病历"
              copy="历史病历尚未形成可复用的结构化内容。" />}
            {onCopy && <footer><span>所选内容覆盖对应草稿；生命体征、医嘱和费用不复制</span>
              <Button size="sm" disabled={copyDisabled || selectedCount === 0} onClick={copyToCurrent}>
                复制所选 {selectedCount} 项</Button></footer>}
            {onCopy && copyDisabled && <p className="doctor-history-copy-disabled">当前病历已签署，不能再带入历史内容。</p>}
          </>}
        </section>
      </div>}
    {notePrintOpen && note && <ControlledPrintDialog api={api} title="打印历史门诊病历"
      description="按当前已签署版本生成不可变 PDF；后续补打复用本次输出。"
      sourceLabel={`${selected?.encounterNo || '历史就诊'} · 病历 V${note.currentVersion}`}
      generate={(purpose, copies) => api.printing.clinicalDocument(note.id, purpose, copies)}
      onGenerated={() => void printRecords.refetch()} onClose={() => setNotePrintOpen(false)} />}
    {reprintRecord && <HistoricalReprintDialog api={api} record={reprintRecord}
      onReprinted={() => void printRecords.refetch()} onClose={() => setReprintRecord(null)} />}
  </Panel>
}
