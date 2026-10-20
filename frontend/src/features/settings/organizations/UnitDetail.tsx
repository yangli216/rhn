import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { errorMessage, type DictionaryValue, type OrganizationProfileResult, type OrganizationProfileSection, type OrganizationUnit,
  type RhnApi } from '../../../shared/rhnApi'
import { Alert, Button, DataTable, LoadingState, StatusBadge } from '../../../shared/ui'
import { PROFILE_SECTIONS } from '../OrganizationProfileRecords'
import { organizationQueryScope } from '../organizationQueryScope'
import { currentRecord, resolveDepartmentTypeText } from './organizationUnitModel'

const configurationSchema = z.object({
  runtimeUses: z.array(z.object({ code: z.string(), name: z.string(), classificationMatches: z.boolean(), requirement: z.string() })),
  suggestedCapabilityTypes: z.array(z.string()), warnings: z.array(z.string()),
})
export const ORGANIZATION_PROFILE_SECTIONS: OrganizationProfileSection[] = ['identifier', 'address', 'contact', 'responsibility', 'capability']
export const DEPARTMENT_PROFILE_SECTIONS: OrganizationProfileSection[] = ['contact', 'responsibility', 'capability']

export type StaffSummary = { current: number; primary: number }

/** 只读详情：基本信息、运行属性（科室）、资质与联系、在岗人员。维护通过页头「编辑」和各分区「维护」进入弹窗。 */
export function UnitDetail({ api, unit, units, profile, departmentTypes, staff, canManage, busy, onEditSection, onViewStaff }: {
  api: RhnApi; unit: OrganizationUnit; units: OrganizationUnit[]; profile: OrganizationProfileResult; departmentTypes: DictionaryValue[]
  staff?: StaffSummary | 'error'; canManage: boolean; busy: boolean
  onEditSection: (section: OrganizationProfileSection) => void; onViewStaff: () => void
}) {
  const department = unit.sdOrgKind === 'ORG_UNIT'
  const parent = units.find(item => item.id === unit.parentId)
  const configuration = useQuery({
    queryKey: ['department-business-configuration', organizationQueryScope(api), unit.id, unit.revision],
    queryFn: async () => configurationSchema.parse(await api.organization.businessConfiguration(unit.id)), enabled: department,
  })
  const facts: Array<[string, ReactNode]> = [
    ['名称', unit.name], ['代码', <code key="code">{unit.code}</code>], ['组织类别', unit.sdOrgKindText],
    ...(department ? [] : [['组织结构类型', unit.sdOrgTypeText] as [string, ReactNode]]),
    ['上级组织', parent?.name ?? '无上级'],
    ...(department ? [] : [['时区', unit.timezoneCode || '未设置'] as [string, ReactNode]]),
    ['虚拟组织', unit.virtual ? '是（不对应独立物理场所）' : '否'],
    ...(unit.shortName ? [['简称', unit.shortName] as [string, ReactNode]] : []),
    ...(!department && unit.sdOrgPropertyText ? [['机构性质', unit.sdOrgPropertyText] as [string, ReactNode]] : []),
    ['有效期', `${unit.validFrom} 至 ${unit.validTo || '长期'}`],
  ]
  return <div className="organization-detail">
    <section className="organization-section" aria-label="基本信息">
      <h3>基本信息</h3>
      <FactList facts={facts} />
      {unit.description && <p className="organization-section__note">{unit.description}</p>}
    </section>
    {department && <section className="organization-section" aria-label="运行属性">
      <h3>运行属性</h3>
      <FactList facts={[['业务属性', unit.sdDepartmentPropertyText || '未维护'], ['具体科室类型', resolveDepartmentTypeText(unit, departmentTypes)]]} />
      <p className="organization-section__hint">业务属性决定排班、转科与护理单元识别；具体科室类型决定检验检查执行路由和药房库存场所。服务能力登记不授予业务权限。</p>
      {configuration.isPending ? <LoadingState label="正在核实运行规则…" /> : configuration.isError
        ? <Alert placement="inline">{errorMessage(configuration.error)}<Button size="sm" variant="secondary" onClick={() => void configuration.refetch()}>重新核实</Button></Alert>
        : <>{configuration.data.warnings.map(value => <Alert key={value} placement="inline" tone="warning">{value}</Alert>)}
          {!!configuration.data.runtimeUses.length && <DataTable compact aria-label="科室运行规则">
            <thead><tr><th>业务用途</th><th>当前分类</th><th>还需满足的条件</th></tr></thead>
            <tbody>{configuration.data.runtimeUses.map(value => <tr key={value.code}><td>{value.name}</td>
              <td><StatusBadge tone={value.classificationMatches ? 'success' : 'neutral'}>{value.classificationMatches ? '适用' : '不适用'}</StatusBadge></td>
              <td>{value.requirement}</td></tr>)}</tbody>
          </DataTable>}</>}
    </section>}
    <section className="organization-section" aria-label="资质与联系">
      <h3>资质与联系</h3>
      <div className="organization-profile-grid">
        {(department ? DEPARTMENT_PROFILE_SECTIONS : ORGANIZATION_PROFILE_SECTIONS).map(section =>
          <div key={section} className="organization-profile-card" role="group" aria-label={PROFILE_SECTIONS[section]}>
            <div className="organization-profile-card__head"><h4>{PROFILE_SECTIONS[section]}</h4>
              {canManage && <Button size="sm" variant="text" disabled={busy} onClick={() => onEditSection(section)}>维护</Button>}</div>
            <ProfileLines section={section} profile={profile} />
          </div>)}
      </div>
    </section>
    <section className="organization-section" aria-label="在岗人员">
      <h3>在岗人员</h3>
      <div className="organization-staff-summary">
        <span>{staff === 'error' ? '在岗人员统计失败，请稍后刷新' : staff ? `在岗 ${staff.current} 人，其中主任职 ${staff.primary} 人` : '正在统计…'}</span>
        <Button size="sm" variant="secondary" onClick={onViewStaff}>在人员管理中查看</Button>
      </div>
    </section>
  </div>
}

function FactList({ facts }: { facts: Array<[string, ReactNode]> }) {
  return <dl className="organization-facts">{facts.map(([label, value]) =>
    <div key={label} className="organization-facts__item"><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
}

function ProfileLines({ section, profile }: { section: OrganizationProfileSection; profile: OrganizationProfileResult }) {
  const lines: string[] = (() => {
    switch (section) {
      case 'identifier': return 'organization' in profile ? profile.identifiers.filter(item => currentRecord(item))
        .map(item => `${item.sdIdentifierTypeText}：${item.identifierCode}`) : []
      case 'address': return 'organization' in profile ? profile.addresses.filter(item => currentRecord(item)).map(item => item.streetAddress) : []
      case 'contact': return profile.contacts.filter(item => currentRecord(item))
        .map(item => `${item.sdContactTypeText}：${item.contactValue}${item.primaryContact ? '（主要）' : ''}`)
      case 'responsibility': return profile.responsibilities.filter(item => currentRecord(item))
        .map(item => `${item.sdResponsibilityTypeText}：${item.responsibleName}${item.primaryResponsibility ? '（主要）' : ''}`)
      case 'capability': return profile.capabilities.filter(item => currentRecord(item))
        .map(item => `${item.sdCapabilityTypeText}${item.capabilityScope ? ` · ${item.capabilityScope}` : ''} · ${item.sdVerifyStatusText}`)
      default: return []
    }
  })()
  return lines.length ? <ul className="organization-profile-card__lines">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>
    : <p className="organization-section__empty">未登记</p>
}
