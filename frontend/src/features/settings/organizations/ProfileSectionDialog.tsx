import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useFieldArray, useForm, type FieldPath, type UseFormReturn } from 'react-hook-form'
import { z } from 'zod'
import { ORGANIZATION_DICTIONARY, type DictionaryValue, type OrganizationProfileInput, type OrganizationProfileResult,
  type OrganizationProfileSection, type OrganizationUnit, type PersonnelAssignment } from '../../../shared/rhnApi'
import { Alert, Button, Dialog, EditableCell, EditableRow, EditableTable, FormField, FormSelect, GridAddressInput,
  type GridAddressInputProps } from '../../../shared/ui'
import { profileDictionaryCodes, requireProfileDictionarySelection } from '../organizationDictionaryFacts'
import { blankProfile, draftFromProfile, profileInput, profileSchema, type ProfileForm } from '../organizationProfileForm'
import { PROFILE_SECTIONS, profileRecords } from '../OrganizationProfileRecords'
import { currentRecord } from './organizationUnitModel'

export type ProfileChange = { id?: string; input: OrganizationProfileInput; status: string }
const editorSchema = z.object({ rows: z.array(z.object({ recordId: z.string().optional(), data: profileSchema })) })
type EditorForm = z.infer<typeof editorSchema>
type Option = { value: string; label: string }
const RESPONSIBILITY_SOURCES: Option[] = [{ value: 'internal', label: '内部任职人员' }, { value: 'external', label: '外部负责人' }]
const firstCode = (items?: DictionaryValue[]) => [...(items ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0]?.code
const labelOf = (options: Option[], value: string) => options.find(item => item.value === value)?.label ?? ''

/**
 * 维护一个分区的当前有效记录。新增记录以当天生效；移除已保存记录即作废（保留历史）。
 * 隐藏的用途、地址类型等字段默认取字典首项，已保存记录保持原值。
 */
export function ProfileSectionDialog({ section, unit, profile, assignments, dictionaries, addressApi, busy, error, onReload, onClose, onSubmit }: {
  section: OrganizationProfileSection; unit: OrganizationUnit; profile: OrganizationProfileResult; assignments: PersonnelAssignment[]
  dictionaries: Map<string, DictionaryValue[]>; addressApi: GridAddressInputProps['api']; busy: boolean; error?: string
  onReload: () => Promise<unknown>; onClose: () => void; onSubmit: (changes: ProfileChange[]) => void
}) {
  const department = unit.sdOrgKind === 'ORG_UNIT'
  const [originals] = useState(() => profileRecords(profile).filter(row => row.input.section === section && currentRecord({ ...row.input, sdDetailStatus: row.status })))
  const form = useForm<EditorForm>({ resolver: zodResolver(editorSchema), defaultValues: {
    rows: originals.map(row => ({ recordId: row.id, data: draftFromProfile(row, blankProfile(section)) })),
  } })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'rows' })
  const [message, setMessage] = useState('')
  const rows = form.watch('rows')
  const codes = profileDictionaryCodes(section, department)
  const ready = codes.every(code => Boolean(dictionaries.get(code)?.length))
  const add = () => append({ data: blankProfile(section, {
    dictionaryType: firstCode(dictionaries.get(codes[0])), dictionaryUse: section === 'contact' ? firstCode(dictionaries.get(codes[1])) : undefined,
  }) })
  const removeRow = (index: number) => {
    if (!rows[index].recordId) remove(index)
    else form.setValue(`rows.${index}.data.status`, 'INACTIVE', { shouldDirty: true })
  }
  const visible = fields.flatMap((_field, index) => rows[index]?.data.status === 'ACTIVE' ? [index] : [])
  const submit = async () => {
    setMessage('')
    if (!await form.trigger()) { setMessage('请补全带红色提示的必填项。'); return }
    const changes = form.getValues().rows.flatMap(row => {
      const input = profileInput(row.data)
      const original = originals.find(old => old.id === row.recordId)
      if (original && JSON.stringify(input) === JSON.stringify(profileInput(draftFromProfile(original, blankProfile(section))))
        && original.status === row.data.status) return []
      if (!original && row.data.status !== 'ACTIVE') return []
      return [{ id: row.recordId, input, status: row.data.status }]
    })
    if (!changes.length) { onClose(); return }
    try { changes.forEach(row => requireProfileDictionarySelection(row.input, unit, dictionaries)) }
    catch (failure) { setMessage(failure instanceof Error ? failure.message : '字典选项已变化，请重新选择'); return }
    onSubmit(changes)
  }
  const props = { form, unit, assignments, dictionaries, indices: visible, onRemove: removeRow, onAppend: add }
  return <Dialog title={`维护${PROFILE_SECTIONS[section]}`} eyebrow={unit.name} onClose={onClose} size="wide" closeOnBackdrop={false}
    actions={<Button type="button" size="sm" variant="secondary" disabled={busy || !ready} onClick={add}>新增{PROFILE_SECTIONS[section]}</Button>}
    footer={<><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button type="button" busy={busy} disabled={busy || !ready} onClick={() => void submit()}>保存</Button></>}>
    {!ready && <Alert placement="inline" tone="warning">字典选项尚未确认。
      <Button type="button" size="sm" variant="secondary" onClick={() => void onReload()}>重新加载</Button></Alert>}
    {(message || error) && <Alert placement="inline">{message || error}</Alert>}
    <fieldset disabled={busy} className="organization-form__fieldset">
      {!visible.length ? <p className="organization-section__empty">暂无{PROFILE_SECTIONS[section]}，点击“新增{PROFILE_SECTIONS[section]}”添加。</p>
        : section === 'address' ? <AddressRows {...props} addressApi={addressApi} /> : <SectionTable section={section} {...props} />}
    </fieldset>
    <p className="organization-section__hint">新增记录自保存当天生效；移除已保存的记录会作废并保留历史，可在「变更记录」查看。</p>
  </Dialog>
}

type RowsProps = { form: UseFormReturn<EditorForm>; unit: OrganizationUnit; assignments: PersonnelAssignment[]
  dictionaries: Map<string, DictionaryValue[]>; indices: number[]; onRemove: (index: number) => void; onAppend: () => void }

function rowIssue(form: UseFormReturn<EditorForm>, index: number) {
  return Object.values(form.formState.errors.rows?.[index]?.data ?? {}).map(item => (item as { message?: string })?.message).find(Boolean)
}

function SectionTable({ section, form, unit, assignments, dictionaries, indices, onRemove, onAppend }: RowsProps & { section: OrganizationProfileSection }) {
  const department = unit.sdOrgKind === 'ORG_UNIT'
  const { control, register } = form
  const options = (code: string) => (dictionaries.get(code) ?? []).map(item => ({ value: item.code, label: item.name }))
  const typeOptions = options(profileDictionaryCodes(section, department)[0])
  const verifyOptions = options(ORGANIZATION_DICTIONARY.verifyStatus)
  const assignmentOptions = assignments.filter(item => item.sdPersonnelStatus === 'ACTIVE' && (department ? item.departmentId === unit.id : item.organizationId === unit.id))
    .map(item => ({ value: item.id, label: `${item.practitionerName} · ${item.departmentName} · ${item.positionName}` }))
  const path = (index: number, name: keyof ProfileForm) => `rows.${index}.data.${name}` as FieldPath<EditorForm>
  const select = (index: number, name: keyof ProfileForm, label: string, choices: Option[]) =>
    <FormSelect control={control} name={path(index, name)} aria-label={label} clearable={false} options={choices} />
  const text = (index: number, name: keyof ProfileForm, label: string, maxLength: number) =>
    <input className="ui-field__control" aria-label={label} maxLength={maxLength} {...register(path(index, name))} />
  const primary = (index: number, label: string) => <td><input type="checkbox" aria-label={label} {...register(path(index, 'primary'))} /></td>
  const heads: Partial<Record<OrganizationProfileSection, string[]>> = {
    identifier: ['标识类型', '标识编码'], contact: ['联系方式类型', '联系方式', '主要'],
    responsibility: ['负责人来源', '负责人', '职责类型', '主要'], capability: ['能力类型', '能力范围说明', '资质依据编码', '确认结果'],
  }
  return <EditableTable aria-label={`${PROFILE_SECTIONS[section]}列表`} onAppendRow={onAppend}>
    <thead><tr>{heads[section]?.map(head => <th key={head} scope="col">{head}</th>)}<th scope="col" className="ui-table-cell--actions">操作</th></tr></thead>
    <tbody>{indices.map(index => {
      const value = form.watch(`rows.${index}.data`)
      const issue = rowIssue(form, index)
      return <EditableRow key={index}>
        {section === 'identifier' && <>
          <EditableCell display={labelOf(typeOptions, value.dictionaryType)}>{select(index, 'dictionaryType', '标识类型', typeOptions)}</EditableCell>
          <EditableCell display={value.secondCode} placeholder="填写标识编码">{text(index, 'secondCode', '标识编码', 128)}</EditableCell></>}
        {section === 'contact' && <>
          <EditableCell display={labelOf(typeOptions, value.dictionaryType)}>{select(index, 'dictionaryType', '联系方式类型', typeOptions)}</EditableCell>
          <EditableCell display={value.firstCode} placeholder="填写联系方式">{text(index, 'firstCode', '联系方式', 300)}</EditableCell>
          {primary(index, '主要联系方式')}</>}
        {section === 'responsibility' && <>
          <EditableCell display={labelOf(RESPONSIBILITY_SOURCES, value.responsibilitySubject)}>{select(index, 'responsibilitySubject', '负责人来源', RESPONSIBILITY_SOURCES)}</EditableCell>
          {value.responsibilitySubject === 'internal'
            ? <EditableCell display={labelOf(assignmentOptions, value.assignmentId)} placeholder="选择任职人员">{select(index, 'assignmentId', '内部负责人', assignmentOptions)}</EditableCell>
            : <EditableCell display={value.firstCode} placeholder="填写负责人姓名">{text(index, 'firstCode', '外部负责人姓名', 100)}</EditableCell>}
          <EditableCell display={labelOf(typeOptions, value.dictionaryType)}>{select(index, 'dictionaryType', '职责类型', typeOptions)}</EditableCell>
          {primary(index, '主要负责人')}</>}
        {section === 'capability' && <>
          <EditableCell display={labelOf(typeOptions, value.dictionaryType)}>{select(index, 'dictionaryType', '能力类型', typeOptions)}</EditableCell>
          <EditableCell display={value.description} placeholder="选填">{text(index, 'description', '能力范围说明', 1000)}</EditableCell>
          <EditableCell display={value.firstCode} placeholder="选填">{text(index, 'firstCode', '资质依据编码', 128)}</EditableCell>
          <EditableCell display={labelOf(verifyOptions, value.verifyStatus)}>{select(index, 'verifyStatus', '确认结果', verifyOptions)}</EditableCell></>}
        <td className="ui-table-cell--actions">
          <Button type="button" size="sm" variant="text" onClick={() => onRemove(index)}>移除</Button>
          {issue && <small role="alert" className="ui-field__error">{issue}</small>}
        </td>
      </EditableRow>
    })}</tbody>
  </EditableTable>
}

function AddressRows({ form, indices, onRemove, addressApi }: RowsProps & { addressApi: GridAddressInputProps['api'] }) {
  return <>{indices.map(index => {
    const value = form.watch(`rows.${index}.data`)
    const set = (name: 'thirdCode' | 'fourthCode' | 'fifthCode', code?: string) => form.setValue(`rows.${index}.data.${name}`, code ?? '', { shouldDirty: true })
    return <div key={index} className="organization-address-row">
      <div className="ui-field"><span className="ui-field__label">省市区</span>
        <GridAddressInput api={addressApi} levels={3}
          value={{ provinceCode: value.thirdCode || undefined, cityCode: value.fourthCode || undefined, districtCode: value.fifthCode || undefined }}
          onChange={next => { set('thirdCode', next.provinceCode); set('fourthCode', next.cityCode); set('fifthCode', next.districtCode) }} /></div>
      <FormField label="详细地址" required error={rowIssue(form, index)}>
        <input maxLength={500} {...form.register(`rows.${index}.data.secondCode`)} /></FormField>
      <Button type="button" size="sm" variant="text" onClick={() => onRemove(index)}>移除</Button>
    </div>
  })}</>
}
