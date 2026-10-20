import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ORGANIZATION_DICTIONARY, ORGANIZATION_SYSTEM_ENUM, systemEnumItems, type DictionaryValue, type OrganizationUnit,
  type SystemEnumDefinition } from '../../../shared/rhnApi'
import { Alert, Button, DatePicker, Dialog, FormField, FormSelect, Switch } from '../../../shared/ui'
import { unitOptionsAvailable } from '../organizationFormOptions'
import { departmentOwner, departmentStructure } from '../organizationUnitReceipt'
import { LEGAL_ORGANIZATION_TYPES, TIMEZONE_OPTIONS, codeNameOption, departmentTypeOptions, resolveDepartmentTypeText,
  unitFormDefaults, unitSchema, type UnitForm } from './organizationUnitModel'

export type UnitFormTarget = { mode: 'create'; parent?: OrganizationUnit } | { mode: 'edit'; unit: OrganizationUnit }

/** 新建或编辑机构/科室。首层只放运行依据；简称、机构性质、排序和有效期收在「更多设置」。 */
export function UnitFormDialog({ target, units, enums, dictionaries, busy, error, onReload, onClose, onSubmit }: {
  target: UnitFormTarget; units: OrganizationUnit[]; enums?: SystemEnumDefinition[]; dictionaries: Map<string, DictionaryValue[]>
  busy: boolean; error?: string; onReload: () => Promise<unknown>; onClose: () => void; onSubmit: (value: UnitForm) => void
}) {
  const editing = target.mode === 'edit' ? target.unit : undefined
  const parent = target.mode === 'create' ? target.parent : undefined
  const [moreOpen, setMoreOpen] = useState(false)
  const { control, register, handleSubmit, watch, setValue, formState: { errors } } = useForm<UnitForm>({
    resolver: zodResolver(unitSchema), defaultValues: unitFormDefaults(editing, parent),
  })
  const kind = watch('sdOrgKind')
  const department = kind === 'ORG_UNIT'
  const property = watch('sdDepartmentProperty')
  const selectedDepartmentType = watch('sdDepartmentType')
  const optionsReady = unitOptionsAvailable(kind, enums, dictionaries)
  const departmentTypes = dictionaries.get(ORGANIZATION_DICTIONARY.departmentType) ?? []
  const typeOptions = departmentTypeOptions(departmentTypes, departmentStructure(property), property).map(codeNameOption)
  if (selectedDepartmentType && !typeOptions.some(item => item.value === selectedDepartmentType)) {
    typeOptions.push({ value: selectedDepartmentType, label: selectedDepartmentType === editing?.sdDepartmentType
      ? resolveDepartmentTypeText(editing, departmentTypes) : selectedDepartmentType })
  }
  useEffect(() => { if (!department && selectedDepartmentType) setValue('sdDepartmentType', '') }, [department, selectedDepartmentType, setValue])
  const parentOptions = units.filter(item => item.id !== editing?.id && (department || item.sdOrgKind === 'LEGAL_ORGANIZATION')
    && (!editing || !department || departmentOwner(item.id, units) === departmentOwner(editing.id, units)))
    .map(item => ({ value: item.id, label: item.name, secondaryText: item.code }))
  const timezones = [...TIMEZONE_OPTIONS, ...(editing?.timezoneCode && !TIMEZONE_OPTIONS.some(item => item.value === editing.timezoneCode)
    ? [{ value: editing.timezoneCode, label: editing.timezoneCode }] : [])]
  const showMore = moreOpen || Boolean(errors.validFrom || errors.validTo || errors.shortName || errors.sortOrder)
  const title = editing ? `编辑${department ? '科室' : '机构'}` : parent ? '新增下级科室' : '新建机构'
  return <Dialog title={title} eyebrow="机构与科室" onClose={onClose} size="wide" closeOnBackdrop={false}
    footer={<><Button type="button" variant="secondary" disabled={busy} onClick={onClose}>取消</Button>
      <Button type="submit" form="organization-unit-form" busy={busy} disabled={busy || !optionsReady}>保存</Button></>}>
    {!optionsReady && <Alert placement="inline" tone="warning">组织类型与字典选项尚未确认。
      <Button type="button" size="sm" variant="secondary" onClick={() => void onReload()}>重新加载</Button></Alert>}
    {error && <Alert placement="inline">{error}</Alert>}
    <form id="organization-unit-form" className="organization-form" onSubmit={handleSubmit(value => { if (!busy && optionsReady) onSubmit(value) })}>
      <fieldset disabled={busy} className="organization-form__fieldset">
        <div className="organization-form__grid">
          {!editing && <FormField label="组织代码" required hint="字母开头，可使用字母、数字、下划线和短横线；保存后不可修改" error={errors.code?.message}>
            <input {...register('code')} autoFocus /></FormField>}
          <FormField label="名称" required error={errors.name?.message}><input {...register('name')} /></FormField>
          {!editing && <FormField label="组织类别" required error={errors.sdOrgKind?.message}><FormSelect control={control} name="sdOrgKind"
            clearable={false} options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.kind).map(codeNameOption)} /></FormField>}
          {department
            ? <FormField label="业务属性" required hint="决定排班、转科和护理单元识别" error={errors.sdDepartmentProperty?.message}>
              <FormSelect control={control} name="sdDepartmentProperty" clearable={false}
                options={(dictionaries.get(ORGANIZATION_DICTIONARY.departmentProperty) ?? []).map(codeNameOption)} /></FormField>
            : <FormField label="组织结构类型" required error={errors.sdOrgType?.message}><FormSelect control={control} name="sdOrgType" clearable={false}
              options={systemEnumItems(enums, ORGANIZATION_SYSTEM_ENUM.type).filter(item => LEGAL_ORGANIZATION_TYPES.includes(item.code)).map(codeNameOption)} /></FormField>}
          {department && <FormField label="具体科室类型" required hint="决定检验检查执行路由和药房库存场所" error={errors.sdDepartmentType?.message}>
            <FormSelect control={control} name="sdDepartmentType" placeholder="请选择" options={typeOptions} /></FormField>}
          <FormField label="上级组织" required={department} error={errors.parentId?.message}>
            <FormSelect control={control} name="parentId" placeholder="无上级" options={parentOptions} /></FormField>
          {!department && <FormField label="时区"><FormSelect control={control} name="timezoneCode" clearable={false} options={timezones} /></FormField>}
          <FormField label="虚拟组织" hint="不对应独立物理场所；执行科室路由会排除虚拟组织">
            <Switch aria-label="虚拟组织" checked={watch('virtual')} onChange={value => setValue('virtual', value, { shouldDirty: true })}
              checkedText="是" uncheckedText="否" /></FormField>
          <FormField className="organization-form__wide" label="说明" error={errors.description?.message}>
            <textarea rows={2} {...register('description')} /></FormField>
        </div>
        <Button type="button" size="sm" variant="text" aria-expanded={showMore} onClick={() => setMoreOpen(open => !open)}>
          {showMore ? '收起更多设置' : `更多设置（简称、${department ? '' : '机构性质、'}排序、有效期）`}</Button>
        {showMore && <div className="organization-form__grid">
          <FormField label="简称" error={errors.shortName?.message}><input {...register('shortName')} /></FormField>
          {!department && <FormField label="机构性质"><FormSelect control={control} name="sdOrgProperty" placeholder="未设置"
            options={(dictionaries.get(ORGANIZATION_DICTIONARY.property) ?? []).map(codeNameOption)} /></FormField>}
          <FormField label="同级排序" error={errors.sortOrder?.message}>
            <input type="number" min="0" {...register('sortOrder', { valueAsNumber: true })} /></FormField>
          <FormField label="生效日期" required error={errors.validFrom?.message}>
            <DatePicker value={watch('validFrom')} onChange={value => setValue('validFrom', value, { shouldDirty: true, shouldValidate: true })} /></FormField>
          <FormField label="结束日期" hint="到期后不再参与排班、开单等业务；停用请使用「停用」操作" error={errors.validTo?.message}>
            <DatePicker clearable value={watch('validTo')} onChange={value => setValue('validTo', value, { shouldDirty: true, shouldValidate: true })} /></FormField>
        </div>}
      </fieldset>
    </form>
  </Dialog>
}
