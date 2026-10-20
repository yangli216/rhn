import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { errorMessage, type DictionaryValue, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, FormField, Select, Switch } from '../../../shared/ui'
import { prescribingSummary, requireQualification, type PractitionerQualification } from './personnelFacts'
import { QUALIFICATION_DICTIONARY } from './usePersonnelOptions'

/** 执业资质单独保存；首次登记不带修订号，之后带当前修订号防止覆盖他人修改。 */
export function QualificationForm({ api, qualification, dictionaries, canManage, onSaved }: {
  api: RhnApi; qualification: PractitionerQualification; dictionaries: Map<string, DictionaryValue[]>; canManage: boolean; onSaved: () => Promise<void>
}) {
  const [value, setValue] = useState({
    title: qualification.sdProfessionalTitle ?? '', category: qualification.sdPracticeCategory ?? '',
    practiceCertificate: qualification.practiceCertificateCode ?? '', qualificationCertificate: qualification.qualificationCertificateCode ?? '',
    insurance: qualification.insurancePractitionerCode ?? '', prescribing: qualification.prescribing,
    narcotic: qualification.narcoticPrescribing, antimicrobial: qualification.sdAntimicrobialLevel ?? '',
  })
  const set = <K extends keyof typeof value>(key: K, next: (typeof value)[K]) => setValue(current => ({ ...current, [key]: next }))
  const options = (code: string) => (dictionaries.get(code) ?? []).map(item => ({ value: item.code, label: item.name }))
  const ready = Object.values(QUALIFICATION_DICTIONARY).every(code => dictionaries.has(code))
  const save = useMutation({
    mutationFn: async () => {
      const saved = requireQualification(await api.organization.saveQualification(qualification.practitionerId, {
        expectedRevision: qualification.revision == null ? undefined : String(qualification.revision),
        sdProfessionalTitle: value.title || undefined, sdPracticeCategory: value.category || undefined,
        practiceCertificateCode: value.practiceCertificate.trim() || undefined, qualificationCertificateCode: value.qualificationCertificate.trim() || undefined,
        insurancePractitionerCode: value.insurance.trim() || undefined, prescribing: value.prescribing,
        narcoticPrescribing: value.prescribing && value.narcotic, sdAntimicrobialLevel: value.prescribing && value.antimicrobial ? value.antimicrobial : undefined,
      }), qualification.practitionerId)
      if (!saved.registered || saved.prescribing !== value.prescribing || (saved.sdProfessionalTitle ?? '') !== value.title) throw new Error('执业资质保存结果未确认，请重新加载核实')
      return saved
    },
    onSuccess: () => onSaved(),
  })
  if (!canManage) return <dl className="personnel-facts">{([
    ['职称', qualification.sdProfessionalTitleText], ['执业类别', qualification.sdPracticeCategoryText],
    ['执业证书编码', qualification.practiceCertificateCode], ['资格证书编码', qualification.qualificationCertificateCode],
    ['医保医师编码', qualification.insurancePractitionerCode], ['处方权', prescribingSummary(qualification)],
  ] as const).map(([label, text]) => <div key={label} className="personnel-facts__item"><dt>{label}</dt><dd>{text || '未登记'}</dd></div>)}</dl>
  return <form className="personnel-qualification" aria-label="执业资质表单" onSubmit={event => { event.preventDefault(); save.mutate() }}>
    {!qualification.registered && <p className="personnel-hint">尚未登记执业资质。未登记不等于无处方权，开单校验接入前请先补齐。</p>}
    {!ready && <Alert placement="inline" tone="warning">职称、执业类别或抗菌药物级别选项尚未加载。</Alert>}
    {save.error && <Alert placement="inline">保存未完成：{errorMessage(save.error)}</Alert>}
    <fieldset disabled={save.isPending} className="personnel-qualification__grid">
      <FormField label="职称"><Select value={value.title} onChange={next => set('title', next)} placeholder="未评定" options={options(QUALIFICATION_DICTIONARY.professionalTitle)} /></FormField>
      <FormField label="执业类别"><Select value={value.category} onChange={next => set('category', next)} placeholder="未登记" options={options(QUALIFICATION_DICTIONARY.practiceCategory)} /></FormField>
      <FormField label="医保医师编码"><input maxLength={64} value={value.insurance} onChange={event => set('insurance', event.target.value)} /></FormField>
      <FormField label="执业证书编码"><input maxLength={64} value={value.practiceCertificate} onChange={event => set('practiceCertificate', event.target.value)} /></FormField>
      <FormField label="资格证书编码"><input maxLength={64} value={value.qualificationCertificate} onChange={event => set('qualificationCertificate', event.target.value)} /></FormField>
      <div />
      <FormField label="普通处方权"><Switch aria-label="普通处方权" checked={value.prescribing} checkedText="有" uncheckedText="无"
        onChange={next => setValue(current => ({ ...current, prescribing: next, ...(next ? {} : { narcotic: false, antimicrobial: '' }) }))} /></FormField>
      <FormField label="麻醉与第一类精神药品处方权" hint="需先具有普通处方权"><Switch aria-label="麻醉与第一类精神药品处方权" checked={value.narcotic} disabled={!value.prescribing}
        checkedText="有" uncheckedText="无" onChange={next => set('narcotic', next)} /></FormField>
      <FormField label="抗菌药物处方级别" hint="需先具有普通处方权；级别越高可开具的抗菌药物范围越大">
        <Select value={value.antimicrobial} disabled={!value.prescribing} onChange={next => set('antimicrobial', next)} placeholder="无"
          options={options(QUALIFICATION_DICTIONARY.antimicrobialLevel)} /></FormField>
    </fieldset>
    <div className="personnel-qualification__footer">
      <Button type="submit" busy={save.isPending} disabled={save.isPending || !ready}>保存执业资质</Button>
    </div>
  </form>
}
