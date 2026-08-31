import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DiseaseConcept } from '../../shared/api/masterDataApi'
import type { InpatientAdmissionDiagnosis, InpatientEpisode } from '../../shared/api/inpatientApi'
import { inpatientDiagnosisVerificationPresentation } from '../../shared/presentation'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { Alert, Button, ClinicalResourceSearch, EmptyState, LoadingState, Panel, Select, StatusBadge,
  type ClinicalResourceOption } from '../../shared/ui'
import './inpatient-diagnoses.css'

export function InpatientAdmissionDiagnosisPanel({ api, episode, variant = 'editor', onManage }: {
  api: RhnApi
  episode: InpatientEpisode
  variant?: 'editor' | 'summary'
  onManage?: () => void
}) {
  const queryClient = useQueryClient()
  const readOnly = episode.status !== 'ADMITTED'
  const canEdit = !readOnly && variant === 'editor'
  const [diagnoses, setDiagnoses] = useState<InpatientAdmissionDiagnosis[]>([])
  const [selected, setSelected] = useState<ClinicalResourceOption<DiseaseConcept>>()
  const [initializedEpisode, setInitializedEpisode] = useState('')
  const query = useQuery({
    queryKey: ['inpatient-admission-diagnoses', episode.id],
    queryFn: () => api.inpatient.admissionDiagnoses(episode.id),
  })
  useEffect(() => {
    if (!query.data || initializedEpisode === episode.id) return
    setDiagnoses(query.data.diagnoses)
    setInitializedEpisode(episode.id)
  }, [episode.id, initializedEpisode, query.data])
  const save = useMutation({
    mutationFn: () => api.inpatient.saveAdmissionDiagnoses(episode.id, {
      expectedEpisodeRevision: episode.revision,
      diagnoses: diagnoses.map(({ code, display, diagnosisType, verificationStatus }) => ({
        code, display, diagnosisType, verificationStatus,
      })),
      commandCode: `ADMISSION-DIAGNOSIS-${crypto.randomUUID()}`,
    }),
    onSuccess: async (value) => {
      setDiagnoses(value.diagnoses)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inpatient-admission-diagnoses', episode.id] }),
        queryClient.invalidateQueries({ queryKey: ['inpatient-discharge-readiness', episode.id] }),
      ])
    },
  })
  const primary = diagnoses.find((value) => value.diagnosisType === 'PRIMARY')
  const addSelected = () => {
    const disease = selected?.raw
    if (!disease || diagnoses.some((value) => value.code.toLowerCase() === disease.code.toLowerCase())) return
    setDiagnoses((current) => [...current, {
      diagnosisStage: 'ADMISSION', code: disease.code, display: disease.display,
      diagnosisType: current.some((value) => value.diagnosisType === 'PRIMARY') ? 'SECONDARY' : 'PRIMARY',
      verificationStatus: 'PROVISIONAL',
    }])
    setSelected(undefined)
  }
  return <Panel className={`inpatient-admission-diagnoses ${variant === 'summary' ? 'is-summary' : ''}`}
    aria-labelledby="inpatient-admission-diagnoses-heading">
    <header className="inpatient-section-head"><div><h2 id="inpatient-admission-diagnoses-heading">入院诊断</h2>
      <span>{variant === 'summary' ? '概览主要诊断与确认状态' : '结构化记录入院主要问题，供病历、医嘱安全和出院对照复用'}</span></div>
      <div><StatusBadge tone={primary ? 'success' : 'warning'}>{primary ? '已记录主要诊断' : '待补主要诊断'}</StatusBadge>
        {variant === 'summary' && onManage && <Button size="sm" variant="secondary" onClick={onManage}>维护诊断</Button>}
        {canEdit && <Button size="sm" busy={save.isPending} disabled={!primary || diagnoses.length === 0}
          onClick={() => save.mutate()}>保存诊断</Button>}</div></header>
    {(query.error || save.error) && <Alert>{errorMessage(query.error || save.error)}</Alert>}
    {query.isPending ? <LoadingState label="正在读取入院诊断…" /> : <>
      {canEdit && <div className="inpatient-admission-diagnoses__add">
        <ClinicalResourceSearch<DiseaseConcept> api={api} resource="diagnosis" value={selected}
          onChange={setSelected} aria-label="搜索入院诊断" placeholder="疾病名称、ICD 编码或拼音码" />
        <Button size="sm" variant="secondary" disabled={!selected} onClick={addSelected}>添加诊断</Button>
      </div>}
      {diagnoses.length === 0 ? <EmptyState icon="clinical" title="尚未记录入院诊断"
        copy={readOnly ? '本次住院未留下结构化入院诊断。' : '先检索疾病，首条诊断会自动设为主要诊断。'} />
        : <div className="inpatient-admission-diagnoses__list">{diagnoses.map((diagnosis) => <article key={diagnosis.code}>
          <span><StatusBadge tone={diagnosis.diagnosisType === 'PRIMARY' ? 'info' : 'neutral'}>
            {diagnosis.diagnosisType === 'PRIMARY' ? '主要' : '次要'}</StatusBadge>
            <strong>{diagnosis.display}</strong><small>{diagnosis.code}</small></span>
          <div>{!canEdit ? <StatusBadge tone={inpatientDiagnosisVerificationPresentation(diagnosis.verificationStatus).tone}>
            {inpatientDiagnosisVerificationPresentation(diagnosis.verificationStatus).label}</StatusBadge> : <>
            <Select aria-label={`诊断确认状态 ${diagnosis.display}`} value={diagnosis.verificationStatus}
              clearable={false} searchable={false} options={[
                { value: 'PROVISIONAL', label: '初步诊断' },
                { value: 'CONFIRMED', label: '已确认' },
              ]} onChange={(verificationStatus) => setDiagnoses((current) => current.map((value) => value.code === diagnosis.code
                ? { ...value, verificationStatus: verificationStatus as InpatientAdmissionDiagnosis['verificationStatus'] }
                : value))} />
            {diagnosis.diagnosisType !== 'PRIMARY' && <Button size="sm" variant="text" onClick={() =>
              setDiagnoses((current) => current.map((value) => ({ ...value,
                diagnosisType: value.code === diagnosis.code ? 'PRIMARY'
                  : value.diagnosisType === 'PRIMARY' ? 'SECONDARY' : value.diagnosisType })))}>设为主要</Button>}
            <Button size="sm" variant="text" onClick={() => setDiagnoses((current) =>
              current.filter((value) => value.code !== diagnosis.code))}>移除</Button></>}</div>
        </article>)}</div>}
    </>}
  </Panel>
}
