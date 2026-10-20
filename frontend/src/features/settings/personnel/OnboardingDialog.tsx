import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems, type PractitionerGender, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DatePicker, Dialog, FormField, Select } from '../../../shared/ui'
import { departmentOwner } from '../organizationUnitReceipt'
import { requireOnboardedPractitioner } from '../practitionerOnboarding'
import type { usePersonnelOptions } from './usePersonnelOptions'

/** 办理入职一次建立人员档案、聘用和主任职；执业资质在入职后打开的档案中填写。 */
export function OnboardingDialog({ api, options, onClose, onDone }: {
  api: RhnApi; options: ReturnType<typeof usePersonnelOptions>; onClose: () => void; onDone: (practitionerId: string, message: string) => Promise<void>
}) {
  const units = options.units.data ?? []
  const organizations = units.filter(unit => unit.sdOrgKind === 'LEGAL_ORGANIZATION' && unit.sdOrgStatus === 'ACTIVE')
  const [value, setValue] = useState({ code: '', fullName: '', gender: '', organizationId: organizations.length === 1 ? organizations[0].id : '',
    departmentId: '', positionId: '', hireDate: new Date().toLocaleDateString('sv-SE') })
  const [validation, setValidation] = useState('')
  const set = (key: keyof typeof value, next: string) => setValue(current => ({ ...current, [key]: next, ...(key === 'organizationId' ? { departmentId: '' } : {}) }))
  const genders = systemEnumItems(options.enums, ORGANIZATION_SYSTEM_ENUM.gender).map(item => ({ value: item.code, label: item.name }))
  const departments = units.filter(unit => unit.sdOrgKind === 'ORG_UNIT' && unit.sdOrgStatus === 'ACTIVE' && departmentOwner(unit.id, units) === value.organizationId)
    .map(unit => ({ value: unit.id, label: unit.name, secondaryText: unit.code }))
  const positions = (options.positions.data ?? []).filter(item => item.sdPersonnelStatus === 'ACTIVE').map(item => ({ value: item.id, label: item.name }))
  const ready = options.unitsReady && options.positions.isSuccess && genders.length > 0
  const onboard = useMutation({
    mutationFn: async () => {
      const input = { code: value.code.trim(), fullName: value.fullName.trim(), sdPractGender: value.gender as PractitionerGender,
        organizationId: value.organizationId, departmentId: value.departmentId, positionId: value.positionId, hireDate: value.hireDate }
      return requireOnboardedPractitioner(await api.organization.onboardPractitioner(input), input)
    },
    onSuccess: person => onDone(person.id, `${person.fullName}已入职，请补充执业资质`),
  })
  const submit = () => {
    setValidation('')
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.code.trim())) { setValidation('工号须以字母开头，只能使用字母、数字、下划线和短横线'); return }
    if (Object.values(value).some(item => !item.trim())) { setValidation('请完整填写必填项'); return }
    onboard.mutate()
  }
  return <Dialog title="办理入职" eyebrow="人员管理" size="wide" closeOnBackdrop={false} onClose={() => { if (!onboard.isPending) onClose() }}
    footer={<><Button variant="secondary" disabled={onboard.isPending} onClick={onClose}>取消</Button>
      <Button busy={onboard.isPending} disabled={!ready} onClick={submit}>确认入职</Button></>}>
    {!ready && <Alert placement="inline" tone="warning">组织、岗位或性别选项尚未加载。<Button size="sm" variant="secondary" onClick={() => void options.reloadAll()}>重新加载</Button></Alert>}
    {(validation || onboard.error) && <Alert placement="inline">{validation || `入职未完成：${errorMessage(onboard.error)}`}</Alert>}
    <fieldset disabled={onboard.isPending} className="personnel-action-form">
      <FormField label="工号" required><input maxLength={64} value={value.code} onChange={event => set('code', event.target.value)} /></FormField>
      <FormField label="姓名" required><input maxLength={100} value={value.fullName} onChange={event => set('fullName', event.target.value)} /></FormField>
      <FormField label="性别" required><Select value={value.gender} onChange={next => set('gender', next)} options={genders} /></FormField>
      <FormField label="入职日期" required><DatePicker value={value.hireDate} onChange={next => set('hireDate', next)} /></FormField>
      <FormField label="机构" required><Select value={value.organizationId} onChange={next => set('organizationId', next)}
        options={organizations.map(unit => ({ value: unit.id, label: unit.name }))} /></FormField>
      <FormField label="科室" required><Select value={value.departmentId} onChange={next => set('departmentId', next)} options={departments} /></FormField>
      <FormField label="岗位" required><Select value={value.positionId} onChange={next => set('positionId', next)} options={positions} /></FormField>
    </fieldset>
  </Dialog>
}
