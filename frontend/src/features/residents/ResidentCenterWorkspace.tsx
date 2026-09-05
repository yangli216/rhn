import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form'
import { useState, type ReactNode } from 'react'
import { age, formatTime, genderLabel } from '../../shared/format'
import type { Resident } from '../../shared/model'
import type {
  CreateResidentInput, ResidentIdentifierInput, ResidentProfile, UpdateResidentProfileInput,
} from '../../shared/api/residentsApi'
import { errorMessage, type RhnApi } from '../../shared/rhnApi'
import { parseChineseResidentId } from '../../shared/validation/businessValidation'
import {
  Alert, BackButton, Button, DataTable, Dialog, DictionarySelect,
  EmptyState, FormField, GridAddressInput, Icon, IconButton, LoadingState, ObjectContextBar,
  PageHeader, Pagination, Panel, PanelHead, Select, StatusBadge, TableShell,
} from '../../shared/ui'

const today = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date())

const genderOptions = [
  { value: '', label: '全部性别' },
  { value: 'MALE', label: '男' },
  { value: 'FEMALE', label: '女' },
  { value: 'UNKNOWN', label: '未知' },
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'ACTIVE', label: '有效居民' },
  { value: 'MERGED', label: '已合并' },
]

const deceasedOptions = [
  { value: 'ALL', label: '全部存活状态' },
  { value: 'ALIVE', label: '仅健在' },
  { value: 'DECEASED', label: '已登记死亡' },
]

export function ResidentCenterWorkspace({ api, onNavigate }: { api: RhnApi; onNavigate: (path: string) => void }) {
  const [selected, setSelected] = useState<Resident | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [submittedKeyword, setSubmittedKeyword] = useState('')
  const [genderFilter, setGenderFilter] = useState<'MALE' | 'FEMALE' | 'UNKNOWN' | ''>('')
  const [statusFilter, setStatusFilter] = useState<'ACTIVE' | 'MERGED' | ''>('')
  const [deceasedFilter, setDeceasedFilter] = useState<'ALL' | 'ALIVE' | 'DECEASED'>('ALL')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const queryClient = useQueryClient()

  const residentsPageQuery = useQuery({
    queryKey: ['residents-page', submittedKeyword, genderFilter, statusFilter, deceasedFilter, page, pageSize],
    queryFn: () => api.residents.page({
      query: submittedKeyword || undefined,
      gender: genderFilter || undefined,
      status: statusFilter || undefined,
      deceased: deceasedFilter === 'ALL' ? undefined : deceasedFilter === 'DECEASED',
      page,
      size: pageSize,
    }),
  })

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
      queryClient.invalidateQueries({ queryKey: ['residents-page'] }),
    ])
  }

  function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault()
    setSubmittedKeyword(keyword.trim())
    setPage(0)
  }

  function handleReset() {
    setKeyword('')
    setSubmittedKeyword('')
    setGenderFilter('')
    setStatusFilter('')
    setDeceasedFilter('ALL')
    setPage(0)
  }

  const pageData = residentsPageQuery.data
  const residentsList = pageData?.content ?? []
  const totalElements = pageData?.totalElements ?? 0
  const totalPages = pageData?.totalPages ?? 0

  if (selected) return <>
    <BackButton onClick={() => { setSelected(null); setShowEdit(false) }}>返回居民列表</BackButton>
    <ObjectContextBar avatar={selected.fullName.slice(-1)} title={selected.fullName}
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
      description="集中完成居民建档、档案查询与检索、人口学资料、地址、联系人和保障信息维护。"
      actions={<><Button variant="secondary" onClick={() => void residentsPageQuery.refetch()}><Icon name="refresh" />刷新</Button>
        <Button onClick={() => setShowCreate(true)}><Icon name="add" />新建居民</Button></>} />

    <Panel className="resident-filter-panel">
      <form className="resident-filter-form" onSubmit={handleSearch}>
        <FormField label="居民检索">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="姓名、身份证、档案号或手机号"
          />
        </FormField>
        <FormField label="性别">
          <Select
            value={genderFilter}
            options={genderOptions}
            placeholder="全部性别"
            searchable={false}
            clearable={false}
            onChange={(val) => { setGenderFilter(val as any); setPage(0) }}
          />
        </FormField>
        <FormField label="档案状态">
          <Select
            value={statusFilter}
            options={statusOptions}
            placeholder="全部状态"
            searchable={false}
            clearable={false}
            onChange={(val) => { setStatusFilter(val as any); setPage(0) }}
          />
        </FormField>
        <FormField label="存活状态">
          <Select
            value={deceasedFilter}
            options={deceasedOptions}
            placeholder="全部存活状态"
            searchable={false}
            clearable={false}
            onChange={(val) => { setDeceasedFilter(val as any); setPage(0) }}
          />
        </FormField>
        <div className="resident-filter-actions">
          <Button type="submit" variant="secondary" busy={residentsPageQuery.isFetching}>
            <Icon name="search" />查询
          </Button>
          <Button variant="secondary" onClick={handleReset}>重置</Button>
        </div>
      </form>
    </Panel>

    <Panel className="resident-roster-panel">
      <PanelHead
        title="已建档居民列表"
        meta={residentsPageQuery.isPending ? '加载中…' : `共 ${totalElements} 条档案记录`}
      />

      {residentsPageQuery.isPending && <LoadingState label="正在加载居民档案列表…" />}
      {residentsPageQuery.error && <Alert>{errorMessage(residentsPageQuery.error)}</Alert>}

      {!residentsPageQuery.isPending && !residentsPageQuery.error && residentsList.length === 0 && (
        <EmptyState
          icon="residents"
          title="未找到居民档案记录"
          copy={submittedKeyword || genderFilter || statusFilter || deceasedFilter !== 'ALL'
            ? '请尝试调整筛选条件或清空查询要素。'
            : '系统中暂无已建档居民，请点击上方“新建居民”完成第一条档案录入。'}
          action={submittedKeyword || genderFilter || statusFilter || deceasedFilter !== 'ALL'
            ? <Button variant="secondary" onClick={handleReset}>清空筛选</Button>
            : <Button onClick={() => setShowCreate(true)}><Icon name="add" />立即建档</Button>}
        />
      )}

      {!residentsPageQuery.isPending && !residentsPageQuery.error && residentsList.length > 0 && (
        <TableShell
          footer={
            <Pagination
              page={page}
              totalPages={totalPages}
              total={totalElements}
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size)
                setPage(0)
              }}
              onChange={setPage}
              label="居民列表分页"
            />
          }
        >
          <DataTable className="resident-table">
            <thead>
              <tr>
                <th>居民姓名</th>
                <th>性别 / 年龄</th>
                <th>健康档案号</th>
                <th>身份证件 / 卡号</th>
                <th>联系电话</th>
                <th>档案状态</th>
                <th>建档时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {residentsList.map((resident) => {
                const primaryIdentifier = resident.identifiers?.find((id) => id.system === 'NATIONAL_ID')
                  ?? resident.identifiers?.[0]
                return (
                  <tr key={resident.id} className="resident-table-row">
                    <td>
                      <div className="resident-cell-name">
                        <span className={`resident-avatar ${resident.gender.toLowerCase()}`}>
                          {resident.fullName.slice(-1)}
                        </span>
                        <strong>{resident.fullName}</strong>
                      </div>
                    </td>
                    <td>
                      <span>{genderLabel(resident.gender)} · {age(resident.birthDate)} 岁</span>
                      <small className="resident-birth-sub">{resident.birthDate}</small>
                    </td>
                    <td>
                      <code>{resident.healthRecordNo}</code>
                    </td>
                    <td>
                      {resident.maskedNationalId ? (
                        <span>{resident.maskedNationalId}</span>
                      ) : primaryIdentifier ? (
                        <span>{primaryIdentifier.system} {primaryIdentifier.maskedValue}</span>
                      ) : (
                        <span className="resident-cell-muted">未登记</span>
                      )}
                    </td>
                    <td>
                      {resident.phone ? <span>{resident.phone}</span> : <span className="resident-cell-muted">未登记</span>}
                    </td>
                    <td>
                      <StatusBadge tone={resident.deceased ? 'warning' : resident.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {resident.deceased ? '已登记死亡' : resident.status === 'ACTIVE' ? '有效居民' : '已合并'}
                      </StatusBadge>
                    </td>
                    <td>
                      <span>{formatTime(resident.createdAt)}</span>
                    </td>
                    <td>
                      <div className="resident-cell-actions">
                        <Button size="sm" variant="secondary" onClick={() => setSelected(resident)}>
                          <Icon name="search" />查看档案
                        </Button>
                        {resident.status === 'ACTIVE' && !resident.deceased && (
                          <Button size="sm" variant="text" onClick={() => onNavigate(`/outpatient/registration?residentId=${resident.id}`)}>
                            <Icon name="clinical" />挂号
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
        </TableShell>
      )}
    </Panel>

    {showCreate && (
      <CreateResidentDialog
        api={api}
        onClose={() => setShowCreate(false)}
        onCreated={(resident) => {
          setShowCreate(false)
          setSelected(resident)
          void queryClient.invalidateQueries({ queryKey: ['residents-page'] })
        }}
      />
    )}
  </>
}

function identifierSystemLabel(system?: string | null, value?: string | null) {
  if (value && /^E/i.test(value)) {
    return '电子健康卡'
  }
  if (value && /^YB/i.test(value)) {
    return '医疗保障卡'
  }
  if (value && /^MRN/i.test(value)) {
    return '病案号'
  }
  if (!system) return '证件/卡'
  const normalized = system.trim().toUpperCase()
  switch (normalized) {
    case '1':
    case 'NATIONAL_ID':
      return '居民身份证'
    case '2':
      return '军官证'
    case '3':
      return '警官证'
    case '4':
      return '文职干部证'
    case '6':
    case 'PASSPORT':
      return '护照'
    case '7':
      return '港澳居民来往内地通行证'
    case '8':
      return '台湾居民来往大陆通行证'
    case '9':
    case 'OTHER':
      return '其他证件/卡'
    case 'SOCIAL_SECURITY_CARD':
      return '社会保障卡'
    case 'HEALTH_CARD':
      return '电子健康卡'
    case 'HOSPITAL_MRN':
      return '病案号'
    case 'BIRTH_CERTIFICATE':
      return '出生医学证明'
    default:
      return system
  }
}

function ResidentProfileView({ profile }: { profile: ResidentProfile }) {
  const { resident, demographicProfile } = profile
  return <div className="resident-profile-grid">
    <Panel><PanelHead title="基本与人口学资料" meta={<StatusBadge tone={resident.deceased ? 'warning' : 'success'}>
      {resident.deceased ? '已登记死亡' : '有效居民'}</StatusBadge>} />
      <dl className="resident-profile-facts">
        <div><dt>身份证号</dt><dd>{resident.maskedNationalId || '未登记'}</dd></div>
        <div><dt>姓名</dt><dd>{resident.fullName}</dd></div><div><dt>出生日期</dt><dd>{resident.birthDate}</dd></div>
        <div><dt>国籍</dt><dd>{demographicProfile.nationalityCodeText || demographicProfile.nationalityCode || '未登记'}</dd></div>
        <div><dt>民族</dt><dd>{demographicProfile.ethnicityCodeText || demographicProfile.ethnicityCode || '未登记'}</dd></div>
        <div><dt>常住类型</dt><dd>{demographicProfile.sdResidencyTypeText || demographicProfile.sdResidencyType || '未登记'}</dd></div>
        <div><dt>婚姻状况</dt><dd>{demographicProfile.sdMaritalStatusText || demographicProfile.sdMaritalStatus || '未登记'}</dd></div>
        <div><dt>文化程度</dt><dd>{demographicProfile.sdEducationLevelText || demographicProfile.sdEducationLevel || '未登记'}</dd></div>
        <div><dt>职业类别</dt><dd>{demographicProfile.sdOccupationTypeText || demographicProfile.sdOccupationType || '未登记'}</dd></div>
        <div><dt>血型</dt><dd>{[demographicProfile.sdBloodTypeText || demographicProfile.sdBloodType, demographicProfile.sdRhTypeText || demographicProfile.sdRhType].filter(Boolean).join(' / ') || '未登记'}</dd></div>
      </dl>
      <div className="resident-profile-list"><article><strong>已登记证件与卡</strong>
        <span>{resident.identifiers?.length
          ? resident.identifiers.map((item) => `${identifierSystemLabel(item.system, item.maskedValue)}: ${item.maskedValue}`).join(' · ')
          : (resident.maskedNationalId ? `居民身份证: ${resident.maskedNationalId}` : '暂无其他证件与卡')}</span></article></div>
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
  const { control, register, handleSubmit, watch } = useForm<UpdateResidentProfileInput>({
    defaultValues: {
      expectedVersion: profile.resident.version, fullName: profile.resident.fullName,
      gender: profile.resident.gender, birthDate: profile.resident.birthDate, phone: profile.resident.phone ?? '',
      deceased: profile.resident.deceased, deceasedAt: profile.resident.deceasedAt?.slice(0, 16) ?? '',
      demographicProfile: profile.demographicProfile,
      addresses: profile.addresses, relatedPersons: profile.relatedPersons, coverages: profile.coverages,
      employments: profile.employments,
    },
  })
  const isDeceased = watch('deceased')
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
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="resident-profile-form" busy={save.isPending}>保存档案</Button></>}>
    <form id="resident-profile-form" className="resident-profile-form" onSubmit={handleSubmit((value) => save.mutate(value))}>
      <section className="resident-profile-section">
        <header className="resident-profile-section-head">
          <div className="resident-profile-section-title">
            <h3>基本资料</h3>
          </div>
        </header>
        <div className="resident-profile-id-banner">
          <div className="resident-profile-id-badge">
            <span className="resident-profile-id-badge__label">健康档案号</span>
            <strong className="resident-profile-id-badge__val">{profile.resident.healthRecordNo}</strong>
          </div>
          <div className="resident-profile-id-badge">
            <span className="resident-profile-id-badge__label">居民身份证号</span>
            <strong className="resident-profile-id-badge__val">{profile.resident.maskedNationalId || '未登记'}</strong>
            <small className="resident-profile-id-badge__hint">法定唯一身份凭证（主索引受控）</small>
          </div>
        </div>
        <div className="ui-form-row">
          <FormField className="ui-field--grow" label="姓名" required><input {...register('fullName')} required /></FormField>
          <FormField label="性别" required><Controller control={control} name="gender" render={({ field }) => <Select
            options={[{ value: 'UNKNOWN', label: '未知' }, { value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]}
            value={field.value} onChange={field.onChange} showValue />}/></FormField>
          <FormField label="出生日期" required><input type="date" max={today()} {...register('birthDate')} required /></FormField>
          <FormField label="联系电话"><input {...register('phone')} placeholder="手机/座机号" /></FormField>
        </div>
        <div className="ui-form-row">
          <FormField label="国籍/地区"><Controller control={control} name="demographicProfile.nationalityCode" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_NATIONALITY" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="民族"><Controller control={control} name="demographicProfile.ethnicityCode" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_ETHNICITY" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="常住类型"><Controller control={control} name="demographicProfile.sdResidencyType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RESIDENCY_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="婚姻状况"><Controller control={control} name="demographicProfile.sdMaritalStatus" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_MARITAL_STATUS" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        </div>
        <div className="ui-form-row">
          <FormField label="文化程度"><Controller control={control} name="demographicProfile.sdEducationLevel" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_EDUCATION_LEVEL" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="职业类别"><Controller control={control} name="demographicProfile.sdOccupationType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="ABO 血型"><Controller control={control} name="demographicProfile.sdBloodType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_BLOOD_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="Rh 血型"><Controller control={control} name="demographicProfile.sdRhType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RH_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        </div>
        <div className="resident-deceased-strip">
          <label className="resident-profile-check">
            <input type="checkbox" {...register('deceased')} />
            <span>登记死亡</span>
          </label>
          {isDeceased && <FormField label="死亡时间" className="resident-deceased-date">
            <input type="datetime-local" {...register('deceasedAt')} />
          </FormField>}
        </div>
      </section>

      <section className="resident-profile-section">
        <header className="resident-profile-section-head">
          <div className="resident-profile-section-title">
            <h3>已登记证件与卡</h3>
            <span className="resident-profile-section-count">
              (居民身份标识由主索引集中校验管理)
            </span>
          </div>
        </header>
        <div className="resident-profile-cards-grid">
          <div className="resident-registered-card is-primary">
            <div className="resident-registered-card__head">
              <Icon name="credential" />
              <strong>居民身份证</strong>
              <span className="ui-badge ui-badge--info">法定主标识</span>
            </div>
            <div className="resident-registered-card__body">
              <span className="resident-registered-card__number">{profile.resident.maskedNationalId || '未登记'}</span>
              <span className="resident-registered-card__status">状态: {profile.resident.status === 'ACTIVE' ? '正常' : profile.resident.status}</span>
            </div>
          </div>
          {profile.resident.identifiers
            .filter((item) => {
              if (item.system === '1' || item.system === 'NATIONAL_ID') {
                return Boolean(item.maskedValue && /^E/i.test(item.maskedValue))
              }
              return true
            })
            .map((item) => (
              <div className="resident-registered-card" key={item.id}>
                <div className="resident-registered-card__head">
                  <Icon name="card" />
                  <strong>{identifierSystemLabel(item.system, item.maskedValue)}</strong>
                  <span className="ui-badge ui-badge--neutral">{item.useType || '辅助标识'}</span>
                </div>
                <div className="resident-registered-card__body">
                  <span className="resident-registered-card__number">{item.maskedValue}</span>
                  <span className="resident-registered-card__status">状态: {item.status === 'ACTIVE' ? '正常' : item.status}</span>
                </div>
              </div>
            ))}
          {profile.coverages.some((c) => Boolean(c.memberNo)) && (
            <div className="resident-registered-card">
              <div className="resident-registered-card__head">
                <Icon name="card" />
                <strong>医疗保障卡号</strong>
                <span className="ui-badge ui-badge--neutral">医保凭证</span>
              </div>
              <div className="resident-registered-card__body">
                <span className="resident-registered-card__number">
                  {profile.coverages.filter((c) => Boolean(c.memberNo)).map((c) => `${c.memberNo}（${c.payerName}）`).join(' · ')}
                </span>
                <span className="resident-registered-card__status">可在下方保障信息中维护</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <ProfileArraySection title="地址" count={addresses.fields.length} onAdd={() => addresses.append({ sdUse: 'HOME', addressText: '', postalCode: '', primary: addresses.fields.length === 0, validFrom: today() })}>
        {addresses.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField label="地址用途" className="field-compact-use"><Controller control={control} name={`addresses.${index}.sdUse`} render={({ field: value }) =>
              <DictionarySelect api={api.dictionaries} dictionaryCode="PI_ADDRESS_USE" value={value.value} onChange={value.onChange} />}/></FormField>
            <FormField className="resident-grid-address-field" label="网格地址" required><Controller control={control}
              name={`addresses.${index}`} render={({ field: address }) => <GridAddressInput
                className="resident-grid-address" api={api.gridAddresses} levels={5} required value={address.value}
                onChange={(grid) => address.onChange({ ...address.value, ...grid })} />}/></FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`addresses.${index}.primary`)} />主要地址</label>
              <IconButton icon="close" label="移除地址" onClick={() => addresses.remove(index)} />
            </div>
          </div>
          <div className="resident-profile-item-row">
            <FormField className="ui-field--grow" label="详细门牌地址"><input {...register(`addresses.${index}.addressText`)} placeholder="如 劳动路18号2单元301室" required /></FormField>
            <FormField label="邮政编码" className="field-compact-postal"><input {...register(`addresses.${index}.postalCode`)} placeholder="如 310002" /></FormField>
          </div>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="保障信息" count={coverages.fields.length} onAdd={() => coverages.append({ sdCoverageType: 'RESIDENT_BASIC', payerName: '基本医疗保险', memberNo: '', primary: coverages.fields.length === 0, validFrom: today() })}>
        {coverages.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField label="保障类型" className="field-compact-cov"><Controller control={control} name={`coverages.${index}.sdCoverageType`} render={({ field: value }) =>
              <DictionarySelect api={api.dictionaries} dictionaryCode="INS_COVERAGE_TYPE" value={value.value} onChange={value.onChange} />}/></FormField>
            <FormField className="ui-field--grow" label="个人编号/卡号"><input {...register(`coverages.${index}.memberNo`)} placeholder="医保卡号/个人编号" /></FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`coverages.${index}.primary`)} />主要保障</label>
              <IconButton icon="close" label="移除保障" onClick={() => coverages.remove(index)} />
            </div>
          </div>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="工作单位" count={employments.fields.length} onAdd={() => employments.append({ employerName: '', sdOccupationType: '', phone: '', postalCode: '', addressText: '', primary: employments.fields.length === 0, validFrom: today() })}>
        {employments.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField className="ui-field--grow" label="单位名称"><input {...register(`employments.${index}.employerName`)} placeholder="单位/公司全称" required /></FormField>
            <FormField label="职业类别" className="field-compact-occ"><Controller control={control} name={`employments.${index}.sdOccupationType`} render={({ field: value }) =>
              <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={value.value ?? ''} onChange={value.onChange} clearable />}/></FormField>
            <FormField label="单位电话" className="field-compact-phone"><input {...register(`employments.${index}.phone`)} placeholder="办公电话" /></FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`employments.${index}.primary`)} />主要单位</label>
              <IconButton icon="close" label="移除单位" onClick={() => employments.remove(index)} />
            </div>
          </div>
          <div className="resident-profile-item-row">
            <FormField className="ui-field--grow" label="单位详细地址"><input {...register(`employments.${index}.addressText`)} placeholder="详细办公地点" /></FormField>
          </div>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="联系人与监护人" count={relatedPersons.fields.length} onAdd={() => relatedPersons.append({ fullName: '', sdRelationship: 'OTHER', phone: '', addressText: '', guardian: false, emergencyContact: false, validFrom: today() })}>
        {relatedPersons.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField label="姓名" className="field-compact-name"><input {...register(`relatedPersons.${index}.fullName`)} placeholder="联系人姓名" required /></FormField>
            <FormField label="关系" className="field-compact-rel"><Controller control={control} name={`relatedPersons.${index}.sdRelationship`} render={({ field: value }) =>
              <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RELATED_PERSON_RELATIONSHIP" value={value.value} onChange={value.onChange} />}/></FormField>
            <FormField label="联系电话" className="field-compact-phone"><input {...register(`relatedPersons.${index}.phone`)} placeholder="手机/座机" /></FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.guardian`)} />监护人</label>
              <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.emergencyContact`)} />紧急联系人</label>
              <IconButton icon="close" label="移除联系人" onClick={() => relatedPersons.remove(index)} />
            </div>
          </div>
        </div>)}
      </ProfileArraySection>

      {save.error && <Alert>{errorMessage(save.error)}</Alert>}
    </form>
  </Dialog>
}

function ProfileArraySection({
  title, count, onAdd, children,
}: {
  title: string; count: number; onAdd: () => void; children: ReactNode
}) {
  return <section className={`resident-profile-section ${count === 0 ? 'is-empty' : ''}`}>
    <header className="resident-profile-section-head">
      <div className="resident-profile-section-title">
        <h3>{title}</h3>
        <span className="resident-profile-section-count">{count > 0 ? `(${count})` : '(暂无登记)'}</span>
      </div>
      <Button size="sm" variant="secondary" onClick={onAdd}><Icon name="add" />新增{title}</Button>
    </header>
    {count > 0 && <div className="resident-profile-items-container">{children}</div>}
  </section>
}

function getIdentifierPlaceholder(system?: string): string {
  switch (system) {
    case '1':
    case 'NATIONAL_ID':
      return '录入18位身份证号，将自动解析出生日期与性别'
    case '2':
      return '录入军官证/军人身份证件号码'
    case '3':
      return '录入武警身份证件号码'
    case '4':
      return '录入港澳居民来往内地通行证号码'
    case '5':
      return '录入台湾居民来往大陆通行证号码'
    case '6':
    case 'PASSPORT':
      return '录入护照号码'
    case 'SOCIAL_SECURITY_CARD':
      return '录入社保卡号 / 社会保障号码'
    case 'HEALTH_CARD':
      return '录入居民健康卡号 / 电子健康卡码'
    case '9':
    default:
      return '请输入证件或卡号'
  }
}

function IdentifierCardItem({
  index, fieldId, control, register, remove, canRemove, onValueChange, api,
}: {
  index: number
  fieldId: string
  control: any
  register: any
  remove: () => void
  canRemove: boolean
  onValueChange: (index: number, val: string, changedSystem?: string) => void
  api: RhnApi
}) {
  const currentSystem = useWatch({ control, name: `identifiers.${index}.system` })
  return (
    <div className="resident-profile-item-card" key={fieldId}>
      <div className="resident-profile-item-row">
        <FormField label="证件/卡类型" required className="field-compact-cov">
          <Controller
            control={control}
            name={`identifiers.${index}.system`}
            render={({ field: value }) => (
              <DictionarySelect
                api={api.dictionaries}
                dictionaryCode="PI_IDENTIFIER_TYPE"
                value={value.value}
                onChange={(val) => {
                  value.onChange(val)
                  onValueChange(index, '', val)
                }}
              />
            )}
          />
        </FormField>
        <FormField className="ui-field--grow" label="证件或卡号" required>
          <input
            {...register(`identifiers.${index}.value`, {
              onChange: (e: any) => onValueChange(index, e.target.value),
              onBlur: (e: any) => onValueChange(index, e.target.value),
            })}
            placeholder={getIdentifierPlaceholder(currentSystem)}
            required
            maxLength={200}
          />
        </FormField>
        {canRemove && (
          <IconButton icon="close" label="移除证件" onClick={remove} />
        )}
      </div>
    </div>
  )
}

function CreateResidentDialog({ api, onClose, onCreated }: {
  api: RhnApi; onClose: () => void; onCreated: (resident: Resident) => void
}) {
  const { control, register, handleSubmit, getValues, setValue } = useForm<CreateResidentInput>({
    defaultValues: {
      fullName: '', nationalId: '', gender: 'UNKNOWN', birthDate: '', phone: '',
      identifiers: [{ system: '1', value: '', useType: 'OFFICIAL' }],
      demographicProfile: { nationalityCode: 'CN', ethnicityCode: '01', sdResidencyType: 'UNKNOWN' },
      addresses: [], relatedPersons: [], coverages: [], employments: [],
    },
  })
  const identifiers = useFieldArray({ control, name: 'identifiers' })
  const addresses = useFieldArray({ control, name: 'addresses' })
  const relatedPersons = useFieldArray({ control, name: 'relatedPersons' })
  const coverages = useFieldArray({ control, name: 'coverages' })
  const employments = useFieldArray({ control, name: 'employments' })
  const create = useMutation({ mutationFn: api.residents.create, onSuccess: onCreated })

  function syncCoverageWithIdentifiers(updatedIdentifiers?: ResidentIdentifierInput[]) {
    const currentIdentifiers = updatedIdentifiers ?? getValues('identifiers') ?? []
    const socialSecurity = currentIdentifiers.find((id) => id.system === 'SOCIAL_SECURITY_CARD' && id.value?.trim())
    const nationalId = currentIdentifiers.find((id) => (id.system === '1' || id.system === 'NATIONAL_ID' || !id.system) && id.value?.trim())

    if (socialSecurity) {
      const cardNo = socialSecurity.value.trim()
      const currentCoverages = getValues('coverages') ?? []
      if (currentCoverages.length === 0) {
        coverages.append({
          sdCoverageType: '01',
          payerName: '城镇职工基本医疗保险',
          memberNo: cardNo,
          primary: true,
          validFrom: today(),
        })
      } else {
        setValue('coverages.0.sdCoverageType', '01', { shouldDirty: true, shouldValidate: true })
        setValue('coverages.0.memberNo', cardNo, { shouldDirty: true, shouldValidate: true })
        setValue('coverages.0.payerName', '城镇职工基本医疗保险', { shouldDirty: true })
      }
    } else if (nationalId) {
      const idNo = nationalId.value.trim()
      const currentCoverages = getValues('coverages') ?? []
      if (currentCoverages.length === 0) {
        coverages.append({
          sdCoverageType: '02',
          payerName: '城镇居民基本医疗保险',
          memberNo: idNo,
          primary: true,
          validFrom: today(),
        })
      } else {
        setValue('coverages.0.sdCoverageType', '02', { shouldDirty: true, shouldValidate: true })
        setValue('coverages.0.memberNo', idNo, { shouldDirty: true, shouldValidate: true })
        setValue('coverages.0.payerName', '城镇居民基本医疗保险', { shouldDirty: true })
      }
    }
  }

  function handleIdentifierChange(index: number, val: string, changedSystem?: string) {
    const currentIds = getValues('identifiers') ?? []
    const system = changedSystem ?? currentIds[index]?.system ?? '1'
    const clean = val.trim()
    // Auto-parse ID card if system is 1 / NATIONAL_ID or length is 18 digits
    if (system === '1' || system === 'NATIONAL_ID' || /^\d{17}[\dXx]$/.test(clean)) {
      const parsed = parseChineseResidentId(clean)
      if (parsed) {
        setValue('birthDate', parsed.birthDate, { shouldValidate: true, shouldDirty: true })
        setValue('gender', parsed.gender, { shouldValidate: true, shouldDirty: true })
      }
    }
    // Real-time sync with coverages
    const updated = currentIds.map((id, i) => i === index ? { ...id, system, value: val } : id)
    syncCoverageWithIdentifiers(updated)
  }

  function handleRemoveIdentifier(index: number) {
    identifiers.remove(index)
    setTimeout(() => {
      syncCoverageWithIdentifiers()
    }, 0)
  }

  return <Dialog title="新建居民" eyebrow="居民中心" size="xwide" className="resident-create-dialog" onClose={onClose} closeOnBackdrop={false}
    footer={<><Button variant="secondary" onClick={onClose}>取消</Button>
      <Button type="submit" form="resident-center-create" busy={create.isPending}>保存居民档案</Button></>}>
    <form id="resident-center-create" className="resident-profile-form" onSubmit={handleSubmit((value) => {
      const payload: CreateResidentInput = {
        ...value,
        coverages: value.coverages?.map((c) => ({
          ...c,
          payerName: c.payerName?.trim() || '基本医疗保险',
        })),
      }
      create.mutate(payload)
    })}>
      <section className="resident-profile-section">
        <header className="resident-profile-section-head">
          <div className="resident-profile-section-title">
            <h3>身份与基本信息</h3>
          </div>
        </header>
        <div className="ui-form-row">
          <FormField className="ui-field--grow" label="姓名" required>
            <input {...register('fullName')} autoFocus required maxLength={100} />
          </FormField>
          <FormField label="性别" required>
            <Controller control={control} name="gender" render={({ field }) => <Select
              options={[{ value: 'UNKNOWN', label: '未知' }, { value: 'MALE', label: '男' }, { value: 'FEMALE', label: '女' }]}
              value={field.value} onChange={field.onChange} showValue />} />
          </FormField>
          <FormField label="出生日期" required>
            <input type="date" max={today()} {...register('birthDate')} required />
          </FormField>
          <FormField label="联系电话">
            <input {...register('phone')} maxLength={32} placeholder="手机/座机号" />
          </FormField>
        </div>
      </section>

      <ProfileArraySection title="证件和卡" count={identifiers.fields.length} onAdd={() => identifiers.append({ system: '1', value: '', useType: 'SECONDARY' })}>
        {identifiers.fields.map((field, index) => (
          <IdentifierCardItem
            key={field.id}
            index={index}
            fieldId={field.id}
            control={control}
            register={register}
            remove={() => handleRemoveIdentifier(index)}
            canRemove={identifiers.fields.length > 1}
            onValueChange={handleIdentifierChange}
            api={api}
          />
        ))}
      </ProfileArraySection>

      <ProfileArraySection title="地址信息" count={addresses.fields.length} onAdd={() => addresses.append({ sdUse: 'HOME', addressText: '', postalCode: '', primary: addresses.fields.length === 0, validFrom: today() })}>
        {addresses.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField label="地址用途" className="field-compact-use">
              <Controller control={control} name={`addresses.${index}.sdUse`} render={({ field: value }) =>
                <DictionarySelect api={api.dictionaries} dictionaryCode="PI_ADDRESS_USE" value={value.value} onChange={value.onChange} />} />
            </FormField>
            <FormField className="resident-grid-address-field" label="网格地址" required>
              <Controller control={control} name={`addresses.${index}`} render={({ field: address }) =>
                <GridAddressInput className="resident-grid-address" api={api.gridAddresses} levels={5} required value={address.value}
                  onChange={(grid) => address.onChange({ ...address.value, ...grid })} />} />
            </FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`addresses.${index}.primary`)} />主要地址</label>
              <IconButton icon="close" label="移除地址" onClick={() => addresses.remove(index)} />
            </div>
          </div>
          <div className="resident-profile-item-row">
            <FormField className="ui-field--grow" label="详细门牌地址"><input {...register(`addresses.${index}.addressText`)} placeholder="如 劳动路18号2单元301室" required /></FormField>
            <FormField label="邮政编码" className="field-compact-postal"><input {...register(`addresses.${index}.postalCode`)} placeholder="如 310002" /></FormField>
          </div>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="联系人信息" count={relatedPersons.fields.length} onAdd={() => relatedPersons.append({ fullName: '', sdRelationship: '97', phone: '', addressText: '', guardian: false, emergencyContact: true, validFrom: today() })}>
        {relatedPersons.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField label="姓名" className="field-compact-name"><input {...register(`relatedPersons.${index}.fullName`)} placeholder="联系人姓名" required /></FormField>
            <FormField label="关系" className="field-compact-rel"><Controller control={control} name={`relatedPersons.${index}.sdRelationship`} render={({ field: value }) =>
              <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RELATED_PERSON_RELATIONSHIP" value={value.value} onChange={value.onChange} />}/></FormField>
            <FormField label="联系电话" className="field-compact-phone"><input {...register(`relatedPersons.${index}.phone`)} placeholder="手机/座机" /></FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.guardian`)} />监护人</label>
              <label className="resident-profile-check"><input type="checkbox" {...register(`relatedPersons.${index}.emergencyContact`)} />紧急联系人</label>
              <IconButton icon="close" label="移除联系人" onClick={() => relatedPersons.remove(index)} />
            </div>
          </div>
        </div>)}
      </ProfileArraySection>

      <section className="resident-profile-section">
        <header className="resident-profile-section-head">
          <div className="resident-profile-section-title">
            <h3>其他信息</h3>
          </div>
        </header>
        <div className="ui-form-row">
          <FormField label="国籍/地区"><Controller control={control} name="demographicProfile.nationalityCode" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_NATIONALITY" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="民族"><Controller control={control} name="demographicProfile.ethnicityCode" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_ETHNICITY" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="常住类型"><Controller control={control} name="demographicProfile.sdResidencyType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RESIDENCY_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="婚姻状况"><Controller control={control} name="demographicProfile.sdMaritalStatus" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_MARITAL_STATUS" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        </div>
        <div className="ui-form-row">
          <FormField label="文化程度"><Controller control={control} name="demographicProfile.sdEducationLevel" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_EDUCATION_LEVEL" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="职业类别"><Controller control={control} name="demographicProfile.sdOccupationType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="ABO 血型"><Controller control={control} name="demographicProfile.sdBloodType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_BLOOD_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
          <FormField label="Rh 血型"><Controller control={control} name="demographicProfile.sdRhType" render={({ field }) =>
            <DictionarySelect api={api.dictionaries} dictionaryCode="PI_RH_TYPE" value={field.value ?? ''} onChange={field.onChange} clearable />}/></FormField>
        </div>
      </section>

      <ProfileArraySection title="保障信息" count={coverages.fields.length} onAdd={() => coverages.append({ sdCoverageType: '02', payerName: '城镇居民基本医疗保险', memberNo: '', primary: coverages.fields.length === 0, validFrom: today() })}>
        {coverages.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField label="保障类型" className="field-compact-cov"><Controller control={control} name={`coverages.${index}.sdCoverageType`} render={({ field: value }) =>
              <DictionarySelect api={api.dictionaries} dictionaryCode="INS_COVERAGE_TYPE" value={value.value} onChange={value.onChange} />}/></FormField>
            <FormField className="ui-field--grow" label="个人编号/卡号"><input {...register(`coverages.${index}.memberNo`)} placeholder="医保卡号/个人编号（自动关联社保卡或身份证）" /></FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`coverages.${index}.primary`)} />主要保障</label>
              <IconButton icon="close" label="移除保障" onClick={() => coverages.remove(index)} />
            </div>
          </div>
        </div>)}
      </ProfileArraySection>

      <ProfileArraySection title="工作单位" count={employments.fields.length} onAdd={() => employments.append({ employerName: '', sdOccupationType: '', phone: '', postalCode: '', addressText: '', primary: employments.fields.length === 0, validFrom: today() })}>
        {employments.fields.map((field, index) => <div className="resident-profile-item-card" key={field.id}>
          <div className="resident-profile-item-row">
            <FormField className="ui-field--grow" label="单位名称"><input {...register(`employments.${index}.employerName`)} placeholder="单位/公司全称" required /></FormField>
            <FormField label="职业类别" className="field-compact-occ"><Controller control={control} name={`employments.${index}.sdOccupationType`} render={({ field: value }) =>
              <DictionarySelect api={api.dictionaries} dictionaryCode="PI_OCCUPATION_TYPE" value={value.value ?? ''} onChange={value.onChange} clearable />}/></FormField>
            <FormField label="单位电话" className="field-compact-phone"><input {...register(`employments.${index}.phone`)} placeholder="办公电话" /></FormField>
            <div className="resident-profile-item-actions">
              <label className="resident-profile-check"><input type="checkbox" {...register(`employments.${index}.primary`)} />主要单位</label>
              <IconButton icon="close" label="移除单位" onClick={() => employments.remove(index)} />
            </div>
          </div>
          <div className="resident-profile-item-row">
            <FormField className="ui-field--grow" label="单位详细地址"><input {...register(`employments.${index}.addressText`)} placeholder="详细办公地点" /></FormField>
          </div>
        </div>)}
      </ProfileArraySection>
      {create.error && <Alert>{errorMessage(create.error)}</Alert>}
    </form>
  </Dialog>
}
