import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ORGANIZATION_SYSTEM_ENUM, errorMessage, systemEnumItems, type PersonnelStatus, type PrescribingFilter, type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, EmptyState, FormField, LoadingState, Pagination, SearchField, Select, StatusBadge,
  tableCellClass, type SelectOption } from '../../../shared/ui'
import { ListPage } from '../../../shared/ui/templates/PageTemplates'
import { departmentOwner } from '../organizationUnitReceipt'
import { OnboardingDialog } from './OnboardingDialog'
import { PersonnelDrawer } from './PersonnelDrawer'
import { prescribingSummary, requirePersonnelPage } from './personnelFacts'
import { PositionSettingsDialog } from './PositionSettingsDialog'
import { QUALIFICATION_DICTIONARY, usePersonnelOptions } from './usePersonnelOptions'
import '../../../styles/features/personnel.css'

const PRESCRIBING_OPTIONS: SelectOption[] = [
  { value: 'PRESCRIBING', label: '有处方权' }, { value: 'NARCOTIC', label: '有麻精处方权' }, { value: 'ANTIMICROBIAL', label: '有抗菌药物处方权' },
  { value: 'NONE', label: '无处方权' }, { value: 'UNREGISTERED', label: '资质未登记' },
]
const STATUS_OPTIONS: SelectOption[] = [{ value: 'ACTIVE', label: '在职' }, { value: 'INACTIVE', label: '已停用' }]
type Filters = { unit: string; positionType: string; professionalTitle: string; prescribing: string; status: string }

/** 人员管理：服务端分页的人员列表；档案、任职、执业资质在右侧抽屉中维护。 */
export function PersonnelPage({ api, canManage = false }: { api: RhnApi; canManage?: boolean }) {
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const options = usePersonnelOptions(api)
  const initialUnit = params.get('departmentId') ? `dept:${params.get('departmentId')}` : params.get('organizationId') ? `org:${params.get('organizationId')}` : ''
  const [keyword, setKeyword] = useState('')
  const [appliedKeyword, setAppliedKeyword] = useState('')
  const [filters, setFilters] = useState<Filters>({ unit: initialUnit, positionType: '', professionalTitle: '', prescribing: '', status: 'ACTIVE' })
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [openedId, setOpenedId] = useState<string>()
  const [dialog, setDialog] = useState<'onboarding' | 'positions'>()
  const [feedback, setFeedback] = useState('')
  useEffect(() => { setOpenedId(undefined); setDialog(undefined) }, [api])

  const [unitKind, unitId] = filters.unit.split(':')
  const query = {
    keyword: appliedKeyword.trim() || undefined, organizationId: unitKind === 'org' ? unitId : undefined, departmentId: unitKind === 'dept' ? unitId : undefined,
    positionType: filters.positionType || undefined, professionalTitle: filters.professionalTitle || undefined,
    prescribing: (filters.prescribing || undefined) as PrescribingFilter | undefined, status: (filters.status || undefined) as PersonnelStatus | undefined, page, size,
  }
  const personnel = useQuery({ queryKey: ['personnel', options.scope, query], queryFn: async () => requirePersonnelPage(await api.organization.personnel(query)) })
  const setFilter = (key: keyof Filters, value: string) => { setFilters(current => ({ ...current, [key]: value })); setPage(0) }
  const reset = () => { setKeyword(''); setAppliedKeyword(''); setFilters({ unit: '', positionType: '', professionalTitle: '', prescribing: '', status: 'ACTIVE' }); setPage(0) }
  const units = options.units.data ?? []
  const unitOptions: SelectOption[] = units.filter(unit => unit.sdOrgKind === 'LEGAL_ORGANIZATION').flatMap(org => [
    { value: `org:${org.id}`, label: org.name, secondaryText: '机构' },
    ...units.filter(unit => unit.sdOrgKind === 'ORG_UNIT' && departmentOwner(unit.id, units) === org.id)
      .map(unit => ({ value: `dept:${unit.id}`, label: `　${unit.name}`, secondaryText: unit.code })),
  ])
  const titleOptions = (options.qualificationDictionaries.get(QUALIFICATION_DICTIONARY.professionalTitle) ?? []).map(item => ({ value: item.code, label: item.name }))
  const changed = async (message: string) => {
    setFeedback(message)
    await Promise.all(['personnel', 'practitioner', 'practitioner-qualification', 'assignments', 'positions', 'organization-changes']
      .map(key => queryClient.invalidateQueries({ queryKey: [key] })))
  }

  return <ListPage title="人员管理" description="维护人员档案、任职与执业资质；登录账号与授权在「角色与权限」中维护。"
    feedback={feedback && <Alert tone="success" onDismiss={() => setFeedback('')}>{feedback}</Alert>}
    actions={canManage && <>
      <Button variant="secondary" onClick={() => { setFeedback(''); setDialog('positions') }}>岗位设置</Button>
      <Button onClick={() => { setFeedback(''); setDialog('onboarding') }}>办理入职</Button></>}
    resetScrollKey={JSON.stringify(query)}
    filters={<>
      <SearchField label="搜索人员" placeholder="姓名或工号" value={keyword} onChange={setKeyword}
        onSearch={value => { setAppliedKeyword(value); setPage(0) }} />
      <FormField label="机构·科室"><Select value={filters.unit} onChange={value => setFilter('unit', value)} placeholder="全部" options={unitOptions} /></FormField>
      <FormField label="岗位类型"><Select value={filters.positionType} onChange={value => setFilter('positionType', value)} placeholder="全部"
        options={systemEnumItems(options.enums, ORGANIZATION_SYSTEM_ENUM.positionType).map(item => ({ value: item.code, label: item.name }))} /></FormField>
      <FormField label="职称"><Select value={filters.professionalTitle} onChange={value => setFilter('professionalTitle', value)} placeholder="全部" options={titleOptions} /></FormField>
      <FormField label="处方权"><Select value={filters.prescribing} onChange={value => setFilter('prescribing', value)} placeholder="全部" options={PRESCRIBING_OPTIONS} /></FormField>
      <FormField label="状态"><Select value={filters.status} onChange={value => setFilter('status', value)} placeholder="全部" options={STATUS_OPTIONS} /></FormField>
      <div className="ui-query-filters__actions">
        <Button onClick={() => { setAppliedKeyword(keyword); setPage(0) }}>查询</Button>
        <Button variant="secondary" onClick={reset}>重置</Button>
      </div>
    </>}
    footer={personnel.data && <Pagination page={personnel.data.page} totalPages={personnel.data.totalPages} total={personnel.data.totalElements}
      pageSize={size} onPageSizeChange={value => { setSize(value); setPage(0) }} onChange={setPage} label="人员分页" />}>
    {personnel.isPending ? <LoadingState label="正在加载人员…" />
      : personnel.isError ? <Alert placement="inline">{errorMessage(personnel.error)}<Button size="sm" variant="secondary" onClick={() => void personnel.refetch()}>重新加载</Button></Alert>
      : !personnel.data.content.length ? <EmptyState icon="user" title="没有符合条件的人员" copy="调整筛选条件，或办理入职新增人员。" />
      : <DataTable aria-label="人员列表">
        <thead><tr><th>工号</th><th>姓名</th><th>性别</th><th>主任职（科室 · 岗位）</th><th>职称</th><th>执业类别</th><th>处方权</th>
          <th className={tableCellClass('status')}>状态</th><th className={tableCellClass('actions')}>操作</th></tr></thead>
        <tbody>{personnel.data.content.map(row => <tr key={row.practitionerId}>
          <td><code>{row.code}</code></td><td>{row.fullName}</td><td>{row.sdPractGenderText ?? '—'}</td>
          <td>{row.primaryAssignment ? `${row.primaryAssignment.departmentName ?? ''} · ${row.primaryAssignment.positionName ?? ''}` : '当前无任职'}
            {row.currentAssignmentCount > 1 && <span className="personnel-muted">（另 {row.currentAssignmentCount - 1} 项）</span>}</td>
          <td>{row.sdProfessionalTitleText ?? '—'}</td><td>{row.sdPracticeCategoryText ?? '—'}</td>
          <td className={row.qualificationRegistered ? undefined : 'personnel-muted'}>{prescribingSummary(row)}</td>
          <td className={tableCellClass('status')}><StatusBadge tone={row.sdPersonnelStatus === 'ACTIVE' ? 'success' : 'neutral'}>{row.sdPersonnelStatus === 'ACTIVE' ? '在职' : '已停用'}</StatusBadge></td>
          <td className={tableCellClass('actions')}><Button size="sm" variant="text" onClick={() => { setFeedback(''); setOpenedId(row.practitionerId) }}>查看</Button></td>
        </tr>)}</tbody>
      </DataTable>}
    {openedId && <PersonnelDrawer api={api} practitionerId={openedId} options={options} canManage={canManage}
      onChanged={changed} onClose={() => setOpenedId(undefined)} />}
    {dialog === 'onboarding' && <OnboardingDialog api={api} options={options} onClose={() => setDialog(undefined)}
      onDone={async (id, message) => { setDialog(undefined); await changed(message); setOpenedId(id) }} />}
    {dialog === 'positions' && <PositionSettingsDialog api={api} options={options} onClose={() => setDialog(undefined)} onChanged={changed} />}
  </ListPage>
}
