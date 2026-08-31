import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { formatTime } from '../../shared/format'
import type {
  InpatientEpisode,
  InpatientNursingAssessment,
  InpatientNursingRecord,
  InpatientNursingRecordType,
} from '../../shared/api/inpatientApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, EmptyState, FormField, LoadingState, Panel, Select, StatusBadge, Tabs } from '../../shared/ui'
import './inpatient-nursing.css'

type WorkspaceTab = 'ASSESSMENT' | 'RECORD'

const recordTypeText: Record<InpatientNursingRecordType, string> = {
  ASSESSMENT: '护理评估',
  ROUTINE: '一般护理', CONDITION: '病情观察', INTERVENTION: '护理措施', MEDICATION: '用药护理',
  SAFETY: '安全护理', EDUCATION: '健康教育', OTHER: '其他',
}
const recordEntryTypes = (Object.keys(recordTypeText) as InpatientNursingRecordType[])
  .filter((value) => value !== 'ASSESSMENT')

export function InpatientNursingWorkspace({ api, episode }: { api: RhnApi; episode: InpatientEpisode }) {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<WorkspaceTab>('RECORD')
  const range = useMemo(() => nursingQueryRange(), [episode.id])
  const records = useQuery({
    queryKey: ['inpatient-nursing-records', episode.id, range.from, range.to],
    queryFn: () => api.inpatient.nursingRecords(episode.id, range.from, range.to),
  })
  useEffect(() => setTab('RECORD'), [episode.id])
  const refreshRecords = () => queryClient.invalidateQueries({ queryKey: ['inpatient-nursing-records', episode.id] })
  const append = useMutation({
    mutationFn: (input: Parameters<typeof api.inpatient.appendNursingRecord>[1]) =>
      api.inpatient.appendNursingRecord(episode.id, input),
    onSuccess: refreshRecords,
  })
  const assessments = (records.data ?? []).filter((value) => value.recordType === 'ASSESSMENT' && value.assessment)
  const error = records.error || append.error
  const busy = append.isPending

  return <Panel className="inpatient-nursing" aria-labelledby="inpatient-nursing-heading">
    <header className="inpatient-nursing__head"><div><span>住院护理 · 事实记录</span>
      <h2 id="inpatient-nursing-heading">护理评估与记录</h2>
      <p>{episode.residentName} · {episode.episodeNo} · {episode.bedNo ?? '已离院'}</p></div>
      <div><StatusBadge tone={episode.status === 'ADMITTED' ? 'success' : 'neutral'}>
        {episode.status === 'ADMITTED' ? '在院可记录' : '出院只读'}</StatusBadge>
        <Tabs value={tab} onChange={setTab} label="护理工作面" variant="line" items={[
          { value: 'ASSESSMENT', label: '入院评估', meta: assessments.length, panelId: 'nursing-assessment-panel' },
          { value: 'RECORD', label: '护理记录', meta: records.data?.length ?? 0, panelId: 'nursing-record-panel' },
        ]} /></div></header>
    {error && <Alert>{errorMessage(error)}</Alert>}
    {records.isPending ? <LoadingState label="正在读取护理记录…" />
      : tab === 'ASSESSMENT'
        ? <NursingAssessmentPane values={assessments} readOnly={episode.status !== 'ADMITTED'} busy={busy}
            onSubmit={(input) => append.mutateAsync(input)} />
        : <NursingRecordPane records={records.data ?? []} readOnly={episode.status !== 'ADMITTED'} busy={busy}
            onSubmit={(input) => append.mutateAsync(input)} />}
  </Panel>
}

function NursingAssessmentPane({ values, readOnly, busy, onSubmit }: {
  values: InpatientNursingRecord[]
  readOnly: boolean
  busy: boolean
  onSubmit: (input: Parameters<RhnApi['inpatient']['appendNursingRecord']>[1]) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [occurredAt, setOccurredAt] = useState(toLocalDateTime(new Date()))
  const [assessmentType, setAssessmentType] = useState<InpatientNursingAssessment['assessmentType']>('ADMISSION')
  const [admissionMethod, setAdmissionMethod] = useState<InpatientNursingAssessment['admissionMethod']>('WALKING')
  const [communicationStatus, setCommunicationStatus] = useState<InpatientNursingAssessment['communicationStatus']>('NORMAL')
  const [selfCareLevel, setSelfCareLevel] = useState<InpatientNursingAssessment['selfCareLevel']>('INDEPENDENT')
  const [mobilityLevel, setMobilityLevel] = useState<InpatientNursingAssessment['mobilityLevel']>('INDEPENDENT')
  const [skinStatus, setSkinStatus] = useState<InpatientNursingAssessment['skinStatus']>('INTACT')
  const [nutritionStatus, setNutritionStatus] = useState<InpatientNursingAssessment['nutritionStatus']>('NORMAL')
  const [fallRiskLevel, setFallRiskLevel] = useState<InpatientNursingAssessment['fallRiskLevel']>('LOW')
  const [pressureInjuryRiskLevel, setPressureInjuryRiskLevel] = useState<InpatientNursingAssessment['pressureInjuryRiskLevel']>('LOW')
  const [painScore, setPainScore] = useState('0')
  const [riskFlags, setRiskFlags] = useState('')
  const [conclusion, setConclusion] = useState('')
  const [immediateActions, setImmediateActions] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    await onSubmit({
      occurredAt: new Date(occurredAt).toISOString(), recordType: 'ASSESSMENT',
      content: { focus: assessmentType === 'ADMISSION' ? '入院护理评估' : '护理再评估' },
      assessment: {
        assessmentType, admissionMethod, communicationStatus, selfCareLevel, mobilityLevel,
        skinStatus, nutritionStatus, fallRiskLevel, pressureInjuryRiskLevel,
        painScore: numberOrUndefined(painScore), riskFlags: splitItems(riskFlags),
        conclusion: conclusion.trim() || undefined, immediateActions: splitItems(immediateActions),
      },
      commandCode: `IP-NURSING-ASSESSMENT-${crypto.randomUUID()}`,
    })
    setOccurredAt(toLocalDateTime(new Date())); setRiskFlags(''); setConclusion(''); setImmediateActions(''); setOpen(false)
  }
  return <div className="inpatient-nursing__pane" role="tabpanel">
    {!readOnly && <div className="inpatient-nursing__toolbar"><span>记录基础状态与风险分层；专业量表后续按机构发布版本接入。</span>
      <Button size="sm" onClick={() => setOpen((value) => !value)}>{open ? '收起评估' : '新增护理评估'}</Button></div>}
    {open && !readOnly && <form className="inpatient-nursing__form inpatient-nursing__form--assessment"
      onSubmit={(event) => void submit(event).catch(() => undefined)}>
      <FormField label="评估时间" required><input aria-label="护理评估时间" type="datetime-local" value={occurredAt}
        onChange={(event) => setOccurredAt(event.target.value)} required /></FormField>
      <AssessmentSelect label="评估类型" value={assessmentType} onChange={(value) => setAssessmentType(value as typeof assessmentType)}
        options={{ ADMISSION: '入院评估', REASSESSMENT: '护理再评估' }} />
      <AssessmentSelect label="入院方式" value={admissionMethod} onChange={(value) => setAdmissionMethod(value as typeof admissionMethod)}
        options={{ WALKING: '步行', WHEELCHAIR: '轮椅', STRETCHER: '平车', AMBULANCE: '救护车' }} />
      <AssessmentSelect label="沟通状态" value={communicationStatus} onChange={(value) => setCommunicationStatus(value as typeof communicationStatus)}
        options={{ NORMAL: '正常', IMPAIRED: '受限', UNABLE: '无法沟通' }} />
      <AssessmentSelect label="自理能力" value={selfCareLevel} onChange={(value) => setSelfCareLevel(value as typeof selfCareLevel)}
        options={{ INDEPENDENT: '自理', PARTIAL_ASSISTANCE: '部分协助', DEPENDENT: '完全依赖' }} />
      <AssessmentSelect label="活动能力" value={mobilityLevel} onChange={(value) => setMobilityLevel(value as typeof mobilityLevel)}
        options={{ INDEPENDENT: '独立活动', ASSISTED: '需协助', BEDBOUND: '卧床' }} />
      <AssessmentSelect label="皮肤状态" value={skinStatus} onChange={(value) => setSkinStatus(value as typeof skinStatus)}
        options={{ INTACT: '完整', AT_RISK: '有风险', DAMAGED: '已有损伤' }} />
      <AssessmentSelect label="营养状态" value={nutritionStatus} onChange={(value) => setNutritionStatus(value as typeof nutritionStatus)}
        options={{ NORMAL: '正常', AT_RISK: '有风险', MALNOURISHED: '营养不良' }} />
      <AssessmentSelect label="跌倒风险" value={fallRiskLevel} onChange={(value) => setFallRiskLevel(value as typeof fallRiskLevel)}
        options={{ LOW: '低', MEDIUM: '中', HIGH: '高' }} />
      <AssessmentSelect label="压力损伤风险" value={pressureInjuryRiskLevel} onChange={(value) => setPressureInjuryRiskLevel(value as typeof pressureInjuryRiskLevel)}
        options={{ LOW: '低', MEDIUM: '中', HIGH: '高' }} />
      <FormField label="疼痛评分 0–10"><input aria-label="护理评估疼痛评分" type="number" min="0" max="10"
        value={painScore} onChange={(event) => setPainScore(event.target.value)} /></FormField>
      <FormField label="风险标记" hint="多项使用逗号分隔"><input aria-label="护理评估风险标记" value={riskFlags}
        placeholder="如：跌倒、压力损伤" onChange={(event) => setRiskFlags(event.target.value)} /></FormField>
      <FormField label="评估结论" className="is-wide"><input aria-label="护理评估结论" value={conclusion}
        placeholder="可补充个体化观察结论" onChange={(event) => setConclusion(event.target.value)} /></FormField>
      <FormField label="即时护理措施" className="is-wide" hint="多项使用逗号分隔"><input aria-label="护理评估即时措施" value={immediateActions}
        placeholder="记录已立即采取的措施" onChange={(event) => setImmediateActions(event.target.value)} /></FormField>
      <div className="inpatient-nursing__form-actions"><Button type="submit" size="sm" busy={busy}>保存评估事实</Button></div>
    </form>}
    {values.length === 0 ? <EmptyState icon="clinical" title="尚未完成护理评估" copy="入院后记录基础状态，专业量表可按机构要求逐步启用。" />
      : <div className="inpatient-nursing__assessments">{[...values].reverse().map((value) =>
        <NursingAssessmentRow key={value.id} value={value} />)}</div>}
  </div>
}

function AssessmentSelect({ label, value, options, onChange }: {
  label: string; value: string; options: Record<string, string>; onChange: (value: string) => void
}) {
  return <FormField label={label}><Select aria-label={label} value={value} clearable={false} searchable={false}
    options={Object.entries(options).map(([code, text]) => ({ value: code, label: text }))} onChange={onChange} /></FormField>
}

function NursingAssessmentRow({ value }: { value: InpatientNursingRecord }) {
  const item = value.assessment!
  const highRisk = item.fallRiskLevel === 'HIGH' || item.pressureInjuryRiskLevel === 'HIGH'
  return <article><header><div><strong>{item.assessmentType === 'ADMISSION' ? '入院护理评估' : '护理再评估'}</strong>
    <small>{formatTime(value.occurredAt)} · {value.recorderName}</small></div>
    <StatusBadge tone={highRisk ? 'danger' : 'success'}>{highRisk ? '存在高风险' : '基础评估完成'}</StatusBadge></header>
    <div className="inpatient-nursing__assessment-facts">
      <span>自理 {assessmentText.selfCare[item.selfCareLevel]}</span><span>活动 {assessmentText.mobility[item.mobilityLevel]}</span>
      <span>皮肤 {assessmentText.skin[item.skinStatus]}</span><span>营养 {assessmentText.nutrition[item.nutritionStatus]}</span>
      <span>跌倒 {assessmentText.risk[item.fallRiskLevel]}</span><span>压力损伤 {assessmentText.risk[item.pressureInjuryRiskLevel]}</span>
      {item.painScore !== undefined && <span>疼痛 {item.painScore}</span>}
    </div>
    {item.conclusion && <p>{item.conclusion}</p>}
    {item.immediateActions.length > 0 && <small>即时措施：{item.immediateActions.join('、')}</small>}
    {item.riskFlags.length > 0 && <small className="is-risk">风险：{item.riskFlags.join('、')}</small>}
    <footer>完整性已固化</footer>
  </article>
}

const assessmentText = {
  selfCare: { INDEPENDENT: '自理', PARTIAL_ASSISTANCE: '部分协助', DEPENDENT: '完全依赖' },
  mobility: { INDEPENDENT: '独立', ASSISTED: '需协助', BEDBOUND: '卧床' },
  skin: { INTACT: '完整', AT_RISK: '有风险', DAMAGED: '已有损伤' },
  nutrition: { NORMAL: '正常', AT_RISK: '有风险', MALNOURISHED: '营养不良' },
  risk: { LOW: '低', MEDIUM: '中', HIGH: '高' },
} as const

function NursingRecordPane({ records, readOnly, busy, onSubmit }: {
  records: InpatientNursingRecord[]
  readOnly: boolean
  busy: boolean
  onSubmit: (input: Parameters<RhnApi['inpatient']['appendNursingRecord']>[1]) => Promise<unknown>
}) {
  const [open, setOpen] = useState(false)
  const [occurredAt, setOccurredAt] = useState(toLocalDateTime(new Date()))
  const [recordType, setRecordType] = useState<InpatientNursingRecordType>('CONDITION')
  const [focus, setFocus] = useState('')
  const [observation, setObservation] = useState('')
  const [intervention, setIntervention] = useState('')
  const [response, setResponse] = useState('')
  const [temperature, setTemperature] = useState('')
  const [pulse, setPulse] = useState('')
  const [oxygen, setOxygen] = useState('')
  const [riskFlags, setRiskFlags] = useState('')
  const [validation, setValidation] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (![focus, observation, intervention, response].some((value) => value.trim())
        && ![temperature, pulse, oxygen].some(Boolean)) {
      setValidation('请至少填写一项护理内容或观察值。'); return
    }
    setValidation('')
    await onSubmit({
      occurredAt: new Date(occurredAt).toISOString(), recordType,
      content: cleanObject({ focus, observation, intervention, response }),
      observationSummary: cleanObject({
        temperatureCelsius: numberOrUndefined(temperature), pulseRate: numberOrUndefined(pulse),
        oxygenSaturation: numberOrUndefined(oxygen), riskFlags: splitItems(riskFlags),
      }),
      commandCode: `IP-NURSING-${crypto.randomUUID()}`,
    })
    setObservation(''); setIntervention(''); setResponse(''); setTemperature(''); setPulse(''); setOxygen(''); setRiskFlags('')
    setOccurredAt(toLocalDateTime(new Date())); setOpen(false)
  }
  return <div className="inpatient-nursing__pane" role="tabpanel">
    {!readOnly && <div className="inpatient-nursing__toolbar"><span>按发生时间连续记录，提交后保留原始事实。</span>
      <Button size="sm" onClick={() => setOpen((value) => !value)}>{open ? '收起录入' : '新增护理记录'}</Button></div>}
    {open && !readOnly && <form className="inpatient-nursing__form" onSubmit={(event) => void submit(event).catch(() => undefined)}>
      {validation && <Alert>{validation}</Alert>}
      <FormField label="记录时间" required><input aria-label="护理记录时间" type="datetime-local" value={occurredAt}
        onChange={(event) => setOccurredAt(event.target.value)} required /></FormField>
      <FormField label="记录类型"><Select aria-label="护理记录类型" value={recordType} clearable={false} searchable={false}
        options={recordEntryTypes.map((value) => ({ value, label: recordTypeText[value] }))}
        onChange={(value) => setRecordType(value as InpatientNursingRecordType)} /></FormField>
      <FormField label="护理重点"><input aria-label="护理重点" value={focus} maxLength={300}
        placeholder="如：发热观察" onChange={(event) => setFocus(event.target.value)} /></FormField>
      <FormField label="病情观察" className="is-wide"><textarea aria-label="病情观察" rows={2} value={observation}
        placeholder="记录患者状态与客观表现" onChange={(event) => setObservation(event.target.value)} /></FormField>
      <FormField label="护理措施" className="is-wide"><textarea aria-label="护理措施" rows={2} value={intervention}
        placeholder="记录已采取的护理措施" onChange={(event) => setIntervention(event.target.value)} /></FormField>
      <FormField label="护理反应"><input aria-label="护理反应" value={response}
        placeholder="如：症状缓解" onChange={(event) => setResponse(event.target.value)} /></FormField>
      <FormField label="体温 ℃"><input aria-label="护理记录体温" inputMode="decimal" value={temperature}
        placeholder="36.5" onChange={(event) => setTemperature(event.target.value)} /></FormField>
      <FormField label="脉搏 次/分"><input aria-label="护理记录脉搏" inputMode="decimal" value={pulse}
        placeholder="72" onChange={(event) => setPulse(event.target.value)} /></FormField>
      <FormField label="血氧 %"><input aria-label="护理记录血氧" inputMode="decimal" value={oxygen}
        placeholder="98" onChange={(event) => setOxygen(event.target.value)} /></FormField>
      <FormField label="风险标记" className="is-wide" hint="可选，多项使用逗号分隔"><input aria-label="护理风险标记" value={riskFlags}
        placeholder="如：跌倒、压力损伤" onChange={(event) => setRiskFlags(event.target.value)} /></FormField>
      <div className="inpatient-nursing__form-actions"><Button type="submit" size="sm" busy={busy}>保存护理事实</Button></div>
    </form>}
    {records.length === 0 ? <EmptyState icon="clinical" title="暂无护理记录" copy="首次护理记录提交后会按时间显示在这里。" />
      : <div className="inpatient-nursing__timeline">{[...records].reverse().map((value) => <NursingRecordRow key={value.id} value={value} />)}</div>}
  </div>
}

function NursingRecordRow({ value }: { value: InpatientNursingRecord }) {
  const summary = value.observationSummary
  const vitals = [summary?.temperatureCelsius !== undefined ? `体温 ${summary.temperatureCelsius}℃` : '',
    summary?.pulseRate !== undefined ? `脉搏 ${summary.pulseRate}` : '',
    summary?.oxygenSaturation !== undefined ? `血氧 ${summary.oxygenSaturation}%` : ''].filter(Boolean)
  return <article><time>{formatTime(value.occurredAt)}</time><div><header><strong>{value.content.focus || recordTypeText[value.recordType]}</strong>
    <StatusBadge tone="info">{recordTypeText[value.recordType]}</StatusBadge></header>
    {value.content.observation && <p>{value.content.observation}</p>}
    {value.content.intervention && <p><b>措施：</b>{value.content.intervention}</p>}
    {value.content.response && <p><b>反应：</b>{value.content.response}</p>}
    {vitals.length > 0 && <small>{vitals.join(' · ')}</small>}
    {summary?.riskFlags?.length ? <small className="is-risk">风险：{summary.riskFlags.join('、')}</small> : null}
    <footer>{value.recorderName} · 完整性已固化</footer></div></article>
}

function nursingQueryRange() {
  const to = new Date(); to.setHours(to.getHours() + 8)
  const from = new Date(); from.setDate(from.getDate() - 7)
  return { from: from.toISOString(), to: to.toISOString() }
}

function toLocalDateTime(value: Date) {
  const offset = value.getTimezoneOffset() * 60_000
  return new Date(value.getTime() - offset).toISOString().slice(0, 16)
}

function numberOrUndefined(value: string) {
  return value.trim() ? Number(value) : undefined
}

function splitItems(value: string) {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)
}

function cleanObject<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as T
}
