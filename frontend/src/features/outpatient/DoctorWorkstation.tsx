import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { ClinicalContext } from '../../app/AppShell'
import type { ClinicalDocument } from '../../shared/api/clinicalDocumentsApi'
import type { MedicationKnowledge, DiseaseConcept, ServiceCatalogItem } from '../../shared/api/masterDataApi'
import type { DiagnosisInput, Prescription } from '../../shared/api/encountersApi'
import type { AllergyIntolerance } from '../../shared/api/residentsApi'
import type { ReceptionQueueItem } from '../../shared/api/schedulingApi'
import type { Encounter, Resident } from '../../shared/model'
import { age, formatTime, genderLabel } from '../../shared/format'
import { encounterStatusPresentation } from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { SettlementPaymentPanel, type SettlementPaymentCommand } from '../../shared/billing/SettlementPaymentPanel'
import {
  Alert, Button, ClinicalResourceSearch, EmptyState, FormField, Icon, LoadingState,
  ObjectContextBar, PageHeader, Panel, PanelHead, StatusBadge, type ClinicalResourceOption,
} from '../../shared/ui'

const businessDate = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

export function DoctorWorkstation({ api, clinicalContext }: { api: RhnApi; clinicalContext: ClinicalContext }) {
  const [params] = useSearchParams()
  const linkedResidentId = params.get('residentId')
  const linkedEncounterId = params.get('encounterId')
  const [selected, setSelected] = useState<Resident | null>(null)
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['outpatient-reception-queue', businessDate(), clinicalContext.department.id],
    queryFn: () => api.scheduling.receptionQueue(businessDate()),
  })
  const linkedResident = useQuery({
    queryKey: ['doctor-workstation-resident', linkedResidentId],
    queryFn: () => api.residents.get(linkedResidentId!),
    enabled: Boolean(linkedResidentId),
  })
  useEffect(() => { if (linkedResident.data) setSelected(linkedResident.data) }, [linkedResident.data])
  const openPatient = useMutation({ mutationFn: (residentId: string) => api.residents.get(residentId), onSuccess: setSelected })

  const refreshQueue = () => queryClient.invalidateQueries({ queryKey: ['outpatient-reception-queue'] })
  if (selected) return <PatientWorkspace resident={selected} encounterId={linkedEncounterId} api={api}
    onBack={() => setSelected(null)} onQueueRefresh={refreshQueue} />

  const waiting = (queue.data ?? []).filter((item) => item.status === 'WAITING' || item.status === 'IN_SERVICE')
  return <>
    <PageHeader eyebrow="门诊医疗 · 医生工作区" title="门诊医生站"
      description="从本人科室候诊队列进入就诊；居民建档、挂号和排班在各自工作台完成。"
      actions={<Button variant="secondary" onClick={() => void queue.refetch()}><Icon name="refresh" />刷新</Button>} />
    {(queue.error || openPatient.error || linkedResident.error) && <Alert className="ui-page-feedback">
      {errorMessage(queue.error || openPatient.error || linkedResident.error)}</Alert>}
    <section className="doctor-queue-summary" aria-label="候诊概览">
      <div><span>候诊</span><strong>{waiting.filter((item) => item.status === 'WAITING').length}</strong></div>
      <div><span>接诊中</span><strong>{waiting.filter((item) => item.status === 'IN_SERVICE').length}</strong></div>
      <div><span>当前科室</span><strong>{clinicalContext.department.name}</strong></div>
      <div><span>业务日期</span><strong>{businessDate()}</strong></div>
    </section>
    <Panel className="doctor-queue-panel">
      <PanelHead title="今日候诊队列" meta={`${waiting.length} 人待处理`} />
      {queue.isPending || (Boolean(linkedResidentId) && linkedResident.isPending) ? <LoadingState label="正在加载候诊队列…" /> : waiting.length === 0
        ? <EmptyState icon="clinical" title="当前没有候诊患者" copy="新挂号患者会自动进入本科室候诊队列。" />
        : <div className="doctor-queue-list">{waiting.map((item) => <QueueRow key={item.registrationId}
          item={item} busy={openPatient.isPending} onOpen={() => openPatient.mutate(item.residentId)} />)}</div>}
    </Panel>
  </>
}

function QueueRow({ item, busy, onOpen }: { item: ReceptionQueueItem; busy: boolean; onOpen: () => void }) {
  return <button type="button" onClick={onOpen} disabled={busy}>
    <span className="doctor-queue-ticket">{item.ticketNo}</span>
    <span><strong>{item.residentName}</strong><small>{genderLabel(item.gender)} · {age(item.birthDate)} 岁 · {item.healthRecordNo}</small></span>
    <span><strong>{item.serviceName || '普通门诊'}</strong><small>{item.practitionerName || '现场接诊'}{item.locationName ? ` · ${item.locationName}` : ''}</small></span>
    <span><strong>{formatTime(item.registeredAt)}</strong><small>挂号时间</small></span>
    <StatusBadge tone={item.status === 'IN_SERVICE' ? 'success' : 'warning'}>{item.status === 'IN_SERVICE' ? '接诊中' : '候诊'}</StatusBadge>
    <Icon name="chevron-right" />
  </button>
}

type WorkTab = 'clinical' | 'results' | 'history'

function PatientWorkspace({ resident, encounterId, api, onBack, onQueueRefresh }: {
  resident: Resident; encounterId: string | null; api: RhnApi; onBack: () => void; onQueueRefresh: () => Promise<unknown>
}) {
  const [tab, setTab] = useState<WorkTab>('clinical')
  const queryClient = useQueryClient()
  const encounters = useQuery({ queryKey: ['doctor-encounters', resident.id], queryFn: () => api.encounters.byResident(resident.id) })
  const allergies = useQuery({ queryKey: ['doctor-allergies', resident.id], queryFn: () => api.residents.allergies(resident.id) })
  const encounter = encounters.data?.find((item) => item.id === encounterId)
    ?? encounters.data?.find((item) => item.status === 'IN_PROGRESS' || item.status === 'REGISTERED')
    ?? encounters.data?.[0]
  const documents = useQuery({
    queryKey: ['doctor-document', encounter?.id],
    queryFn: () => api.clinicalDocuments.byEncounter(encounter!.id),
    enabled: Boolean(encounter?.id),
  })
  const outpatientNote = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const readyToComplete = Boolean(encounter?.chiefComplaint
    && encounter.diagnoses.some((item) => item.type === 'PRIMARY') && outpatientNote?.status === 'SIGNED')
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['doctor-encounters', resident.id] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter?.id] }),
      queryClient.invalidateQueries({ queryKey: ['doctor-allergies', resident.id] }),
      onQueueRefresh(),
    ])
  }
  const complete = useMutation({
    mutationFn: () => api.encounters.complete(encounter!.id),
    onSuccess: async () => { await refresh(); onBack() },
  })

  return <section className="doctor-patient-workspace">
    <ObjectContextBar avatar={resident.fullName.slice(-1)} eyebrow="当前患者" title={resident.fullName}
      description={`${genderLabel(resident.gender)} · ${age(resident.birthDate)} 岁 · ${resident.maskedNationalId || '无证件标识'}`}
      facts={[{ label: '健康档案号', value: resident.healthRecordNo },
        { label: '联系电话', value: resident.phone || '未登记' },
        { label: '就诊号', value: encounter?.encounterNo || '无当前就诊' }]}
      actions={encounter && <div className="doctor-context-actions">
        <StatusBadge tone={encounterStatusPresentation(encounter.status).tone}>
          {encounterStatusPresentation(encounter.status).label}</StatusBadge>
        {encounter.status === 'IN_PROGRESS' && <>
          <Button size="sm" variant="secondary" title="保留当前接诊状态并返回候诊患者列表" onClick={onBack}>暂挂</Button>
          <Button size="sm" busy={complete.isPending} disabled={!readyToComplete}
            title={readyToComplete ? '完成本次就诊' : '需保存主诉、确认主要诊断并签署病历后诊毕'}
            onClick={() => { if (window.confirm('确认完成本次就诊？诊毕后将不能继续修改当前病历。')) complete.mutate() }}>诊毕</Button>
        </>}
      </div>} />
    {complete.error && <Alert className="ui-page-feedback">{errorMessage(complete.error)}</Alert>}
    {encounter && <AllergySafetyPanel resident={resident} encounter={encounter} allergies={allergies.data ?? []}
      loading={allergies.isPending} error={allergies.error} api={api} />}
    {encounters.isPending ? <LoadingState label="正在建立就诊上下文…" /> : !encounter
      ? <EmptyState icon="clinical" title="没有可处理的门诊就诊" copy="请先在门诊挂号工作台完成挂号。" /> : <>
        <nav className="doctor-work-tabs" aria-label="门诊工作区">
          {([['clinical', '诊疗工作区'], ['results', '检查检验'], ['history', '就诊历史']] as const)
            .map(([value, label]) => <button type="button" key={value} className={tab === value ? 'is-active' : ''}
              onClick={() => setTab(value)}>{label}</button>)}
        </nav>
        {encounter.status === 'REGISTERED' ? <IdentityStartPanel encounter={encounter} api={api} onSuccess={refresh} />
          : encounter.status === 'IN_PROGRESS' ? <>
            {tab === 'clinical' && <ClinicalRecordPanel resident={resident} encounter={encounter}
              allergies={allergies.data ?? []} api={api} onRefresh={refresh} />}
            {tab === 'results' && <ResultsPanel encounter={encounter} api={api} />}
            {tab === 'history' && <HistoryPanel encounters={encounters.data ?? []} />}
          </> : <HistoryPanel encounters={encounters.data ?? []} />}
      </>}
  </section>
}

function AllergySafetyPanel({ resident, encounter, allergies, loading, error, api }: {
  resident: Resident; encounter: Encounter; allergies: AllergyIntolerance[]; loading: boolean; error: unknown; api: RhnApi
}) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [category, setCategory] = useState<NonNullable<AllergyIntolerance['categoryCode']>>('DRUG')
  const [criticality, setCriticality] = useState<NonNullable<AllergyIntolerance['criticalityCode']>>('UNABLE_TO_ASSESS')
  const [severity, setSeverity] = useState<NonNullable<AllergyIntolerance['reactionSeverity']>>('MILD')
  const [substance, setSubstance] = useState('')
  const [substanceCode, setSubstanceCode] = useState('')
  const [reaction, setReaction] = useState('')
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['doctor-allergies', resident.id] })
  const record = useMutation({
    mutationFn: () => api.residents.recordAllergy(resident.id, {
      encounterId: encounter.id, assertionType: 'ALLERGY', categoryCode: category, criticalityCode: criticality,
      reactionSeverity: severity, informationSource: 'PATIENT', substanceDisplay: substance.trim(),
      substanceCode: substanceCode.trim() || undefined, reactionText: reaction.trim() || undefined,
    }),
    onSuccess: async () => { setEditing(false); setSubstance(''); setSubstanceCode(''); setReaction(''); await refresh() },
  })
  const noKnown = useMutation({
    mutationFn: () => api.residents.recordAllergy(resident.id, {
      encounterId: encounter.id, assertionType: 'NO_KNOWN_DRUG_ALLERGY', informationSource: 'PATIENT',
    }), onSuccess: refresh,
  })
  const inactivate = useMutation({
    mutationFn: (value: AllergyIntolerance) => api.residents.inactivateAllergy(
      resident.id, value.id, value.revision, '医生复核后停用',
    ), onSuccess: refresh,
  })
  const actual = allergies.filter((item) => item.assertionType === 'ALLERGY')
  const noKnownAssertion = allergies.find((item) => item.assertionType !== 'ALLERGY')
  const mutationError = record.error || noKnown.error || inactivate.error

  return <section className={`doctor-allergy-safety ${actual.length ? 'is-risk' : noKnownAssertion ? 'is-clear' : 'is-unknown'}`}
    aria-label="患者过敏安全信息">
    <div className="doctor-allergy-heading"><span>过敏安全</span>{loading ? <small>加载中…</small>
      : actual.length ? <strong>{actual.length} 项有效过敏记录</strong>
        : noKnownAssertion ? <strong>已确认无已知药物过敏</strong> : <strong>尚未核对过敏信息</strong>}</div>
    {actual.length > 0 && <div className="doctor-allergy-list">{actual.map((item) => <span key={item.id}>
      <strong>{item.substanceDisplay}</strong>
      <small>{[allergyCategoryLabel(item.categoryCode), allergySeverityLabel(item.reactionSeverity), item.reactionText]
        .filter(Boolean).join(' · ')}</small>
      <Button size="sm" variant="text" busy={inactivate.isPending}
        onClick={() => { if (window.confirm(`确认停用“${item.substanceDisplay}”过敏记录？`)) inactivate.mutate(item) }}>停用</Button>
    </span>)}</div>}
    {!loading && <div className="doctor-allergy-actions">
      <Button size="sm" variant="secondary" onClick={() => setEditing((value) => !value)}>{editing ? '取消录入' : '记录过敏'}</Button>
      {allergies.length === 0 && <Button size="sm" variant="text" busy={noKnown.isPending}
        onClick={() => noKnown.mutate()}>确认无已知药物过敏</Button>}
    </div>}
    {editing && <div className="doctor-allergy-editor">
      <FormField label="类别" required><select value={category}
        onChange={(event) => setCategory(event.target.value as typeof category)}>
        <option value="DRUG">药物</option><option value="FOOD">食物</option><option value="ENVIRONMENT">环境</option>
        <option value="BIOLOGIC">生物制品</option><option value="OTHER">其他</option>
      </select></FormField>
      <FormField label="过敏原" required><input value={substance} maxLength={300}
        onChange={(event) => setSubstance(event.target.value)} placeholder="如青霉素" /></FormField>
      <FormField label="药品/物质编码"><input value={substanceCode} maxLength={128}
        onChange={(event) => setSubstanceCode(event.target.value)} placeholder="有标准编码时填写" /></FormField>
      <FormField label="危急程度"><select value={criticality}
        onChange={(event) => setCriticality(event.target.value as typeof criticality)}>
        <option value="HIGH">高</option><option value="LOW">低</option><option value="UNABLE_TO_ASSESS">无法评估</option>
      </select></FormField>
      <FormField label="反应严重度"><select value={severity}
        onChange={(event) => setSeverity(event.target.value as typeof severity)}>
        <option value="MILD">轻度</option><option value="MODERATE">中度</option><option value="SEVERE">重度</option>
      </select></FormField>
      <FormField label="过敏反应"><input value={reaction} maxLength={1000}
        onChange={(event) => setReaction(event.target.value)} placeholder="如皮疹、呼吸困难" /></FormField>
      <Button size="sm" busy={record.isPending} disabled={!substance.trim()} onClick={() => record.mutate()}>保存过敏事实</Button>
    </div>}
    {(error || mutationError) && <Alert>{errorMessage(error || mutationError)}</Alert>}
  </section>
}

function allergyCategoryLabel(value?: AllergyIntolerance['categoryCode']) {
  return ({ DRUG: '药物', FOOD: '食物', ENVIRONMENT: '环境', BIOLOGIC: '生物制品', OTHER: '其他' } as const)[value ?? 'OTHER']
}

function allergySeverityLabel(value?: AllergyIntolerance['reactionSeverity']) {
  return value ? ({ MILD: '轻度', MODERATE: '中度', SEVERE: '重度' } as const)[value] : ''
}

function IdentityStartPanel({ encounter, api, onSuccess }: { encounter: Encounter; api: RhnApi; onSuccess: () => Promise<unknown> }) {
  const [nameChecked, setNameChecked] = useState(false)
  const [secondFactorChecked, setSecondFactorChecked] = useState(false)
  const start = useMutation({
    mutationFn: () => api.encounters.start(encounter.id, {
      commandCode: `START-${encounter.id}-${Date.now()}`,
      factorResults: { NAME: nameChecked, DEMOGRAPHIC_OR_IDENTIFIER: secondFactorChecked },
      terminalCode: 'WEB-DOCTOR-WORKSTATION',
    }),
    onSuccess,
  })
  return <Panel className="doctor-identity-panel">
    <PanelHead title="开始接诊前核验患者身份" meta="核验结果将作为不可覆盖业务事实保存" />
    <div className="doctor-identity-checks">
      <label><input type="checkbox" checked={nameChecked} onChange={(event) => setNameChecked(event.target.checked)} />
        <span><strong>已向患者确认姓名</strong><small>不得仅依据候诊号判断患者身份</small></span></label>
      <label><input type="checkbox" checked={secondFactorChecked} onChange={(event) => setSecondFactorChecked(event.target.checked)} />
        <span><strong>已核对第二身份因子</strong><small>健康档案号、出生日期或脱敏证件信息之一</small></span></label>
    </div>
    {start.error && <Alert>{errorMessage(start.error)}</Alert>}
    <div className="ui-form-actions"><Button busy={start.isPending} disabled={!nameChecked || !secondFactorChecked}
      onClick={() => start.mutate()}>核验通过，开始接诊</Button></div>
  </Panel>
}

const recordSchema = z.object({
  chiefComplaint: z.string().trim().min(1, '请输入主诉').max(1000),
  presentIllness: z.string().trim().max(4000),
  medicalHistory: z.string().trim().max(4000),
  physicalExam: z.string().trim().max(4000),
  treatmentPlan: z.string().trim().max(4000),
  systolic: z.number().int().min(40).max(300),
  diastolic: z.number().int().min(20).max(200),
  temperature: z.number().min(30).max(45).optional(),
  pulseRate: z.number().int().min(20).max(250).optional(),
  respiratoryRate: z.number().int().min(5).max(80).optional(),
  heightCm: z.number().min(30).max(250).optional(),
  weightKg: z.number().min(1).max(500).optional(),
  oxygenSaturation: z.number().int().min(50).max(100).optional(),
})
type RecordForm = z.infer<typeof recordSchema>

function ClinicalRecordPanel({ resident, encounter, allergies, api, onRefresh }: {
  resident: Resident; encounter: Encounter; allergies: AllergyIntolerance[]; api: RhnApi; onRefresh: () => Promise<unknown>
}) {
  const queryClient = useQueryClient()
  const [diagnosisSearch, setDiagnosisSearch] = useState<ClinicalResourceOption<DiseaseConcept>>()
  const [diagnosisType, setDiagnosisType] = useState<DiagnosisInput['type']>('SECONDARY')
  const [diagnoses, setDiagnoses] = useState<DiagnosisInput[]>([])
  const [diagnosisError, setDiagnosisError] = useState('')
  const { register, handleSubmit, reset, formState } = useForm<RecordForm>({
    resolver: zodResolver(recordSchema),
    defaultValues: { chiefComplaint: '', presentIllness: '', medicalHistory: '', physicalExam: '', treatmentPlan: '',
      systolic: undefined, diastolic: undefined, temperature: undefined, pulseRate: undefined,
      respiratoryRate: undefined, heightCm: undefined, weightKg: undefined, oxygenSaturation: undefined },
  })
  const documents = useQuery({ queryKey: ['doctor-document', encounter.id], queryFn: () => api.clinicalDocuments.byEncounter(encounter.id) })
  const document = documents.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  useEffect(() => {
    reset({ chiefComplaint: encounter.chiefComplaint ?? '', presentIllness: document?.content.presentIllness ?? '',
      medicalHistory: document?.content.medicalHistory ?? '', physicalExam: document?.content.physicalExam ?? '',
      treatmentPlan: document?.content.treatmentPlan ?? '', systolic: encounter.systolic, diastolic: encounter.diastolic,
      temperature: document?.content.vitalSigns?.temperature, pulseRate: document?.content.vitalSigns?.pulseRate,
      respiratoryRate: document?.content.vitalSigns?.respiratoryRate, heightCm: document?.content.vitalSigns?.heightCm,
      weightKg: document?.content.vitalSigns?.weightKg, oxygenSaturation: document?.content.vitalSigns?.oxygenSaturation })
    setDiagnoses(encounter.diagnoses.map(({ code, display, type }) => ({ code, display, type })))
  }, [document, encounter, reset])
  const save = useMutation({
    mutationFn: (form: RecordForm) => {
      if (!diagnoses.some((item) => item.type === 'PRIMARY')) throw new Error('请确认一个主要诊断')
      return api.encounters.recordClinicalData(encounter.id, {
        chiefComplaint: form.chiefComplaint, presentIllness: form.presentIllness, medicalHistory: form.medicalHistory,
        physicalExam: form.physicalExam, treatmentPlan: form.treatmentPlan,
        systolic: form.systolic, diastolic: form.diastolic, temperature: form.temperature,
        pulseRate: form.pulseRate, respiratoryRate: form.respiratoryRate, heightCm: form.heightCm,
        weightKg: form.weightKg, oxygenSaturation: form.oxygenSaturation, diagnoses,
      })
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter.id] }); await onRefresh() },
  })
  const sign = useMutation({
    mutationFn: () => api.clinicalDocuments.sign(document!.id, document!.currentVersion),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['doctor-document', encounter.id] }); await onRefresh() },
  })
  const signed = document?.status === 'SIGNED'
  const addDiagnosis = () => {
    const selected = diagnosisSearch?.raw
    if (!selected) { setDiagnosisError('请先检索并选择诊断'); return }
    if (diagnoses.some((item) => item.code === selected.code)) { setDiagnosisError('该诊断已经录入'); return }
    setDiagnoses((current) => [
      ...current.map((item) => diagnosisType === 'PRIMARY' ? { ...item, type: 'SECONDARY' as const } : item),
      { code: selected.code, display: selected.display, type: diagnosisType },
    ])
    setDiagnosisSearch(undefined)
    setDiagnosisType('SECONDARY')
    setDiagnosisError('')
  }
  const makePrimary = (code: string) => setDiagnoses((current) => current.map((item) => ({
    ...item, type: item.code === code ? 'PRIMARY' : 'SECONDARY',
  })))
  const removeDiagnosis = (code: string) => setDiagnoses((current) => current.filter((item) => item.code !== code))
  const error = save.error || sign.error || documents.error

  return <section className="doctor-clinical-cockpit">
    <div className="doctor-record-column"><Panel className="doctor-record-panel">
      <PanelHead title="门诊病历" meta={signed ? '已签署' : '病历草稿 · 保存后签署'} />
      {error && <Alert>{errorMessage(error)}</Alert>}
      <form className="clinical-form doctor-record-form" noValidate onSubmit={handleSubmit((value) => save.mutate(value))}>
        <FormField className="doctor-record-field--chief" label="主诉" required error={formState.errors.chiefComplaint?.message}>
          <textarea {...register('chiefComplaint')} disabled={signed} placeholder="症状、持续时间及本次就诊原因" />
        </FormField>
        <FormField label="现病史" error={formState.errors.presentIllness?.message}>
          <textarea {...register('presentIllness')} disabled={signed} placeholder="起病、演变、伴随症状及诊治经过" />
        </FormField>
        <FormField label="既往史" error={formState.errors.medicalHistory?.message}>
          <textarea {...register('medicalHistory')} disabled={signed} placeholder="既往疾病、手术、过敏及长期用药" />
        </FormField>
        <div className="doctor-physical-exam" role="group" aria-labelledby="doctor-physical-exam-label">
          <span id="doctor-physical-exam-label" className="doctor-physical-exam__label">体格检查</span>
          <div className="doctor-vital-grid">
            <label><span>体温</span><span><input type="number" step="0.1" disabled={signed}
              {...register('temperature', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>℃</small></span></label>
            <label><span>脉搏</span><span><input type="number" disabled={signed}
              {...register('pulseRate', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>次/分</small></span></label>
            <label><span>呼吸</span><span><input type="number" disabled={signed}
              {...register('respiratoryRate', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>次/分</small></span></label>
            <label><span>血氧</span><span><input type="number" disabled={signed}
              {...register('oxygenSaturation', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>%</small></span></label>
            <label className="doctor-vital-blood-pressure"><span>血压</span><span>
              <input aria-label="收缩压" type="number" {...register('systolic', { valueAsNumber: true })} disabled={signed} />
              <b aria-hidden="true">/</b>
              <input aria-label="舒张压" type="number" {...register('diastolic', { valueAsNumber: true })} disabled={signed} />
              <small>mmHg</small></span></label>
            <label><span>身高</span><span><input type="number" step="0.1" disabled={signed}
              {...register('heightCm', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>cm</small></span></label>
            <label><span>体重</span><span><input type="number" step="0.1" disabled={signed}
              {...register('weightKg', { setValueAs: (value) => value === '' ? undefined : Number(value) })} /><small>kg</small></span></label>
          </div>
          {Object.values({ systolic: formState.errors.systolic, diastolic: formState.errors.diastolic,
            temperature: formState.errors.temperature, pulseRate: formState.errors.pulseRate,
            respiratoryRate: formState.errors.respiratoryRate, heightCm: formState.errors.heightCm,
            weightKg: formState.errors.weightKg, oxygenSaturation: formState.errors.oxygenSaturation })
            .find(Boolean)?.message && <small className="ui-field__message ui-field__error">请检查生命体征录入范围</small>}
        </div>
        <FormField label="查体所见" error={formState.errors.physicalExam?.message}>
          <textarea {...register('physicalExam')} disabled={signed} placeholder="阳性体征及必要的阴性体征" />
        </FormField>
        <FormField label="诊疗计划" error={formState.errors.treatmentPlan?.message}>
          <textarea {...register('treatmentPlan')} disabled={signed} placeholder="检查、治疗、用药和随访安排" />
        </FormField>
        <div className="ui-form-actions doctor-record-actions"><Button type="submit" busy={save.isPending} disabled={signed}>保存病历草稿</Button></div>
      </form>
    </Panel>
      <Panel className="doctor-sign-panel">
        <PanelHead title="病历签署" meta={document ? `V${document.currentVersion}` : '尚未保存'} />
        {documents.isPending ? <LoadingState /> : !document
          ? <EmptyState icon="clinical" title="尚无门诊病历草稿" copy="保存左侧记录后可进行签署。" />
          : <div className="doctor-sign-content"><dl className="doctor-document-facts">
              <div><dt>文书状态</dt><dd><StatusBadge tone={signed ? 'success' : 'warning'}>{signed ? '已签署' : '待签署'}</StatusBadge></dd></div>
              <div><dt>患者</dt><dd>{resident.fullName}</dd></div><div><dt>当前版本</dt><dd>V{document.currentVersion}</dd></div>
              <div><dt>最近更新</dt><dd>{formatTime(document.updatedAt)}</dd></div>
            </dl>
            <div className="doctor-completion-checklist">
              <span className="is-ready">✓ 身份核验</span>
              <span className={encounter.chiefComplaint ? 'is-ready' : ''}>{encounter.chiefComplaint ? '✓' : '○'} 主诉</span>
              <span className={encounter.diagnoses.some((item) => item.type === 'PRIMARY') ? 'is-ready' : ''}>
                {encounter.diagnoses.some((item) => item.type === 'PRIMARY') ? '✓' : '○'} 主要诊断</span>
              <span className={signed ? 'is-ready' : ''}>{signed ? '✓' : '○'} 病历签署</span>
            </div>
            {!signed && <Button busy={sign.isPending} onClick={() => sign.mutate()}>核对并签署当前版本</Button>}
          </div>}
      </Panel>
    </div>
    <aside className="doctor-clinical-aside" aria-label="诊断与医嘱工作区">
      <Panel className="doctor-diagnosis-panel">
        <PanelHead title="诊断" meta={`${diagnoses.length} 项`} />
        <div className="doctor-diagnosis-content">
          <div className="doctor-diagnosis-editor">
            <FormField label="诊断检索" required error={diagnosisError || undefined}>
              <ClinicalResourceSearch<DiseaseConcept> api={api} resource="diagnosis" value={diagnosisSearch}
                disabled={signed} onChange={(option) => { setDiagnosisSearch(option); setDiagnosisError('') }} />
            </FormField>
            <FormField label="诊断类型"><select value={diagnosisType} disabled={signed}
              onChange={(event) => setDiagnosisType(event.target.value as DiagnosisInput['type'])}>
              <option value="SECONDARY">次要诊断</option><option value="PRIMARY">主要诊断</option>
            </select></FormField>
            <Button type="button" variant="secondary" disabled={signed || !diagnosisSearch} onClick={addDiagnosis}>加入诊断</Button>
          </div>
          <div className="doctor-diagnosis-list" aria-label="本次诊断">
            {diagnoses.length === 0 ? <p>尚未录入诊断</p> : diagnoses.map((item) => <div key={item.code}>
              <StatusBadge tone={item.type === 'PRIMARY' ? 'success' : 'neutral'}>{item.type === 'PRIMARY' ? '主要' : '次要'}</StatusBadge>
              <span><strong>{item.display}</strong><small>{item.code}</small></span>
              {item.type !== 'PRIMARY' && <Button type="button" size="sm" variant="text" disabled={signed}
                onClick={() => makePrimary(item.code)}>设为主要</Button>}
              <Button type="button" size="sm" variant="text" disabled={signed}
                onClick={() => removeDiagnosis(item.code)}>移除</Button>
            </div>)}
          </div>
        </div>
      </Panel>
      <OrdersPanel encounter={encounter} allergies={allergies} api={api} />
      <DoctorSettlementPanel encounter={encounter} api={api} />
    </aside>
  </section>
}

function DoctorSettlementPanel({ encounter, api }: { encounter: Encounter; api: RhnApi }) {
  const [expanded, setExpanded] = useState(false)
  const queryClient = useQueryClient()
  const statement = useQuery({
    queryKey: ['doctor-billing-statement', encounter.id], queryFn: () => api.billing.statement(encounter.id),
    enabled: expanded, retry: false,
  })
  const methods = useQuery({
    queryKey: ['applicable-dictionary-items', 'PAY_METHOD', 'AVAILABLE_SCENE', 'CLINIC_SETTLE'],
    queryFn: () => api.dictionaries.applicable('PAY_METHOD', 'AVAILABLE_SCENE', 'CLINIC_SETTLE'),
    enabled: expanded,
  })
  const orders = useQuery({
    queryKey: ['doctor-payment-orders', statement.data?.accountId],
    queryFn: () => api.billing.paymentOrders(statement.data!.accountId), enabled: Boolean(statement.data?.accountId),
    refetchInterval: (query) => (query.state.data ?? []).some((value) =>
      ['CREATED', 'PENDING', 'PROCESSING', 'PARTIAL'].includes(value.status)) ? 2500 : false,
  })
  const createPayment = useMutation({
    mutationFn: (command: SettlementPaymentCommand) => api.billing.createPaymentOrder(command.settlementId, {
      idempotencyKey: command.idempotencyKey, businessScene: 'OUTPATIENT', paymentSceneCode: 'CLINIC_SETTLE',
      paymentMethodCode: command.paymentMethodCode, amount: command.amount,
      correlationId: `DOCTOR-STATION-${encounter.id}`, terminalCode: 'WEB-DOCTOR-WORKSTATION',
    }),
    onSuccess: async () => {
      await Promise.all([statement.refetch(), orders.refetch(),
        queryClient.invalidateQueries({ queryKey: ['billing-statement', encounter.id] })])
    },
  })
  const payable = (statement.data?.settlements ?? []).filter((value) =>
    ['PRICED', 'PAYMENT_PENDING', 'PARTIAL'].includes(value.status) && value.outstandingAmount > 0)
  const outstanding = payable.reduce((sum, value) => sum + value.outstandingAmount, 0)
  return <Panel className="doctor-settlement-panel">
    <PanelHead title="诊间结算" meta={statement.data ? (outstanding > 0 ? `待收 ¥${outstanding.toFixed(2)}` : '当前无待收') : '按需展开'}
      actions={<Button size="sm" variant="text" onClick={() => setExpanded((value) => !value)}>
        {expanded ? '收起' : '展开'}</Button>} />
    {expanded && <div className="doctor-settlement-content">
      {(statement.error || methods.error || orders.error || createPayment.error) && <Alert>
        {statement.error ? '当前就诊尚未形成可结算费用；医嘱执行计费后可在此直接结算。'
          : errorMessage(methods.error || orders.error || createPayment.error)}</Alert>}
      {(statement.isPending || methods.isPending) && <LoadingState label="正在读取诊间费用…" />}
      {statement.data && payable.length === 0 && <EmptyState icon="billing" title="当前无待结算费用"
        copy="已结清或尚未形成正式结算单。" />}
      {statement.data && payable.length > 0 && <SettlementPaymentPanel settlements={payable.map((value) => ({
        id: value.id, code: value.settlementNo, outstandingAmount: value.outstandingAmount,
        currencyCode: value.currencyCode,
      }))} methods={(methods.data ?? []).map((value) => ({ code: value.code, name: value.name }))}
      orders={orders.data ?? []} busy={createPayment.isPending} sceneLabel="诊间收款"
      onSubmit={(command) => createPayment.mutateAsync(command)} />}
    </div>}
  </Panel>
}

function OrdersPanel({ encounter, allergies, api }: { encounter: Encounter; allergies: AllergyIntolerance[]; api: RhnApi }) {
  const queryClient = useQueryClient()
  const [orderView, setOrderView] = useState<'medication' | 'service' | 'list'>('medication')
  const [service, setService] = useState<ClinicalResourceOption<ServiceCatalogItem>>()
  const [medication, setMedication] = useState<ClinicalResourceOption<MedicationKnowledge>>()
  const [serviceQuantity, setServiceQuantity] = useState(1)
  const [medicationQuantity, setMedicationQuantity] = useState(1)
  const [doseValue, setDoseValue] = useState<number | ''>('')
  const [doseUnit, setDoseUnit] = useState('')
  const [routeCode, setRouteCode] = useState('')
  const [frequencyCode, setFrequencyCode] = useState('')
  const [durationValue, setDurationValue] = useState<number | ''>('')
  const [durationUnit, setDurationUnit] = useState('天')
  const [medicationInstruction, setMedicationInstruction] = useState('遵医嘱使用')
  const [safetyReviewed, setSafetyReviewed] = useState(false)
  const [allergyOverrideReason, setAllergyOverrideReason] = useState('')
  const prescriptions = useQuery({ queryKey: ['doctor-prescriptions', encounter.id], queryFn: () => api.encounters.prescriptions(encounter.id) })
  const services = useQuery({ queryKey: ['doctor-services', encounter.id], queryFn: () => api.encounters.serviceRequests(encounter.id) })
  const medications = useQuery({ queryKey: ['doctor-medications', encounter.id], queryFn: () => api.encounters.medicationRequests(encounter.id) })
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['doctor-prescriptions', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-services', encounter.id] }),
    queryClient.invalidateQueries({ queryKey: ['doctor-medications', encounter.id] }),
  ])
  useEffect(() => {
    const selected = medication?.raw
    setDoseValue(selected?.defaultDose ?? '')
    setDoseUnit(selected?.defaultDoseUnit ?? '')
    setRouteCode(selected?.defaultRoute ?? '')
    setFrequencyCode(selected?.defaultFrequency ?? '')
    setSafetyReviewed(false)
    setAllergyOverrideReason('')
  }, [medication])
  const selectedMedication = medication?.raw
  const drugAllergies = allergies.filter((item) => item.assertionType === 'ALLERGY' && item.categoryCode === 'DRUG')
  const matchedAllergies = selectedMedication ? drugAllergies.filter((item) => item.substanceCode
    && item.substanceCode.toLowerCase() === selectedMedication.code.toLowerCase()) : []
  const requiresSafetyReview = Boolean(selectedMedication && (drugAllergies.length > 0
    || selectedMedication.skinTestRequired || selectedMedication.antimicrobial))
  const createPrescription = useMutation({ mutationFn: () => api.encounters.createPrescription(encounter.id, '门诊处方'), onSuccess: refresh })
  const draft = prescriptions.data?.find((item) => item.status === 'DRAFT')
  const addMedication = useMutation({
    mutationFn: () => {
      const selected = medication?.raw
      if (!draft || !selected) throw new Error('请先选择处方草稿和通用药品')
      return api.encounters.createMedicationRequest(encounter.id, {
        prescriptionId: draft.id, medicationId: selected.id, quantity: medicationQuantity,
        quantityUnit: selected.preparationUnit, substitutionAllowed: true, selfProvided: false,
        doseValue: doseValue === '' ? undefined : doseValue, doseUnit: doseUnit || undefined,
        routeCode: routeCode || undefined, frequencyCode: frequencyCode || undefined,
        durationValue: durationValue === '' ? undefined : durationValue, durationUnit: durationValue === '' ? undefined : durationUnit,
        reason: '门诊处方', medicationInstruction, allergyReviewConfirmed: safetyReviewed || drugAllergies.length === 0,
        allergyOverrideReason: allergyOverrideReason.trim() || undefined,
      })
    },
    onSuccess: async () => { setMedication(undefined); setMedicationQuantity(1); setDurationValue(''); await refresh() },
  })
  const addService = useMutation({
    mutationFn: () => {
      const selected = service?.raw
      if (!selected) throw new Error('请先选择诊疗项目')
      return api.encounters.createServiceRequest(encounter.id, {
        catalogItemId: selected.id, quantity: serviceQuantity, unitCode: selected.unitCode, priceType: 'SALE', pricingRequired: true,
        reason: '门诊诊疗申请', clinicalDescription: '门诊医生站开立',
      })
    },
    onSuccess: async () => { setService(undefined); setServiceQuantity(1); await refresh() },
  })
  const submit = useMutation({
    mutationFn: (value: Prescription) => api.encounters.submitPrescription(encounter.id, value.id, value.revision),
    onSuccess: refresh,
  })
  const cancelService = useMutation({
    mutationFn: (value: import('../../shared/api/encountersApi').ServiceRequest) =>
      api.encounters.cancelServiceRequest(encounter.id, value.id, value.revision, '医生站撤销'), onSuccess: refresh,
  })
  const cancelMedication = useMutation({
    mutationFn: (value: import('../../shared/api/encountersApi').MedicationRequest) =>
      api.encounters.cancelMedicationRequest(encounter.id, value.id, value.revision, '医生站撤销'), onSuccess: refresh,
  })
  const cancelPrescription = useMutation({
    mutationFn: (value: Prescription) => api.encounters.cancelPrescription(encounter.id, value.id, value.revision, '医生站撤销'),
    onSuccess: refresh,
  })
  const error = prescriptions.error || services.error || medications.error || createPrescription.error
    || addMedication.error || addService.error || submit.error || cancelService.error || cancelMedication.error || cancelPrescription.error
  const orderCount = (services.data?.length ?? 0) + (medications.data?.length ?? 0)

  return <Panel className="doctor-orders-panel">
    <PanelHead title="医嘱与处方" meta={`${orderCount} 项`} />
    <nav className="doctor-order-tabs" aria-label="医嘱类型">
      <button type="button" className={orderView === 'medication' ? 'is-active' : ''}
        onClick={() => setOrderView('medication')}>门诊处方</button>
      <button type="button" className={orderView === 'service' ? 'is-active' : ''}
        onClick={() => setOrderView('service')}>诊疗申请</button>
      <button type="button" className={orderView === 'list' ? 'is-active' : ''}
        onClick={() => setOrderView('list')}>本次医嘱 <span>{orderCount}</span></button>
    </nav>
    {error && <Alert className="doctor-order-error">{errorMessage(error)}</Alert>}
    <div className="doctor-orders-content">
      {orderView === 'service' && <div className="doctor-service-entry">
        <FormField label="诊疗项目"><ClinicalResourceSearch<ServiceCatalogItem> api={api} resource="service"
          organizationId={encounter.organizationId} value={service} onChange={setService} /></FormField>
        <div className="doctor-order-entry"><FormField label="数量"><input type="number" min="1" value={serviceQuantity}
          onChange={(event) => setServiceQuantity(Number(event.target.value))} /></FormField>
          <Button busy={addService.isPending} disabled={!service || serviceQuantity <= 0}
            onClick={() => addService.mutate()}>加入申请</Button></div>
      </div>}
      {orderView === 'medication' && <div className="doctor-prescription-entry">
        <div className="doctor-prescription-meta">
          <span>{draft ? draft.prescriptionNo : '尚未建立处方草稿'}</span>
          {!draft && <Button size="sm" onClick={() => createPrescription.mutate()}>新建处方</Button>}
        </div>
        <FormField label="通用药品"><ClinicalResourceSearch<MedicationKnowledge> api={api} resource="medication"
          organizationId={encounter.organizationId} value={medication} onChange={setMedication} /></FormField>
        {selectedMedication && <div className={`doctor-medication-safety ${requiresSafetyReview ? 'is-warning' : 'is-clear'}`}>
          <strong>{requiresSafetyReview ? '开立前安全核对' : '未命中当前高风险提示'}</strong>
          {drugAllergies.length > 0 && <p>患者药物过敏：{drugAllergies.map((item) => item.substanceDisplay).join('、')}</p>}
          {selectedMedication.skinTestRequired && <p>该药品目录标记为“需皮试”；加入处方不代表皮试已完成。</p>}
          {selectedMedication.antimicrobial && <p>抗菌药等级：{selectedMedication.sdAntimicrobialLevelText
            || selectedMedication.sdAntimicrobialLevel || '未配置等级'}</p>}
          {matchedAllergies.length > 0 && <FormField label="命中过敏原，继续开立的临床理由" required>
            <input value={allergyOverrideReason} maxLength={1000} onChange={(event) => setAllergyOverrideReason(event.target.value)} />
          </FormField>}
          {requiresSafetyReview && <label><input type="checkbox" checked={safetyReviewed}
            onChange={(event) => setSafetyReviewed(event.target.checked)} /> 已核对患者过敏信息及以上药品风险</label>}
        </div>}
        <div className="doctor-medication-directions">
          <FormField label="单次剂量"><input type="number" min="0" step="0.01" value={doseValue}
            onChange={(event) => setDoseValue(event.target.value === '' ? '' : Number(event.target.value))} /></FormField>
          <FormField label="剂量单位"><input value={doseUnit} onChange={(event) => setDoseUnit(event.target.value)} /></FormField>
          <FormField label="给药途径"><input value={routeCode} onChange={(event) => setRouteCode(event.target.value)} placeholder="如 PO" /></FormField>
          <FormField label="频次"><input value={frequencyCode} onChange={(event) => setFrequencyCode(event.target.value)} placeholder="如 BID" /></FormField>
          <FormField label="疗程"><input type="number" min="1" value={durationValue}
            onChange={(event) => setDurationValue(event.target.value === '' ? '' : Number(event.target.value))} /></FormField>
          <FormField label="疗程单位"><input value={durationUnit} onChange={(event) => setDurationUnit(event.target.value)} /></FormField>
        </div>
        <FormField label="用药嘱托"><input value={medicationInstruction}
          onChange={(event) => setMedicationInstruction(event.target.value)} /></FormField>
        <div className="doctor-order-entry"><FormField label="发药数量"><input type="number" min="1" value={medicationQuantity}
          onChange={(event) => setMedicationQuantity(Number(event.target.value))} /></FormField>
          <Button busy={addMedication.isPending} disabled={!draft || !medication || medicationQuantity <= 0
            || doseValue === '' || !doseUnit.trim() || !routeCode.trim() || !frequencyCode.trim() || !medicationInstruction.trim()
            || (requiresSafetyReview && !safetyReviewed) || (matchedAllergies.length > 0 && !allergyOverrideReason.trim())}
            onClick={() => addMedication.mutate()}>加入处方</Button></div>
        {draft && <div className="ui-form-actions"><Button variant="secondary" busy={submit.isPending}
          disabled={!draft.medicationRequests.some((item) => item.status === 'DRAFT')} onClick={() => submit.mutate(draft)}>提交整张处方</Button>
          <Button variant="text" busy={cancelPrescription.isPending}
            onClick={() => { if (window.confirm('确认撤销当前处方草稿？')) cancelPrescription.mutate(draft) }}>撤销草稿</Button></div>}
      </div>}
      {orderView === 'list' && (services.isPending || medications.isPending ? <LoadingState />
        : !(services.data?.length || medications.data?.length)
          ? <div className="doctor-order-empty"><strong>尚未开立医嘱</strong><span>可切换到处方或诊疗申请进行开立。</span></div>
          : <div className="doctor-order-lines" role="list" aria-label="本次医嘱明细，每行一条医嘱">
            {services.data?.map((item) => <div className="doctor-order-line" role="listitem" key={item.id}>
              <span className="doctor-order-kind">诊疗</span>
              <span className="doctor-order-main"><strong>{item.itemName}</strong><code>{item.itemCode}</code></span>
              <span className="doctor-order-usage">{item.quantity} {item.unitCode}</span>
              <StatusBadge tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>{orderStatusLabel(item.status)}</StatusBadge>
              <span className="doctor-order-action">{item.status === 'ACTIVE' && <Button size="sm" variant="text" busy={cancelService.isPending}
                onClick={() => { if (window.confirm(`确认撤销“${item.itemName}”？`)) cancelService.mutate(item) }}>撤销</Button>}</span>
            </div>)}
            {medications.data?.map((item) => <div className="doctor-order-line" role="listitem" key={item.id}>
              <span className="doctor-order-kind is-medication">药品</span>
              <span className="doctor-order-main"><strong>{item.medicationName}</strong><code>{item.medicationCode}</code></span>
              <span className="doctor-order-usage" title={[
                `${item.quantity} ${item.quantityUnit}`,
                item.doseValue && `${item.doseValue} ${item.doseUnit || ''}`,
                item.routeCode,
                item.frequencyCode,
              ].filter(Boolean).join(' · ')}>{[
                `${item.quantity} ${item.quantityUnit}`,
                item.doseValue && `${item.doseValue} ${item.doseUnit || ''}`,
                item.routeCode,
                item.frequencyCode,
              ].filter(Boolean).join(' · ')}</span>
              <StatusBadge tone={item.status === 'CANCELLED' ? 'neutral' : item.status === 'DRAFT' ? 'warning' : 'success'}>
                {orderStatusLabel(item.status)}</StatusBadge>
              <span className="doctor-order-action">{item.status !== 'CANCELLED' && <Button size="sm" variant="text" busy={cancelMedication.isPending}
                onClick={() => { if (window.confirm(`确认撤销“${item.medicationName}”？`)) cancelMedication.mutate(item) }}>撤销</Button>}</span>
            </div>)}
          </div>)}
    </div>
  </Panel>
}

function orderStatusLabel(status: string) {
  return ({ DRAFT: '草稿', ACTIVE: '已开立', SUBMITTED: '已提交', CANCELLED: '已撤销' } as Record<string, string>)[status] ?? status
}

function ResultsPanel({ encounter, api }: { encounter: Encounter; api: RhnApi }) {
  const reports = useQuery({ queryKey: ['doctor-reports', encounter.id], queryFn: () => api.diagnostics.reportsByEncounter(encounter.id) })
  return <Panel><PanelHead title="本次检查检验结果" meta={`${reports.data?.length ?? 0} 份报告`}
    actions={<Button size="sm" variant="secondary" onClick={() => void reports.refetch()}><Icon name="refresh" />刷新</Button>} />
    {reports.error && <Alert>{errorMessage(reports.error)}</Alert>}
    {reports.isPending ? <LoadingState /> : !reports.data?.length
      ? <EmptyState icon="clinical" title="暂无报告" copy="报告接收后会按版本展示，获取失败不会伪造空结果。" />
      : <div className="doctor-report-list">{reports.data.map((report) => <article key={report.id}><header>
        <div><strong>{report.reportName}</strong><small>{report.reportCode} · V{report.reportVersion} · {formatTime(report.issuedAt)}</small></div>
        <StatusBadge tone={report.status === 'FINAL' ? 'success' : 'warning'}>{report.status}</StatusBadge></header>
        <p>{report.conclusion || '无报告结论'}</p><div>{report.observations.map((item) => <span key={item.id}
          className={isAbnormalObservation(item) ? 'is-abnormal' : ''}>
          {item.observationName}：{item.valueNumber ?? item.valueString ?? item.valueCode ?? '—'} {item.unitCode ?? ''}
          {isAbnormalObservation(item) ? ' · 异常' : ''}</span>)}</div>
      </article>)}</div>}
  </Panel>
}

function isAbnormalObservation(item: import('../../shared/api/diagnosticsApi').DiagnosticObservation) {
  if (item.interpretationCode && !['N', 'NORMAL'].includes(item.interpretationCode.toUpperCase())) return true
  if (item.valueNumber == null) return false
  return (item.referenceRangeLow != null && item.valueNumber < item.referenceRangeLow)
    || (item.referenceRangeHigh != null && item.valueNumber > item.referenceRangeHigh)
}

function HistoryPanel({ encounters }: { encounters: Encounter[] }) {
  return <Panel><PanelHead title="门诊就诊历史" meta={`最近 ${encounters.length} 次`} />
    <div className="history-list">{encounters.map((encounter) => <div className="history-row" key={encounter.id}>
      <StatusBadge tone={encounterStatusPresentation(encounter.status).tone}>{encounterStatusPresentation(encounter.status).label}</StatusBadge>
      <div><strong>{encounter.chiefComplaint || '门诊就诊'}</strong><small>{formatTime(encounter.registeredAt)} · {encounter.encounterNo}</small></div>
      <div>{encounter.diagnoses.map((item) => item.display).join('、') || '尚无诊断'}</div>
    </div>)}</div>
  </Panel>
}
