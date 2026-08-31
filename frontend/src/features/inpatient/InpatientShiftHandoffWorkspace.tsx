import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { InpatientEpisode, InpatientShiftHandoff } from '../../shared/api/inpatientApi'
import { formatTime } from '../../shared/format'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, Panel, StatusBadge } from '../../shared/ui'
import { currentWardShiftWindow } from './InpatientWardBoard'
import './inpatient-nursing.css'

type PatientDraft = { situation: string; pendingActions: string; riskFlags: string }

export function InpatientShiftHandoffWorkspace({ api, episodes }: {
  api: RhnApi
  episodes: InpatientEpisode[]
}) {
  const queryClient = useQueryClient()
  const shift = useMemo(() => currentWardShiftWindow(), [episodes[0]?.departmentId])
  const episodeKey = episodes.map((episode) => episode.id).join('|')
  const [open, setOpen] = useState(false)
  const [wardSummary, setWardSummary] = useState('本班病区运行平稳')
  const [generalItems, setGeneralItems] = useState('')
  const [patientDrafts, setPatientDrafts] = useState<Record<string, PatientDraft>>({})
  useEffect(() => setPatientDrafts((current) => Object.fromEntries(episodes.map((episode) => [episode.id,
    current[episode.id] ?? { situation: '病情平稳，继续观察', pendingActions: '', riskFlags: '' },
  ]))), [episodeKey])
  const handoffs = useQuery({
    queryKey: ['inpatient-shift-handoffs', episodes[0]?.departmentId ?? 'empty', shift.from, shift.to],
    queryFn: () => api.inpatient.shiftHandoffs(shift.from, shift.to),
    enabled: episodes.length > 0,
  })
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['inpatient-shift-handoffs'] })
  const create = useMutation({
    mutationFn: () => api.inpatient.createShiftHandoff({
      from: shift.from,
      to: shift.to,
      wardSummary: wardSummary.trim(),
      generalItems: splitItems(generalItems),
      patients: episodes.map((episode) => ({
        episodeId: episode.id,
        situation: patientDrafts[episode.id]?.situation.trim() || '病情平稳，继续观察',
        pendingActions: splitItems(patientDrafts[episode.id]?.pendingActions ?? ''),
        riskFlags: splitItems(patientDrafts[episode.id]?.riskFlags ?? ''),
      })),
      commandCode: `IP-HANDOFF-CREATE-${crypto.randomUUID()}`,
    }),
    onSuccess: async () => { setOpen(false); await refresh() },
  })
  const submit = useMutation({
    mutationFn: (value: InpatientShiftHandoff) => api.inpatient.submitShiftHandoff(
      value.id, `IP-HANDOVER-${crypto.randomUUID()}`),
    onSuccess: refresh,
  })
  const accept = useMutation({
    mutationFn: (value: InpatientShiftHandoff) => api.inpatient.acceptShiftHandoff(
      value.id, `IP-TAKEOVER-${crypto.randomUUID()}`),
    onSuccess: refresh,
  })
  const values = [...(handoffs.data ?? [])].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  const latest = values[0]
  const riskCount = latest?.patients.filter((patient) => patient.riskFlags.length > 0).length ?? 0
  const pendingCount = latest?.patients.reduce((count, patient) => count + patient.pendingActions.length, 0) ?? 0
  const busy = create.isPending || submit.isPending || accept.isPending
  const error = handoffs.error || create.error || submit.error || accept.error
  const updatePatient = (episodeId: string, field: keyof PatientDraft, value: string) => setPatientDrafts((current) => ({
    ...current,
    [episodeId]: { ...current[episodeId], [field]: value } as PatientDraft,
  }))
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (episodes.length > 0 && wardSummary.trim()) create.mutate()
  }

  return <Panel className="inpatient-shift-workspace" aria-labelledby="inpatient-shift-heading">
    <header className="inpatient-nursing__head"><div><span>病区护理 · 班次工作面</span>
      <h2 id="inpatient-shift-heading">病区交接班</h2>
      <p>{formatTime(shift.from)} 至 {formatTime(shift.to)} · 覆盖当前病区全部在院患者</p></div>
      <div>{latest && <StatusBadge tone={handoffTone(latest.status)}>{handoffText(latest.status)}</StatusBadge>}
        <Button size="sm" disabled={episodes.length === 0} onClick={() => setOpen((value) => !value)}>
          {open ? '收起交班' : latest?.status === 'DRAFT' ? '新建补充交班' : '新建本班交班'}
        </Button></div></header>
    <section className="inpatient-shift-metrics" aria-label="本班交接摘要">
      <div><span>在院患者</span><strong>{episodes.length}</strong></div>
      <div><span>风险患者</span><strong>{riskCount}</strong></div>
      <div><span>待办事项</span><strong>{pendingCount}</strong></div>
      <div><span>当前状态</span><strong>{latest ? handoffText(latest.status) : '未创建'}</strong></div>
    </section>
    {error && <Alert>{errorMessage(error)}</Alert>}
    {open && <form className="inpatient-shift-form" onSubmit={save}>
      <div className="inpatient-shift-form__summary">
        <FormField label="病区摘要" required><textarea value={wardSummary} rows={2} maxLength={2000}
          onChange={(event) => setWardSummary(event.target.value)} /></FormField>
        <FormField label="病区公共待办" hint="多项使用逗号分隔"><input value={generalItems} maxLength={2000}
          placeholder="如：夜班重点巡查、抢救车清点" onChange={(event) => setGeneralItems(event.target.value)} /></FormField>
      </div>
      <div className="inpatient-shift-form__patients">
        <header><strong>患者交接事项</strong><span>按床位逐项确认，可补充待办和风险标记</span></header>
        {episodes.map((episode) => <section key={episode.id} className="inpatient-shift-patient">
          <div className="inpatient-shift-patient__identity"><strong>{bedLabel(episode.bedNo)} · {episode.residentName}</strong>
            <small>{episode.episodeNo}</small></div>
          <FormField label="患者情况" required><input value={patientDrafts[episode.id]?.situation ?? ''}
            onChange={(event) => updatePatient(episode.id, 'situation', event.target.value)} /></FormField>
          <FormField label="待办事项"><input value={patientDrafts[episode.id]?.pendingActions ?? ''}
            placeholder="多项用逗号分隔" onChange={(event) => updatePatient(episode.id, 'pendingActions', event.target.value)} /></FormField>
          <FormField label="风险标记"><input value={patientDrafts[episode.id]?.riskFlags ?? ''}
            placeholder="如：跌倒、压力损伤" onChange={(event) => updatePatient(episode.id, 'riskFlags', event.target.value)} /></FormField>
        </section>)}
      </div>
      <footer><Button type="submit" size="sm" busy={busy} disabled={!wardSummary.trim() || episodes.length === 0}>保存交班草稿</Button></footer>
    </form>}
    {handoffs.isPending ? <LoadingState label="正在读取本班交接记录…" /> : values.length === 0
      ? <EmptyState icon="clinical" title="本班尚未创建交班" copy="创建后集中记录病区摘要、患者风险与下一班待办。" />
      : <div className="inpatient-shift-list">{values.map((value) => <article key={value.id}>
        <header><div><strong>{formatTime(value.from)}–{formatTime(value.to)}</strong><small>{value.creatorName} 创建 · {value.patients.length} 位患者</small></div>
          <StatusBadge tone={handoffTone(value.status)}>{handoffText(value.status)}</StatusBadge></header>
        <p>{value.wardSummary}</p>
        {value.generalItems.length > 0 && <small>病区待办：{value.generalItems.join('、')}</small>}
        <div className="inpatient-shift-list__patients">{value.patients.map((patient) => <div key={patient.id}>
          <strong>{bedLabel(patient.bedNo)} · {patient.residentName}</strong><span>{patient.situation}</span>
          {patient.pendingActions.length > 0 && <small>待办：{patient.pendingActions.join('、')}</small>}
          {patient.riskFlags.length > 0 && <small className="is-risk">风险：{patient.riskFlags.join('、')}</small>}
        </div>)}</div>
        <footer><span>事实摘要已固化</span>{value.status === 'DRAFT' && <Button size="sm" busy={busy}
          onClick={() => submit.mutate(value)}>交班签署</Button>}
          {value.status === 'SUBMITTED' && <Button size="sm" busy={busy}
            onClick={() => accept.mutate(value)}>接班确认</Button>}</footer>
      </article>)}</div>}
  </Panel>
}

function splitItems(value: string) {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
}

function bedLabel(value?: string) {
  if (!value) return '未分床'
  return value.endsWith('床') ? value : `${value}床`
}

function handoffText(value: InpatientShiftHandoff['status']) {
  return value === 'DRAFT' ? '草稿' : value === 'SUBMITTED' ? '待接班' : '已接班'
}

function handoffTone(value: InpatientShiftHandoff['status']): 'neutral' | 'warning' | 'success' {
  return value === 'DRAFT' ? 'neutral' : value === 'SUBMITTED' ? 'warning' : 'success'
}
