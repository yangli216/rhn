import './history-panel.css'
import { WorkspacePane } from '../../../shared/ui/templates/PageTemplates'
import { HistoryPrescriptionReference } from "../ai/HistoryPrescriptionReference";
import { useMutation, useQueries, useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { PrintRecord } from "../../../shared/api/printingApi";
import type { AllergyIntolerance } from "../../../shared/api/residentsApi";
import type { Encounter } from "../../../shared/model";
import { formatTime } from "../../../shared/format";
import { clinicalDocumentStatusPresentation, encounterStatusPresentation } from "../../../shared/presentation";
import { errorMessage, type RhnApi } from "../../../shared/rhnApi";
import { Alert, Button, EmptyState, Icon, LoadingState, Panel, PanelHead, StatusBadge } from "../../../shared/ui";
import { type HistoryRecordField, type HistoryCopyField, type HistoryCopyDraft, type HistoryCopyRecord } from '../workstation/workstationShared'
import { printPurposeLabel, ControlledPrintDialog, HistoricalReprintDialog } from '../printing/EncounterPrintPanel'

export const defaultHistoryRecordFields: HistoryRecordField[] = [
  'chiefComplaint', 'presentIllness', 'medicalHistory', 'physicalExam',
  'allergyHistory', 'medicationHistory', 'auxiliaryExaminations', 'healthEducation', 'followUp',
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

const directoryScopes = new WeakMap<RhnApi, number>()
let nextDirectoryScope = 0

function HistoryCopySection({ group, checked, canCopy, onToggle, onToggleGroup }: {
  group: HistoryCopyGroup; checked: Set<HistoryCopyField>; canCopy: boolean
  onToggle: (key: HistoryCopyField) => void; onToggleGroup: (items: HistoryCopyItem[]) => void
}) {
  const sectionId = useId()
  const [expanded, setExpanded] = useState<Set<HistoryCopyField>>(() => new Set())
  const foldable = group.key === 'record' ? group.items.filter(item => item.key !== 'chiefComplaint') : []
  const allExpanded = foldable.length > 0 && foldable.every(item => expanded.has(item.key))
  const selectedCount = group.items.filter(item => checked.has(item.key)).length
  const allSelected = selectedCount === group.items.length
  return <section className={`doctor-history-copy-group is-${group.key}`} aria-label={group.label}>
    <header>
      <div className="doctor-history-group-title">
        {canCopy && <input type="checkbox" checked={allSelected}
          ref={node => { if (node) node.indeterminate = selectedCount > 0 && !allSelected }}
          onChange={() => onToggleGroup(group.items)} aria-label={`选择${group.label}`} />}
        <Icon name={group.key === 'record' ? 'file-text' : 'stethoscope'} />
        <h3 title={group.description}>{group.label}</h3>
      </div>
      <div className="doctor-history-group-actions">
        <small>{canCopy ? `已选 ${selectedCount}/${group.items.length}` : `${group.items.length} 项`}</small>
        {foldable.length > 0 && <Button variant="text" size="sm" onClick={() => setExpanded(allExpanded
          ? new Set() : new Set(foldable.map(item => item.key)))}>
          {allExpanded ? '收起全部' : '展开全部'}</Button>}
      </div>
    </header>
    <div className="doctor-history-copy-list">{group.items.map(item => {
      const canFold = group.key === 'record' && item.key !== 'chiefComplaint'
      const open = !canFold || expanded.has(item.key)
      const contentId = `${sectionId}-${item.key}-content`
      return <div key={item.key} className={`doctor-history-copy-row${open && canFold ? ' is-expanded' : ''}`}>
        {canCopy ? <label className="doctor-history-field-select">
          <input type="checkbox" checked={checked.has(item.key)} onChange={() => onToggle(item.key)}
            aria-label={`选择${group.key === 'diagnosis' ? `${item.label} ${item.value}` : item.label}`} />
          <strong>{item.label}</strong>
        </label> : <strong className="doctor-history-field-label">{item.label}</strong>}
        {canFold ? <>
          {!open && <span className="doctor-history-field-preview">{item.value.replace(/\s+/g, ' ')}</span>}
          <Button className="doctor-history-field-toggle" variant="text" size="sm" aria-expanded={open}
            aria-controls={contentId} aria-label={`${open ? '收起' : '展开'}${item.label}`}
            onClick={() => setExpanded(previous => {
              const next = new Set(previous)
              if (next.has(item.key)) next.delete(item.key); else next.add(item.key)
              return next
            })}>{open ? '收起' : '展开'}</Button>
          <p id={contentId} className="doctor-history-field-value" hidden={!open}>{item.value}</p>
        </> : <p className="doctor-history-field-value">{item.value}</p>}
      </div>
    })}</div>
  </section>
}

export function HistoryPanel({ encounters, currentEncounter, api, copyDisabled = false, onCopy, allergies = [], allergyReady = false }: {
  encounters: Encounter[]; currentEncounter: Encounter; api: RhnApi; copyDisabled?: boolean
  onCopy?: (draft: HistoryCopyDraft) => void
  allergies?: AllergyIntolerance[]
  allergyReady?: boolean
}) {
  const canCopy = Boolean(onCopy) && !copyDisabled
  const currentEncounterId = currentEncounter.id
  const history = useMemo(() => encounters.filter((item) => item.id !== currentEncounterId), [encounters, currentEncounterId])
  if (!directoryScopes.has(api)) directoryScopes.set(api, ++nextDirectoryScope)
  const directoryScope = directoryScopes.get(api)
  const organizations = useQuery({ queryKey: ['history-organizations', directoryScope],
    queryFn: () => api.organization.list(), enabled: history.some(item => item.organizationId !== currentEncounter.organizationId),
    staleTime: 60_000, retry: false })
  const organizationIds = [...new Set(history.map(item => item.organizationId))].sort()
  const departments = useQueries({ queries: organizationIds.map(id => ({
    queryKey: ['history-departments', directoryScope, id], queryFn: () => api.organization.departments(id),
    staleTime: 60_000, retry: false,
  })) })
  const visitLocation = (visit: Encounter) => {
    const directory = departments[organizationIds.indexOf(visit.organizationId)]
    const matches = directory?.isSuccess && Array.isArray(directory.data)
      ? directory.data.filter(item => item.organizationId === visit.organizationId && item.id === visit.departmentId && item.name?.trim()) : []
    const departmentName = matches.length === 1 ? matches[0].name.trim() : '科室名称待确认'
    if (visit.organizationId === currentEncounter.organizationId) return departmentName
    const organizationMatches = organizations.isSuccess && Array.isArray(organizations.data)
      ? organizations.data.filter(item => item.id === visit.organizationId && item.name?.trim()) : []
    const organizationName = organizationMatches.length === 1 ? organizationMatches[0].name.trim() : '机构名称待确认'
    return `${organizationName} · ${departmentName}`
  }
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
  const notePrintRecords = (printRecords.data ?? []).filter((item) => item.sourceType === 'ClinicalDocument'
    && item.sourceId === note?.id)
  const currentPrintRecords = notePrintRecords.filter((item) => item.sourceVersion === note?.currentVersion)
  const latestPrint = currentPrintRecords[0]
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
    { key: 'record', label: '病历内容', description: '选择需要沿用的病历段落', items: recordItems },
    { key: 'diagnosis', label: '诊断信息', description: '选择本次需要沿用的诊断', items: diagnosisItems },
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
          <div role="listitem" key={item.id}><Button variant={item.id === selectedId ? 'secondary' : 'text'} size="sm" type="button" className={item.id === selectedId ? 'is-selected' : ''}
            aria-label={`查看${visitLocation(item)} ${formatTime(item.registeredAt)} ${item.encounterNo}`}
            aria-pressed={item.id === selectedId} onClick={() => setSelectedId(item.id)}>
            <span className="doctor-history-visit">
              <span className="doctor-history-visit-content">
                <span className="doctor-history-visit-meta"><strong title={visitLocation(item)}>{visitLocation(item)}</strong>
                  <small>{formatTime(item.registeredAt)}</small></span>
                <small title={item.diagnoses.map((diagnosis) => diagnosis.display).join('、')}>
                  {item.diagnoses.map((diagnosis) => diagnosis.display).join('、') || '尚无诊断'}</small>
              </span>
              <Icon name="chevron-right" />
            </span>
          </Button></div>)}</div>
        <WorkspacePane className="doctor-history-detail" label="历史就诊详情" resetScrollKey={selectedId ?? undefined}
          header={<header className="doctor-history-context"><div><strong>{selected?.chiefComplaint || '门诊就诊'}</strong>
              <small>{selected ? formatTime(selected.registeredAt) : ''}</small></div>
              {selected && <StatusBadge tone={encounterStatusPresentation(selected.status).tone}>
                {encounterStatusPresentation(selected.status).label}</StatusBadge>}</header>}
          footer={onCopy && (copyDisabled
            ? <p className="doctor-history-copy-disabled">当前病历不可编辑，历史内容仅供查阅。</p>
            : <footer className="doctor-history-actions"><span>带入将覆盖对应病历草稿，请先核对</span>
                <Button size="sm" disabled={selectedCount === 0} onClick={copyToCurrent}>
                  带入本次 {selectedCount} 项</Button></footer>)}>

          {(documents.error || printRecords.error || downloadRecord.error) && <Alert>
            {errorMessage(documents.error || printRecords.error || downloadRecord.error)}</Alert>}
          {documents.isPending ? <LoadingState label="正在加载历史病历…" /> : <>
            <div className="doctor-history-copy-groups">
              {copyGroups.map(group => <HistoryCopySection key={`${selectedId}:${group.key}`} group={group}
                checked={checked} canCopy={canCopy} onToggle={toggle} onToggleGroup={toggleGroup} />)}
            </div>
            {allItems.length === 0 && <EmptyState icon="clinical" title="本次就诊暂无可展示病历"
              copy="此次就诊未记录病历内容。" />}
          </>}
          {selected && <HistoryPrescriptionReference key={selected.id} encounter={selected} targetEncounter={currentEncounter} api={api}
            disabled={copyDisabled || !onCopy} allergies={allergies} allergyReady={allergyReady}
            onStage={(medicationDrafts) => onCopy?.({ requestId: Date.now(), sourceEncounterNo: selected.encounterNo,
              sourceRegisteredAt: selected.registeredAt, record: {}, medicationDrafts })} />}
          {note && <details className="doctor-history-documents">
            <summary>病历下载与打印
              <StatusBadge tone={clinicalDocumentStatusPresentation(note).tone}>
                {clinicalDocumentStatusPresentation(note).label}</StatusBadge>
            </summary>
            {printRecords.isPending ? <LoadingState label="正在读取病历文件…" />
              : notePrintRecords.length > 0 && <div className="doctor-history-print-list">
                {notePrintRecords.map((record) => <article key={record.outputId}>
                  <span><strong>门诊病历 · 第 {record.sourceVersion} 版</strong>
                    <small>{printPurposeLabel(record.purpose)} · {formatTime(record.generatedAt)}</small></span>
                  <div><Button size="sm" variant="text" busy={downloadRecord.isPending}
                    onClick={() => downloadRecord.mutate(record)}>下载病历</Button>
                    {record.sourceVersion === note.currentVersion && <Button size="sm" variant="secondary"
                      onClick={() => setReprintRecord(record)}>补打</Button>}</div>
                </article>)}</div>}
            {note.status === 'SIGNED' && !latestPrint && <div className="doctor-history-document-actions">
              <Button size="sm" variant="secondary" onClick={() => setNotePrintOpen(true)}>
                <Icon name="print" />下载 / 打印病历</Button>
            </div>}
          </details>}
        </WorkspacePane>
      </div>}
    {notePrintOpen && note && <ControlledPrintDialog api={api} title="打印历史门诊病历"
      description="下载或打印本次已签署病历。"
      sourceLabel={`${selected ? formatTime(selected.registeredAt) : '历史就诊'} · 门诊病历第 ${note.currentVersion} 版`}
      generate={(purpose, copies) => api.printing.clinicalDocument(note.id, purpose, copies)}
      onGenerated={() => void printRecords.refetch()} onClose={() => setNotePrintOpen(false)} />}
    {reprintRecord && <HistoricalReprintDialog api={api} record={reprintRecord}
      onReprinted={() => void printRecords.refetch()} onClose={() => setReprintRecord(null)} />}
  </Panel>
}
