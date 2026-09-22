import type { OutpatientNoteForm, OutpatientNoteFormField } from '../../../shared/api/outpatientNoteFormsApi'
import { FormField, StatusBadge } from '../../../shared/ui'
import type { RecordForm } from './clinicalRecordDraft'

export function StructuredNoteForm({ form, values, errors, disabled, onChange }: {
  form: OutpatientNoteForm
  values: Record<string, unknown>
  errors: Record<string, string>
  disabled: boolean
  onChange: (code: string, value: unknown) => void
}) {
  return <div className="doctor-structured-note" aria-label={`${form.name}结构化病历`}>
    <div className="doctor-structured-note__head">
      <span><strong>{form.name}</strong><small>{form.formCode} · V{form.version}</small></span>
      <StatusBadge tone="info">科室结构</StatusBadge>
    </div>
    {form.description && <p>{form.description}</p>}
    {form.sections.map((section) => <fieldset key={section.code}>
      <legend>{section.title}</legend>
      {section.description && <small className="doctor-structured-note__description">{section.description}</small>}
      <div className="doctor-structured-note__fields">
        {section.fields.map((field) => <StructuredNoteField key={field.code} field={field}
          value={values[field.code]} error={errors[field.code]} disabled={disabled}
          onChange={(value) => onChange(field.code, value)} />)}
      </div>
    </fieldset>)}
  </div>
}

function structuredNoteReadValue(field: OutpatientNoteFormField, value: unknown) {
  if (value === undefined || value === null || value === '') return '未记录'
  if (field.type === 'BOOLEAN') return value ? '是' : '否'
  if (field.type === 'SELECT') return field.options.find((option) => option.value === value)?.label ?? String(value)
  return `${String(value)}${field.unit ? ` ${field.unit}` : ''}`
}

function StructuredNoteReadView({ form, values }: {
  form: OutpatientNoteForm
  values: Record<string, unknown>
}) {
  return <section className="doctor-structured-note-read" aria-label={`${form.name}阅读内容`}>
    <header><strong>{form.name}</strong><small>{form.formCode} · V{form.version}</small></header>
    {form.sections.map((section) => <section key={section.code}>
      <h4>{section.title}</h4>
      <dl>{section.fields.map((field) => <div key={field.code}>
        <dt>{field.label}</dt><dd>{structuredNoteReadValue(field, values[field.code])}</dd>
      </div>)}</dl>
    </section>)}
  </section>
}

export function ClinicalRecordReadView({ value, bmi, structuredForm, structuredValues }: {
  value: RecordForm
  bmi?: string
  structuredForm?: OutpatientNoteForm
  structuredValues: Record<string, unknown>
}) {
  const sections = [
    { label: '主诉', value: value.chiefComplaint },
    { label: '现病史', value: value.presentIllness },
    { label: '既往史', value: value.medicalHistory },
    { label: '查体所见', value: value.physicalExam },
    { label: '诊疗计划', value: value.treatmentPlan },
  ]
  const vitals = [
    { label: '体温', value: value.temperature, unit: '℃' },
    { label: '脉搏', value: value.pulseRate, unit: '次/分' },
    { label: '呼吸', value: value.respiratoryRate, unit: '次/分' },
    { label: '血氧', value: value.oxygenSaturation, unit: '%' },
    { label: '血压', value: value.systolic && value.diastolic ? `${value.systolic}/${value.diastolic}` : undefined, unit: 'mmHg' },
    { label: '身高', value: value.heightCm, unit: 'cm' },
    { label: '体重', value: value.weightKg, unit: 'kg' },
    { label: 'BMI', value: bmi, unit: 'kg/m²' },
  ]
  return <article className="doctor-record-read" aria-label="门诊病历阅读内容">
    <div className="doctor-record-read__body">
      {sections.slice(0, 3).map((section) => <section key={section.label}>
        <h3>{section.label}</h3>
        <p className={section.value?.trim() ? '' : 'is-empty'}>{section.value?.trim() || '未记录'}</p>
      </section>)}
      <section className="doctor-record-read__vitals">
        <h3>生命体征</h3>
        <dl>{vitals.map((item) => <div key={item.label}>
          <dt>{item.label}</dt><dd className={item.value == null || item.value === '' ? 'is-empty' : ''}>
            {item.value == null || item.value === '' ? '—' : item.value}<small>{item.value == null || item.value === '' ? '' : item.unit}</small>
          </dd>
        </div>)}</dl>
      </section>
      {sections.slice(3).map((section) => <section key={section.label}>
        <h3>{section.label}</h3>
        <p className={section.value?.trim() ? '' : 'is-empty'}>{section.value?.trim() || '未记录'}</p>
      </section>)}
    </div>
    {structuredForm && <StructuredNoteReadView form={structuredForm} values={structuredValues} />}
  </article>
}

function StructuredNoteField({ field, value, error, disabled, onChange }: {
  field: OutpatientNoteFormField
  value: unknown
  error?: string
  disabled: boolean
  onChange: (value: unknown) => void
}) {
  const common = { disabled, 'aria-label': field.label }
  let control
  if (field.type === 'TEXTAREA') {
    control = <textarea {...common} value={typeof value === 'string' ? value : ''}
      maxLength={field.maxLength ?? undefined} placeholder={field.placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value)} />
  } else if (field.type === 'SELECT') {
    control = <select {...common} value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">请选择</option>
      {field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  } else if (field.type === 'BOOLEAN') {
    control = <select {...common} value={typeof value === 'boolean' ? String(value) : ''}
      onChange={(event) => onChange(event.target.value === '' ? undefined : event.target.value === 'true')}>
      <option value="">请选择</option><option value="true">是</option><option value="false">否</option>
    </select>
  } else if (field.type === 'NUMBER') {
    control = <span className="doctor-structured-note__number"><input {...common} type="number"
      value={typeof value === 'number' ? value : ''} min={field.minimum ?? undefined} max={field.maximum ?? undefined}
      placeholder={field.placeholder ?? undefined}
      onChange={(event) => onChange(event.target.value === '' ? undefined : Number(event.target.value))} />
      {field.unit && <small>{field.unit}</small>}</span>
  } else {
    control = <input {...common} type={field.type === 'DATE' ? 'date' : 'text'}
      value={typeof value === 'string' ? value : ''} maxLength={field.maxLength ?? undefined}
      placeholder={field.placeholder ?? undefined} onChange={(event) => onChange(event.target.value)} />
  }
  return <FormField label={field.label} required={field.required} error={error}>{control}</FormField>
}

