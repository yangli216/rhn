import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { UseFormReturn } from 'react-hook-form'
import type { Encounter } from '../../../shared/model'
import type { RhnApi } from '../../../shared/rhnApi'
import { Button, Icon } from '../../../shared/ui'
import { exceedsWarning, VITAL_HARD_LIMITS, vitalRule } from '../../../shared/validation/businessValidation'
import type { VitalsSummary } from '../waiting/queueTypes'
import type { RecordForm } from './clinicalRecordDraft'

export function ClinicalVitalsFields({ api, encounterId, historyEncounters, triageVitals,
  form, recordValues, bmi, signed, bloodPressureRequired }: {
  api: {
    clinicalDocuments: Pick<RhnApi['clinicalDocuments'], 'byEncounter'>
    clinicalSafety: Pick<RhnApi['clinicalSafety'], 'vitalSignRules'>
  }
  encounterId: string
  historyEncounters?: Encounter[]
  triageVitals?: VitalsSummary
  form: Pick<UseFormReturn<RecordForm>, 'register' | 'getValues' | 'reset' | 'formState'>
  recordValues: RecordForm
  bmi?: string
  signed: boolean
  bloodPressureRequired: boolean
}) {
  const { register, getValues, reset, formState } = form
  const vitalRulesQuery = useQuery({
    queryKey: ['clinical-safety-vital-rules'],
    queryFn: api.clinicalSafety.vitalSignRules,
    staleTime: 5 * 60 * 1000,
  })
  const [selectedRefIdx, setSelectedRefIdx] = useState(0)
  const [appliedRefFeedback, setAppliedRefFeedback] = useState(false)
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(feedbackTimer.current), [])
  const pastEncounters = useMemo(() => {
    return (historyEncounters ?? []).filter((item) => item.id !== encounterId)
  }, [historyEncounters, encounterId])
  const recentPastEncounter = pastEncounters[0]
  const pastDocumentQuery = useQuery({
    queryKey: ['doctor-recent-past-doc', recentPastEncounter?.id],
    queryFn: () => api.clinicalDocuments.byEncounter(recentPastEncounter!.id),
    enabled: Boolean(recentPastEncounter?.id),
    staleTime: 5 * 60 * 1000,
  })
  const pastNote = pastDocumentQuery.data?.find((item) => item.documentType === 'OUTPATIENT_NOTE')
  const pastVitalsData = useMemo(() => {
    if (!recentPastEncounter) return null
    const noteVitals = pastNote?.content.vitalSigns
    const systolic = recentPastEncounter.systolic ?? noteVitals?.systolic
    const diastolic = recentPastEncounter.diastolic ?? noteVitals?.diastolic
    const temperature = noteVitals?.temperature
    const pulseRate = noteVitals?.pulseRate
    const respiratoryRate = noteVitals?.respiratoryRate
    const oxygenSaturation = noteVitals?.oxygenSaturation
    const heightCm = noteVitals?.heightCm
    const weightKg = noteVitals?.weightKg

    const hasAny = [systolic, diastolic, temperature, pulseRate, respiratoryRate, oxygenSaturation, heightCm, weightKg]
      .some((v) => v !== undefined && v !== null && !isNaN(Number(v)))

    if (!hasAny) return null

    const dateStr = recentPastEncounter.registeredAt ? formatShortDate(recentPastEncounter.registeredAt) : ''
    return {
      sourceType: 'PAST' as const,
      label: `上次就诊 (${dateStr || '既往'})`,
      vitals: {
        systolic,
        diastolic,
        temperature,
        pulseRate,
        respiratoryRate,
        oxygenSaturation,
        heightCm,
        weightKg,
      },
    }
  }, [recentPastEncounter, pastNote])

  const triageVitalsData = useMemo(() => {
    if (!triageVitals) return null
    const systolic = triageVitals.systolic
    const diastolic = triageVitals.diastolic
    const temperature = triageVitals.temperature
    const pulseRate = triageVitals.pulseRate
    const oxygenSaturation = triageVitals.spo2
    const hasAny = [systolic, diastolic, temperature, pulseRate, oxygenSaturation]
      .some((v) => v !== undefined && v !== null && !isNaN(Number(v)))

    if (!hasAny) return null

    const timeStr = triageVitals.measuredAt ? formatShortTime(triageVitals.measuredAt) : '分诊'
    return {
      sourceType: 'TRIAGE' as const,
      label: `分诊测量 (${timeStr})`,
      vitals: {
        systolic,
        diastolic,
        temperature,
        pulseRate,
        oxygenSaturation,
        respiratoryRate: undefined,
        heightCm: undefined,
        weightKg: undefined,
      },
    }
  }, [triageVitals])

  const availableSources = useMemo(() => {
    const list = []
    if (triageVitalsData) list.push(triageVitalsData)
    if (pastVitalsData) list.push(pastVitalsData)
    return list
  }, [triageVitalsData, pastVitalsData])

  const activeRef = availableSources[selectedRefIdx] ?? availableSources[0]

  const handleApplyReferenceVitals = (refVitals: {
    systolic?: number
    diastolic?: number
    temperature?: number
    pulseRate?: number
    respiratoryRate?: number
    oxygenSaturation?: number
    heightCm?: number
    weightKg?: number
  }) => {
    const current = getValues()
    reset({
      ...current,
      systolic: refVitals.systolic !== undefined ? refVitals.systolic : current.systolic,
      diastolic: refVitals.diastolic !== undefined ? refVitals.diastolic : current.diastolic,
      temperature: refVitals.temperature !== undefined ? refVitals.temperature : current.temperature,
      pulseRate: refVitals.pulseRate !== undefined ? refVitals.pulseRate : current.pulseRate,
      respiratoryRate: refVitals.respiratoryRate !== undefined ? refVitals.respiratoryRate : current.respiratoryRate,
      oxygenSaturation: refVitals.oxygenSaturation !== undefined ? refVitals.oxygenSaturation : current.oxygenSaturation,
      heightCm: refVitals.heightCm !== undefined ? refVitals.heightCm : current.heightCm,
      weightKg: refVitals.weightKg !== undefined ? refVitals.weightKg : current.weightKg,
    }, { keepDefaultValues: true })
    setAppliedRefFeedback(true)
    clearTimeout(feedbackTimer.current)
    feedbackTimer.current = setTimeout(() => setAppliedRefFeedback(false), 2000)
  }
  const tempNum = recordValues.temperature ? Number(recordValues.temperature) : undefined
  const isTempAbnormal = exceedsWarning(tempNum, vitalRule(vitalRulesQuery.data, 'temperature'))

  const pulseNum = recordValues.pulseRate ? Number(recordValues.pulseRate) : undefined
  const isPulseAbnormal = exceedsWarning(pulseNum, vitalRule(vitalRulesQuery.data, 'pulse'))

  const respNum = recordValues.respiratoryRate ? Number(recordValues.respiratoryRate) : undefined
  const isRespAbnormal = exceedsWarning(respNum, vitalRule(vitalRulesQuery.data, 'respiratory-rate'))

  const spo2Num = recordValues.oxygenSaturation ? Number(recordValues.oxygenSaturation) : undefined
  const isSpo2Abnormal = exceedsWarning(spo2Num, vitalRule(vitalRulesQuery.data, 'oxygen-saturation'))

  const sysNum = recordValues.systolic ? Number(recordValues.systolic) : undefined
  const diaNum = recordValues.diastolic ? Number(recordValues.diastolic) : undefined
  const isBpAbnormal = exceedsWarning(sysNum, vitalRule(vitalRulesQuery.data, 'systolic-pressure'))
    || exceedsWarning(diaNum, vitalRule(vitalRulesQuery.data, 'diastolic-pressure'))

  const bmiNum = bmi ? Number(bmi) : undefined
  const bmiStatus = bmiNum !== undefined && !isNaN(bmiNum)
    ? bmiNum < 18.5 ? { label: '偏瘦', tone: 'info' as const }
      : bmiNum < 24.0 ? { label: '正常', tone: 'normal' as const }
        : bmiNum < 28.0 ? { label: '超重', tone: 'warning' as const }
          : { label: '肥胖', tone: 'danger' as const }
    : null

  return (
    <div className="doctor-physical-exam" role="group" aria-labelledby="doctor-physical-exam-label">
      <span id="doctor-physical-exam-label" className="doctor-physical-exam__label">体格检查</span>
      <div className="doctor-physical-exam__body">
        {activeRef && (
          <div className="doctor-recent-vitals-bar" aria-label="近期体格数据参考">
            <div className="doctor-recent-vitals-head">
              <Icon name="roadmap" />
              <span className="doctor-recent-vitals-title">近期参考</span>
              {availableSources.length > 1 ? (
                <div className="doctor-recent-vitals-tabs" role="tablist">
                  {availableSources.map((src, idx) => (
                    <button
                      key={src.sourceType}
                      type="button"
                      className={`doctor-recent-vitals-tab ${selectedRefIdx === idx ? 'is-active' : ''}`}
                      onClick={() => setSelectedRefIdx(idx)}
                    >
                      {src.label}
                    </button>
                  ))}
                </div>
              ) : (
                <span className="doctor-recent-vitals-tag">{activeRef.label}</span>
              )}
            </div>
            <div className="doctor-recent-vitals-metrics">
              {formatVitalsSummary(activeRef.vitals).map((item) => (
                <span key={item.key} className="doctor-recent-vitals-metric">
                  <span className="doctor-recent-vitals-metric__name">{item.label}</span>
                  <strong className="doctor-recent-vitals-metric__val">{item.text}</strong>
                </span>
              ))}
            </div>
            {!signed && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className={`doctor-recent-vitals-apply-btn ${appliedRefFeedback ? 'is-applied' : ''}`}
                onClick={() => handleApplyReferenceVitals(activeRef.vitals)}
                title={`将${activeRef.label}的数据一键带入本次病历`}
              >
                <Icon name={appliedRefFeedback ? 'check' : 'roadmap'} />
                {appliedRefFeedback ? '已带入' : `引用${activeRef.sourceType === 'TRIAGE' ? '分诊数据' : '上次结果'}`}
              </Button>
            )}
          </div>
        )}
        <div className={`doctor-vital-grid ${appliedRefFeedback ? 'is-highlight' : ''}`}>
          <div className={`doctor-vital-cell ${isTempAbnormal ? 'is-abnormal' : ''}`}>
            <span className="doctor-vital-name">
              体温
              {isTempAbnormal && <span className="doctor-vital-alert-dot" title="体温异常" />}
            </span>
            <div className="doctor-vital-input-wrap">
              <input aria-label="体温" aria-invalid={Boolean(formState.errors.temperature)}
                aria-describedby={formState.errors.temperature ? 'doctor-vital-errors' : undefined} type="number" step="0.1" min={VITAL_HARD_LIMITS.temperature.minimum}
                max={VITAL_HARD_LIMITS.temperature.maximum} disabled={signed}
                {...register('temperature', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} />
              <small>℃</small>
            </div>
          </div>
          <div className={`doctor-vital-cell ${isPulseAbnormal ? 'is-abnormal' : ''}`}>
            <span className="doctor-vital-name">
              脉搏
              {isPulseAbnormal && <span className="doctor-vital-alert-dot" title="脉搏异常" />}
            </span>
            <div className="doctor-vital-input-wrap">
              <input aria-label="脉搏" aria-invalid={Boolean(formState.errors.pulseRate)}
                aria-describedby={formState.errors.pulseRate ? 'doctor-vital-errors' : undefined} type="number" min={VITAL_HARD_LIMITS.pulse.minimum}
                max={VITAL_HARD_LIMITS.pulse.maximum} disabled={signed}
                {...register('pulseRate', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} />
              <small>次/分</small>
            </div>
          </div>
          <div className={`doctor-vital-cell ${isRespAbnormal ? 'is-abnormal' : ''}`}>
            <span className="doctor-vital-name">
              呼吸
              {isRespAbnormal && <span className="doctor-vital-alert-dot" title="呼吸频率异常" />}
            </span>
            <div className="doctor-vital-input-wrap">
              <input aria-label="呼吸" aria-invalid={Boolean(formState.errors.respiratoryRate)}
                aria-describedby={formState.errors.respiratoryRate ? 'doctor-vital-errors' : undefined} type="number" min={VITAL_HARD_LIMITS.respiratoryRate.minimum}
                max={VITAL_HARD_LIMITS.respiratoryRate.maximum} disabled={signed}
                {...register('respiratoryRate', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} />
              <small>次/分</small>
            </div>
          </div>
          <div className={`doctor-vital-cell ${isSpo2Abnormal ? 'is-abnormal' : ''}`}>
            <span className="doctor-vital-name">
              血氧
              {isSpo2Abnormal && <span className="doctor-vital-alert-dot" title="血氧偏低" />}
            </span>
            <div className="doctor-vital-input-wrap">
              <input aria-label="血氧" aria-invalid={Boolean(formState.errors.oxygenSaturation)}
                aria-describedby={formState.errors.oxygenSaturation ? 'doctor-vital-errors' : undefined} type="number" min={VITAL_HARD_LIMITS.oxygenSaturation.minimum}
                max={VITAL_HARD_LIMITS.oxygenSaturation.maximum} disabled={signed}
                {...register('oxygenSaturation', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} />
              <small>%</small>
            </div>
          </div>
          <div className={`doctor-vital-cell doctor-vital-cell--bp ${isBpAbnormal ? 'is-abnormal' : ''}`}>
            <span className="doctor-vital-name">
              血压 {bloodPressureRequired ? <span className="doctor-vital-required" aria-hidden="true">*</span>
                : <small>（未满18岁可不填）</small>}
              {isBpAbnormal && <span className="doctor-vital-alert-dot" title="血压异常" />}
            </span>
            <div className="doctor-vital-input-wrap doctor-vital-bp-wrap">
              <input aria-label="收缩压" aria-invalid={Boolean(formState.errors.systolic)}
                aria-describedby={formState.errors.systolic ? 'doctor-vital-errors' : undefined} aria-required={bloodPressureRequired} type="number" min={VITAL_HARD_LIMITS.systolicPressure.minimum}
                max={VITAL_HARD_LIMITS.systolicPressure.maximum}
                {...register('systolic', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} disabled={signed} />
              <b>/</b>
              <input aria-label="舒张压" aria-invalid={Boolean(formState.errors.diastolic)}
                aria-describedby={formState.errors.diastolic ? 'doctor-vital-errors' : undefined} aria-required={bloodPressureRequired} type="number" min={VITAL_HARD_LIMITS.diastolicPressure.minimum}
                max={VITAL_HARD_LIMITS.diastolicPressure.maximum}
                {...register('diastolic', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} disabled={signed} />
              <small>mmHg</small>
            </div>
          </div>
          <div className="doctor-vital-cell">
            <span className="doctor-vital-name">身高</span>
            <div className="doctor-vital-input-wrap">
              <input aria-label="身高" aria-invalid={Boolean(formState.errors.heightCm)}
                aria-describedby={formState.errors.heightCm ? 'doctor-vital-errors' : undefined} type="number" step="0.1" min={VITAL_HARD_LIMITS.height.minimum}
                max={VITAL_HARD_LIMITS.height.maximum} disabled={signed}
                {...register('heightCm', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} />
              <small>cm</small>
            </div>
          </div>
          <div className="doctor-vital-cell">
            <span className="doctor-vital-name">体重</span>
            <div className="doctor-vital-input-wrap">
              <input aria-label="体重" aria-invalid={Boolean(formState.errors.weightKg)}
                aria-describedby={formState.errors.weightKg ? 'doctor-vital-errors' : undefined} type="number" step="0.1" min={VITAL_HARD_LIMITS.weight.minimum}
                max={VITAL_HARD_LIMITS.weight.maximum} disabled={signed}
                {...register('weightKg', { setValueAs: (value) => value === '' || value == null ? undefined : Number(value) })} />
              <small>kg</small>
            </div>
          </div>
          <div className="doctor-vital-cell doctor-vital-cell--bmi">
            <span className="doctor-vital-name">BMI</span>
            <div className="doctor-vital-bmi-content">
              <span className="doctor-vital-bmi-value">{bmi ?? '—'}</span>
              <small>kg/m²</small>
              {bmiStatus && <span className={`doctor-vital-bmi-badge doctor-vital-bmi-badge--${bmiStatus.tone}`}>{bmiStatus.label}</span>}
            </div>
          </div>
        </div>
      </div>
      {Object.values({ systolic: formState.errors.systolic, diastolic: formState.errors.diastolic,
        temperature: formState.errors.temperature, pulseRate: formState.errors.pulseRate,
        respiratoryRate: formState.errors.respiratoryRate, heightCm: formState.errors.heightCm,
        weightKg: formState.errors.weightKg, oxygenSaturation: formState.errors.oxygenSaturation })
        .some(Boolean) && <small id="doctor-vital-errors" role="alert" className="ui-field__message ui-field__error">
          {[formState.errors.systolic, formState.errors.diastolic, formState.errors.temperature,
            formState.errors.pulseRate, formState.errors.respiratoryRate, formState.errors.heightCm,
            formState.errors.weightKg, formState.errors.oxygenSaturation]
            .flatMap((error) => error?.message ? [error.message] : []).join('；')}
        </small>}
    </div>
  )
}

function formatShortDate(value?: string) {
  if (!value) return ''
  try {
    const d = new Date(value)
    return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    return value
  }
}

function formatShortTime(value?: string) {
  if (!value) return ''
  try {
    const d = new Date(value)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch {
    return value
  }
}

function formatVitalsSummary(v: {
  systolic?: number
  diastolic?: number
  temperature?: number
  pulseRate?: number
  respiratoryRate?: number
  oxygenSaturation?: number
  heightCm?: number
  weightKg?: number
}) {
  const items: Array<{ key: string; label: string; text: string }> = []
  if (v.systolic && v.diastolic) {
    items.push({ key: 'bp', label: '血压', text: `${v.systolic}/${v.diastolic} mmHg` })
  } else if (v.systolic) {
    items.push({ key: 'sys', label: '收缩压', text: `${v.systolic} mmHg` })
  } else if (v.diastolic) {
    items.push({ key: 'dia', label: '舒张压', text: `${v.diastolic} mmHg` })
  }
  if (v.pulseRate != null) items.push({ key: 'pulse', label: '脉搏', text: `${v.pulseRate} 次/分` })
  if (v.temperature != null) items.push({ key: 'temp', label: '体温', text: `${v.temperature} ℃` })
  if (v.respiratoryRate != null) items.push({ key: 'resp', label: '呼吸', text: `${v.respiratoryRate} 次/分` })
  if (v.oxygenSaturation != null) items.push({ key: 'spo2', label: '血氧', text: `${v.oxygenSaturation} %` })
  if (v.heightCm != null) items.push({ key: 'height', label: '身高', text: `${v.heightCm} cm` })
  if (v.weightKg != null) items.push({ key: 'weight', label: '体重', text: `${v.weightKg} kg` })
  return items
}
