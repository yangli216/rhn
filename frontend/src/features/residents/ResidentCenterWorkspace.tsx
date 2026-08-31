import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { useState, type ReactNode } from 'react'
import { age, genderLabel } from '../../shared/format'
import type { Resident } from '../../shared/model'
import type {
  CreateResidentInput, ResidentProfile, UpdateResidentProfileInput,
} from '../../shared/api/residentsApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import {
  Alert, BackButton, Button, Dialog, DictionarySelect,
  FormField, GridAddressInput, Icon, LoadingState, ObjectContextBar, PageHeader, Panel, PanelHead,
  PatientIdentitySearch, Select, StatusBadge,
} from '../../shared/ui'

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

export function ResidentCenterWorkspace({ api, onNavigate }: { api: RhnApi; onNavigate: (path: string) => void }) {
  const [selected, setSelected] = useState<Resident | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const queryClient = useQueryClient()
  const profile = useQuery({
    queryKey: ['resident-profile', selected?.id],
    queryFn: () => api.residents.profile(selected!.id),
    enabled: Boolean(selected),
  })

  async function profileUpdated(value: ResidentProfile) {
    setSelected(value.resident)
    setShowEdit(false)
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['resident-profile', value.resident.id] }),
      queryClient.invalidateQueries({ queryKey: ['residents'] }),
    ])
  }

  if (selected) return <>
    <BackButton onClick={() => { setSelected(null); setShowEdit(false) }}>返回居民检索</BackButton>
    <ObjectContextBar avatar={selected.fullName.slice(-1)} eyebrow="统一居民主索引" title={selected.fullName}
      description={`${genderLabel(selected.gender)} · ${age(selected.birthDate)} 岁 · ${selected.maskedNationalId || '无身份证标识'}`}
      facts={[{ label: '健康档案号', value: selected.healthRecordNo }, { label: '联系电话', value: selected.phone || '未登记' }]}
      actions={<><Button variant="secondary" onClick={() => onNavigate(`/outpatient/registration?residentId=${selected.id}`)}>
        <Icon name="clinical" />门诊挂号</Button>
        <Button onClick={() => setShowEdit(true)} disabled={!profile.data}><Icon name="settings" />维护档案</Button></>} />
    {profile.isPending ? <Panel><LoadingState label="正在加载居民档案…" /></Panel> : profile.error
      ? <Alert>{errorMessage(profile.error)}</Alert> : profile.data && <ResidentProfileView profile={profile.data} />}
    {showEdit && profile.data && <ResidentProfileDialog api={api} profile={profile.data}
      onClose={() => setShowEdit(false)} onSaved={profileUpdated} />}
  </>

  return <>
    <PageHeader eyebrow="共享健康内核 · MPI" title="居民中心"
      description="集中完成居民建档、人口学资料、地址、联系人和保障信息维护。"
      actions={<Button onClick={() => setShowCreate(true)}><Icon name="add" />新建居民</Button>} />
    <Panel className="search-panel">
      <PatientIdentitySearch queryKey="resident-center" search={api.residents.search} selected={selected}
        onSelect={setSelected} autoFocus emptyTitle="查找居民档案"
        emptyCopy="支持姓名、身份证、卡号和健康档案号；外部识别方式按接口配置启用。" />
      <div className="search-hint"><span>唯一标识命中后自动回填，姓名查询需从候选列表确认</span><span>居民中心不发起门诊接诊</span></div>
    </Panel>
    {showCreate && <CreateResidentDialog api={api} onClose={() => setShowCreate(false)} onCreated={(resident) => {
      setShowCreate(false); setSelected(resident)
    }} />}
  </>
}

function ResidentProfileView({ profile }: { profile: ResidentProfile }) {
  const { resident, demographicProfile } = profile
  return <div className="resident-profile-grid">
    <Panel><PanelHead title="基本与人口学资料" meta={<StatusBadge tone={resident.deceased ? 'warning' : 'success'}>
      {resident.deceased ? '已登记死亡' : '有效居民'}</StatusBadge>} />
      <dl className="resident-profile-facts">
        <div><dt>姓名</dt><dd>{resident.fullName}</dd></div><div><dt>出生日期</dt><dd>{resident.birthDate}</dd></div>
        <div><dt>国籍代码</dt><dd>{demographicProfile.nationalityCode || '未登记'}</dd></div>
        <div><dt>民族代码</dt><dd>{demographicProfile.ethnicityCode || '未登记'}</dd></div>
        <div><dt>常住类型</dt><dd>{demographicProfile.sdResidencyTypeText || '未登记'}</dd></div>
        <div><dt>婚姻状况</dt><dd>{demographicProfile.sdMaritalStatusText || '未登记'}</dd></div>
        <div><dt>文化程度</dt><dd>{demographicProfile.sdEducationLevelText || '未登记'}</dd></div>
        <div><dt>职业类别</dt><dd>{demographicProfile.sdOccupationTypeText || '未登记'}</dd></div>
        <div><dt>血型</dt><dd>{[demographicProfile.sdBloodTypeText, demographicProfile.sdRhTypeText].filter(Boolean).join(' / ') || '未登记'}</dd></div>
      </dl>
      <div className="resident-profile-list"><article><strong>证件和卡</strong>
        <span>{resident.identifiers.map((item) => `${item.system} ${item.maskedValue}`).join(' · ')}</span></article></div>
    </Panel>
    <Panel><PanelHead title="地址" meta={`${profile.addresses.length} 条`} />
      <div className="resident-profile-list">{profile.addresses.length ? profile.addresses.map((item) => <article key={item.id}>
        <strong>{item.primary ? `主要地址 · ${item.sdUseText}` : item.sdUseText}</strong><span>{item.addressText}</span>
      </article>) : <p>暂未登记地址</p>}</div>
    </Panel>
    <Panel><PanelHead title="联系人与监护人" meta={`${profile.relatedPersons.length} 人`} />
      <div className="resident-profile-list">{profile.relatedPersons.length ? profile.relatedPersons.map((item) => <article key={item.id}>
        <strong>{item.fullName} · {item.sdRelationshipText}</strong><span>{item.phone || '未登记电话'}{item.emergencyContact ? ' · 紧急联系人' : ''}</span>
      </article>) : <p>暂未登记联系人</p>}</div>
    </Panel>
    <Panel><PanelHead title="保障信息" meta={`${profile.coverages.length} 条`} />
      <div className="resident-profile-list">{profile.coverages.length ? profile.coverages.map((item) => <article key={item.id}>
        <strong>{item.payerName}</strong><span>{item.sdCoverageTypeText}{item.memberNo ? ` · ${item.memberNo}` : ''}</span>
      </article>) : <p>暂未登记保障信息</p>}</div>
    </Panel>
    <Panel><PanelHead title="工作单位" meta={`${profile.employments.length} 条`} />
      <div className="resident-profile-list">{profile.employments.length ? profile.employments.map((item) => <article key={item.id}>
        <strong>{item.primary ? `主要单位 · ${item.employerName}` : item.employerName}</strong>
        <span>{[item.sdOccupationTypeText, item.phone, item.addressText].filter(Boolean).join(' · ')}</span>
      </article>) : <p>暂未登记工作单位</p>}</div>
    </Panel>
  </div>
}

function ResidentProfileDialog({ api, profile, onClose, onSaved }: {
  api: RhnApi; profile: ResidentProfile; onClose: () => void; onSaved: (value: ResidentProfile) => void
}) {
  const { control, register, handleSubmit } = useForm<UpdateResidentProfileInput>({
    defaultValues: {
      expectedVersion: profile.resident.version, fullName: profile.resident.fullName,
      gender: profile.resident.gender, birthDate: profile.resident.birthDate, phone: profile.resident.phone ?? '',
      deceased: profile.resident.deceased, deceasedAt: profile.resident.deceasedAt?.slice(0, 16) ?? '',
      demographicProfile: profile.demographicProfile,
      addresses: profile.addresses, relatedPersons: profile.relatedPersons, coverages: profile.coverages,
      employments: profile.employments,
    },
  })
  const addresses = useFieldArray({ control, name: 'addresses' })
  const relatedPersons = useFieldArray({ control, name: 'relatedPersons' })
  const coverages = useFieldArray({ control, name: 'coverages' })
  const employments = useFieldArray({ control, name: 'employments' })
  const save = useMutation({
    mutationFn: (input: UpdateResidentProfileInput) => {
      const { sdResidencyTypeText: _residencyText, sdMaritalStatusText: _maritalText,
        sdEducationLevelText: _educationText, sdOccupationTypeText: _occupationText,
        sdBloodTypeText: _bloodText, sdRhTypeText: _rhText, ...demographicProfile } = input.demographicProfile
      return api.residents.updateProfile(profile.resident.id, {
        ...input, demographicProfile,
        deceasedAt: input.deceased && input.deceasedAt ? new Date(input.deceasedAt).toISOString() : undefined,
        addresses: input.addresses.map(({ id: _id, sdUseText: _text, ...item }) => item),
        relatedPersons: input.relatedPersons.map(({ id: _id, sdRelationshipText: _text, ...item }) => item),
        coverages: input.coverages.map(({ id: _id, sdCoverageTypeText: _text, ...item }) => item),
        employments: input.employments.map(({ id: _id, sdOccupationTypeText: _text, ...item }) => item),
      })
    },
    onSuccess: onSaved,
  })

  return <Dialog title="维护居民档案" eyebrow="居民中心" size="xwide" closeOnBackdrop={false} onClose={onClose}
    description="基本资料与地址、联系人、保障信息一次保存；证件标识仍由主索引流程单独管理。"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="resident-profile-form" busy={save.isPending}>保存档案</Button></>}>
    <form id="resident-profile-form" className="resident-profile-form" onSubmit={handleSubmit((value) => save.mutate(value))}>
      <section><h3>基本资料</h3><div className="ui-form-row">
        <FormField className="ui-field--grow" label="姓名" required><input {...register('fullName')} required /></FormField>
        <FormField label="性别" required><Controller control={control} name="gender" render={({ field }) => <Select
          options={[{ value: 'UNKNOWN', label: '未知' }, { value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]}
          value={field.value} onChange={field.onChange} showValue />}/></FormField>
        <FormField label="出生日期" required><input type="date" {...register('birthDate')} required /></FormField>
        <FormField label="联系电话"><input {...register('phone')} /></FormField>
      </div><div className="ui-form-row">
        <FormField label="国籍代码"><input {...register('demographicProfile.nationalityCode')} placeholder="如 CHN" /></FormField>
        <FormField label="民族代码"><input {...register('demographicProfile.ethnicityCode')} placeholder="如 01" /></FormField>
        <FormField label="常住类型"><Controller control={control} name="demographicProfile.sdResidencyType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RESIDENCY_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="婚姻状况"><Controller control={control} name="demographicProfile.sdMaritalStatus" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_MARITAL_STATUS" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
      </div><div className="ui-form-row">
        <FormField label="文化程度"><Controller control={control} name="demographicProfile.sdEducationLevel" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_EDUCATION_LEVEL" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="职业类别"><Controller control={control} name="demographicProfile.sdOccupationType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="ABO 血型"><Controller control={control} name="demographicProfile.sdBloodType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_BLOOD_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="Rh 血型"><Controller control={control} name="demographicProfile.sdRhType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RH_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <label className="resident-profile-check"><input type="checkbox" {...register('deceased')} />登记死亡</label>
        <FormField label="死亡时间"><input type="datetime-local" {...register('deceasedAt')} /></FormField>
      </div></section>

      <ProfileArraySection title="地址" onAdd={() => addresses.append({ sdUse: 'HOME', addressText: '', primary: addresses.fields.length === 0, validFrom: today() })}>
        {addresses.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField label="地址用途"><Controller control={control} name={`addresses.${index}.sdUse`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_ADDRESS_USE" value={value.value} onChange={value.onChange} />}/></FormField>
          <FormField className="resident-grid-address-field" label="网格地址" required><Controller control={control}
            name={`addresses.${index}`} render={({ field: address }) => <GridAddressInput
              className="resident-grid-address" api={api.gridAddresses} levels={5} required value={address.value}
              onChange={(grid) => address.onChange({ ...address.value, ...grid })} />}/></FormField>
          <FormField className="ui-field--grow" label="详细地址"><input {...register(`addresses.${index}.addressText`)} required /></FormField>
          <FormField label="邮编"><input {...register(`addresses.${index}.postalCode`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`addresses.${index}.primary`)} />主要</label>
          <Button variant="text" onClick={() => addresses.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="工作单位" onAdd={() => employments.append({ employerName: '', sdOccupationType: '', phone: '', postalCode: '', addressText: '', primary: employments.fields.length === 0, validFrom: today() })}>
        {employments.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField className="ui-field--grow" label="单位名称"><input {...register(`employments.${index}.employerName`)} required /></FormField>
          <FormField label="职业类别"><Controller control={control} name={`employments.${index}.sdOccupationType`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={value.value ?? ''} onChange={value.onChange} clearable />}/></FormField>
          <FormField label="单位电话"><input {...register(`employments.${index}.phone`)} /></FormField>
          <FormField className="ui-field--grow" label="单位地址"><input {...register(`employments.${index}.addressText`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`employments.${index}.primary`)} />主要</label>
          <Button variant="text" onClick={() => employments.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="联系人与监护人" onAdd={() => relatedPersons.append({ fullName: '', sdRelationship: 'OTHER', phone: '', addressText: '', guardian: false, emergencyContact: false, validFrom: today() })}>
        {relatedPersons.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField label="姓名"><input {...register(`relatedPersons.${index}.fullName`)} required /></FormField>
          <FormField label="关系"><Controller control={control} name={`relatedPersons.${index}.sdRelationship`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RELATED_PERSON_RELATIONSHIP" value={value.value} onChange={value.onChange} />}/></FormField>
          <FormField label="电话"><input {...register(`relatedPersons.${index}.phone`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.guardian`)} />监护人</label>
          <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.emergencyContact`)} />紧急联系人</label>
          <Button variant="text" onClick={() => relatedPersons.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="保障信息" onAdd={() => coverages.append({ sdCoverageType: 'RESIDENT_BASIC', payerName: '', memberNo: '', primary: coverages.fields.length === 0, validFrom: today() })}>
        {coverages.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField label="保障类型"><Controller control={control} name={`coverages.${index}.sdCoverageType`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="INS_COVERAGE_TYPE" value={value.value} onChange={value.onChange} />}/></FormField>
          <FormField className="ui-field--grow" label="支付方/经办机构"><input {...register(`coverages.${index}.payerName`)} required /></FormField>
          <FormField label="个人编号"><input {...register(`coverages.${index}.memberNo`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`coverages.${index}.primary`)} />主要</label>
          <Button variant="text" onClick={() => coverages.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>
      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
    </form>
  </Dialog>
}

function ProfileArraySection({ title, onAdd, children }: { title: string; onAdd: () => void; children: ReactNode }) {
  return <section><header className="resident-profile-section-head"><h3>{title}</h3>
    <Button size="sm" variant="secondary" onClick={onAdd}><Icon name="add" />新增</Button></header>{children}</section>
}

function CreateResidentDialog({ api, onClose, onCreated }: {
  api: RhnApi; onClose: () => void; onCreated: (resident: Resident) => void
}) {
  const { control, register, handleSubmit, getValues, setValue } = useForm<CreateResidentInput>({
    defaultValues: {
      fullName: '', nationalId: '', gender: 'UNKNOWN', birthDate: '', phone: '',
      identifiers: [{ system: 'NATIONAL_ID', value: '', useType: 'OFFICIAL' }],
      demographicProfile: { nationalityCode: 'CHN', ethnicityCode: '', sdResidencyType: 'UNKNOWN' },
      addresses: [], relatedPersons: [], coverages: [], employments: [],
    },
  })
  const identifiers = useFieldArray({ control, name: 'identifiers' })
  const addresses = useFieldArray({ control, name: 'addresses' })
  const relatedPersons = useFieldArray({ control, name: 'relatedPersons' })
  const coverages = useFieldArray({ control, name: 'coverages' })
  const employments = useFieldArray({ control, name: 'employments' })
  const create = useMutation({ mutationFn: api.residents.create, onSuccess: onCreated })
  function fillFromNationalId(index: number, value: string) {
    if (getValues(`identifiers.${index}.system`) !== 'NATIONAL_ID' || !/^\d{17}[\dXx]$/.test(value)) return
    const rawDate = value.slice(6, 14)
    setValue('birthDate', `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`)
    setValue('gender', Number(value[16]) % 2 === 1 ? 'MALE' : 'FEMALE')
  }

  return <Dialog title="新建居民" eyebrow="居民中心" size="xwide" className="resident-create-dialog" onClose={onClose} closeOnBackdrop={false}
    description="先录入基本信息与证件或卡；其他资料可按需补充，也可建档后维护。"
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="resident-center-create" busy={create.isPending}>保存居民档案</Button></>}>
    <form id="resident-center-create" className="resident-profile-form resident-create-form" onSubmit={handleSubmit((value) => create.mutate(value))}>
      <section><h3>身份与基本信息</h3>
        <div className="ui-form-row resident-create-basics"><FormField label="姓名" required>
          <input {...register('fullName')} autoFocus required maxLength={100} /></FormField>
        <FormField label="性别" required><Controller control={control} name="gender" render={({ field }) => <Select
          options={[{ value: 'UNKNOWN', label: '未知' }, { value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]}
          value={field.value} onChange={field.onChange} showValue />}/></FormField>
        <FormField label="出生日期" required><input type="date" max={today()} {...register('birthDate')} required /></FormField>
          <FormField label="联系电话"><input {...register('phone')} maxLength={32} /></FormField></div>
      </section>

      <ProfileArraySection title="地址信息" onAdd={() => addresses.append({ sdUse: 'HOME', addressText: '', primary: addresses.fields.length === 0, validFrom: today() })}>
        {addresses.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField label="地址用途"><Controller control={control} name={`addresses.${index}.sdUse`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_ADDRESS_USE" value={value.value} onChange={value.onChange} />}/></FormField>
          <FormField className="resident-grid-address-field" label="网格地址" required><Controller control={control}
            name={`addresses.${index}`} render={({ field: address }) => <GridAddressInput
              className="resident-grid-address" api={api.gridAddresses} levels={5} required value={address.value}
              onChange={(grid) => address.onChange({ ...address.value, ...grid })} />}/></FormField>
          <FormField className="ui-field--grow" label="详细地址"><input {...register(`addresses.${index}.addressText`)} required /></FormField>
          <FormField label="邮编"><input {...register(`addresses.${index}.postalCode`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`addresses.${index}.primary`)} />主要</label>
          <Button variant="text" onClick={() => addresses.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="证件和卡" onAdd={() => identifiers.append({ system: 'HEALTH_CARD', value: '', useType: 'SECONDARY' })}>
        {identifiers.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField label="证件/卡类型" required><Controller control={control} name={`identifiers.${index}.system`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_IDENTIFIER_TYPE" value={value.value} onChange={value.onChange} />}/></FormField>
          <FormField className="ui-field--grow" label="证件或卡号" required><input {...register(`identifiers.${index}.value`, {
            onBlur: (event) => fillFromNationalId(index, event.target.value),
          })} required maxLength={200} /></FormField>
          <FormField label="用途"><Controller control={control} name={`identifiers.${index}.useType`} render={({ field: value }) => <Select
            options={[{ value: 'OFFICIAL', label: '正式' }, { value: 'SECONDARY', label: '辅助' }, { value: 'TEMP', label: '临时' }]}
            value={value.value} onChange={value.onChange} />}/></FormField>
          {identifiers.fields.length > 1 && <Button variant="text" onClick={() => identifiers.remove(index)}>移除</Button>}
        </div>)}
        <p className="resident-identifier-hint">录入 18 位身份证后自动带出出生日期和性别，并参与租户内重复识别。</p>
      </ProfileArraySection>

      <ProfileArraySection title="联系人信息" onAdd={() => relatedPersons.append({ fullName: '', sdRelationship: 'OTHER', phone: '', addressText: '', guardian: false, emergencyContact: true, validFrom: today() })}>
        {relatedPersons.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField label="姓名"><input {...register(`relatedPersons.${index}.fullName`)} required /></FormField>
          <FormField label="关系"><Controller control={control} name={`relatedPersons.${index}.sdRelationship`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RELATED_PERSON_RELATIONSHIP" value={value.value} onChange={value.onChange} />}/></FormField>
          <FormField label="电话"><input {...register(`relatedPersons.${index}.phone`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.guardian`)} />监护人</label>
          <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.emergencyContact`)} />紧急联系人</label>
          <Button variant="text" onClick={() => relatedPersons.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>

      <section><h3>其他信息</h3><div className="ui-form-row">
        <FormField label="国籍代码"><input {...register('demographicProfile.nationalityCode')} placeholder="如 CHN" /></FormField>
        <FormField label="民族代码"><input {...register('demographicProfile.ethnicityCode')} placeholder="如 01" /></FormField>
        <FormField label="常住类型"><Controller control={control} name="demographicProfile.sdResidencyType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RESIDENCY_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="婚姻状况"><Controller control={control} name="demographicProfile.sdMaritalStatus" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_MARITAL_STATUS" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
      </div><div className="ui-form-row">
        <FormField label="文化程度"><Controller control={control} name="demographicProfile.sdEducationLevel" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_EDUCATION_LEVEL" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="职业类别"><Controller control={control} name="demographicProfile.sdOccupationType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="ABO 血型"><Controller control={control} name="demographicProfile.sdBloodType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_BLOOD_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        <FormField label="Rh 血型"><Controller control={control} name="demographicProfile.sdRhType" render={({ field }) =>
          <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RH_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
      </div></section>

      <ProfileArraySection title="保障信息" onAdd={() => coverages.append({ sdCoverageType: 'RESIDENT_BASIC', payerName: '', memberNo: '', primary: coverages.fields.length === 0, validFrom: today() })}>
        {coverages.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField label="保障类型"><Controller control={control} name={`coverages.${index}.sdCoverageType`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="INS_COVERAGE_TYPE" value={value.value} onChange={value.onChange} />}/></FormField>
          <FormField className="ui-field--grow" label="支付方/经办机构"><input {...register(`coverages.${index}.payerName`)} required /></FormField>
          <FormField label="个人编号"><input {...register(`coverages.${index}.memberNo`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`coverages.${index}.primary`)} />主要</label>
          <Button variant="text" onClick={() => coverages.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="工作单位" onAdd={() => employments.append({ employerName: '', sdOccupationType: '', phone: '', postalCode: '', addressText: '', primary: employments.fields.length === 0, validFrom: today() })}>
        {employments.fields.map((field, index) => <div className="resident-profile-array-row" key={field.id}>
          <FormField className="ui-field--grow" label="单位名称"><input {...register(`employments.${index}.employerName`)} required /></FormField>
          <FormField label="职业类别"><Controller control={control} name={`employments.${index}.sdOccupationType`} render={({ field: value }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={value.value ?? ''} onChange={value.onChange} clearable />}/></FormField>
          <FormField label="单位电话"><input {...register(`employments.${index}.phone`)} /></FormField>
          <FormField className="ui-field--grow" label="单位地址"><input {...register(`employments.${index}.addressText`)} /></FormField>
          <label className="resident-profile-check"><input type="checkbox" {...register(`employments.${index}.primary`)} />主要</label>
          <Button variant="text" onClick={() => employments.remove(index)}>移除</Button>
        </div>)}
      </ProfileArraySection>
      {create.error && <Alert>{errorMessage(create.error)}</Alert>}
    </form>
  </Dialog>
}
