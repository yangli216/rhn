import { zodResolver } from '@hookform/resolvers/zod'
import { forwardRef, useImperativeHandle, useState } from 'react'
import { useFieldArray, useForm, type FieldPath, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { ORGANIZATION_DICTIONARY, type DictionaryValue, type OrganizationProfileInput, type OrganizationProfileResult,
  type OrganizationUnit, type PersonnelAssignment } from '../../shared/rhnApi'
import { Alert, Button, FormField, FormSelect, PanelHead } from '../../shared/ui'
import { PROFILE_SECTIONS, profileRecords } from './OrganizationProfileRecords'
import { blankProfile, draftFromProfile, profileInput, profileSchema, type ProfileForm } from './organizationProfileForm'
import { profileDictionaryCodes, requireProfileDictionarySelection } from './organizationDictionaryFacts'

export type ProfileChangeDraft = { id?: string; input: OrganizationProfileInput; status: string }
export type ProfileEditorHandle = { changes: () => Promise<ProfileChangeDraft[] | undefined> }
const editorSchema = z.object({ rows: z.array(z.object({ recordId: z.string().optional(), data: profileSchema })) })
type EditorForm = z.infer<typeof editorSchema>
type Props = { profile: OrganizationProfileResult; unit: OrganizationUnit; units: OrganizationUnit[]; assignments: PersonnelAssignment[];
  dictionaries: Map<string, DictionaryValue[]>; disabled: boolean }

export const OrganizationProfileEditor = forwardRef<ProfileEditorHandle, Props>(function OrganizationProfileEditor({ profile, unit, units, assignments, dictionaries, disabled }, ref) {
  const originals = profileRecords(profile)
  const form = useForm<EditorForm>({ resolver: zodResolver(editorSchema), defaultValues: {
    rows: originals.map(row => ({ recordId: row.id, data: draftFromProfile(row, blankProfile(row.input.section)) })),
  } })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'rows' })
  const [history, setHistory] = useState(false)
  const [error, setError] = useState('')
  const department = unit.sdOrgKind === 'ORG_UNIT'
  const sections = (['capability', 'identifier', 'contact', 'address', 'responsibility', 'relation'] as const)
    .filter(section => !department || !['identifier', 'address'].includes(section))
  const rows = form.watch('rows')
  useImperativeHandle(ref, () => ({ changes: async () => {
    setError('')
    if (!await form.trigger()) { setHistory(true); setError('请检查各分区的必填项和有效期。'); return undefined }
    const changes = form.getValues().rows.flatMap(row => {
      const input = profileInput(row.data)
      const original = originals.find(old => old.id === row.recordId && old.input.section === input.section)
      if (original && JSON.stringify(input) === JSON.stringify(profileInput(draftFromProfile(original, blankProfile(input.section)))) && original.status === row.data.status) return []
      return [{ id: row.recordId, input, status: row.data.status }]
    })
    try { changes.forEach(row => requireProfileDictionarySelection(row.input, unit, dictionaries)); return changes }
    catch (failure) { setError(failure instanceof Error ? failure.message : '请重新加载资料选项'); return undefined }
  } }))
  const today = new Date().toLocaleDateString('sv-SE')
  return <div className="organization-profile-editor">
    <div className="ui-query-filters"><p>各项资料在本页直接维护，修改后统一保存。确认结果直接填写，无需提交或审批。</p>
      <label className="master-check"><input type="checkbox" checked={history} onChange={event => setHistory(event.target.checked)} />含待生效、已结束与作废记录</label></div>
    {error && <Alert>{error}</Alert>}
    {sections.map(section => {
      const dictionariesReady = profileDictionaryCodes(section, department).every(code => Boolean(dictionaries.get(code)?.length))
      const indices = fields.flatMap((_field, index) => rows[index]?.data.section === section ? [index] : [])
      const visible = indices.filter(index => { const row = rows[index]; return !row.recordId || history || row.data.status === 'ACTIVE'
        && row.data.validFrom <= today && (!row.data.validTo || row.data.validTo >= today) })
      return <section key={section} aria-label={PROFILE_SECTIONS[section]} className="organization-profile-editor__section">
        <PanelHead title={PROFILE_SECTIONS[section]} actions={<Button type="button" size="sm" variant="secondary" disabled={disabled || !dictionariesReady}
          onClick={() => append({ data: blankProfile(section) })}>新增{PROFILE_SECTIONS[section]}</Button>} />
        {!dictionariesReady && <Alert>本分区的字典选项尚未确认，请重新加载资料选项后再维护。</Alert>}
        {visible.map(index => <ProfileRow key={fields[index].id} index={index} form={form} unit={unit} units={units} assignments={assignments}
          dictionaries={dictionaries} disabled={disabled} onRemove={!rows[index].recordId ? () => remove(index) : undefined} />)}
        {!visible.length && <p>暂无当前有效的{PROFILE_SECTIONS[section]}{indices.length ? '，可勾选查看历史记录' : ''}。</p>}
      </section>
    })}
  </div>
})

function ProfileRow({ index, form, unit, units, assignments, dictionaries, disabled, onRemove }: {
  index: number; form: UseFormReturn<EditorForm>; unit: OrganizationUnit; units: OrganizationUnit[]; assignments: PersonnelAssignment[];
  dictionaries: Map<string, DictionaryValue[]>; disabled: boolean; onRemove?: () => void
}) {
  const value = form.watch(`rows.${index}.data`)
  const section = value.section
  const prefix = `rows.${index}.data` as const
  const { register, control } = form
  const errors = form.formState.errors.rows?.[index]?.data
  const department = unit.sdOrgKind === 'ORG_UNIT'
  const options = (code: string) => (dictionaries.get(code) ?? []).map(item => ({ value: item.code, label: item.name }))
  const text = (name: keyof ProfileForm, label: string, maxLength: number, type = 'text') => <FormField label={label} error={errors?.[name]?.message}>
    <input type={type} maxLength={maxLength} {...register(`${prefix}.${name}` as FieldPath<EditorForm>)} /></FormField>
  return <fieldset disabled={disabled} className="organization-profile-editor__row" aria-label={`${PROFILE_SECTIONS[section]}记录`}>
    <div className="master-form master-form--unit">
      <FormField label={section === 'capability' ? '能力类型' : section === 'identifier' ? '标识类型' : section === 'contact' ? '联系方式类型'
        : section === 'address' ? '地址类型' : section === 'relation' ? '关系类型' : '负责人类型'} required error={errors?.dictionaryType?.message}>
        <FormSelect control={control} name={`${prefix}.dictionaryType`} clearable={false} options={options(profileDictionaryCodes(section, department)[0])} />
      </FormField>
      {section === 'capability' && <>{text('firstCode', '资质依据编码', 128)}
        <FormField label="确认结果" required error={errors?.verifyStatus?.message}><FormSelect control={control} name={`${prefix}.verifyStatus`} clearable={false}
          options={options(ORGANIZATION_DICTIONARY.verifyStatus)} /></FormField>
        <FormField label="能力范围说明" className="master-form__span-3"><textarea maxLength={1000} rows={2} {...register(`${prefix}.description`)} /></FormField></>}
      {section === 'identifier' && <>{text('firstCode', '标识体系 URI', 300)}{text('secondCode', '标识编码', 128)}
        <FormField label="签发机构"><FormSelect control={control} name={`${prefix}.targetOrganizationId`}
          options={units.filter(item => item.sdOrgKind === 'LEGAL_ORGANIZATION').map(item => ({ value: item.id, label: item.name }))} /></FormField>
        <FormField label="确认结果" required error={errors?.verifyStatus?.message}><FormSelect control={control} name={`${prefix}.verifyStatus`} clearable={false}
          options={options(ORGANIZATION_DICTIONARY.verifyStatus)} /></FormField></>}
      {section === 'contact' && <>{text('firstCode', '联系方式', 300)}
        <FormField label="使用场景" required error={errors?.dictionaryUse?.message}><FormSelect control={control} name={`${prefix}.dictionaryUse`}
          options={options(ORGANIZATION_DICTIONARY.contactUse)} /></FormField>
        <FormField label="展示顺序"><input type="number" min="0" {...register(`${prefix}.sortOrder`, { valueAsNumber: true })} /></FormField></>}
      {section === 'address' && <>{text('firstCode', '国家代码', 8)}{text('thirdCode', '省级行政区代码', 32)}{text('fourthCode', '市级行政区代码', 32)}
        {text('fifthCode', '区县行政区代码', 32)}{text('sixthCode', '邮政编码', 32)}{text('secondCode', '详细地址', 500)}</>}
      {section === 'relation' && <><FormField label={department ? '目标科室' : '目标机构'} required error={errors?.targetOrganizationId?.message}>
        <FormSelect control={control} name={`${prefix}.targetOrganizationId`} options={units.filter(item => item.id !== unit.id && item.sdOrgKind === unit.sdOrgKind)
          .map(item => ({ value: item.id, label: item.name, secondaryText: item.code }))} /></FormField>
        <FormField label="关系说明"><textarea maxLength={1000} {...register(`${prefix}.description`)} /></FormField></>}
      {section === 'responsibility' && <><FormField label="负责人来源"><FormSelect control={control} name={`${prefix}.responsibilitySubject`} clearable={false}
        options={[{ value: 'internal', label: '内部任职人员' }, { value: 'external', label: '外部负责人' }]} /></FormField>
        {value.responsibilitySubject === 'internal' ? <FormField label="内部负责人" required error={errors?.assignmentId?.message}><FormSelect control={control} name={`${prefix}.assignmentId`}
          options={assignments.filter(item => item.sdPersonnelStatus === 'ACTIVE' && (department ? item.departmentId === unit.id : item.organizationId === unit.id))
            .map(item => ({ value: item.id, label: `${item.practitionerName} · ${item.departmentName} · ${item.positionName}` }))} /></FormField> : text('firstCode', '外部负责人姓名', 100)}</>}
      {text('validFrom', '生效日期', 10, 'date')}{text('validTo', '结束日期', 10, 'date')}
      <FormField label="记录状态"><FormSelect control={control} name={`${prefix}.status`} clearable={false}
        options={[{ value: 'ACTIVE', label: '启用' }, { value: 'INACTIVE', label: '作废（保留历史）' }]} /></FormField>
      {!['capability', 'address'].includes(section) && <label className="master-check"><input type="checkbox" {...register(`${prefix}.primary`)} />主要记录</label>}
      {onRemove && <Button type="button" size="sm" variant="text" onClick={onRemove}>移除此新增记录</Button>}
    </div>
  </fieldset>
}
