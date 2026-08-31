import { formatTime } from '../../shared/format'
import type { InpatientWardBoard as WardBoardValue, InpatientWardPatient } from '../../shared/api/inpatientApi'
import { LoadingState, Panel, StatusBadge } from '../../shared/ui'

export function InpatientWardBoard({ value, loading, selectedId, onSelect }: {
  value?: WardBoardValue
  loading: boolean
  selectedId?: string
  onSelect: (episodeId: string) => void
}) {
  if (loading) return <Panel className="inpatient-handover"><LoadingState label="正在汇总病区交接事项…" /></Panel>
  if (!value || value.patients.length === 0) return null
  const metrics = value.metrics
  return <Panel className="inpatient-handover">
    <header className="inpatient-section-head"><div><h2>病区患者一览</h2>
      <span>本班 {formatTime(value.from)}–{formatTime(value.to)} · 更新 {formatTime(value.generatedAt)}</span></div>
      <small>按异常、逾期、待签收、重点护理优先排序</small></header>
    <section className="inpatient-handover__metrics" aria-label="病区交接摘要">
      <div><span>在院</span><strong>{metrics.patientCount}</strong></div>
      <div><span>重点护理</span><strong>{metrics.specialCareCount}</strong></div>
      <div><span>待核对医嘱</span><strong>{metrics.pendingVerificationCount}</strong></div>
      <div className={metrics.overdueTaskCount ? 'is-warning' : ''}><span>逾期执行</span><strong>{metrics.overdueTaskCount}</strong></div>
      <div><span>待签收批次</span><strong>{metrics.awaitingReceiptBatchCount}</strong></div>
      <div className={metrics.exceptionPatientCount ? 'is-danger' : ''}><span>需重点交接</span><strong>{metrics.exceptionPatientCount}</strong></div>
    </section>
    <div className="inpatient-handover__patients">{value.patients.map((patient) =>
      <WardPatientRow key={patient.episodeId} value={patient} active={selectedId === patient.episodeId}
        onClick={() => onSelect(patient.episodeId)} />)}</div>
  </Panel>
}

export function currentWardShiftWindow(reference = new Date()) {
  const from = new Date(reference)
  from.setHours(Math.floor(from.getHours() / 8) * 8, 0, 0, 0)
  const to = new Date(from)
  to.setHours(to.getHours() + 8)
  return { from: from.toISOString(), to: to.toISOString() }
}

function WardPatientRow({ value, active, onClick }: {
  value: InpatientWardPatient
  active: boolean
  onClick: () => void
}) {
  const labels: Record<InpatientWardPatient['attentionLevel'], string> = {
    EXCEPTION: '交接异常', OVERDUE: '执行逾期', AWAITING_RECEIPT: '待签收', HIGH_CARE: '重点护理',
    PENDING: '有待办', STABLE: '平稳',
  }
  const tones: Record<InpatientWardPatient['attentionLevel'], 'danger' | 'warning' | 'info' | 'neutral' | 'success'> = {
    EXCEPTION: 'danger', OVERDUE: 'warning', AWAITING_RECEIPT: 'info', HIGH_CARE: 'warning',
    PENDING: 'neutral', STABLE: 'success',
  }
  return <button type="button" className={active ? 'is-active' : ''} onClick={onClick}>
    <span className="inpatient-handover__identity"><strong>{value.bedNo ?? '—'}</strong>
      <b>{value.residentName}</b><small>{nursingLevelText(value.nursingLevelCode)}</small></span>
    <span className="inpatient-handover__summary">{value.handoverSummary}</span>
    <span className="inpatient-handover__counts">
      {value.pendingVerificationCount > 0 && <small>核对 {value.pendingVerificationCount}</small>}
      {value.medicationTaskCount > 0 && <small>药 {value.medicationTaskCount}</small>}
      {value.serviceTaskCount > 0 && <small>诊疗 {value.serviceTaskCount}</small>}
      {value.nursingTaskCount > 0 && <small>护理 {value.nursingTaskCount}</small>}
    </span>
    <StatusBadge tone={tones[value.attentionLevel]}>{labels[value.attentionLevel]}</StatusBadge>
  </button>
}

function nursingLevelText(value?: string) {
  const labels: Record<string, string> = {
    SPECIAL: '特级护理',
    LEVEL_I: '一级护理',
    LEVEL_II: '二级护理',
    LEVEL_III: '三级护理',
  }
  return labels[value ?? ''] ?? '未登记'
}
