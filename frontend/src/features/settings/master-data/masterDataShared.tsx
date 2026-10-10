import { lazy, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { errorMessage, type DictionaryValue, type MasterDataStatus, type ItemAttributeSchema } from "../../../shared/rhnApi";
import { Button, DataTable, Dialog, FormField, LoadingState, Select, StatusBadge, TableShell } from "../../../shared/ui";

export const preloadMedicationComposition = () => import('../MedicationCompositionDialog')

export const MedicationCompositionDialog = lazy(() => preloadMedicationComposition()
  .then((module) => ({ default: module.MedicationCompositionDialog })))

export const ClinicalMedicationStandardsPanel = lazy(() => import('../ClinicalMedicationStandardsPanel')
  .then((module) => ({ default: module.ClinicalMedicationStandardsPanel })))

export const MedicationStandardReadinessPanel = lazy(() => import('../MedicationStandardReadinessPanel')
  .then((module) => ({ default: module.MedicationStandardReadinessPanel })))

export const StandardMedicationCatalogPanel = lazy(() => import('../StandardMedicationCatalogPanel')
  .then((module) => ({ default: module.StandardMedicationCatalogPanel })))

export const ItemAttributeConfigurationPanel = lazy(() => import('../ItemAttributeConfigurationPanel')
  .then((module) => ({ default: module.ItemAttributeConfigurationPanel })))

export const preloadOperationalMasterData = () => import('../OperationalMasterDataPanel')

export const OperationalMasterDataPanel = lazy(() => preloadOperationalMasterData()
  .then((module) => ({ default: module.OperationalMasterDataPanel })))

export const ClinicalServiceConfigurationDialog = lazy(() => preloadOperationalMasterData()
  .then((module) => ({ default: module.ClinicalServiceConfigurationDialog })))

export function DialogSuspenseFallback({ label = '正在打开弹窗…' }: { label?: string }) {
  const content = (
    <div className="ui-dialog-backdrop" aria-busy="true">
      <div
        className="ui-dialog"
        style={{
          width: 'auto',
          minWidth: '18rem',
          maxWidth: '90vw',
          textAlign: 'center',
          padding: 'var(--space-6)',
        }}
      >
        <LoadingState label={label} />
      </div>
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

export type BasicDataScope = 'all' | 'medication' | 'service' | 'disease' | 'operations'

export type Tab = 'disease' | 'service' | 'medication' | 'operations' | 'attribute'

export type DiseaseMode = 'terms' | 'management'

export type MedicationMode = 'readiness' | 'standard' | 'knowledge' | 'product' | 'rules' | 'semantics'

export type DictionaryMap = Record<string, DictionaryValue[]>

export const dictionaryCodes = [
  'BD_MASTER_STATUS', 'BD_CONCEPT_TYPE', 'BD_SERVICE_TYPE', 'BD_SERVICE_USE',
  'BD_MEDICATION_TYPE', 'BD_DOSE_FORM', 'BD_MANUFACTURER_TYPE', 'BD_PACKAGE_USE', 'BD_PRICE_TYPE',
  'BD_STORAGE_TYPE', 'BD_ANTIMICROBIAL_LEVEL', 'BD_SERVICE_DUPLICATE_RULE',
  'BD_PRODUCT_MARKET_STATUS', 'BD_PRODUCTION_PLACE', 'BD_SHELF_LIFE_UNIT',
  'BD_SPECIMEN_TYPE', 'BD_SPECIMEN_CONTAINER', 'BD_LAB_METHOD', 'BD_EXAM_TYPE',
  'BD_SERVICE_VARIANT_METHOD',
  'BD_DIAGNOSIS_DOMAIN', 'BD_DISEASE_MANAGEMENT_TYPE', 'BD_DISEASE_TRIGGER_ACTION',
] as const

export const today = () => new Date().toISOString().slice(0, 10)

export const SERVICE_SUBTYPE_MAP: Record<string, string> = {
  IMMUNOASSAY: '免疫检测',
  BIOCHEMISTRY: '生化检测',
  HEMATOLOGY: '血液体液检测',
  MICROBIOLOGY: '微生物检测',
  MOLECULAR: '分子生物检测',
  PATHOLOGY: '病理检查',
  RADIOGRAPHY: '普通放射 (DR)',
  CT: '计算机断层扫描 (CT)',
  MRI: '磁共振成像 (MRI)',
  ULTRASOUND: '超声检查',
  ENDOSCOPY: '内镜检查',
  ECG: '心电图',
  OUTPATIENT_VISIT: '门诊诊查',
  EMERGENCY_VISIT: '急诊诊查',
  INPATIENT_VISIT: '住院诊查',
  NEBULIZATION: '雾化治疗',
  DRESSING: '创面换药',
  INJECTION: '注射处置',
  PHYSIOTHERAPY: '物理治疗',
  BED_DAY: '按日床位',
  GENERAL: '常规项目',
}

export function accountingCategoryLabel(category?: string, categoryText?: string | null) {
  return categoryText?.trim() || category || ''
}

export const SERVICE_DUPLICATE_RULE_MAP: Record<string, string> = {
  SAME_DAY: '当日不重复',
  ALLOW: '允许重复',
  WARN: '提醒后允许',
  BLOCK: '禁止重复',
  INTERVAL: '间隔限制',
}

export function serviceSubtypeLabel(subtype?: string) {
  if (!subtype) return ''
  return SERVICE_SUBTYPE_MAP[subtype] || subtype
}

export function serviceDuplicateRuleLabel(rule?: string, fallbackText?: string) {
  if (rule && SERVICE_DUPLICATE_RULE_MAP[rule]) return SERVICE_DUPLICATE_RULE_MAP[rule]
  if (fallbackText && SERVICE_DUPLICATE_RULE_MAP[fallbackText]) return SERVICE_DUPLICATE_RULE_MAP[fallbackText]
  return fallbackText || (rule ? SERVICE_DUPLICATE_RULE_MAP[rule] || rule : '')
}

export function serviceTypeTone(serviceType: string): 'info' | 'success' | 'warning' | 'neutral' {
  switch (serviceType) {
    case 'LABORATORY': return 'info'
    case 'EXAMINATION': return 'info'
    case 'TREATMENT': return 'success'
    case 'SURGERY': return 'warning'
    default: return 'neutral'
  }
}

export function DataFormDialog({ title, eyebrow, description, size = 'wide', className, onClose, onSubmit, children }: {
  title: string; eyebrow: string; description?: string; size?: 'wide' | 'xwide'
  className?: string
  onClose: () => void; onSubmit: (form: FormData) => void | Promise<unknown>; children: ReactNode
}) {
  const pending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  return <Dialog title={title} eyebrow={eyebrow} description={description} size={size} className={className} onClose={() => { if (!pending.current) onClose() }}>
    <form className="master-data-dialog-form" onSubmit={async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (pending.current) return
      const form = new FormData(event.currentTarget)
      pending.current = true; setSaving(true); setSaveError('')
      try { await onSubmit(form) } catch (error) { setSaveError(errorMessage(error)) }
      finally { pending.current = false; setSaving(false) }
    }}><fieldset className="master-data-dialog-fields" disabled={saving}>{children}</fieldset>{saveError && <p role="alert">{saveError}</p>}
    <div className="ui-form-actions"><Button variant="secondary" disabled={saving} onClick={onClose}>取消</Button>
    <Button type="submit" disabled={saving}>{saving ? '正在保存…' : '保存'}</Button></div></form></Dialog>
}

export function FormSection({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <section className="master-data-form-section"><header><h3>{title}</h3><p>{description}</p></header>{children}</section>
}

export function FormGrid({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 | 4 }) {
  return <div className={`master-data-form-grid master-data-form-grid--${columns}`}>{children}</div>
}

export function DateRangeFields({ fromName, toName, fromLabel, toLabel, fromDefault, toDefault,
  required = true }: { fromName: string; toName: string; fromLabel: string; toLabel: string;
  fromDefault?: string; toDefault?: string; required?: boolean }) {
  const [from, setFrom] = useState(fromDefault ?? (required ? today() : ''))
  return <><FormField label={fromLabel} required={required}><input name={fromName} type="date" value={from}
    onChange={(event) => setFrom(event.target.value)} required={required} /></FormField>
    <FormField label={toLabel}><input name={toName} type="date" defaultValue={toDefault} min={from || undefined} /></FormField></>
}

export function Checkboxes({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  return <fieldset className={`master-data-checkboxes ${className ?? 'span-2'}`.trim()}><legend>{title}</legend><div>{children}</div></fieldset>
}

export function Checkbox({ name, label, defaultChecked = false, checked: checkedValue, onChange, disabled = false }: { name: string; label: string;
  defaultChecked?: boolean; checked?: boolean; onChange?: (checked: boolean) => void; disabled?: boolean }) {
  return <label><input type="checkbox" name={name} defaultChecked={checkedValue === undefined ? defaultChecked : undefined}
    checked={checkedValue} onChange={onChange ? (event) => onChange(event.target.checked) : undefined}
    disabled={disabled} />{label}</label>
}

export function SelectField({ name, label, values = [], defaultValue, disabled = false, required = true, placeholder }: { name: string; label: string;
  values?: DictionaryValue[]; defaultValue?: string; disabled?: boolean; required?: boolean; placeholder?: string }) {
  return <StaticSelectField name={name} label={label} defaultValue={defaultValue ?? (required ? values[0]?.code : undefined)}
    disabled={disabled} required={required} placeholder={placeholder} options={values.map((item) => ({ value: item.code, label: item.name }))} />
}

export function StaticSelectField({ name, label, options: values, defaultValue, disabled = false, required = true,
  placeholder = '请选择', searchable = true, className }: { name: string; label: string; options: Array<{ value: string; label: string }>;
  defaultValue?: string; disabled?: boolean; required?: boolean; placeholder?: string; searchable?: boolean; className?: string }) {
  const [value, setValue] = useState(defaultValue ?? '')
  return <FormField label={label} required={required} className={className}><StaticSelectControl name={name} value={value}
    onChange={setValue} options={values} placeholder={placeholder} disabled={disabled} required={required}
    searchable={searchable} /></FormField>
}

export function StaticSelectControl({ id, name, className, value, onChange, options: values, placeholder, disabled, required,
  searchable = true, 'aria-describedby': ariaDescribedBy, 'aria-invalid': ariaInvalid, 'aria-required': ariaRequired }: {
  id?: string; name: string; className?: string; value: string; onChange: (value: string) => void
  options: Array<{ value: string; label: string }>; placeholder: string; disabled: boolean; required: boolean; searchable?: boolean
  'aria-describedby'?: string; 'aria-invalid'?: boolean | 'false' | 'true'; 'aria-required'?: boolean | 'false' | 'true'
}) {
  return <div className="master-data-select-field">
    {disabled && <input type="hidden" name={name} value={value} />}
    <Select id={id} name={disabled ? undefined : name} className={className} value={value} onChange={onChange}
      options={values} placeholder={placeholder} disabled={disabled} clearable={!required}
      searchable={searchable}
      aria-describedby={ariaDescribedBy} aria-invalid={ariaInvalid} aria-required={ariaRequired} />
  </div>
}

export function Table({ headers, children, compact = false, footer, className = '' }: {
  headers: string[]; children: ReactNode; compact?: boolean; footer?: ReactNode; className?: string
}) {
  return <TableShell scrollClassName="master-data-table-wrap" footer={footer}>
    <DataTable className={`master-data-table ${className}`.trim()} compact={compact}>
      <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody>
    </DataTable>
  </TableShell>
}

export function RowActions({ children }: { children: ReactNode }) { return <div className="master-data-row-actions">{children}</div> }

export function DataStatus({ value, text }: { value: MasterDataStatus; text: string }) {
  return <StatusBadge tone={value === 'ACTIVE' ? 'success' : value === 'SUSPENDED' ? 'warning' : 'neutral'}>{text}</StatusBadge>
}

export function attributeDataTypeLabel(value: ItemAttributeSchema['dataType']) {
  return ({ TEXT: '文本', BOOLEAN: '布尔', INTEGER: '整数', DECIMAL: '小数', ENUM: '枚举',
    DICT_REF: '字典引用', DATE: '日期', DATETIME: '日期时间', DURATION: '时长',
    TERM_REF: '术语引用', OBJECT: '结构化对象' } as Record<string, string>)[value] ?? value
}

export function Flag({ value, label }: { value: boolean; label: string }) { return <StatusBadge tone={value ? 'success' : 'neutral'}>{value ? label : `不可${label.slice(1)}`}</StatusBadge> }

export function options(values: DictionaryMap | undefined, code: string) {
  return (values?.[code] ?? []).map((item) => ({ value: item.code, label: item.name }))
}

export function text(form: FormData, name: string) { return String(form.get(name) ?? '').trim() }

export function optionalText(form: FormData, name: string) { const value = text(form, name); return value || undefined }

export function optionalNumber(form: FormData, name: string) { const value = text(form, name); return value ? Number(value) : undefined }

export function checked(form: FormData, name: string) { return form.get(name) === 'on' }
